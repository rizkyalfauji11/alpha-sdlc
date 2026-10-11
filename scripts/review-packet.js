#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readPrinciples, readApplicability } = require('./lib/rules');
const { measureTier, globPattern, TierInputError } = require('./review-tier');
const coverage = require('./check-coverage');
const { stateDirectoryFor } = require('../hooks/lib/sdlc-context');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');

const USAGE =
  'usage: review-packet.js <feature-dir> <platform|all> --base <sha> [--kind code|fix|tests|groom]\n' +
  '         [--stage <n>] [--bug <id>[,<id>...]] [--self] [--verify <log>] [--head <rev>] [--repo <dir>]\n' +
  '         [--items <n,...>] [--single] [--report <runner report>...] [--settled <output file>...]\n' +
  '         [--applicability <file>] [--exclude <path>...]\n' +
  '  writes <repo>/.alpha-sdlc/review/<feature>-<platform>-<unit>.md and prints its path first\n' +
  '  --exclude leaves another session\'s uncommitted paths out of the tier, the diff and the sweeps; the\n' +
  '  packet header lists every excluded path\n' +
  '  code (default) is the feature review, the whole feature diff; with --stage and --self, a stage\'s\n' +
  '  self-review; with --stage alone, a stage built after the feature review closed\n' +
  '  --bug (one id or a comma list) or --kind fix is the fix review of a batch; one bug with --self, its\n' +
  '  self-review · tests is the test review · groom is the grooming review: the hub and every spoke\n' +
  '  with platform "all", the hub and that spoke with a platform\n' +
  '  --self runs the settled scripts and names no reviewer · --items keeps only those checklist items ·\n' +
  '  --single hands every remaining dimension to one reviewer (the light tier always does)\n';

const INLINE_DIFF_LIMIT = 1500;
const BACKEND_PLATFORM = /^(backend|be|api|server|services?|bridge|daemon|worker|cli)$/i;
const KIND_LABEL = {
  code: 'code — the feature review',
  stage: 'code — one stage reviewed as its own change, built after the feature review closed',
  fix: 'fix — the fix review',
  tests: 'tests — the test review',
  groom: 'groom — the grooming review',
};
const SELF_LABEL = {
  code: 'code — a stage\'s self-review',
  fix: 'fix — a bug\'s self-review',
};
const TRIGGER_ABSENT = {
  code: 'no code or config file changed',
  ui: 'no UI path changed',
  data: 'no data-layer or logic file changed',
  contract: 'no contract or logic file changed',
  tests: 'no test changed and this is not a code or test review',
  docs: 'no document changed and this is not a TRD review',
  trd: 'not a TRD review and no TRD changed',
  never: 'not a review rule',
};

class PacketInputError extends Error {}

function inputError(message) {
  throw new PacketInputError(message);
}

function parseArguments(argv) {
  const options = {
    positional: [], kind: null, stage: null, bug: null, bugs: [], base: null, head: null, self: false,
    verify: null, repo: null, items: null, single: false, reports: [], settled: [], applicability: null, exclude: [],
  };
  const valued = {
    '--kind': 'kind', '--stage': 'stage', '--bug': 'bug', '--base': 'base', '--head': 'head', '--verify': 'verify',
    '--repo': 'repo', '--items': 'items', '--applicability': 'applicability',
  };
  const retired = { '--round': 'one review per phase: there is no second round', '--prev': 'one review per phase: there is no second round', '--since': 'one review per phase: there is no second round', '--dimensions': 'one review per phase: there is no fix round to narrow' };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (valued[argument]) {
      const value = argv[++index];
      if (value === undefined) inputError(`${argument} needs a value`);
      options[valued[argument]] = value;
    } else if (argument === '--single') options.single = true;
    else if (argument === '--self') options.self = true;
    else if (argument === '--report' || argument === '--settled' || argument === '--exclude') {
      const target = argument === '--report' ? options.reports : argument === '--settled' ? options.settled : options.exclude;
      const before = target.length;
      while (argv[index + 1] && !argv[index + 1].startsWith('--')) target.push(argv[++index]);
      if (argument === '--exclude' && target.length === before) inputError('--exclude needs at least one path');
    } else if (retired[argument]) inputError(`${argument} is retired — ${retired[argument]}`);
    else if (argument.startsWith('--')) inputError(`unknown option ${argument}`);
    else options.positional.push(argument);
  }
  if (options.positional.length !== 2) inputError('expected a feature directory and a platform');
  if (!options.base) inputError('--base <sha> is required');
  const [featureArgument, platform] = options.positional;
  options.featureDirectory = path.resolve(featureArgument);
  options.platform = platform;
  options.bugs = options.bug ? options.bug.split(/[\s,]+/).filter(Boolean) : [];
  options.kind = resolveKind(options);
  if (options.kind === 'fix' && !options.bugs.length) inputError('a fix review needs --bug <id>[,<id>...]');
  if (options.stage !== null) {
    options.stage = Number(options.stage);
    if (!Number.isInteger(options.stage)) inputError('--stage takes a stage number');
  }
  if (options.self) {
    if (options.kind === 'code' && options.stage === null) inputError('a self-review is one stage\'s: --stage <n> --self');
    if (options.kind === 'fix' && options.bugs.length !== 1) inputError('a self-review is one bug\'s: --bug <id> --self');
    if (!['code', 'fix'].includes(options.kind)) inputError(`--self is a stage's or a bug's self-review, not a ${options.kind} review`);
  }
  if (options.kind === 'groom' && platform === 'hub') inputError('the grooming review covers the hub and its spokes: platform "all", or one spoke\'s platform');
  options.items = options.items ? options.items.split(/[\s,]+/).filter(Boolean).map(Number) : null;
  if (options.items && options.items.some((item) => !Number.isInteger(item))) inputError('--items takes item numbers, e.g. 4,5,8');
  return options;
}

function resolveKind(options) {
  const requested = options.kind || (options.bugs.length ? 'fix' : 'code');
  if (requested === 'hub' || requested === 'trd') {
    inputError(`--kind ${requested} is retired — the hub and alignment reviews are one grooming review: --kind groom`);
  }
  if (!['code', 'fix', 'tests', 'groom'].includes(requested)) inputError(`unknown --kind ${requested}`);
  if (requested === 'code' && options.bugs.length) return 'fix';
  return requested;
}

function git(repo, args, environment) {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', '-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    env: environment || process.env,
  });
  return { ok: !result.error && result.status === 0, stdout: result.stdout || '', stderr: String(result.stderr || result.error || '').trim() };
}

function repositoryOf(directory) {
  const top = git(directory, ['rev-parse', '--show-toplevel']);
  if (!top.ok) inputError(`${directory} is not inside a git repository`);
  return top.stdout.trim();
}

function realOrSelf(candidate) {
  try { return fs.realpathSync(candidate); } catch {}
  try { return path.join(fs.realpathSync(path.dirname(candidate)), path.basename(candidate)); } catch {}
  return candidate;
}

function repositoryRelative(repo, entry) {
  const candidates = path.isAbsolute(entry) ? [entry] : [path.join(repo, entry), path.resolve(entry)];
  for (const candidate of candidates) {
    const relative = path.relative(repo, realOrSelf(candidate));
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return relative.split(path.sep).join('/');
  }
  return null;
}

function keepStateOutOfGit(repo) {
  const stateDirectory = stateDirectoryFor(repo);
  const ignorePath = path.join(stateDirectory, '.gitignore');
  if (fs.existsSync(ignorePath)) return;
  fs.mkdirSync(stateDirectory, { recursive: true });
  fs.writeFileSync(ignorePath, '*\n');
}

function readOptional(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

function scriptPath(name) {
  const override = path.join(pluginRoot, 'scripts', name);
  return fs.existsSync(override) ? override : path.join(__dirname, name);
}

function runScript(name, args, cwd) {
  const file = scriptPath(name);
  const result = spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 300000 });
  const output = `${result.stdout || ''}${result.stderr || ''}`.replace(/\s+$/, '');
  const exitCode = result.error ? `did not run (${result.error.code || result.error.message})` : result.status;
  return { command: `node ${shellQuoted(file)} ${args.map(shellQuoted).join(' ')}`.trim(), exitCode, output };
}

function shellQuoted(value) {
  return /^[\w@%+=:,./-]+$/.test(String(value)) ? String(value) : `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function fenceFor(text) {
  const longest = Math.max(2, ...[...String(text).matchAll(/^\s*(`{3,}|~{3,})/gm)].map((match) => match[1].length));
  return '~'.repeat(longest + 1);
}

function fenced(text, language = '') {
  const fence = fenceFor(text);
  return [`${fence}${language}`, ...String(text).replace(/\s+$/, '').split('\n'), fence];
}

function snapshotTree(repo) {
  const indexPath = git(repo, ['rev-parse', '--git-path', 'index']);
  const temporaryIndex = path.join(os.tmpdir(), `alpha-sdlc-review-index-${process.pid}-${Date.now()}`);
  try {
    const realIndex = indexPath.ok ? path.resolve(repo, indexPath.stdout.trim()) : null;
    if (realIndex && fs.existsSync(realIndex)) fs.copyFileSync(realIndex, temporaryIndex);
    const environment = { ...process.env, GIT_INDEX_FILE: temporaryIndex };
    if (!git(repo, ['add', '-A'], environment).ok) return null;
    if (!git(repo, ['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', '.alpha-sdlc'], environment).ok) return null;
    const tree = git(repo, ['write-tree'], environment);
    return tree.ok ? tree.stdout.trim() : null;
  } finally {
    fs.rmSync(temporaryIndex, { force: true });
  }
}

function treeHashOf(repo) {
  const run = runScript('scan-record.js', ['--hash', repo], repo);
  if (run.exitCode !== 0) return { tree: null, why: `scan-record.js --hash exited ${run.exitCode}: ${run.output.split('\n')[0] || 'no output'}` };
  try {
    const parsed = JSON.parse(run.output.trim().split('\n').pop());
    return { tree: parsed.tree || null, commit: parsed.commit || null, why: parsed.tree ? null : 'scan-record.js printed no tree' };
  } catch {
    return { tree: null, why: 'scan-record.js printed no JSON' };
  }
}

function loadDimensions(kind) {
  const file = scriptPath('review-dimensions.json');
  let table;
  try { table = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { return inputError(`cannot read ${file}: ${error.message}`); }
  if (!table[kind] || !Array.isArray(table[kind].dimensions)) inputError(`${file} has no "${kind}" dimensions`);
  return { file, ...table[kind], dimensions: table[kind].dimensions.map((dimension) => ({ ...dimension, items: [...dimension.items] })) };
}

function checklistPathOf(dimension, skill) {
  const planned = path.join(pluginRoot, dimension.checklistFile);
  if (fs.existsSync(planned)) return { path: planned, note: null };
  const fallback = path.join(pluginRoot, 'skills', skill, 'SKILL.md');
  return { path: fallback, note: `${dimension.checklistFile} not found — the items are in ${fallback}` };
}

function foldDimension(dimensions, thin) {
  const index = dimensions.indexOf(thin);
  const neighbour = dimensions[index - 1] || dimensions[index + 1];
  if (!neighbour) return dimensions;
  neighbour.items = [...new Set([...neighbour.items, ...thin.items])].sort((a, b) => a - b);
  neighbour.owns = [...new Set([...(neighbour.owns || []), ...(thin.owns || [])])];
  neighbour.testQuality = neighbour.testQuality || thin.testQuality;
  neighbour.agent = neighbour.agent || thin.agent;
  neighbour.name = `${neighbour.name} + ${thin.name}`;
  neighbour.folded = [...(neighbour.folded || []), thin.id];
  return dimensions.filter((dimension) => dimension !== thin);
}

function shapeDimensions(definition, { kind, spokeCount, foundation, options, tier }) {
  let dimensions = definition.dimensions;
  const notes = [];
  if (kind === 'groom' && spokeCount === 0) {
    const alignment = definition.alignmentItems || [];
    for (const dimension of dimensions) {
      const dropped = dimension.items.filter((item) => alignment.includes(item));
      if (!dropped.length) continue;
      dimension.items = dimension.items.filter((item) => !dropped.includes(item));
      dimension.thinned = true;
    }
    notes.push('no spoke yet: alignment items 1–11 have nothing to check — the hub items alone');
  } else if (kind === 'groom' && spokeCount < 2) {
    for (const dimension of dimensions) {
      const dropped = (dimension.multiSpokeItems || []).filter((item) => dimension.items.includes(item));
      if (!dropped.length) continue;
      dimension.items = dimension.items.filter((item) => !dropped.includes(item));
      dimension.thinned = true;
      notes.push(`item ${dropped.join(', ')} needs two or more spokes — this feature has ${spokeCount}`);
    }
  }
  if (options.items) {
    for (const dimension of dimensions) {
      const kept = dimension.items.filter((item) => options.items.includes(item));
      if (kept.length < dimension.items.length) dimension.thinned = true;
      dimension.items = kept;
    }
    notes.push(`items in play: ${options.items.join(', ')}`);
  }
  dimensions = dimensions.filter((dimension) => dimension.items.length);
  if (!dimensions.length) inputError('no checklist item is left to review — check --items');
  for (const thin of dimensions.filter((dimension) => dimension.thinned && dimension.items.length === 1)) {
    if (dimensions.length < 2) break;
    notes.push(`dimension ${thin.id} is down to item ${thin.items[0]} and folds into its neighbour`);
    dimensions = foldDimension(dimensions, thin);
  }
  if (kind === 'groom' && foundation) {
    const contract = dimensions.find((dimension) => dimension.id === 'a');
    if (contract && dimensions.length > 1) {
      notes.push('a foundation: dimensions a and b merge');
      dimensions = foldDimension(dimensions, contract);
    }
  }
  const single = options.single || tier === 'light';
  return { dimensions, notes, single };
}

function ownersOf(file, dimensions) {
  return dimensions.filter((dimension) => (dimension.owns || []).some((selector) => {
    if (selector.startsWith('@')) {
      const wanted = selector.slice(1);
      return file.class === wanted || file.flags.includes(wanted);
    }
    return globPattern(selector).test(file.path);
  })).map((dimension) => dimension.id);
}

function activeTriggers({ kind, measure, platform }) {
  const active = new Map([['always', 'every review']]);
  const files = measure.files;
  const first = (list) => `${list[0].path}${list.length > 1 ? ` (+${list.length - 1} more)` : ''}`;
  const code = files.filter((file) => file.class !== 'docs');
  if (code.length) active.set('code', `code or config changed: ${first(code)}`);
  const ui = files.filter((file) => file.class !== 'docs' && file.flags.includes('ui'));
  if (ui.length) active.set('ui', `UI path changed: ${first(ui)}`);
  else if (kind === 'groom' && (platform === 'all' || !BACKEND_PLATFORM.test(platform))) {
    active.set('ui', platform === 'all' ? 'the hub feeds every spoke, client ones included' : `a ${platform} spoke`);
  }
  const logic = files.filter((file) => (file.class === 'production' || file.class === 'generated') && file.behaviourChange && !file.styleOnly);
  const schema = files.filter((file) => file.flags.includes('schema'));
  if (logic.length || schema.length) active.set('data', `logic or data file changed: ${first(logic.length ? logic : schema)}`);
  else if (['tests', 'groom'].includes(kind)) active.set('data', `a ${kind} review`);
  const contract = files.filter((file) => file.flags.includes('contract'));
  if (contract.length) active.set('contract', `contract path changed: ${first(contract)}`);
  else if (logic.length) active.set('contract', `logic file changed: ${first(logic)}`);
  else if (['tests', 'groom'].includes(kind)) active.set('contract', `a ${kind} review`);
  const tests = files.filter((file) => file.class === 'test');
  if (tests.length) active.set('tests', `test changed: ${first(tests)}`);
  else if (['code', 'fix', 'tests'].includes(kind)) active.set('tests', `a ${kind} review`);
  const docs = files.filter((file) => file.class === 'docs');
  if (docs.length) active.set('docs', `document changed: ${first(docs)}`);
  else if (kind === 'groom') active.set('docs', 'a TRD review');
  const trds = files.filter((file) => /(^|\/)TRD[^/]*\.md$/.test(file.path));
  if (kind === 'groom') active.set('trd', 'a TRD review');
  else if (trds.length) active.set('trd', `TRD changed: ${first(trds)}`);
  return active;
}

function selectRules(options, active) {
  const principlesPath = path.join(pluginRoot, 'principles.md');
  let rules;
  try {
    rules = readPrinciples(principlesPath);
  } catch (error) {
    return { principlesPath, applicabilityPath: null, note: `cannot read ${principlesPath} (${error.message}) — open it by section for the rules your dimension audits`, notes: [], included: [], withheld: [], placed: [] };
  }
  const applicabilityPath = options.applicability ? path.resolve(options.applicability) : path.join(pluginRoot, 'rules', 'applicability.json');
  let applicability = null;
  let note = null;
  try {
    applicability = readApplicability(applicabilityPath);
    if (!applicability || typeof applicability.rules !== 'object') throw new Error('it has no "rules" object');
  } catch (error) {
    applicability = null;
    note = fs.existsSync(applicabilityPath)
      ? `${applicabilityPath} is unreadable (${error.message}) — every rule is included`
      : `${applicabilityPath} not found — every rule is included`;
  }
  let line = 1;
  const placed = rules.map((rule) => {
    const count = rule.text.split('\n').length;
    const range = [line, line + count - 1];
    line += count;
    return { ...rule, range };
  });
  const included = [];
  const withheld = [];
  const notes = [];
  for (const rule of placed) {
    if (rule.kind === 'heading') continue;
    if (!applicability) { included.push(rule); continue; }
    const entry = applicability.rules[rule.id];
    if (!entry || !Array.isArray(entry.review) || !entry.review.length) {
      notes.push(`\`${rule.id}\` has no review triggers in the applicability file — included`);
      included.push(rule);
      continue;
    }
    const unknown = entry.review.filter((trigger) => !active.has(trigger) && !TRIGGER_ABSENT[trigger]);
    if (unknown.length) notes.push(`\`${rule.id}\` names unknown trigger(s) ${unknown.join(', ')} — included`);
    if (unknown.length || entry.review.some((trigger) => active.has(trigger))) included.push(rule);
    else withheld.push({ rule, triggers: entry.review });
  }
  const heading = placed.find((rule) => rule.kind === 'heading');
  if (heading && included.some((rule) => rule.kind === 'agreement')) included.push(heading);
  included.sort((a, b) => a.range[0] - b.range[0]);
  return { principlesPath, applicabilityPath, note, notes, included, withheld, placed };
}

function changeDocMapRule(placed) {
  return placed.find((rule) => rule.kind === 'agreement' && /change\s*→\s*doc/i.test(rule.text)) || null;
}

function registerTableHeader(spoke) {
  const tableLines = coverage.acceptanceLinesOf(spoke).filter((line) => /^\|/.test(line));
  const separator = tableLines.findIndex((line) => /^\|\s*:?-{3}/.test(line));
  return separator > 0 ? tableLines.slice(separator - 1, separator + 1) : [];
}

function locatedHub(options) {
  const localPath = path.join(options.featureDirectory, 'TRD.md');
  if (fs.existsSync(localPath) || options.platform === 'hub' || options.platform === 'all') return { path: localPath, text: readOptional(localPath), local: true };
  let hubPath = localPath;
  try {
    const { contextFor, locateHub } = require('./next-step');
    hubPath = locateHub(contextFor(options.featureDirectory, options.platform));
  } catch {}
  return { path: hubPath, text: readOptional(hubPath), local: hubPath === localPath };
}

function variantOf(hubText) {
  if (hubText === null) return null;
  let kind = 'hub';
  try {
    const { documentKind } = require('./next-step');
    kind = documentKind(hubText, 'TRD.md');
  } catch {}
  return kind === 'hub' ? 'feature' : kind;
}

function spokeNamesOf(options, hub) {
  const local = fs.existsSync(options.featureDirectory)
    ? fs.readdirSync(options.featureDirectory).map((name) => /^TRD-(.+)\.md$/.exec(name)).filter(Boolean).map((match) => match[1].toLowerCase())
    : [];
  let listed = [];
  if (hub.text !== null) {
    try {
      const { spokesOf } = require('./next-step');
      listed = (spokesOf(hub.text.split('\n'), path.dirname(hub.path)) || []).map((spoke) => {
        const linked = spoke.path ? /^TRD-(.+)\.md$/i.exec(path.basename(spoke.path)) : null;
        return (linked ? linked[1] : spoke.name.split(/\s+/)[0] || '').toLowerCase();
      }).filter(Boolean);
    } catch {}
  }
  return [...new Set([...local, ...listed])].sort();
}

function stageUnit(options) {
  const lines = [];
  const planPath = path.join(options.featureDirectory, `plan-${options.platform}.md`);
  const spokePath = coverage.registerDocumentPath(options.featureDirectory, options.platform);
  const plan = readOptional(planPath);
  if (plan === null) return { title: `Stage ${options.stage}`, lines: [`Cannot read ${planPath}: read the stage, its AC and its slice yourself.`], namedDocs: [] };
  const spoke = readOptional(spokePath) || '';
  const slices = coverage.parseSlices(spoke);
  const { stages, movedInto } = coverage.parsePlan(plan, slices);
  const stage = stages.find((candidate) => candidate.number === options.stage);
  if (!stage) inputError(`no Stage ${options.stage} in ${planPath}`);
  lines.push(`From ${planPath}, line ${stage.line} — verbatim:`, '', stage.heading, ...stage.block.join('\n').replace(/\s+$/, '').split('\n'), '');
  const register = coverage.generalRegisterOf(spoke);
  const claimText = `${coverage.bulletText(stage.block, 'Covers').split('⚠️')[0].replace(/^.*?\*\*Covers:?\*\*/, '')} ${coverage.bulletText(stage.block, 'Moved in')}`;
  const covered = [...new Set([
    ...[...stage.covers, ...(movedInto.get(stage.number) || [])].map((id) => `AC-${id}`),
    ...coverage.generalAcIdsIn(claimText, register.scheme || 'AC'),
  ])];
  lines.push(`Acceptance criteria this stage covers — ${spokePath}, verbatim:`, '');
  if (spoke) lines.push(...registerTableHeader(spoke));
  const missing = [];
  for (const id of covered) {
    if (register.rows.has(id)) lines.push(...register.rows.get(id));
    else missing.push(id);
  }
  if (!covered.length) lines.push('(the stage names no acceptance criterion)');
  if (missing.length) lines.push('', `Not in the AC register: ${missing.join(', ')}`);
  lines.push('', `Its work slice(s) — §9 of ${spokePath}, verbatim:`, '');
  if (!stage.slices.length) lines.push('(the stage heading names no §9 slice)');
  for (const slice of stage.slices) lines.push(...slices.get(slice).lines);
  const namedDocs = docsNamedIn(stage.block.join('\n'), options.featureDirectory);
  if (namedDocs.length) {
    lines.push('', 'Documents the stage names (read the ones your dimension needs):', '');
    for (const doc of namedDocs) lines.push(`- ${doc.path}${doc.exists ? '' : ' — named but missing'}`);
  }
  return { title: `Stage ${options.stage}`, lines, namedDocs };
}

function featureUnit(options) {
  const lines = [];
  const planPath = path.join(options.featureDirectory, `plan-${options.platform}.md`);
  const spokePath = coverage.registerDocumentPath(options.featureDirectory, options.platform);
  const plan = readOptional(planPath);
  if (plan === null) return { title: 'The feature', lines: [`Cannot read ${planPath}: read the plan, its AC and its slices yourself.`], namedDocs: [] };
  const spoke = readOptional(spokePath) || '';
  const slices = coverage.parseSlices(spoke);
  const { stages } = coverage.parsePlan(plan, slices);
  lines.push(`The plan: ${planPath} — every stage below is in this diff; read a stage's block there when your dimension needs it.`, '');
  for (const stage of stages) {
    const covers = coverage.bulletText(stage.block, 'Covers').replace(/^.*?\*\*Covers:?\*\*\s*/, '').trim();
    lines.push(`- line ${stage.line}: ${stage.heading.replace(/^#+\s*/, '')}${covers ? ` — covers ${covers}` : ''}`);
  }
  if (!stages.length) lines.push('(no "Stage N" heading found in the plan)');
  lines.push('', `The acceptance criteria — ${spokePath}, verbatim:`, '');
  const register = coverage.acceptanceLinesOf(spoke).filter((line) => /^\|/.test(line));
  lines.push(...(register.length ? register : ['(no acceptance-criteria table found)']));
  const namedDocs = docsNamedIn(stages.map((stage) => stage.block.join('\n')).join('\n'), options.featureDirectory);
  if (namedDocs.length) {
    lines.push('', 'Documents the stages name (read the ones your dimension needs):', '');
    for (const doc of namedDocs) lines.push(`- ${doc.path}${doc.exists ? '' : ' — named but missing'}`);
  }
  return { title: 'The feature', lines, namedDocs };
}

function docsNamedIn(text, featureDirectory) {
  const found = new Set();
  for (const match of text.matchAll(/\b((?:section-slicing|widget-spec)\/[\w.-]+\.md|design\/[\w./-]+\.(?:png|jpe?g|webp|svg))\b/g)) found.add(match[1]);
  return [...found].map((relative) => {
    const absolute = path.join(featureDirectory, relative);
    return { path: absolute, exists: fs.existsSync(absolute) };
  });
}

function tableHeaderBefore(lines, index) {
  for (let back = index; back > 0; back--) {
    if (/^\|\s*:?-{3}/.test(lines[back]) && /^\|/.test(lines[back - 1])) return [lines[back - 1], lines[back]];
    if (!/^\|/.test(lines[back])) break;
  }
  return [];
}

function bugUnit(options) {
  const title = options.bugs.length === 1 ? `Bug ${options.bugs[0]}` : `Bugs ${options.bugs.join(', ')}`;
  const testPlanPath = path.join(options.featureDirectory, `test-plan-${options.platform}.md`);
  const testPlan = readOptional(testPlanPath);
  const lines = [];
  if (testPlan === null) return { title, lines: [`Cannot read ${testPlanPath}; read the bug entries yourself.`] };
  const planLines = testPlan.split('\n');
  const start = planLines.findIndex((line) => /^##\s+Bugs found/i.test(line));
  const spokePath = coverage.registerDocumentPath(options.featureDirectory, options.platform);
  const spoke = readOptional(spokePath);
  const register = spoke === null ? null : coverage.generalRegisterOf(spoke);
  for (const bug of options.bugs) {
    const wanted = bug.replace(/[*`~]/g, '').trim().toLowerCase();
    let rowIndex = -1;
    for (let index = Math.max(start, 0); index < planLines.length; index++) {
      if (index > start && start >= 0 && /^##\s/.test(planLines[index])) break;
      if (!/^\|/.test(planLines[index])) continue;
      const first = coverage.cellsOf(planLines[index])[0] || '';
      if (first.replace(/[*`~]/g, '').trim().toLowerCase() === wanted) { rowIndex = index; break; }
    }
    if (rowIndex === -1) {
      lines.push(`Bug ${bug} is not a row of the Bugs found table in ${testPlanPath}; read the entry yourself.`, '');
      continue;
    }
    lines.push(`Bug ${bug} — from ${testPlanPath}, line ${rowIndex + 1}, verbatim:`, '', ...tableHeaderBefore(planLines, rowIndex), planLines[rowIndex], '');
    if (register) {
      const ids = coverage.generalAcIdsIn(planLines[rowIndex], register.scheme);
      if (ids.length) {
        lines.push(`The acceptance criteria it names — ${spokePath}, verbatim:`, '');
        for (const id of ids) lines.push(...(register.rows.get(id) || [`${id}: not in the register`]));
        lines.push('');
      }
    }
  }
  return { title, lines };
}

function testsUnit(options) {
  const lines = [];
  const spokePath = coverage.registerDocumentPath(options.featureDirectory, options.platform);
  const testPlanPath = path.join(options.featureDirectory, `test-plan-${options.platform}.md`);
  lines.push(`Test plan: ${testPlanPath}${fs.existsSync(testPlanPath) ? '' : ' — missing'}`, '');
  const spoke = readOptional(spokePath);
  if (spoke === null) lines.push(`Cannot read the AC register in ${spokePath}.`);
  else {
    const register = coverage.acceptanceLinesOf(spoke).filter((line) => /^\|/.test(line));
    lines.push(`The AC register — ${spokePath}, verbatim:`, '', ...(register.length ? register : ['(no acceptance-criteria table found)']));
  }
  const hub = path.basename(spokePath) === 'TRD.md' ? null : locatedHub(options);
  if (hub && hub.text !== null) {
    const contract = coverage.sectionOf(hub.text, 5);
    const heading = hub.text.split('\n').find((line) => /^##\s+5\./.test(line));
    if (heading && /api|contract/i.test(heading)) {
      lines.push('', `The hub API contract — §5 of ${hub.path}${hub.local ? '' : ' (the hub lives in another repository)'}, verbatim:`, '', heading,
        ...contract.join('\n').replace(/\s+$/, '').split('\n'));
    } else lines.push('', `The hub at ${hub.path} has no §5 API contract to copy: read its contract where the tests need it.`);
  } else if (hub) {
    lines.push('', `No hub found for this feature (no TRD.md here, and the spoke's Hub row names none that exists): the hub API contract is not in this packet.`);
  }
  return { title: 'Tests under review', lines };
}

function groomUnit(options, docsRepo) {
  const lines = [];
  const hub = locatedHub(options);
  const hubPath = hub.path;
  const spokes = spokeNamesOf(options, hub);
  const hubWhere = hub.text === null ? ' — missing'
    : hub.local ? '' : ' — in another repository, so its edits are not in this diff: read it whole';
  lines.push(`Hub: ${hubPath}${hubWhere}`);
  const reviewed = options.platform === 'all' ? spokes : [options.platform.toLowerCase()];
  lines.push(`Spokes in this feature: ${spokes.length ? spokes.join(', ') : 'none yet'}` +
    (hub.text !== null ? ' (this directory\'s TRD-<platform>.md files and the hub\'s Spokes table)' : ''));
  if (options.platform !== 'all') lines.push(`Scoped to one spoke: ${options.platform} — the hub and that spoke`);
  const spokeTexts = [];
  for (const name of reviewed) {
    const spokePath = path.join(options.featureDirectory, `TRD-${name}.md`);
    const text = readOptional(spokePath);
    spokeTexts.push(text || '');
    lines.push(`Spoke under review: ${spokePath}${text === null ? ' — not in this directory: read it where the hub\'s Spokes table links it' : ''}`);
  }
  const folders = ['contract', 'widget-spec', 'section-slicing'].map((folder) => path.join(options.featureDirectory, folder));
  if (!hub.local && hub.text !== null) folders.unshift(path.join(path.dirname(hubPath), 'contract'));
  for (const directory of folders) {
    if (!fs.existsSync(directory)) continue;
    const entries = fs.readdirSync(directory).sort();
    lines.push(`${path.basename(directory)}/: ${entries.length ? entries.map((name) => path.join(directory, name)).join(', ') : 'empty'}`);
  }
  const texts = [readOptional(hubPath) || '', ...spokeTexts].join('\n');
  const profileDocs = new Set();
  for (const match of texts.matchAll(/\b(\d\d-[a-z][a-z0-9-]*[a-z0-9])\b/g)) {
    const candidate = path.join(docsRepo, 'docs', 'basics', `${match[1]}.md`);
    if (fs.existsSync(candidate)) profileDocs.add(candidate);
  }
  lines.push('', 'Profile docs the TRDs reference:', '', ...([...profileDocs].sort().map((doc) => `- ${doc}`)));
  if (!profileDocs.size) lines.push('- none found by name; map the TRDs to docs/basics yourself');
  const variant = variantOf(hub.text);
  return { title: 'Hub and spokes under review', lines, spokeCount: spokes.length, foundation: variant === 'foundation', variant };
}

function charterLines(options, docsRepo) {
  const charterPath = path.join(options.featureDirectory, 'review-charter.md');
  const text = readOptional(charterPath);
  if (text === null) return [`No ${charterPath}: read the docs/basics docs the change touches, mapped with the change → doc map below.`];
  const recordedLine = text.split('\n').find((line) => /profile/i.test(line) && /\b[0-9a-f]{7,40}\b/.test(line));
  const recorded = recordedLine ? recordedLine.match(/\b[0-9a-f]{7,40}\b/)[0] : null;
  const latest = git(docsRepo, ['log', '-1', '--format=%H', '--', 'docs/basics']);
  const latestCommit = latest.ok ? latest.stdout.trim() : '';
  if (!recorded) return [`${charterPath} — it records no profile commit, so its currency is unknown: treat it as stale and read the docs it summarises where your dimension needs them.`];
  if (!latestCommit) return [`${charterPath} — records profile commit ${recorded}; no commit has touched docs/basics, so it is current.`];
  const resolved = git(docsRepo, ['rev-parse', '--verify', '--quiet', `${recorded}^{commit}`]);
  if (!resolved.ok) return [`${charterPath} — records profile commit ${recorded}, which this repository does not have: treat it as stale.`];
  const current = git(docsRepo, ['merge-base', '--is-ancestor', latestCommit, resolved.stdout.trim()]).ok;
  const dirty = git(docsRepo, ['status', '--porcelain', '--', 'docs/basics']).stdout.trim();
  return [
    `${charterPath} — records profile commit ${recorded}; the last commit touching docs/basics is ${latestCommit.slice(0, 12)} → ` +
      (current ? 'current.' : 'STALE: docs/basics moved after the charter was built — read the docs it summarises where your dimension needs them.'),
    ...(dirty ? [`docs/basics has uncommitted changes: ${dirty.split('\n').map((line) => line.slice(3)).join(', ')}`] : []),
  ];
}

function settledRuns(options, kind, codeRepo, measure, excluded) {
  const runs = [];
  const testFiles = measure.files.filter((file) => file.class === 'test' && file.status !== 'D').map((file) => path.join(measure.repo, file.path));
  if (kind === 'code') {
    const args = options.stage === null
      ? [options.featureDirectory, options.platform, '--table']
      : [options.featureDirectory, options.platform, '--stage', String(options.stage), '--base', options.base];
    if (options.stage !== null && testFiles.length) args.push('--tests', ...testFiles);
    runs.push({ label: 'check-coverage.js', ...runScript('check-coverage.js', args, codeRepo) });
  }
  if (kind === 'tests') {
    const args = [options.featureDirectory, options.platform, '--test-plan', '--repo', codeRepo];
    if (options.reports.length) args.push('--report', ...options.reports.map((report) => path.resolve(report)));
    runs.push({ label: 'check-coverage.js --test-plan', ...runScript('check-coverage.js', args, codeRepo) });
  }
  if (kind === 'code' || kind === 'fix') {
    const exclusions = excluded.length ? ['--exclude', ...excluded] : [];
    runs.push({ label: 'find-orphans.js --diff', ...runScript('find-orphans.js', [codeRepo, '--diff', options.base, ...exclusions], codeRepo) });
    const planClaims = kind === 'code' && options.stage !== null
      ? ['--plan', path.join(options.featureDirectory, `plan-${options.platform}.md`), '--stage', String(options.stage)]
      : [];
    runs.push({ label: 'debt-balance.js --diff', ...runScript('debt-balance.js', [codeRepo, '--diff', options.base, ...planClaims, ...exclusions], codeRepo) });
  }
  for (const file of options.settled) {
    const text = readOptional(path.resolve(file));
    runs.push({ label: path.basename(file), command: `supplied by the author: ${path.resolve(file)}`, exitCode: 'as recorded', output: text === null ? `cannot read ${path.resolve(file)}` : text.replace(/\s+$/, '') });
  }
  return runs;
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function unitLabel(kind, options) {
  if (kind === 'code') return options.stage === null ? 'feature' : `s${options.stage}`;
  if (kind === 'fix') return options.bugs.length === 1 ? slug(options.bugs[0]) || 'bug' : `bugs-${options.bugs.map(slug).join('-')}`;
  if (kind === 'tests') return 'tests';
  return 'groom';
}

function packetStem(packetDirectory, stem, self) {
  if (self) return `${stem}-self`;
  let candidate = stem;
  for (let index = 2; fs.existsSync(path.join(packetDirectory, `${candidate}.md`)); index++) candidate = `${stem}-${index}`;
  return candidate;
}

function patchFiles(diff, patchDirectory) {
  fs.rmSync(patchDirectory, { recursive: true, force: true });
  fs.mkdirSync(patchDirectory, { recursive: true });
  const pieces = diff.split(/^(?=diff --git )/m).filter((piece) => piece.startsWith('diff --git '));
  return pieces.map((piece, index) => {
    const header = piece.split('\n')[0];
    const name = (header.match(/ b\/(.+)$/) || [null, `file-${index + 1}`])[1];
    const file = path.join(patchDirectory, `${String(index + 1).padStart(3, '0')}-${name.replace(/[^\w.-]+/g, '_')}.patch`);
    fs.writeFileSync(file, piece);
    return { name, file, lines: piece.split('\n').length };
  });
}

function assemble(title, sections) {
  const bodies = sections.map((section) => [`## ${section.title}`, '', ...section.lines, '']);
  let line = 5;
  const ranges = bodies.map((body, index) => {
    const range = `${sections[index].title.split(' — ')[0]} ${line}–${line + body.length - 2}`;
    line += body.length;
    return range;
  });
  return [`# ${title}`, '', `Contents (line ranges): ${ranges.join(' · ')}`, '', ...bodies.flat()].join('\n');
}

function build(options) {
  if (!fs.existsSync(options.featureDirectory) || !fs.statSync(options.featureDirectory).isDirectory()) {
    inputError(`${options.featureDirectory} is not a directory`);
  }
  options.featureDirectory = fs.realpathSync(options.featureDirectory);
  const kind = options.kind;
  const docsRepo = repositoryOf(options.featureDirectory);
  const codeRepo = options.repo ? repositoryOf(path.resolve(options.repo)) : docsRepo;
  const diffRepo = kind === 'groom' ? docsRepo : codeRepo;
  const relativeFeature = path.relative(docsRepo, options.featureDirectory) || '.';
  const featureSpec = kind === 'groom'
    ? [`:(glob)${relativeFeature}/TRD*.md`, ...['widget-spec', 'section-slicing', 'design', 'contract'].map((folder) => `${relativeFeature}/${folder}`)]
    : null;
  const excluded = options.exclude.map((entry) => {
    const relative = repositoryRelative(diffRepo, entry);
    if (relative === null) inputError(`--exclude ${entry} is not inside ${diffRepo}`);
    return relative;
  });
  const pathspec = [...(featureSpec || ['.', ':(exclude).alpha-sdlc']), ...excluded.map((entry) => `:(exclude)${entry}`)];
  const feature = path.basename(options.featureDirectory);
  const self = options.self;
  const packetDirectory = path.join(stateDirectoryFor(diffRepo), 'review');
  const platformPart = kind === 'groom' && options.platform === 'all' ? null : options.platform;
  const stem = packetStem(packetDirectory, [feature, platformPart, unitLabel(kind, options)].filter(Boolean).join('-'), self);
  const packetPath = path.join(packetDirectory, `${stem}.md`);

  let measure;
  try {
    measure = measureTier({ repo: diffRepo, base: options.base, head: options.head, pathspec });
  } catch (error) {
    if (error instanceof TierInputError) inputError(error.message);
    throw error;
  }
  const tiered = (kind === 'code' || kind === 'fix') && !self;
  const tier = self ? 'self' : tiered ? measure.tier : 'full';
  const tierReasons = self ? ['the author\'s self-review — no reviewer; the phase is reviewed once, at its end']
    : tiered ? measure.reasons : [kind === 'tests'
      ? 'test reviews keep both dimensions on every diff'
      : 'grooming reviews keep their dimensions on every diff'];

  const unit = kind === 'code' ? (options.stage === null ? featureUnit(options) : stageUnit(options))
    : kind === 'fix' ? bugUnit(options) : kind === 'tests' ? testsUnit(options) : groomUnit(options, docsRepo);
  const definition = loadDimensions(kind);
  const shaped = shapeDimensions(definition, {
    kind, spokeCount: unit.spokeCount || 0, foundation: Boolean(unit.foundation), options, tier,
  });
  const triggers = activeTriggers({ kind, measure, platform: options.platform });
  const rules = selectRules(options, triggers);
  keepStateOutOfGit(diffRepo);
  const treeHash = treeHashOf(diffRepo);
  const snapshot = options.head ? null : snapshotTree(diffRepo);
  const target = options.head || snapshot;
  const headCommit = git(diffRepo, ['rev-parse', 'HEAD']).stdout.trim();
  const reportPath = (id) => path.join(packetDirectory, `${stem}-${id}.md`);
  const scriptOnly = tier === 'script-only';
  const noReviewer = scriptOnly || self;
  const withCritic = !noReviewer && tier !== 'light';
  const reRuns = (kind === 'code' || kind === 'fix') ? '; it also re-runs the change\'s own tests and the sabotage checks' : '';
  const scope = kind === 'code' ? (options.stage === null ? ' · the whole feature' : ` · stage ${options.stage}`)
    : kind === 'fix' ? ` · ${options.bugs.length === 1 ? 'bug' : 'bugs'} ${options.bugs.join(', ')}` : '';

  const header = {
    title: 'Header',
    lines: [
      `- Kind: ${self ? SELF_LABEL[kind] : kind === 'code' && options.stage !== null ? KIND_LABEL.stage : KIND_LABEL[kind]} (${definition.skill} · ${definition.step})`,
      ...(unit.variant ? [unit.variant === 'feature'
        ? '- Variant: feature — no variant notes; the checklist reads as written'
        : `- Variant: ${unit.variant} — read grooming-review.md → *Variants* before the checklist`] : []),
      `- Feature: ${options.featureDirectory} · platform ${options.platform}${scope}`,
      `- Repository: ${diffRepo}`,
      `- Base: ${measure.base} · HEAD: ${headCommit || 'none'} · compared with: ${options.head ? `${options.head} (${measure.head})` : 'the working tree, untracked files included'}`,
      treeHash.tree
        ? `- Tree hash: ${treeHash.tree} (\`scan-record.js --hash\`). Re-run a plugin script only if \`node ${scriptPath('scan-record.js')} --hash ${diffRepo}\` prints another tree.`
        : `- Tree hash: unavailable (${treeHash.why}) — the settled outputs below are not pinned to a tree: the owning dimension re-runs what it relies on.`,
      `- Snapshot: ${snapshot || 'none'}${snapshot ? ' (the working tree this packet diffs)' : ''}`,
      `- Tier: ${tier} — ${tierReasons.join('; ')}`,
      ...(excluded.length
        ? [`- Excluded by the author (another session's work — out of the tier, the map, the diff and the sweeps): ${excluded.map((entry) => `\`${entry}\``).join(', ')}`]
        : []),
      `- Written: ${new Date().toISOString()}`,
    ],
  };

  const dimensionLines = [];
  if (self) {
    dimensionLines.push('- Launch: no reviewer — the author\'s self-review. Walk the checklist items below yourself against this packet, each answered with the line or the command that settles it. The phase is reviewed once, at its end.');
  } else if (scriptOnly) {
    dimensionLines.push('- Launch: no reviewer. The diff cannot change reachable production behaviour — close on the settled outputs and its own suite.');
  } else if (shaped.single) {
    dimensionLines.push(`- Launch: one \`alpha-sdlc:sdlc-reviewer\` runs every dimension below${tier === 'light' ? ' (light tier)' : ''}${reRuns}. Then \`review-gaps.js\`${withCritic ? ', then `alpha-sdlc:sdlc-reviewer-critic` with the report and the gaps output' : ''}.`);
  } else {
    dimensionLines.push('- Launch: one reviewer per dimension, the whole round in one message, in the foreground (at most 3 in flight). Then `review-gaps.js`, then `alpha-sdlc:sdlc-reviewer-critic` with the reports and the gaps output.');
  }
  for (const dimension of shaped.dimensions) {
    const checklist = checklistPathOf(dimension, definition.skill);
    dimensionLines.push(self
      ? `- ${dimension.id} · ${dimension.name} · items ${dimension.items.join(', ')} · checklist ${checklist.path}`
      : `- ${dimension.id} · ${dimension.name} · items ${dimension.items.join(', ')}` +
        (dimension.testQuality ? ' · re-runs the change\'s own tests and the sabotage checks' : '') +
        ` · agent ${shaped.single ? 'alpha-sdlc:sdlc-reviewer' : dimension.agent || 'alpha-sdlc:sdlc-reviewer'}` +
        ` · checklist ${checklist.path}` + (shaped.single ? '' : ` · report ${reportPath(dimension.id)}`));
    if (checklist.note) dimensionLines.push(`  - ${checklist.note}`);
  }
  const reportIds = shaped.single ? ['single'] : shaped.dimensions.map((dimension) => dimension.id);
  if (!noReviewer && shaped.single) {
    dimensionLines.push(`- single · every dimension above (${shaped.dimensions.map((dimension) => dimension.id).join(', ')}) · items ${[...new Set(shaped.dimensions.flatMap((dimension) => dimension.items))].sort((a, b) => a - b).join(', ')} · report ${reportPath('single')}`);
  }
  if (withCritic) {
    const reads = kind === 'groom'
      ? 'the reports, this map, the diff stat, the gaps output and the author\'s section map (grooming-review.md → *How the grooming review runs*, step 3)'
      : 'the reports, this map, the diff stat and the gaps output';
    dimensionLines.push(`- critic · \`alpha-sdlc:sdlc-reviewer-critic\` after \`review-gaps.js\` · reads ${reads} · the author files its report at ${reportPath('critic')}`);
  }
  for (const note of shaped.notes) dimensionLines.push(`- Note: ${note}`);
  if (!noReviewer) {
    dimensionLines.push(`- Gaps: \`node ${scriptPath('review-gaps.js')} --packet ${packetPath} --reports ${reportIds.map(reportPath).join(' ')}\``);
  }

  const mapLines = [];
  const owned = measure.files.map((file) => ({ file, owners: ownersOf(file, shaped.dimensions) }));
  for (const { file, owners } of owned) {
    const size = file.binary ? 'binary' : `+${file.added} -${file.deleted}`;
    mapLines.push(`- \`${file.path}\` → ${owners.length ? owners.join(', ') : 'UNOWNED'} · ${file.class} ${file.status} ${size}${file.flags.length ? ` [${file.flags.join(', ')}]` : ''}`);
  }
  if (!owned.length) mapLines.push('- (no file changed)');
  const unowned = owned.filter(({ owners }) => !owners.length).map(({ file }) => file.path);
  if (unowned.length) mapLines.push('', `UNOWNED files fall to no dimension: name one for each, or say in the verdict that it went unreviewed and why.`);

  const range = target ? [measure.base, target] : [measure.base];
  const spec = ['--', ...pathspec];
  const stat = git(diffRepo, ['diff', '--stat=200', '-M', ...range, ...spec]).stdout.replace(/\s+$/, '');
  const untrackedNote = !target && !options.head ? measure.files.filter((file) => file.status === '?').map((file) => `- untracked: ${file.path}`) : [];
  const statLines = stat ? [...fenced(stat), ...untrackedNote] : ['(empty)', ...untrackedNote];

  const sections = [header, { title: 'Reviewers', lines: dimensionLines }, { title: 'File → dimension map', lines: mapLines }, { title: 'Diff stat', lines: statLines }, unit];
  sections.push({ title: 'Review charter', lines: charterLines(options, docsRepo) });
  const verify = options.verify ? readOptional(path.resolve(options.verify)) : null;
  sections.push({
    title: 'Author\'s verification',
    lines: options.verify
      ? (verify === null ? [`cannot read ${path.resolve(options.verify)}`] : [`From ${path.resolve(options.verify)} — verbatim:`, '', ...fenced(verify)])
      : kind === 'groom'
        ? ['None supplied — a TRD review runs no suite; the doc checks arrive as settled outputs (--settled).']
        : ['None supplied: the author\'s runs are unverified, so the test-quality dimension (or the single reviewer) runs the change\'s own tests.'],
  });
  const runs = settledRuns(options, kind, codeRepo, measure, excluded);
  const settledLines = [treeHash.tree
    ? `Settled on tree ${treeHash.tree}: nobody re-runs these unless the tree hash differs.`
    : 'Not pinned to a tree hash (see Header): re-run what you rely on and say so.'];
  for (const run of runs) settledLines.push('', `### ${run.label} — exit ${run.exitCode}`, '', `\`${run.command}\``, '', ...fenced(run.output || '(no output)'));
  if (!runs.length) settledLines.push('', 'No plugin script applies to this kind of review; the author attaches doc-check outputs with --settled.');
  sections.push({ title: 'Settled script outputs', lines: settledLines });

  const mapRule = kind === 'code' || kind === 'fix' ? changeDocMapRule(rules.placed) : null;
  if (kind === 'code' || kind === 'fix') {
    sections.push({
      title: 'Change → doc map',
      lines: mapRule
        ? [`From ${rules.principlesPath} lines ${mapRule.range[0]}–${mapRule.range[1]} — verbatim:`, '', ...mapRule.text.replace(/\s+$/, '').split('\n')]
        : ['No change → doc map found in principles.md: map the change to docs/basics by the doc titles.'],
    });
  }

  const ruleLines = [];
  const activeList = [...triggers.entries()].map(([trigger, why]) => `${trigger} (${why})`).join(' · ');
  ruleLines.push(`Selected from ${rules.principlesPath}${rules.note ? '' : ` through ${rules.applicabilityPath}`}. Active review triggers: ${activeList}.`);
  if (rules.note) ruleLines.push(`${rules.note}.`);
  for (const note of rules.notes) ruleLines.push(`- ${note}`);
  ruleLines.push('Verbatim, in file order:', '');
  for (const rule of rules.included) {
    if (mapRule && rule.id === mapRule.id) ruleLines.push(`*${rule.title}* (lines ${rule.range[0]}–${rule.range[1]}) is in the Change → doc map section above.`, '');
    else ruleLines.push(...rule.text.split('\n'));
  }
  sections.push({ title: 'Principles this change can violate', lines: ruleLines });
  sections.push({
    title: 'Withheld rules',
    lines: rules.withheld.length
      ? ['Open one only by its line range, and only when the change turns out to reach it:', '', ...rules.withheld.map(({ rule, triggers: listed }) =>
        `- *${rule.title}* — ${rules.principlesPath} lines ${rule.range[0]}–${rule.range[1]} — review: ${listed.join(', ')} — ${listed.map((trigger) => TRIGGER_ABSENT[trigger] || 'inactive').join('; ')}`)]
      : ['None — every rule is in the section above.'],
  });

  const diffArgs = ['diff', '-M', ...range, ...spec];
  let diffText = git(diffRepo, diffArgs).stdout;
  if (!target && !options.head) {
    for (const file of measure.files.filter((candidate) => candidate.status === '?')) {
      diffText += spawnSync('git', ['-C', diffRepo, 'diff', '--no-index', '--', '/dev/null', file.path], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).stdout || '';
    }
  }
  if (kind === 'groom' && diffText) {
    const pieces = diffText.split(/^(?=diff --git )/m).filter((piece) => piece.startsWith('diff --git '));
    const isNew = (piece) => /^new file mode/m.test(piece.split('@@')[0]);
    const created = pieces.filter(isNew).map((piece) => (piece.split('\n')[0].match(/ b\/(.+)$/) || [])[1]).filter(Boolean);
    diffText = pieces.filter((piece) => !isNew(piece)).join('');
    if (created.length) sections.push({ title: 'New documents', lines: ['New since the base — read them whole:', '', ...created.map((name) => `- ${path.join(diffRepo, name)}`)] });
  }
  const diffLineCount = diffText ? diffText.replace(/\s+$/, '').split('\n').length : 0;
  const diffLines = [`\`git diff -M ${range.map((value) => value.slice(0, 12)).join(' ')}\` — ${diffLineCount} line(s).`, ''];
  if (!diffLineCount) diffLines.push('(empty)');
  else if (diffLineCount <= INLINE_DIFF_LIMIT) diffLines.push(...fenced(diffText, 'diff'));
  else {
    const patches = patchFiles(diffText, path.join(packetDirectory, `${stem}.patches`));
    diffLines.push(`Over ${INLINE_DIFF_LIMIT} lines, so it is split per file — read the ones your dimension owns:`, '');
    for (const patch of patches) diffLines.push(`- \`${patch.name}\` → ${patch.file} (${patch.lines} lines)`);
  }
  sections.push({ title: 'Diff', lines: diffLines });

  const subject = kind === 'code' ? (options.stage === null ? 'feature review' : `stage ${options.stage} self-review`)
    : kind === 'fix' ? `${self ? 'self-review of' : 'fix review of'} ${options.bugs.join(', ')}`
      : kind === 'tests' ? 'test review' : 'grooming review';
  const packet = assemble(`${self ? 'Self-review packet' : 'Review packet'} — ${feature} · ${options.platform} · ${subject}`, sections);
  fs.mkdirSync(packetDirectory, { recursive: true });
  fs.writeFileSync(packetPath, packet.endsWith('\n') ? packet : packet + '\n');

  const summary = [
    packetPath,
    `tier: ${tier} — ${tierReasons.join('; ')}`,
    self ? 'reviewers: none — the author\'s self-review: walk the checklist against this packet'
      : scriptOnly ? 'reviewers: none — close on the settled outputs'
      : shaped.single ? `reviewers: one alpha-sdlc:sdlc-reviewer for ${shaped.dimensions.map((dimension) => dimension.id).join(', ')} → ${reportPath('single')}${withCritic ? ', then the critic' : ''}`
        : `reviewers: ${shaped.dimensions.map((dimension) => `${dimension.id} (${dimension.agent || 'alpha-sdlc:sdlc-reviewer'})`).join(', ')} → ${reportPath('<id>')}, then the critic`,
    `settled: ${runs.map((run) => `${run.label} exit ${run.exitCode}`).join(' · ') || 'none'}`,
    excluded.length ? `excluded: ${excluded.join(', ')}` : null,
    unowned.length && !self ? `UNOWNED: ${unowned.join(', ')}` : null,
  ].filter(Boolean);
  return summary.join('\n') + '\n';
}

function main(argv) {
  try {
    process.stdout.write(build(parseArguments(argv)));
  } catch (error) {
    if (!(error instanceof PacketInputError)) throw error;
    process.stderr.write(`review-packet: ${error.message}\n${USAGE}`);
    process.exit(2);
  }
}

module.exports = { parseArguments, shapeDimensions, activeTriggers, ownersOf };

if (require.main === module) main(process.argv.slice(2));
