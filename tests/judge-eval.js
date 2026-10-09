#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pluginRoot = path.join(__dirname, '..');
const casesDirectory = path.join(__dirname, 'judge-cases');
const hookPath = path.join(pluginRoot, 'hooks', 'stop-judge.js');
const HOOK_TIMEOUT_MS = 150000;
const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const FIELD = /^(\w+):\s*(.*)$/;
const DEFAULT_MODEL_NOTE = 'claude-opus-5-5 (hook default)';
const DEFAULT_EFFORT_NOTE = 'medium (hook default)';
const FAIL_OPEN_VERDICTS = new Set(['unparsed', 'error', 'timeout', 'unavailable', 'FAIL-unquoted']);

const USAGE = [
  'Usage: node tests/judge-eval.js [--runs N] [--case <name>[,<name>…]] [--model <id>] [--effort <level>]',
  '                                [--list] [--verbose] [--keep]',
  '',
  'Runs every fixture in tests/judge-cases through hooks/stop-judge.js with the real nested `claude`.',
  'Opt-in: each run is one judge call on your plan. Prints verdicts, cited rules, latency and usage.',
  '  --runs N      runs per case (default 1; the release gate uses 3)',
  '  --case NAME   only the named cases (repeatable, or comma-separated)',
  '  --model ID    sets ALPHA_JUDGE_MODEL for the hook; --effort sets ALPHA_JUDGE_EFFORT',
  '  --list        print the cases and their expected verdicts without calling anything',
  '  --verbose     print the judge’s failing lines for every blocked run, not only mismatches',
  '  --keep        keep the temporary projects and judge-log.jsonl and print where they are',
].join('\n');

function parseArguments(argv) {
  const options = { runs: 1, cases: [], list: false, verbose: false, keep: false, help: false, problems: [] };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = () => argv[++index];
    if (argument === '--runs') options.runs = Number(next());
    else if (argument === '--case') options.cases.push(...String(next() || '').split(',').map((name) => name.trim()).filter(Boolean));
    else if (argument === '--model') options.model = next();
    else if (argument === '--effort') options.effort = next();
    else if (argument === '--list') options.list = true;
    else if (argument === '--verbose') options.verbose = true;
    else if (argument === '--keep') options.keep = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else options.problems.push(`unknown argument ${argument}`);
  }
  if (!Number.isInteger(options.runs) || options.runs < 1) options.problems.push('--runs needs a whole number of 1 or more');
  if ('model' in options && !options.model) options.problems.push('--model needs a model id');
  if ('effort' in options && !options.effort) options.problems.push('--effort needs a level');
  return options;
}

function readCase(fileName) {
  const text = fs.readFileSync(path.join(casesDirectory, fileName), 'utf8').replace(/\r\n?/g, '\n');
  const match = FRONT_MATTER.exec(text);
  if (!match) throw new Error(`${fileName}: no front matter`);
  const fields = {};
  for (const line of match[1].split('\n')) {
    const field = FIELD.exec(line);
    if (field) fields[field[1]] = field[2].trim();
  }
  if (!['pass', 'fail'].includes(fields.expected)) throw new Error(`${fileName}: expected must be pass or fail`);
  const rules = (fields.rules || '').replace(/[[\]]/g, '').split(/[\s,]+/).filter(Boolean).map(Number);
  if (rules.some((rule) => !Number.isInteger(rule) || rule < 1 || rule > 10)) throw new Error(`${fileName}: rules must be numbers 1–10`);
  return {
    name: fileName.replace(/\.md$/, ''),
    expected: fields.expected.toUpperCase(),
    rules,
    language: fields.language || 'en',
    context: fields.context || 'sdlc',
    entrypoint: fields.entrypoint || 'cli',
    source: fields.source || '',
    message: match[2].replace(/\n$/, ''),
  };
}

function selectedCases(options) {
  const all = fs.readdirSync(casesDirectory).filter((name) => name.endsWith('.md') && name !== 'README.md').sort().map(readCase);
  if (!options.cases.length) return { cases: all, missing: [] };
  const wanted = new Set(options.cases);
  return { cases: all.filter((testCase) => wanted.has(testCase.name)), missing: options.cases.filter((name) => !all.some((testCase) => testCase.name === name)) };
}

function projectFor(testCase, workDirectory) {
  const projectRoot = path.join(workDirectory, 'projects', testCase.name);
  fs.mkdirSync(projectRoot, { recursive: true });
  if (testCase.context === 'sdlc') {
    fs.mkdirSync(path.join(projectRoot, 'docs', 'basics'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'docs', 'basics', '.alpha-sdlc.json'), JSON.stringify({ plainLanguage: testCase.language }));
  }
  return projectRoot;
}

function parsedJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function logLineFor(dataDirectory, session) {
  try {
    const lines = fs.readFileSync(path.join(dataDirectory, 'judge-log.jsonl'), 'utf8').split('\n').filter(Boolean);
    return lines.map(parsedJson).filter((entry) => entry && entry.session === session).pop() || null;
  } catch {
    return null;
  }
}

function hookEnvironment(testCase, context) {
  const environment = {
    ...process.env,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    CLAUDE_PLUGIN_DATA: context.dataDirectory,
    CLAUDE_CODE_ENTRYPOINT: testCase.entrypoint,
  };
  delete environment.ALPHA_JUDGE;
  delete environment.ALPHA_JUDGE_NESTED;
  if (context.model) environment.ALPHA_JUDGE_MODEL = context.model;
  if (context.effort) environment.ALPHA_JUDGE_EFFORT = context.effort;
  return environment;
}

function runOnce(testCase, run, context) {
  const session = `judge-eval-${process.pid}-${testCase.name}-${run}`;
  const payload = {
    hook_event_name: 'Stop',
    session_id: session,
    transcript_path: '',
    cwd: context.projects.get(testCase.name),
    permission_mode: 'default',
    stop_hook_active: false,
    last_assistant_message: testCase.message,
  };
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    env: hookEnvironment(testCase, context),
    encoding: 'utf8',
    timeout: HOOK_TIMEOUT_MS,
  });
  const wallMs = Date.now() - startedAt;
  const output = parsedJson(result.stdout || '');
  const logged = logLineFor(context.dataDirectory, session) || {};
  const blocked = Boolean(output && output.decision === 'block');
  const judgeVerdict = logged.skip ? `skipped (${logged.skip})` : logged.verdict || (result.error ? result.error.code : 'none');
  const failed = Array.isArray(logged.failed) ? logged.failed : [];
  const verdictMatches = testCase.expected === 'FAIL' ? blocked : !blocked && (judgeVerdict === 'PASS' || Boolean(logged.skip));
  const citedExpected = testCase.rules.filter((rule) => failed.includes(rule));
  const rulesMatch = testCase.expected !== 'FAIL' || !testCase.rules.length || citedExpected.length > 0;
  return {
    run,
    blocked,
    judgeVerdict,
    failed,
    wallMs,
    usage: logged.usage || null,
    models: Array.isArray(logged.models) ? logged.models : [],
    reason: blocked ? String(output.reason || '') : '',
    notice: output && output.systemMessage ? String(output.systemMessage) : '',
    inconsistent: judgeVerdict === 'PASS' && failed.length > 0,
    failOpen: FAIL_OPEN_VERDICTS.has(judgeVerdict),
    ok: verdictMatches && rulesMatch,
    missingRules: testCase.rules.filter((rule) => !failed.includes(rule)),
    stderr: (result.stderr || '').trim(),
  };
}

const ruleList = (rules) => `[${rules.join(' ')}]`;
const thousands = (value) => Math.round(value).toLocaleString('en-US');
const seconds = (milliseconds) => `${(milliseconds / 1000).toFixed(1)} s`;
const inputSide = (usage) => usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

function printRun(testCase, outcome, verbose) {
  const got = outcome.blocked ? `FAIL ${ruleList(outcome.failed)}` : outcome.judgeVerdict;
  const usage = outcome.usage
    ? `in ${thousands(inputSide(outcome.usage))} · out ${thousands(outcome.usage.output_tokens)} (thinking ${thousands(outcome.usage.thinking_tokens || 0)})`
    : 'no usage';
  const flags = [
    outcome.ok ? 'ok' : 'MISMATCH',
    outcome.inconsistent ? 'PASS-with-failing-lines' : '',
    outcome.blocked && outcome.missingRules.length ? `uncited ${ruleList(outcome.missingRules)}` : '',
  ].filter(Boolean).join(' · ');
  process.stdout.write(`  run ${outcome.run}: got ${got} · ${seconds(outcome.wallMs)} · ${usage} · ${flags}\n`);
  if ((verbose || !outcome.ok) && outcome.reason) {
    for (const line of outcome.reason.split('\n')) process.stdout.write(`      ${line}\n`);
  }
  if (outcome.notice) process.stdout.write(`      notice: ${outcome.notice}\n`);
  if (!outcome.ok && outcome.stderr) process.stdout.write(`      hook stderr: ${outcome.stderr.slice(0, 400)}\n`);
}

function printSummary(results, context) {
  const outcomes = results.flatMap(({ outcomes: list }) => list);
  const judged = outcomes.filter((outcome) => outcome.usage);
  const matching = outcomes.filter((outcome) => outcome.ok).length;
  const steadyCases = results.filter(({ outcomes: list }) => list.every((outcome) => outcome.ok)).length;
  const walls = outcomes.map((outcome) => outcome.wallMs);
  const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
  const models = [...new Set(outcomes.flatMap((outcome) => outcome.models))];
  process.stdout.write('\nSummary\n');
  process.stdout.write(`  runs matching the expected verdict: ${matching}/${outcomes.length}\n`);
  process.stdout.write(`  cases matching on every run: ${steadyCases}/${results.length}\n`);
  process.stdout.write(`  latency per stop (wall): p50 ${seconds(percentile(walls, 0.5))} · p90 ${seconds(percentile(walls, 0.9))} · max ${seconds(Math.max(0, ...walls))}\n`);
  if (judged.length) {
    const usages = judged.map((outcome) => outcome.usage);
    process.stdout.write(`  tokens per judged run (mean): input-side ${thousands(mean(usages.map(inputSide)))}` +
      ` (cache write ${thousands(mean(usages.map((usage) => usage.cache_creation_input_tokens)))},` +
      ` cache read ${thousands(mean(usages.map((usage) => usage.cache_read_input_tokens)))})` +
      ` · output ${thousands(mean(usages.map((usage) => usage.output_tokens)))}` +
      ` (thinking ${thousands(mean(usages.map((usage) => usage.thinking_tokens || 0)))})\n`);
  }
  process.stdout.write(`  fail-open runs: ${outcomes.filter((outcome) => outcome.failOpen).length}` +
    ` · PASS with failing lines: ${outcomes.filter((outcome) => outcome.inconsistent).length}\n`);
  process.stdout.write(`  models seen: ${models.length ? models.join(', ') : 'none'}\n`);
  if (context.keep) process.stdout.write(`  kept: ${context.workDirectory} (judge-log.jsonl under plugin-data/)\n`);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE + '\n');
    return 0;
  }
  if (options.problems.length) {
    process.stderr.write(`${options.problems.join('\n')}\n\n${USAGE}\n`);
    return 2;
  }
  const { cases, missing } = selectedCases(options);
  if (missing.length || !cases.length) {
    process.stderr.write(`no such case: ${missing.join(', ') || '(none selected)'}\nrun with --list to see the cases\n`);
    return 2;
  }
  if (options.list) {
    for (const testCase of cases) {
      process.stdout.write(`${testCase.name}  expect ${testCase.expected} ${ruleList(testCase.rules)}  ${testCase.language}/${testCase.context}  ${testCase.source}\n`);
    }
    return 0;
  }

  const workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-sdlc-judge-eval-'));
  const context = {
    workDirectory,
    dataDirectory: path.join(workDirectory, 'plugin-data'),
    model: options.model || '',
    effort: options.effort || '',
    keep: options.keep,
    projects: new Map(cases.map((testCase) => [testCase.name, projectFor(testCase, workDirectory)])),
  };
  const model = options.model || process.env.ALPHA_JUDGE_MODEL || DEFAULT_MODEL_NOTE;
  const effort = options.effort || process.env.ALPHA_JUDGE_EFFORT || DEFAULT_EFFORT_NOTE;
  process.stdout.write(`alpha-sdlc judge eval · model ${model} · effort ${effort} · ${cases.length} case(s) × ${options.runs} run(s)` +
    ` = ${cases.length * options.runs} judge call(s) on your plan\n`);

  const results = [];
  try {
    for (const testCase of cases) {
      process.stdout.write(`\n${testCase.name} — expect ${testCase.expected} ${ruleList(testCase.rules)} — ${testCase.source}\n`);
      const outcomes = [];
      for (let run = 1; run <= options.runs; run++) {
        const outcome = runOnce(testCase, run, context);
        outcomes.push(outcome);
        printRun(testCase, outcome, options.verbose);
      }
      results.push({ testCase, outcomes });
    }
    printSummary(results, context);
  } finally {
    if (!options.keep) fs.rmSync(workDirectory, { recursive: true, force: true });
  }
  return results.every(({ outcomes }) => outcomes.every((outcome) => outcome.ok)) ? 0 : 1;
}

process.exitCode = main();
