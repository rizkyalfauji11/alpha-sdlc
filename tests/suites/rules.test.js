#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createSuite, pluginRoot } = require('../lib/harness');

process.env.CLAUDE_PLUGIN_ROOT = pluginRoot;

const { parsePrinciples, readPrinciples, principlesPath } = require('../../scripts/lib/rules');
const coverageModule = require('../../scripts/rule-coverage');

const suite = createSuite('rules');
const { projectFixture, runScript, report, finish } = suite;

const BUILD = 'build-rules.js';
const BUDGETS = 'check-size-budgets.js';
const COVERAGE = 'rule-coverage.js';
const budgets = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'size-budgets.json'), 'utf8'));

const PRINCIPLES = [
  '# Fixture principles',
  '',
  'Every skill applies these.',
  '',
  '## Mindset — stay lazy',
  '',
  'Lazy means **efficient, not careless at any hour of the day**.',
  '',
  '## Working agreements',
  '',
  '- **Ask, don\'t assume.** Surface open questions and wait for answers. **But a question already',
  '  answered is not asked again, and a reversal is named.**',
  '- **When you ask, wait for the answer — no timeout.** Asking is the end of your turn.',
  '- **UI containers must never clip — verify at the extremes.** Every variable-content container',
  '  fits its content or scrolls.',
  '- **Auto-run mode — the one exception.** The user opts in explicitly, per invocation.',
  '',
].join('\n');

const RULE = {
  mindset: 'mindset',
  ask: 'ask-don-t-assume',
  wait: 'when-you-ask-wait-for-the-answer-no-timeout',
  clip: 'ui-containers-must-never-clip-verify-at-the-extremes',
  auto: 'auto-run-mode-the-one-exception',
};

const applicabilityWith = (overrides) => ({
  bundles: {
    execute: { skills: ['do-alpha'] },
    groom: { skills: ['do-beta'] },
    ui: { skills: [], readWhen: 'client platform: web, android, ios' },
  },
  rules: {
    [RULE.mindset]: { bundles: ['*'], digest: false, review: ['never'] },
    [RULE.ask]: { bundles: ['*'], digest: true, review: ['always'] },
    [RULE.wait]: { bundles: ['*'], digest: true, review: ['always'] },
    [RULE.clip]: { bundles: ['groom', 'ui'], digest: false, review: ['ui'] },
    [RULE.auto]: { bundles: ['execute'], digest: false, review: ['code'] },
    ...overrides,
  },
});

function git(root, ...args) {
  return spawnSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args],
    { encoding: 'utf8' });
}

function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    if (content === null) {
      fs.rmSync(target, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
}

function editFile(root, relativePath, transform) {
  const target = path.join(root, relativePath);
  fs.writeFileSync(target, transform(fs.readFileSync(target, 'utf8')));
}

const readOutput = (directory, name) => fs.readFileSync(path.join(directory, name), 'utf8');

{
  const text = fs.readFileSync(principlesPath, 'utf8');
  const rules = readPrinciples();
  report('scripts/lib/rules.js', 'principles.md parses into rules that rejoin to the file byte for byte',
    rules.map((rule) => rule.text).join('\n') === text);
  const ids = rules.map((rule) => rule.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  report('scripts/lib/rules.js', 'every rule id in principles.md is unique', !duplicates.length, `duplicated: ${duplicates.join(', ')}`);

  const parsed = parsePrinciples(PRINCIPLES);
  report('scripts/lib/rules.js', 'a fixture with a wrapped bold lead rejoins byte for byte and keeps the rule kinds',
    parsed.map((rule) => rule.text).join('\n') === PRINCIPLES &&
    parsed.map((rule) => rule.kind).join(',') === 'preamble,section,heading,agreement,agreement,agreement,agreement' &&
    parsed.map((rule) => rule.id).join(',') === ['preamble', RULE.mindset, 'working-agreements', RULE.ask, RULE.wait, RULE.clip, RULE.auto].join(','),
    parsed.map((rule) => `${rule.kind}:${rule.id}`).join(' '));
}

function buildFixture(name, applicability) {
  const directory = projectFixture('build-' + name, {
    'principles.md': PRINCIPLES,
    'applicability.json': JSON.stringify(applicability, null, 2),
  });
  const args = ['--principles', path.join(directory, 'principles.md'), '--applicability', path.join(directory, 'applicability.json'),
    '--out', path.join(directory, 'rules')];
  return { directory, out: path.join(directory, 'rules'), args };
}

{
  const fixture = buildFixture('clean', applicabilityWith());
  const built = runScript(BUILD, fixture.args);
  const produced = fs.existsSync(fixture.out) ? fs.readdirSync(fixture.out).sort().join(',') : '';
  report(BUILD, 'writes one file per bundle and the compact digest',
    built.exitCode === 0 && produced === 'compact-digest.md,execute.md,groom.md,ui.md', [built.stdout, built.stderr, produced]);
  const checked = runScript(BUILD, [...fixture.args, '--check']);
  report(BUILD, '--check is clean right after a build', checked.exitCode === 0, [checked.stdout, checked.stderr]);

  const execute = readOutput(fixture.out, 'execute.md');
  const executeLines = execute.split('\n');
  report(BUILD, 'a bundle opens with the one-line generated notice naming its skills',
    executeLines[0] === 'Generated from `principles.md` by `scripts/build-rules.js` for: do-alpha. Edit `principles.md`, never this file.' &&
    executeLines[1] === '' && executeLines[2] === '# Fixture principles', executeLines.slice(0, 3));
  const order = ['## Mindset', '## Working agreements', '**Ask, don\'t assume.**', '**When you ask, wait', '**Auto-run mode'].map((marker) => execute.indexOf(marker));
  report(BUILD, 'a bundle keeps its rules verbatim in file order under the Working agreements heading',
    order.every((position, index) => position > 0 && (index === 0 || position > order[index - 1])) &&
    execute.includes('- **Ask, don\'t assume.** Surface open questions and wait for answers. **But a question already\n  answered is not asked again, and a reversal is named.**'),
    `positions ${order.join(', ')}`);
  report(BUILD, 'a bundle leaves out the rules it does not carry and lists them at the end',
    !execute.includes('variable-content container') &&
    execute.trimEnd().endsWith('Not in this bundle (they do not govern these skills, or bind through the add-on named beside them):\n' +
      '- *UI containers must never clip* — in `rules/ui.md`\n\n`rules/ui.md` is read when client platform: web, android, ios.'),
    execute.slice(-200));

  const groom = readOutput(fixture.out, 'groom.md');
  report(BUILD, '"*" reaches every bundle that names skills, and a named bundle gets its own rules',
    groom.includes('**UI containers must never clip') && groom.includes('**Ask, don\'t assume.**') &&
    !groom.includes('opts in explicitly') && groom.includes('- *Auto-run mode*'), groom.slice(-200));

  const ui = readOutput(fixture.out, 'ui.md');
  report(BUILD, 'an add-on bundle with no skills carries only the rules naming it',
    ui.includes('**UI containers must never clip') && !ui.includes('Ask, don\'t assume') && !ui.includes('## Mindset') &&
    ui.startsWith('Generated from `principles.md` by `scripts/build-rules.js` for: read when client platform: web, android, ios.') &&
    ui.trimEnd().endsWith("This bundle adds to the reading skill's own bundle; every other rule binds through that bundle."), ui);

  const digest = readOutput(fixture.out, 'compact-digest.md');
  report(BUILD, 'the digest has one line per digest rule: title, then its bold spans of 25 chars or more',
    digest.includes('- **Ask, don\'t assume** — But a question already answered is not asked again, and a reversal is named.\n') &&
    digest.includes('- **When you ask, wait for the answer** — no timeout.\n') &&
    !digest.includes('Mindset') && !digest.includes('Auto-run'), digest);

  editFile(fixture.out, 'execute.md', (text) => text.replace('Asking is the end of your turn.', 'Asking is optional.'));
  const stale = runScript(BUILD, [...fixture.args, '--check']);
  report(BUILD, '--check fails and names a bundle edited by hand', stale.exitCode === 1 && stale.stdout.includes('execute.md is stale'), stale.stdout);

  fs.writeFileSync(path.join(fixture.out, 'old-bundle.md'), 'left behind\n');
  const rebuilt = runScript(BUILD, fixture.args);
  const orphan = runScript(BUILD, [...fixture.args, '--check']);
  report(BUILD, 'a rules file no bundle produces is noted by the build and fails --check',
    /note: .*old-bundle\.md/.test(rebuilt.stdout) && orphan.exitCode === 1 && orphan.stdout.includes('old-bundle.md'),
    [rebuilt.stdout, orphan.stdout]);
}

{
  const fixture = buildFixture('no-agreement', applicabilityWith({
    [RULE.ask]: { bundles: ['execute'] },
    [RULE.wait]: { bundles: ['execute'] },
    [RULE.clip]: { bundles: ['ui'] },
  }));
  runScript(BUILD, fixture.args);
  const groom = readOutput(fixture.out, 'groom.md');
  report(BUILD, 'a bundle with no agreement selected drops the Working agreements heading',
    groom.includes('## Mindset') && !groom.includes('## Working agreements'), groom);
}

const failingBuilds = [
  { name: 'an applicability entry naming an unknown rule fails the build', expect: '"bogus-rule", which is no rule',
    applicability: applicabilityWith({ 'bogus-rule': { bundles: ['*'] } }) },
  { name: 'a rule without an applicability entry fails the build', expect: `rule "${RULE.wait}"`,
    applicability: (() => { const value = applicabilityWith(); delete value.rules[RULE.wait]; return value; })() },
  { name: 'a rule naming an unknown bundle fails the build', expect: 'unknown bundle "review"',
    applicability: applicabilityWith({ [RULE.auto]: { bundles: ['review'] } }) },
  { name: 'a rule in no bundle fails the build', expect: 'is in no bundle',
    applicability: applicabilityWith({ [RULE.auto]: { bundles: [] } }) },
  { name: 'an unknown review trigger fails the build', expect: 'unknown review trigger "sometimes"',
    applicability: applicabilityWith({ [RULE.auto]: { bundles: ['execute'], review: ['sometimes'] } }) },
];

for (const failing of failingBuilds) {
  const fixture = buildFixture(failing.name.replace(/\W+/g, '-'), failing.applicability);
  const built = runScript(BUILD, fixture.args);
  const checked = runScript(BUILD, [...fixture.args, '--check']);
  report(BUILD, failing.name,
    built.exitCode === 1 && checked.exitCode === 1 && built.stdout.includes(failing.expect) && !fs.existsSync(fixture.out),
    [built.stdout, checked.stdout]);
}

{
  const fixture = buildFixture('missing-applicability', applicabilityWith());
  fs.rmSync(path.join(fixture.directory, 'applicability.json'));
  const checked = runScript(BUILD, [...fixture.args, '--check']);
  report(BUILD, '--check fails when applicability.json does not exist', checked.exitCode === 1 && checked.stdout.includes('not found'), checked.stdout);

  const skillsRoot = projectFixture('build-skills', {
    'skills/do-alpha/SKILL.md': '# alpha\n',
    'skills/do-gamma/SKILL.md': '# gamma\n',
  });
  const withSkills = buildFixture('skills-check', applicabilityWith());
  const unassigned = runScript(BUILD, [...withSkills.args, '--skills', path.join(skillsRoot, 'skills')]);
  report(BUILD, 'with --skills, a bundle naming a missing skill and a skill in no bundle both fail',
    unassigned.exitCode === 1 && unassigned.stdout.includes('names "do-beta", which has no skills/do-beta/SKILL.md') &&
    unassigned.stdout.includes('skill "do-gamma" is in no bundle'), unassigned.stdout);
}

{
  const realApplicability = path.join(pluginRoot, 'rules', 'applicability.json');
  if (fs.existsSync(realApplicability)) {
    const real = runScript(BUILD, ['--check']);
    report(BUILD, 'the real rule bundles and digest are fresh', real.exitCode === 0, [real.stdout, real.stderr]);
  } else {
    report(BUILD, 'the real rules/applicability.json is not written yet — the real --check is skipped', true);
  }
}

const SMALL_BODY = '# Skill\n\n## Gates\n\n- Step 1 → ⏸ STOP for approval.\n\n## Flow\n\nDo the work.\n\n## Resume (fresh session)\n\nRead the next-file.\n';
const skillFile = (body, description) => `---\nname: do-x\ndescription: ${description || 'A short description.'}\n---\n\n${body}`;
const padding = (chars) => ('Plain filler sentence without any gate words in it at all. '.repeat(Math.ceil(chars / 59))).slice(0, chars);

function budgetRun(name, files) {
  const root = projectFixture('budgets-' + name, {
    'principles.md': '# Principles\n',
    'agents/reviewer.md': '---\nname: reviewer\n---\n\nReview the packet.\n',
    ...files,
  });
  const result = runScript(BUDGETS, ['--json'], { env: { CLAUDE_PLUGIN_ROOT: root } });
  let parsed = { failures: [], warnings: [] };
  try { parsed = JSON.parse(result.stdout); } catch {}
  return { ...result, kinds: parsed.failures.map((failure) => failure.kind), warningKinds: parsed.warnings.map((warning) => warning.kind) };
}

{
  const clean = budgetRun('clean', { 'skills/do-x/SKILL.md': skillFile(SMALL_BODY) });
  report(BUDGETS, 'a skill inside every budget passes', clean.exitCode === 0 && !clean.kinds.length, [clean.stdout, clean.stderr]);

  const gateBody = SMALL_BODY + padding(budgets.gateLineMaxOffsetChars) + '\n\n8. **Present + ⏸ STOP** — wait for approval.\n';
  const lateGate = budgetRun('late-gate', { 'skills/do-x/SKILL.md': skillFile(gateBody) });
  report(BUDGETS, `a gate line past char ${budgets.gateLineMaxOffsetChars} of the body fails`,
    lateGate.exitCode === 1 && lateGate.kinds.includes('gate-offset') && lateGate.kinds.includes('skill-body'), lateGate.kinds);

  const noGates = budgetRun('no-gates', { 'skills/do-x/SKILL.md': skillFile(SMALL_BODY.replace('## Gates', '## Checkpoints')) });
  report(BUDGETS, 'a SKILL.md without a ## Gates section fails', noGates.exitCode === 1 && noGates.kinds.join() === 'skill-section', noGates.kinds);

  const slicingTarget = budgets.skillBodyTargetChars['do-slicing'];
  const overTarget = budgetRun('over-target', { 'skills/do-slicing/SKILL.md': skillFile(SMALL_BODY + padding(slicingTarget + 200)) });
  report(BUDGETS, 'a body over its soft target but under the hard cap only warns',
    overTarget.exitCode === 0 && overTarget.warningKinds.includes('skill-target'), [overTarget.stdout]);

  const longDescription = budgetRun('description', { 'skills/do-x/SKILL.md': skillFile(SMALL_BODY, padding(budgets.descriptionMaxChars + 10)) });
  report(BUDGETS, 'a description over the listing cap fails', longDescription.kinds.includes('description'), longDescription.kinds);

  const manyLines = Array.from({ length: 60 }, (_, index) => `Line ${index}.`).join('\n');
  const reference = (contents) => `# Reference\n\n${contents}\n## First part\n\n${manyLines}\n\n## Second part\n\n${manyLines}\n`;
  const noToc = budgetRun('no-toc', { 'skills/do-x/SKILL.md': skillFile(SMALL_BODY), 'skills/do-x/guide.md': reference('') });
  const withToc = budgetRun('with-toc', {
    'skills/do-x/SKILL.md': skillFile(SMALL_BODY),
    'skills/do-x/guide.md': reference('Contents: [First part](#first-part) · [Second part](#second-part)\n'),
  });
  report(BUDGETS, 'a reference file over 100 lines needs a table of contents naming its sections',
    noToc.kinds.includes('reference-toc') && withToc.exitCode === 0, [noToc.kinds, withToc.stdout]);

  const oversized = budgetRun('oversized', {
    'skills/do-x/SKILL.md': skillFile(SMALL_BODY),
    'skills/do-x/plan-template.md': padding(budgets.templateMaxChars + 1),
    'skills/do-x/templates/01-doc.md': padding(budgets.templateMaxChars + 1),
    'skills/do-x/notes.md': padding(budgets.referenceFileMaxChars + 1),
    'rules/execute.md': padding(budgets.bundleMaxChars.execute + 1),
    'rules/mystery.md': 'a bundle nobody budgeted\n',
    'rules/compact-digest.md': padding(budgets.compactDigestMaxChars + 1),
    'plain-language/id.md': padding(budgets.plainLanguageGuideMaxChars + 1),
    'principles.md': padding(budgets.principlesMaxChars + 1),
  });
  const expectedKinds = ['template', 'template', 'reference', 'bundle', 'bundle', 'compact-digest', 'plain-language-guide', 'principles'];
  report(BUDGETS, 'templates, references, bundles, an unbudgeted bundle, the digest, the guide and principles.md each fail over budget',
    expectedKinds.every((kind) => oversized.kinds.filter((found) => found === kind).length >= expectedKinds.filter((other) => other === kind).length),
    oversized.kinds);

  const real = runScript(BUDGETS, ['--json']);
  let realReport = null;
  try { realReport = JSON.parse(real.stdout); } catch {}
  report(BUDGETS, 'the real plugin is measured and reported as JSON',
    [0, 1].includes(real.exitCode) && realReport && realReport.rows.some((entry) => entry.file === 'principles.md'), [real.stderr]);
}

const ALPHA = [
  '---',
  'name: do-alpha',
  'description: A fixture skill.',
  '---',
  '',
  '**Read `../../principles.md` in full now**, then apply it.',
  '',
  '## Flow',
  '',
  '1. Present the outline, then ⏸ STOP and wait for the user\'s approval before writing anything.',
  '2. Never write a section the user has not approved, and record each approval in the TRD.',
  '3. The reviewer must check 12 items, only from the packet.',
  '4. Ask the user before you change a decided value (`principles.md` → *Ask, don\'t assume*).',
  '5. Review per `do-beta` → Step 2 before closing.',
  '6. Do not merge a stage before its review closes.',
  '',
].join('\n');

const BETA = [
  '---',
  'name: do-beta',
  'description: Another fixture skill.',
  '---',
  '',
  '**Read `../../principles.md` in full now**, then apply it.',
  '',
  '### Step 2 — Review',
  '',
  'Run the review and wait for its verdict (`principles.md` → *When you ask, wait for the answer*).',
  '',
].join('\n');

const JUDGE_PROMPT = 'Judge only by rules 1–10 above. When unsure, pass and never block a message twice.';
const hooksConfig = (withPrompt) => ({
  hooks: {
    Stop: [
      { hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/stop.js"' }] },
      ...(withPrompt ? [{ hooks: [{ type: 'prompt', prompt: JUDGE_PROMPT }] }] : []),
    ],
  },
});

const CORPUS = {
  'principles.md': PRINCIPLES,
  'skills/do-alpha/SKILL.md': ALPHA,
  'skills/do-alpha/reference.md': '# Reference\n\nOnly the main agent writes gated artifacts; subagents return text.\n',
  'skills/do-beta/SKILL.md': BETA,
  'agents/reviewer.md': '---\nname: reviewer\n---\n\nYou never edit files; you only report findings with their closing command.\n',
  'plain-language/id.md': '# Panduan\n\nJangan tulis "mendarat" — selalu tulis "selesai" (never translate word for word).\n',
  'hooks/hooks.json': hooksConfig(true),
};

const STOP_CLAUSE = 'Present the outline, then ⏸ STOP and wait for the user\'s approval before writing anything.';

function coverageRepository(name, baseline) {
  const root = projectFixture('coverage-' + name.replace(/\W+/g, '-'), {});
  writeFiles(root, baseline || CORPUS);
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'baseline');
  return root;
}

function coverage(root, extraArguments) {
  const result = runScript(COVERAGE, ['--baseline', 'HEAD', '--json', ...(extraArguments || [])], { env: { CLAUDE_PLUGIN_ROOT: root } });
  let parsed = null;
  try { parsed = JSON.parse(result.stdout); } catch {}
  return { ...result, report: parsed };
}

const ledgerFile = (entries, baseline) => ({ 'tests/coverage-ledger/area.json': { baseline: baseline || 'HEAD', entries } });
const verdictOf = (run, needle) => ((run.report && run.report.unledgered) || []).filter((entry) => entry.clause.includes(needle)).map((entry) => entry.verdict).join(',');
const referenceText = (run) => ((run.report && run.report.references) || []).map((problem) => problem.message).join('\n');

{
  const root = coverageRepository('unchanged');
  const run = coverage(root);
  report(COVERAGE, 'an unchanged tree is fully covered',
    run.exitCode === 0 && run.report.clauses > 8 && run.report.counts.exact === run.report.clauses, [run.stdout, run.stderr]);
}

{
  const root = coverageRepository('deleted-stop');
  editFile(root, 'skills/do-alpha/SKILL.md', (text) => text.replace(`1. ${STOP_CLAUSE}\n`, ''));
  const run = coverage(root);
  report(COVERAGE, 'a deleted STOP sentence fails coverage as missing',
    run.exitCode === 1 && verdictOf(run, '⏸ STOP and wait') === 'missing', [run.stdout, run.stderr]);

  writeFiles(root, ledgerFile([{ clause: STOP_CLAUSE, file: 'skills/do-alpha/SKILL.md', verdict: 'removed', reason: 'TEST-1: the fixture drops it' }]));
  const ledgered = coverage(root);
  report(COVERAGE, 'a ledger entry signs the deleted sentence off',
    ledgered.exitCode === 0 && ledgered.report.counts.ledgered === 1, [ledgered.stdout]);

  writeFiles(root, ledgerFile([{ clause: STOP_CLAUSE.slice(0, 48), file: 'skills/do-alpha/SKILL.md', verdict: 'removed', reason: 'TEST-1: partial quote' }]));
  report(COVERAGE, 'a ledger entry quoting 40 or more chars of the clause matches it', coverage(root).exitCode === 0);

  writeFiles(root, ledgerFile([{ clause: STOP_CLAUSE.slice(0, 30), file: 'skills/do-alpha/SKILL.md', verdict: 'removed', reason: 'TEST-1: too short' }]));
  report(COVERAGE, 'a ledger quote shorter than 40 chars of a longer clause does not match it', coverage(root).exitCode === 1);

  writeFiles(root, ledgerFile([{ clause: STOP_CLAUSE, file: 'skills/do-alpha/SKILL.md', verdict: 'moved', reason: 'TEST-1: no where' }]));
  const invalid = coverage(root);
  report(COVERAGE, 'a ledger entry without "where" for a non-removed verdict is a ledger problem',
    invalid.exitCode === 1 && invalid.report.ledger.problems.some((problem) => problem.includes('"where"')), [invalid.stdout]);

  writeFiles(root, ledgerFile([{ clause: STOP_CLAUSE, file: 'skills/do-alpha/SKILL.md', verdict: 'deleted', reason: 'TEST-1', where: 'x' }]));
  report(COVERAGE, 'a ledger entry with an unknown verdict is a ledger problem', coverage(root).report.ledger.problems.length === 1);

  git(root, 'commit', '-q', '--allow-empty', '-m', 'later');
  writeFiles(root, ledgerFile([{ clause: STOP_CLAUSE, file: 'skills/do-alpha/SKILL.md', verdict: 'removed', reason: 'TEST-1' }], 'HEAD'));
  const otherBaseline = coverage(root, ['--baseline', 'HEAD~1']);
  report(COVERAGE, 'ledger entries written against another baseline are not applied',
    otherBaseline.exitCode === 1 && otherBaseline.report.ledger.notes.length === 1, [otherBaseline.stdout]);

  const scopedAway = coverage(root, ['--baseline', 'HEAD~1', '--files', 'skills/do-beta/**']);
  const scopedIn = coverage(root, ['--baseline', 'HEAD~1', '--files', 'skills/do-alpha']);
  report(COVERAGE, '--files limits the check to clauses from the named files',
    scopedAway.exitCode === 0 && scopedIn.exitCode === 1 && scopedAway.report.files === 1 && scopedIn.report.files === 2,
    [scopedAway.stdout, scopedIn.stdout]);
}

{
  const root = coverageRepository('reworded');
  editFile(root, 'skills/do-alpha/SKILL.md', (text) => text.replace(
    'Never write a section the user has not approved, and record each approval in the TRD.',
    'Never write any section the user has not yet approved, and record each approval in the TRD.'));
  const run = coverage(root, ['--show', 'reworded']);
  const reworded = (run.report.results || []).filter((entry) => entry.verdict === 'reworded');
  report(COVERAGE, 'a rewording that keeps every hard token passes as reworded',
    run.exitCode === 0 && reworded.length === 1 && reworded[0].clause.startsWith('Never write a section'), [run.stdout]);
}

{
  const root = coverageRepository('weakened');
  editFile(root, 'skills/do-alpha/SKILL.md', (text) => text.replace(
    'The reviewer must check 12 items, only from the packet.', 'The reviewer must check 10 items from the packet.'));
  const run = coverage(root);
  const weakened = run.report.unledgered.find((entry) => entry.clause.startsWith('The reviewer must check'));
  report(COVERAGE, 'a rewording that drops a number and "only" fails as weakened and names both',
    run.exitCode === 1 && weakened && weakened.verdict === 'weakened' && weakened.lost.includes('12') && weakened.lost.includes('only'),
    [JSON.stringify(weakened)]);
}

{
  const root = coverageRepository('negation');
  editFile(root, 'agents/reviewer.md', (text) => text.replace('you only report findings', 'you report findings only'));
  editFile(root, 'skills/do-alpha/SKILL.md', (text) => text.replace('Do not merge a stage', 'Merge a stage'));
  const run = coverage(root);
  report(COVERAGE, 'dropping a negation weakens a clause even when the content words still match',
    verdictOf(run, 'Do not merge a stage') === 'weakened' && verdictOf(run, 'only report findings') === '', [run.stdout]);
}

{
  const root = coverageRepository('moved');
  editFile(root, 'skills/do-alpha/SKILL.md', (text) => text.replace('3. The reviewer must check 12 items, only from the packet.\n', ''));
  editFile(root, 'skills/do-alpha/reference.md', (text) => `${text}\nThe reviewer must check 12 items, only from the packet.\n`);
  report(COVERAGE, 'a sentence moved verbatim to a reference file stays exact', coverage(root).exitCode === 0);

  editFile(root, 'skills/do-alpha/SKILL.md', (text) => text.replace(`1. ${STOP_CLAUSE}\n`, ''));
  editFile(root, 'skills/do-alpha/reference.md', (text) => `${text}\n${STOP_CLAUSE}\n`);
  const relocated = coverage(root);
  report(COVERAGE, 'a STOP sentence moved out of its SKILL.md fails as relocated',
    relocated.exitCode === 1 && verdictOf(relocated, '⏸ STOP and wait') === 'relocated', [relocated.stdout]);
}

{
  const root = coverageRepository('judge');
  writeFiles(root, { 'hooks/hooks.json': hooksConfig(false) });
  const lost = coverage(root);
  writeFiles(root, { 'hooks/judge-rules.md': `# Judge\n\n${JUDGE_PROMPT}\n` });
  const moved = coverage(root);
  report(COVERAGE, 'the judge prompt of the baseline hooks.json is tracked and found again in hooks/*.md',
    lost.exitCode === 1 && verdictOf(lost, 'Judge only by rules') === 'missing' && moved.exitCode === 0, [lost.stdout, moved.stdout]);
}

{
  const root = coverageRepository('references');
  editFile(root, 'skills/do-alpha/SKILL.md', (text) => text
    .replace('*Ask, don\'t assume*', '*Ask twice, assume never*')
    .replace('`do-beta` → Step 2', '`do-beta` → Step 9')
    .replace('then apply it.', 'then apply it. Keep `../../rules/missing.md` in mind.'));
  const run = coverage(root);
  const messages = referenceText(run);
  report(COVERAGE, 'an unknown rule title, a missing step and a missing plugin path each fail the references',
    run.exitCode === 1 && messages.includes('*Ask twice, assume never* names no rule') &&
    messages.includes('`do-beta` → Step 9 does not resolve') && messages.includes('`../../rules/missing.md`, which does not exist'),
    messages);

  const resolvable = coverageRepository('references-resolve');
  editFile(resolvable, 'skills/do-alpha/SKILL.md', (text) => `${text}6. Follow rules → *UI containers must never clip* on client screens.\n`);
  report(COVERAGE, 'a rules → *Title* reference to a bold lead resolves', referenceText(coverage(resolvable)) === '');
}

{
  const bundled = (text) => text.replace('**Read `../../principles.md` in full now**', '**Read `../../rules/execute.md` in full now** (and `../../rules/ui.md` on a client platform)');
  const root = coverageRepository('bundles', {
    ...CORPUS,
    'skills/do-alpha/SKILL.md': `${bundled(ALPHA)}6. Clip nothing (\`principles.md\` → *UI containers must never clip*).\n`,
    'skills/do-beta/SKILL.md': BETA.replace('`../../principles.md`', '`../../rules/groom.md`'),
    'rules/applicability.json': applicabilityWith(),
  });
  const rebuild = () => runScript(BUILD, [], { env: { CLAUDE_PLUGIN_ROOT: root } });
  const firstBuild = rebuild();
  const loaded = coverage(root);
  report(COVERAGE, 'a skill whose bundles carry every rule it cites passes the load check',
    firstBuild.exitCode === 0 && referenceText(loaded) === '' && loaded.exitCode === 0, [firstBuild.stdout, loaded.stdout]);

  writeFiles(root, { 'rules/applicability.json': applicabilityWith({ [RULE.ask]: { bundles: ['groom'] } }) });
  rebuild();
  const missingRule = coverage(root);
  report(COVERAGE, 'a skill citing a rule its bundle does not carry fails',
    missingRule.exitCode === 1 && referenceText(missingRule).includes('cites *Ask, don\'t assume*'), referenceText(missingRule));
  const fromRulesSide = coverage(root, ['--files', 'principles.md']);
  const fromOtherArea = coverage(root, ['--files', 'agents/*.md']);
  report(COVERAGE, '--files principles.md still runs the load check for every skill; another area does not',
    referenceText(fromRulesSide).includes('cites *Ask, don\'t assume*') && referenceText(fromOtherArea) === '',
    [referenceText(fromRulesSide), referenceText(fromOtherArea)]);

  writeFiles(root, { 'rules/applicability.json': applicabilityWith() });
  rebuild();
  editFile(root, 'skills/do-alpha/SKILL.md', (text) => text.replace(' (and `../../rules/ui.md` on a client platform)', ''));
  const withoutUi = coverage(root);
  report(COVERAGE, 'a skill that stops naming rules/ui.md loses the UI rules it cites',
    referenceText(withoutUi).includes('cites *UI containers must never clip*'), referenceText(withoutUi));
}

{
  const markdown = [
    '---',
    'description: You must never see this front matter line.',
    '---',
    '',
    '# Step 3 — Present and only then continue',
    '',
    '| Field | Rule |',
    '|---|---|',
    '| **Approach:** | Must name the rung, e.g. `rung 2 (reuse)`, every time it is used. |',
    '',
    '- **Inputs:** the plan and the TRD.',
    '- **The hub is groomed first.** Spokes wait for it.',
    '',
    '```',
    'never-run --this command in the fence',
    '```',
    '',
    'Short one: never.',
  ].join('\n');
  const clauses = coverageModule.clausesOf(markdown);
  report(COVERAGE, 'clauses come from headings, table cells, bold-lead items and code lines — never front matter or labels',
    clauses.length === 4 &&
    clauses[0] === 'Step 3 — Present and only then continue' &&
    clauses[1] === 'Must name the rung, e.g. `rung 2 (reuse)`, every time it is used.' &&
    clauses[2] === '**The hub is groomed first.** Spokes wait for it.' &&
    clauses[3] === 'never-run --this command in the fence',
    JSON.stringify(clauses));

  const tokens = coverageModule.hardTokensOf('Never batch more than 19,000 chars of `SKILL.md` — ⏸ STOP ★ unless ≤ 3 are left, not only one.')
    .map((token) => token.label).sort();
  report(COVERAGE, 'hard tokens are numbers, code spans, the guard words, the gate marks and a negation',
    ['19,000', '3', '`SKILL.md`', 'never', 'only', 'unless', 'STOP', '⏸', '★', '≤', 'a negation (not / no / never …)']
      .every((label) => tokens.includes(label)), JSON.stringify(tokens));
}

{
  const cli = runScript(COVERAGE, ['--baseline', 'HEAD', '--json']);
  let parsed = null;
  try { parsed = JSON.parse(cli.stdout); } catch {}
  report(COVERAGE, 'the whole real corpus is checked and reported as JSON',
    [0, 1].includes(cli.exitCode) && parsed && parsed.clauses > 1000 && parsed.files > 30, [cli.stderr]);

  const startedAt = Date.now();
  const started = process.cpuUsage();
  const inProcess = coverageModule.run({ baseline: 'HEAD', files: [], show: new Set(), json: true });
  const spent = process.cpuUsage(started);
  const cpuMs = Math.round((spent.user + spent.system) / 1000);
  report(COVERAGE, 'the whole real corpus is checked in under five CPU seconds',
    inProcess.clauses > 1000 && cpuMs < 5000, `${cpuMs} ms CPU, ${Date.now() - startedAt} ms wall`);
}

finish();
