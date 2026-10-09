#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createSuite, testPlan } = require('../lib/harness');

const suite = createSuite('scripts');
const { projectFixture, runScript, report, finish } = suite;

const spokeWith = (slices) =>
  '# Spoke\n\n## 8. Acceptance criteria\n\n| ID | AC | Source |\n|---|---|---|\n' +
  '| AC-1 | one | hub §2 |\n| AC-2 | two | hub §3 |\n| AC-3 | three | hub §5 |\n\n' +
  '## 9. Work slices\n\n' + slices + '\n';
const planWith = (stages) => '# Plan\n\n## Stages\n\n' + stages + '\n';
const TWO_SLICES = '| Slice | What | AC |\n|---|---|---|\n| **W1** | a | `AC-1` `AC-2` |\n| **W2** | b | `AC-3` |';

function coverageRun(name, spoke, plan, extraArguments, extraFiles) {
  const featureDirectory = projectFixture('coverage-' + name, {
    'TRD-web.md': spoke,
    'plan-web.md': plan,
    ...(extraFiles || {}),
  });
  const extras = (extraArguments || []).map((argument) => argument.replace('{dir}', featureDirectory));
  return runScript('check-coverage.js', [featureDirectory, 'web', ...extras]).exitCode;
}

const coverageCases = [
  { name: 'every criterion claimed inside its own slice is clean', expected: 0,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`') },
  { name: 'a criterion no stage claims is reported', expected: 1,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`') },
  { name: 'a stage claiming another slice\'s criterion without a Moved in record is reported', expected: 1,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2` · `AC-3`') },
  { name: 'a stage that pays debt and claims no criterion is clean', expected: 0,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — pay TD-4\n- **Covers:** none — pays debt\n- **Pays debt:** `TD-4` — the duplicate\n\n' +
      '### Stage 2 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n\n### Stage 3 — [UI] `W2` — b\n- **Covers:** `AC-3`') },
  { name: 'a stage that claims no criterion and pays no debt is reported', expected: 1,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — tidy\n- **Covers:** none\n- **Pays debt:** nothing\n\n' +
      '### Stage 2 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n\n### Stage 3 — [UI] `W2` — b\n- **Covers:** `AC-3`') },
  { name: 'the same claim with a Moved in record is clean', expected: 0,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2` · `AC-3`\n- **Moved in:** `AC-3` from `W2` — provable only here') },
  { name: 'a claim of a criterion missing from the register is reported', expected: 1,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3` · `AC-9`') },
  { name: 'a list-style slice with an AC range is read in full', expected: 0,
    spoke: spokeWith('- [ ] **`BE1`** — everything — **AC:** `AC-1` … `AC-3`'),
    plan: planWith('### Stage 1 — [api] `BE1` — all\n- **Covers:** `AC-1` · `AC-2` · `AC-3`') },
  { name: 'amendment prose after the warning mark is not read as a claim', expected: 0,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2` ⚠️ `AC-3` moves to Stage 2\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`') },
  { name: 'a new test titled with a criterion its stage does not cover is reported', expected: 1,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`'),
    extraArguments: ['--stage', '1', '--tests', '{dir}/a.test.ts'],
    extraFiles: { 'a.test.ts': "it('AC-3 shows the band', () => {});\n" } },
  { name: 'stages built together that record it on both sides are clean', expected: 0,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n- **Built with:** Stage 2\n- **Status:** done 2026-09-25\n- **Checkpoint verdict:** auto 2026-09-25\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`\n- **Built with:** Stage 1\n- **Status:** done 2026-09-25\n- **Checkpoint verdict:** auto 2026-09-25') },
  { name: 'a prose heading that opens with a stage number is not read as a stage', expected: 0,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`\n\n### Stage 2\'s deferred dialog extremes\nNotes only.') },
  { name: 'a one-sided built-with record is reported', expected: 1,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n- **Built with:** Stage 2\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`') },
  { name: 'a done stage without its own checkpoint verdict is reported', expected: 1,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n- **Status:** done 2026-09-25\n- **Checkpoint verdict:** pending\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`') },
  { name: 'a new test titled with its own stage\'s criterion is clean', expected: 0,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`'),
    extraArguments: ['--stage', '1', '--tests', '{dir}/a.test.ts'],
    extraFiles: { 'a.test.ts': "it('AC-1 keeps the list', () => {});\n" } },
];

for (const coverageCase of coverageCases) {
  const exitCode = coverageRun(coverageCase.name.replace(/\W+/g, '-'), coverageCase.spoke, coverageCase.plan,
    coverageCase.extraArguments, coverageCase.extraFiles);
  report('check-coverage.js', coverageCase.name, exitCode === coverageCase.expected,
    `expected exit ${coverageCase.expected}, got ${exitCode}`);
}

const featureDoneCases = [
  { name: 'a green test plan is done', expected: 0, plan: testPlan() },
  { name: 'Boot & Smoke blocked is not done', expected: 1, plan: testPlan({ smoke: '**2 of 3 critical journeys pass; journey 3 is BLOCKED** — mandatory' }) },
  { name: 'a bug fixed but not re-verified is not done', expected: 1, plan: testPlan({ bug: '**fixed 2026-09-25, NOT re-verified at the level that found it** — both sites now address it' }) },
  { name: 'a struck-through old failure does not count against a green line', expected: 0, plan: testPlan({ covered: '~~**3 of 3 · 2 passing, 1 failing**~~ **3 of 3 covered and passing** — re-tested' }) },
  { name: 'a test plan without a Boot & Smoke summary is not done', expected: 1, plan: testPlan({ smoke: null }) },
  { name: 'a missing test plan is unreadable', expected: 2, plan: null },
];

for (const featureDoneCase of featureDoneCases) {
  const name = featureDoneCase.name.replace(/\W+/g, '-');
  const featureDirectory = projectFixture('feature-done-' + name,
    featureDoneCase.plan === null ? {} : { 'test-plan-web.md': featureDoneCase.plan });
  const exitCode = runScript('check-feature-done.js', [featureDirectory, 'web']).exitCode;
  report('check-feature-done.js', featureDoneCase.name, exitCode === featureDoneCase.expected,
    `expected exit ${featureDoneCase.expected}, got ${exitCode}`);
}

function gitRepoFixture(name, before, after) {
  const root = projectFixture('orphans-' + name, before);
  const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'before');
  for (const [relativePath, content] of Object.entries(after || {})) {
    const target = path.join(root, relativePath);
    if (content === null) fs.rmSync(target, { force: true });
    else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
  }
  return root;
}

const inventoryNaming = (name) => '# Inventory\n\n| Unit | What | Where |\n|---|---|---|\n| `' + name + '` | a unit | `a.ts` |\n';
const orphanCases = [
  { name: 'a removed export still registered is reported', expected: 1, mode: ['--diff', 'HEAD'],
    before: { 'src/a.ts': 'export function oldPath() { return 1 }\n', 'docs/basics/19-code-inventory.md': inventoryNaming('oldPath') },
    after: { 'src/a.ts': 'export function newPath() { return 2 }\n' } },
  { name: 'a removed export already deregistered is clean', expected: 0, mode: ['--diff', 'HEAD'],
    before: { 'src/a.ts': 'export function oldPath() { return 1 }\n', 'docs/basics/19-code-inventory.md': inventoryNaming('oldPath') },
    after: { 'src/a.ts': 'export function newPath() { return 2 }\n', 'docs/basics/19-code-inventory.md': inventoryNaming('newPath') } },
  { name: 'a type moved to another file is not a removal', expected: 0, mode: ['--diff', 'HEAD'],
    before: { 'src/a.ts': 'export type Where = 1\n', 'docs/basics/19-code-inventory.md': inventoryNaming('Where') },
    after: { 'src/a.ts': 'export const nothing = 0\n', 'src/b.ts': 'export type Where = 1\n' } },
  { name: 'a registry row naming a unit that is gone is reported', expected: 1, mode: ['--registry'],
    before: { 'src/a.ts': 'export const present = 1\n', 'docs/basics/19-code-inventory.md': inventoryNaming('vanished') } },
  { name: 'a registry row naming a present unit is clean', expected: 0, mode: ['--registry'],
    before: { 'src/a.ts': 'export const present = 1\n', 'docs/basics/19-code-inventory.md': inventoryNaming('present') } },
  { name: 'a listed token no stylesheet defines is reported', expected: 1, mode: ['--registry'],
    before: { 'src/tokens.css': ':root { --space-1: 4px; }\n', 'docs/basics/18-design-tokens.md': '# Tokens\n\n| Token | Value |\n|---|---|\n| `--space-1` | 4 |\n| `--gone-token` | 8 |\n' } },
];

for (const orphanCase of orphanCases) {
  const root = gitRepoFixture(orphanCase.name.replace(/\W+/g, '-'), orphanCase.before, orphanCase.after);
  const exitCode = runScript('find-orphans.js', [root, ...orphanCase.mode]).exitCode;
  report('find-orphans.js', orphanCase.name, exitCode === orphanCase.expected,
    `expected exit ${orphanCase.expected}, got ${exitCode}`);
}

const REGISTER = 'docs/basics/20-tech-debt-register.md';
const registerWith = (rows) => '# Tech-Debt Register\n\n**Next ID:** `TD-9`\n\n## Open\n\n' +
  '| ID | What (plain · engineer) | Kind | Origin | Ceiling | Status |\n|---|---|---|---|---|---|\n' +
  rows.map(([id, file, status]) => `| ${id} | a debt · \`${file}\` | duplicate | setup | soon | ${status} |`).join('\n') + '\n';
const twoSources = { 'src/a.ts': 'export const a = 1\n', 'src/b.ts': 'export const b = 1\n' };
const stagesPayingDebt = '# Plan\n\n### Stage 1 — [data] `W1` — a\n- **Pays debt:** nothing\n\n' +
  '### Stage 2 — [data] `W1` — b\n- **Pays debt:** `TD-1` — the duplicate\n';
const debtCases = [
  { name: 'an open row naming a file the change edits is reported', expected: 1, mode: ['--diff', 'HEAD'],
    before: { ...twoSources, [REGISTER]: registerWith([['TD-1', 'src/a.ts', 'open']]) },
    after: { 'src/a.ts': 'export const a = 2\n' }, output: /measured\s+TD-1 .*open debt in a file this change edits/ },
  { name: 'an open row naming a file the change leaves alone is clean', expected: 0, mode: ['--diff', 'HEAD'],
    before: { ...twoSources, [REGISTER]: registerWith([['TD-1', 'src/a.ts', 'open']]) },
    after: { 'src/b.ts': 'export const b = 2\n' } },
  { name: 'a row the user accepted is clean', expected: 0, mode: ['--diff', 'HEAD'],
    before: { ...twoSources, [REGISTER]: registerWith([['TD-1', 'src/a.ts', 'accepted — a contract change · revisit at v2']]) },
    after: { 'src/a.ts': 'export const a = 2\n' }, output: /decided\s+TD-1/ },
  { name: 'a row the change pays is counted as paid', expected: 0, mode: ['--diff', 'HEAD'],
    before: { ...twoSources, [REGISTER]: registerWith([['TD-1', 'src/a.ts', 'open']]) },
    after: { 'src/a.ts': 'export const a = 2\n', [REGISTER]: registerWith([]) }, output: /1 paid · balance -1/ },
  { name: 'a row the change registers in a file it edits is reported as born undecided', expected: 1, mode: ['--diff', 'HEAD'],
    before: { ...twoSources, [REGISTER]: registerWith([]) },
    after: { 'src/a.ts': 'export const a = 2\n', [REGISTER]: registerWith([['TD-1', 'src/a.ts', 'open']]) },
    output: /registered by this change in a file it edits/ },
  { name: 'a row the change registers outside its footprint is a question', expected: 0, mode: ['--diff', 'HEAD'],
    before: { ...twoSources, [REGISTER]: registerWith([]) },
    after: { 'src/a.ts': 'export const a = 2\n', [REGISTER]: registerWith([['TD-1', 'src/b.ts', 'open']]) },
    output: /inferred\s+TD-1 .*outside the footprint/ },
  { name: 'a row a later stage pays is not charged to this stage', expected: 0,
    mode: ['--diff', 'HEAD', '--plan', '{root}/plan-web.md', '--stage', '1'],
    before: { ...twoSources, 'plan-web.md': stagesPayingDebt, [REGISTER]: registerWith([['TD-1', 'src/a.ts', 'open']]) },
    after: { 'src/a.ts': 'export const a = 2\n' }, output: /planned\s+TD-1 .*Stage 2/ },
  { name: 'a row the stage under review was to pay is still reported', expected: 1,
    mode: ['--diff', 'HEAD', '--plan', '{root}/plan-web.md', '--stage', '2'],
    before: { ...twoSources, 'plan-web.md': stagesPayingDebt, [REGISTER]: registerWith([['TD-1', 'src/a.ts', 'open']]) },
    after: { 'src/a.ts': 'export const a = 2\n' } },
  { name: 'a basename two files share names neither', expected: 0, mode: ['--diff', 'HEAD'],
    before: { 'src/a/util.ts': 'export const a = 1\n', 'src/b/util.ts': 'export const b = 1\n', [REGISTER]: registerWith([['TD-1', 'util.ts', 'open']]) },
    after: { 'src/a/util.ts': 'export const a = 2\n' } },
  { name: 'a component named without its extension is found', expected: 1, mode: ['--diff', 'HEAD'],
    before: { 'src/MonthGrid.tsx': 'export const g = 1\n', [REGISTER]: registerWith([['TD-1', 'MonthGrid', 'open']]) },
    after: { 'src/MonthGrid.tsx': 'export const g = 2\n' } },
  { name: 'planning lists the open rows under a layout directory', expected: 1, mode: ['--files', 'src/'],
    before: { ...twoSources, [REGISTER]: registerWith([['TD-1', 'src/b.ts', 'open'], ['TD-2', 'lib/c.ts', 'open']]) },
    output: /measured\s+TD-1[\s\S]*1 open in the footprint/ },
  { name: 'a repository without a register has nothing to measure', expected: 0, mode: ['--diff', 'HEAD'],
    before: twoSources, after: { 'src/a.ts': 'export const a = 2\n' }, output: /no docs\/basics\/20-tech-debt-register\.md/ },
];

for (const debtCase of debtCases) {
  const root = gitRepoFixture('debt-' + debtCase.name.replace(/\W+/g, '-'), debtCase.before, debtCase.after);
  const { exitCode, stdout } = runScript('debt-balance.js', [root, ...debtCase.mode.map((argument) => argument.replace('{root}', root))]);
  const ok = exitCode === debtCase.expected && (!debtCase.output || debtCase.output.test(stdout));
  report('debt-balance.js', debtCase.name, ok, [`expected exit ${debtCase.expected}, got ${exitCode}`, stdout]);
}

const moreDebtCases = [
  { name: 'a row an earlier stage claimed and left open is still reported', expected: 1,
    mode: ['--diff', 'HEAD', '--plan', '{root}/plan-web.md', '--stage', '2'],
    before: { ...twoSources, 'plan-web.md': '# Plan\n\n### Stage 1 — [data] `W1` — a\n- **Pays debt:** `TD-1`\n\n### Stage 2 — [data] `W1` — b\n- **Pays debt:** nothing\n',
      [REGISTER]: registerWith([['TD-1', 'src/a.ts', 'open']]) },
    after: { 'src/a.ts': 'export const a = 2\n' } },
  { name: 'a claim on a wrapped Pays debt line counts', expected: 0,
    mode: ['--diff', 'HEAD', '--plan', '{root}/plan-web.md', '--stage', '1'],
    before: { ...twoSources, 'plan-web.md': '# Plan\n\n### Stage 1 — [data] `W1` — a\n- **Pays debt:** nothing\n\n### Stage 2 — [data] `W1` — b\n- **Pays debt:** `TD-2` — the copy, and\n  `TD-1` — the duplicate\n',
      [REGISTER]: registerWith([['TD-1', 'src/a.ts', 'open']]) },
    after: { 'src/a.ts': 'export const a = 2\n' } },
  { name: 'an ID cell carrying a marker is still read', expected: 1, mode: ['--diff', 'HEAD'],
    before: { ...twoSources, [REGISTER]: registerWith([['**TD-BR-11** ⏰', 'src/a.ts', 'open']]) },
    after: { 'src/a.ts': 'export const a = 2\n' }, output: /measured\s+TD-BR-11/ },
  { name: 'a lowercase word that happens to be a file stem names no file', expected: 0, mode: ['--diff', 'HEAD'],
    before: { 'src/main.ts': 'export const m = 1\n', [REGISTER]: registerWith([['TD-1', 'main', 'open']]) },
    after: { 'src/main.ts': 'export const m = 2\n' } },
];
for (const debtCase of moreDebtCases) {
  const root = gitRepoFixture('debt-' + debtCase.name.replace(/\W+/g, '-'), debtCase.before, debtCase.after);
  const { exitCode, stdout } = runScript('debt-balance.js', [root, ...debtCase.mode.map((argument) => argument.replace('{root}', root))]);
  const ok = exitCode === debtCase.expected && (!debtCase.output || debtCase.output.test(stdout));
  report('debt-balance.js', debtCase.name, ok, [`expected exit ${debtCase.expected}, got ${exitCode}`, stdout]);
}

const commitAll = (root, message) => {
  spawnSync('git', ['-C', root, 'add', '-A']);
  spawnSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', message]);
};
{
  const root = gitRepoFixture('debt-a-renamed-file-still-counts-as-edited', { ...twoSources, [REGISTER]: registerWith([['TD-1', 'src/a.ts', 'open']]) });
  spawnSync('git', ['-C', root, 'mv', 'src/a.ts', 'src/renamed.ts']);
  const { exitCode, stdout } = runScript('debt-balance.js', [root, '--diff', 'HEAD']);
  report('debt-balance.js', 'a renamed file still counts as edited', exitCode === 1 && /measured\s+TD-1/.test(stdout), [`exit ${exitCode}`, stdout]);
}

const PLAN_WITH_DEBT_TABLE = '# Plan\n\n## Debt in the footprint\n\nnone\n\n### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1`\n';
const PLAN_BEFORE_THE_RULE = '# Plan\n\n### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1`\n';
const featureDebtCases = [
  { name: 'a feature leaving an open row in a file it changed is not done', expected: 1, rows: [['TD-1', 'src/a.ts', 'open']], plan: PLAN_WITH_DEBT_TABLE },
  { name: 'a feature whose row in a changed file the user kept is done', expected: 0,
    rows: [['TD-1', 'src/a.ts', 'accepted — a contract change · revisit at v2']], plan: PLAN_WITH_DEBT_TABLE },
  { name: 'a feature planned before the debt rule is measured, not gated', expected: 0, rows: [['TD-1', 'src/a.ts', 'open']],
    plan: PLAN_BEFORE_THE_RULE, output: /not gated/ },
  { name: 'a row registered after the feature\'s last commit is not charged to it', expected: 0, rows: [],
    later: [['TD-1', 'src/a.ts', 'open']], plan: PLAN_WITH_DEBT_TABLE, output: /0 undecided/ },
];
for (const featureDebtCase of featureDebtCases) {
  const root = gitRepoFixture('feature-debt-' + featureDebtCase.name.replace(/\W+/g, '-'), {
    ...twoSources,
    'docs/development/f/plan-web.md': featureDebtCase.plan,
    'docs/development/f/test-plan-web.md': testPlan(),
    [REGISTER]: registerWith(featureDebtCase.rows),
  });
  if (featureDebtCase.later) {
    fs.writeFileSync(path.join(root, REGISTER), registerWith(featureDebtCase.later));
    commitAll(root, 'a later feature registers debt');
  }
  const { exitCode, stdout, stderr } = runScript('check-feature-done.js', [path.join(root, 'docs/development/f'), 'web']);
  const ok = exitCode === featureDebtCase.expected && /debt: /.test(stdout) && (!featureDebtCase.output || featureDebtCase.output.test(stdout));
  report('check-feature-done.js', featureDebtCase.name, ok, [`expected exit ${featureDebtCase.expected}, got ${exitCode}`, stdout, stderr]);
}
{
  const root = gitRepoFixture('feature-debt-no-register', {
    ...twoSources, 'docs/development/f/plan-web.md': PLAN_WITH_DEBT_TABLE, 'docs/development/f/test-plan-web.md': testPlan(),
  });
  const { exitCode, stdout } = runScript('check-feature-done.js', [path.join(root, 'docs/development/f'), 'web']);
  report('check-feature-done.js', 'a repository without a register is judged as before', exitCode === 0 && !/debt/.test(stdout), [`exit ${exitCode}`, stdout]);
}

const HOUR = 3600 * 1000;
const TRAIL = 'design/compared-ui/';
const assemblyPlan = '# Plan\n\n### Stage 4 — [presentation] `run` assembly\n';
const completeTrail = {
  'design/run.png': 'png', 'design/sections/run/hdr.png': 'png', 'plan-web.md': assemblyPlan,
  [TRAIL + 'run-web-v2.png']: 'png', [TRAIL + 'run-web-v2-diff.png']: 'png',
  [TRAIL + 'run.hdr-web-v1.png']: 'png', [TRAIL + 'run.hdr-web-v1-diff.png']: 'png',
};
const olderReferences = { 'design/run.png': 5, 'design/sections/run/hdr.png': 5 };
const parityTrailCases = [
  { name: 'every capture with its diff and newer than its reference is clean', expected: 0,
    files: completeTrail, ages: olderReferences, extraArguments: ['--screen', 'run'] },
  { name: 'a capture without its diff overlay is reported', expected: 1,
    files: { ...completeTrail, [TRAIL + 'run.hdr-web-v2.png']: 'png' }, ages: olderReferences },
  { name: 'a design reference changed after the capture is reported as stale', expected: 1,
    files: completeTrail, ages: { [TRAIL + 'run-web-v2.png']: 5, 'design/sections/run/hdr.png': 5 } },
  { name: 'an assembly screen without a full-screen reference is reported', expected: 1,
    files: { ...completeTrail, 'plan-web.md': assemblyPlan + '\n### Stage 9 — [presentation] `gate` assembly\n' },
    ages: olderReferences },
  { name: 'a screen checked on its own needs a full-screen capture', expected: 1,
    files: { ...completeTrail, [TRAIL + 'run-web-v2.png']: undefined, [TRAIL + 'run-web-v2-diff.png']: undefined },
    ages: olderReferences, extraArguments: ['--screen', 'run'] },
  { name: 'a capture that does not name its screen is reported', expected: 1,
    files: { ...completeTrail, 'design/sections/run/hdr--C2.png': 'png', [TRAIL + 'hdr--C2-web-v1.png']: 'png', [TRAIL + 'hdr--C2-web-v1-diff.png']: 'png' },
    ages: { ...olderReferences, 'design/sections/run/hdr--C2.png': 5 } },
];

for (const parityCase of parityTrailCases) {
  const featureDirectory = projectFixture('parity-' + parityCase.name.replace(/\W+/g, '-'), parityCase.files);
  for (const [relativePath, hoursAgo] of Object.entries(parityCase.ages || {})) {
    const when = new Date(Date.now() - hoursAgo * HOUR);
    fs.utimesSync(path.join(featureDirectory, relativePath), when, when);
  }
  const exitCode = runScript('check-parity-trail.js', [featureDirectory, 'web', ...(parityCase.extraArguments || [])]).exitCode;
  report('check-parity-trail.js', parityCase.name, exitCode === parityCase.expected,
    `expected exit ${parityCase.expected}, got ${exitCode}`);
}

const runScreen = {
  page: [0, 0, 1768, 1020], header: [32, 32, 1704, 64], list: [32, 120, 1100, 880],
  rowA: [48, 136, 1068, 88], rowB: [48, 232, 1068, 88], rail: [1156, 120, 580, 400],
};
const shifted = (boxes, id, change) => ({ ...boxes, [id]: boxes[id].map((value, index) => value + (change[index] || 0)) });
const geometryCases = [
  { name: 'the same layout is clean', expected: 0, design: runScreen, app: runScreen },
  { name: 'a one-pixel rendering difference stays inside the tolerance', expected: 0,
    design: runScreen, app: shifted(runScreen, 'header', [1, 0, -1, 0]) },
  { name: 'a header sitting 30px lower is reported with its inset and token', expected: 1,
    design: runScreen, app: shifted(runScreen, 'header', [0, 30, 0, 0]),
    extraArguments: ['--tokens', '{dir}/tokens.css'], output: /header inside page: inset top 62 \(no px token\) vs 32 \(--space-8\)/ },
  { name: 'a shorter row is reported as a height and gap difference', expected: 1,
    design: runScreen, app: shifted(runScreen, 'rowA', [0, 0, 0, -36]), output: /rowA: height 52 vs 88.*\n[\s\S]*rowA → rowB: gap below 44 vs 8/ },
  { name: 'a rail stacked under the list instead of beside it is reported as a column change', expected: 1,
    design: runScreen, app: { ...runScreen, rail: [32, 1010, 580, 400], page: [0, 0, 1768, 1500] },
    output: /page: 1 column\(s\) of children in the app vs 2 in the design/ },
  { name: 'an element the design has and the app does not render is reported', expected: 1,
    design: runScreen, app: Object.fromEntries(Object.entries(runScreen).filter(([id]) => id !== 'rail')),
    output: /rail: in the design, not rendered by the app/ },
];

for (const geometryCase of geometryCases) {
  const directory = projectFixture('geometry-' + geometryCase.name.replace(/\W+/g, '-'), {
    'design.json': JSON.stringify({ boxes: geometryCase.design }),
    'app.json': JSON.stringify({ boxes: geometryCase.app }),
    'tokens.css': ':root { --space-4: 16px; --space-6: 24px; --space-8: 32px; }\n',
  });
  const extras = (geometryCase.extraArguments || []).map((argument) => argument.replace('{dir}', directory));
  const { exitCode, stdout } = runScript('compare-geometry.js',
    [path.join(directory, 'design.json'), path.join(directory, 'app.json'), ...extras]);
  const ok = exitCode === geometryCase.expected && (!geometryCase.output || geometryCase.output.test(stdout));
  report('compare-geometry.js', geometryCase.name, ok, [`expected exit ${geometryCase.expected}, got ${exitCode}`, stdout]);
}

finish();
