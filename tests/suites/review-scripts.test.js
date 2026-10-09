#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createSuite, pluginRoot } = require('../lib/harness');

const suite = createSuite('review-scripts');
const { projectFixture, runScript, report, finish } = suite;

const GIT_IDENTITY = ['-c', 'user.email=t@t', '-c', 'user.name=t'];

function gitIn(root, ...args) {
  return spawnSync('git', ['-C', root, ...GIT_IDENTITY, ...args], { encoding: 'utf8' }).stdout || '';
}

function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files || {})) {
    const target = path.join(root, relativePath);
    if (content === null) {
      fs.rmSync(target, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

function committedRepo(name, files) {
  const root = projectFixture(name, { '.gitignore': '.alpha-sdlc/\n', ...files });
  gitIn(root, 'init', '-q');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-q', '-m', 'base');
  return { root, base: gitIn(root, 'rev-parse', 'HEAD').trim() };
}

function sectionOf(text, title) {
  const lines = text.split('\n');
  const contents = lines[2] || '';
  const label = title.split(' — ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const range = contents.match(new RegExp(`(?:: |· )${label} (\\d+)–(\\d+)`));
  if (range) return lines.slice(Number(range[1]), Number(range[2])).join('\n');
  const start = text.indexOf(`\n## ${title}\n`);
  if (start === -1) return '';
  const rest = text.slice(start + title.length + 5);
  const end = rest.search(/\n## /);
  return end === -1 ? rest : rest.slice(0, end);
}

const numbered = (count, make) => Array.from({ length: count }, (unused, index) => make(index)).join('\n') + '\n';
const slashStar = '/' + '*';
const starSlash = '*' + '/';

const DATA = 'export function load(id) {\n  verify(id)\n  return fetchUser(id)\n}\n';
const PACKAGE = (dependencies) => JSON.stringify({ name: 'x', version: '1.0.0', dependencies }, null, 2) + '\n';

function tierOf(name, { before, after, rename, commitAfter, extraArguments }) {
  const { root, base } = committedRepo('tier-' + name, before);
  if (rename) gitIn(root, 'mv', rename[0], rename[1]);
  writeFiles(root, after);
  const head = [];
  if (commitAfter) {
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-q', '-m', 'after');
    head.push('--head', 'HEAD');
  }
  const run = runScript('review-tier.js', [root, '--base', base, ...head, '--json', ...(extraArguments || [])]);
  let measure = null;
  try { measure = JSON.parse(run.stdout); } catch {}
  return { run, measure, root };
}

const tierCases = [
  { name: 'docs and tests only is script-only', expected: 'script-only',
    before: { 'src/data.ts': DATA, 'README.md': '# r\n' },
    after: { 'README.md': '# r, reworded\n', 'src/data.test.ts': "it('loads', () => {})\n" } },
  { name: 'a whitespace-only change is script-only', expected: 'script-only',
    before: { 'src/data.ts': DATA }, after: { 'src/data.ts': DATA.replace('  verify', '      verify') } },
  { name: 'an indentation change in a whitespace-sensitive file is not script-only', expected: 'light',
    before: { 'src/m.py': 'def f(x):\n    if x:\n        y = 1\n        return y\n' },
    after: { 'src/m.py': 'def f(x):\n    if x:\n        y = 1\n    return y\n' } },
  { name: 'a version bump is script-only', expected: 'script-only',
    before: { 'package.json': PACKAGE({ react: '^18.2.0' }) },
    after: { 'package.json': PACKAGE({ react: '^18.2.0' }).replace('"1.0.0"', '"1.0.1"') } },
  { name: 'a pure rename is script-only', expected: 'script-only',
    before: { 'src/data.ts': DATA }, rename: ['src/data.ts', 'src/load.ts'] },
  { name: 'a small edit that keeps its calls is light', expected: 'light', reason: /3 production lines|2 production lines/,
    before: { 'src/data.ts': DATA }, after: { 'src/data.ts': DATA.replace('fetchUser(id)', 'fetchUser(id, true)') } },
  { name: 'a deleted call site is full', expected: 'full', reason: /removed call or declaration.*verify\( in src\/data\.ts/,
    before: { 'src/data.ts': DATA }, after: { 'src/data.ts': DATA.replace('  verify(id)\n', '') } },
  { name: 'a removed dependency is full', expected: 'full', reason: /removed dependency or manifest entry.*lodash/,
    before: { 'package.json': PACKAGE({ lodash: '^4.17.21', react: '^18.2.0' }) },
    after: { 'package.json': PACKAGE({ react: '^18.2.0' }) } },
  { name: 'a bumped dependency is light', expected: 'light',
    before: { 'package.json': PACKAGE({ react: '^18.2.0' }) }, after: { 'package.json': PACKAGE({ react: '^18.3.1' }) } },
  { name: 'a deleted production file is full', expected: 'full', reason: /removed production file.*src\/data\.ts/,
    before: { 'src/data.ts': DATA, 'src/other.ts': 'export const other = 1\n' }, after: { 'src/data.ts': null } },
  { name: 'a contract path is full', expected: 'full', reason: /contract path: api\/openapi\.yaml/,
    before: { 'api/openapi.yaml': 'openapi: 3.1.0\n' }, after: { 'api/openapi.yaml': 'openapi: 3.1.0\ninfo: {}\n' } },
  { name: 'a migration is full', expected: 'full', reason: /schema or migration path: db\/migrations\/002_add\.sql/,
    before: { 'src/data.ts': DATA }, after: { 'db/migrations/002_add.sql': 'ALTER TABLE a ADD COLUMN b int;\n' } },
  { name: 'an auth path is full', expected: 'full', reason: /auth, token, session or PII path: src\/auth\/session\.ts/,
    before: { 'src/auth/session.ts': 'export const ttl = 1\n' }, after: { 'src/auth/session.ts': 'export const ttl = 2\n' } },
  { name: 'a path the auth profile doc names is full', expected: 'full', reason: /13-auth\.md names src\/core\/api/,
    before: { 'docs/basics/13-auth.md': '# Auth\n\nThe bearer header is attached in `src/core/api`.\n', 'src/core/api/client.ts': 'export const base = 1\n' },
    after: { 'src/core/api/client.ts': 'export const base = 2\n' } },
  { name: 'the same path without that doc is light', expected: 'light',
    before: { 'src/core/api/client.ts': 'export const base = 1\n' }, after: { 'src/core/api/client.ts': 'export const base = 2\n' } },
  { name: 'a UI component is full', expected: 'full', reason: /UI path: src\/components\/Band\.tsx/,
    before: { 'src/data.ts': DATA }, after: { 'src/components/Band.tsx': 'export const Band = () => null\n' } },
  { name: 'an Android layout is full', expected: 'full', reason: /UI path: app\/src\/main\/res\/layout\/main\.xml/,
    before: { 'src/data.ts': DATA }, after: { 'app/src/main/res/layout/main.xml': '<LinearLayout/>\n' } },
  { name: 'a SwiftUI view is full', expected: 'full', reason: /UI path: App\/HomeView\.swift/,
    before: { 'App/HomeView.swift': 'struct HomeView {}\n' }, after: { 'App/HomeView.swift': 'struct HomeView { let a = 1 }\n' } },
  { name: 'tests, docs, generated files and lockfiles do not count as production lines', expected: 'light', productionLines: 100,
    before: { 'src/data.ts': DATA },
    after: {
      'src/big.ts': numbered(100, (index) => `export const value${index} = ${index}`),
      'src/big.test.ts': numbered(500, (index) => `it('case ${index}', () => {})`),
      'docs/notes.md': numbered(300, (index) => `line ${index}`),
      'src/__generated__/api.ts': numbered(400, (index) => `export const generated${index} = ${index}`),
      'package-lock.json': numbered(1000, (index) => `"x${index}": 1,`),
    } },
  { name: 'more than 150 production lines is full', expected: 'full', reason: /151 production lines changed/,
    before: { 'src/data.ts': DATA }, after: { 'src/big.ts': numbered(151, (index) => `export const value${index} = ${index}`) } },
  { name: 'a file marked generated in its first lines is not counted', expected: 'light', productionLines: 2,
    before: { 'src/data.ts': DATA },
    after: {
      'src/data.ts': DATA.replace('fetchUser(id)', 'fetchUser(id, 1)'),
      'src/api/schema.ts': `${slashStar} This file was automatically generated by openapi-typescript. ${starSlash}\n` + numbered(400, (index) => `export type T${index} = ${index}`),
    } },
  { name: 'an untracked production file counts', expected: 'light', productionLines: 2,
    before: { 'src/data.ts': DATA }, after: { 'src/fresh.ts': 'export const a = 1\nexport const b = 2\n' } },
  { name: 'a committed range is compared with --head', expected: 'full', reason: /UI path/, commitAfter: true,
    before: { 'src/data.ts': DATA }, after: { 'src/screens/Home.tsx': 'export const Home = () => null\n' } },
];

for (const tierCase of tierCases) {
  const { run, measure } = tierOf(tierCase.name.replace(/\W+/g, '-'), tierCase);
  const reasons = measure ? measure.reasons.join(' | ') : '';
  const ok = run.exitCode === 0 && measure && measure.tier === tierCase.expected &&
    (!tierCase.reason || tierCase.reason.test(reasons)) &&
    (tierCase.productionLines === undefined || measure.productionLines === tierCase.productionLines);
  report('review-tier.js', tierCase.name, ok,
    [`expected ${tierCase.expected}${tierCase.productionLines !== undefined ? ` with ${tierCase.productionLines} production lines` : ''}`,
      measure ? `got ${measure.tier}, ${measure.productionLines} production lines: ${reasons}` : `exit ${run.exitCode}: ${run.stderr}`]);
}

{
  const { classOf } = require(path.join(pluginRoot, 'scripts', 'review-tier.js'));
  const expectedClasses = {
    'internal/domain/featuredetail/history.go': 'production',
    'src/features/trd/TrdShared/changes.ts': 'production',
    'app/src/main/java/com/acme/auth/Security.kt': 'production',
    'src/security.ts': 'production',
    'src/license.ts': 'production',
    'app/src/main/java/com/acme/doc/DocRepository.kt': 'production',
    'src/features/docs/DocsPage.tsx': 'production',
    'app/src/main/java/com/acme/build/BuildRunner.kt': 'production',
    'src/out/Writer.ts': 'production',
    'internal/gen/ids.go': 'production',
    'dist/index.js': 'production',
    'README.md': 'docs',
    'LICENSE': 'docs',
    'CHANGELOG.md': 'docs',
    'SECURITY.md': 'docs',
    'CODEOWNERS': 'docs',
    'docs/guide.md': 'docs',
    'docs/diagrams/flow.png': 'docs',
    '.github/ISSUE_TEMPLATE/bug.yml': 'docs',
    'src/generated/api.ts': 'generated',
    'lib/model.g.dart': 'generated',
    'api/v1/service.pb.go': 'generated',
    'src/data.test.ts': 'test',
  };
  const wrong = Object.entries(expectedClasses).filter(([file, expected]) => classOf(file) !== expected)
    .map(([file, expected]) => `${file}: ${classOf(file)}, expected ${expected}`);
  report('review-tier.js', 'a source file is production whatever its name or folder — docs and generated only by what the file is', !wrong.length, wrong);
}
{
  const HISTORY = 'package featuredetail\n\nfunc load(id string) error {\n\tvalue, err := read(id)\n\tif err != nil {\n\t\treturn err\n\t}\n\treturn use(value)\n}\n';
  const { measure } = tierOf('condition-flip-history', {
    before: { 'internal/domain/featuredetail/history.go': HISTORY },
    after: { 'internal/domain/featuredetail/history.go': HISTORY.replace('if err != nil {', 'if err == nil {') },
  });
  report('review-tier.js', 'a condition flipped in a file named history.go is reviewed, never script-only',
    Boolean(measure) && measure.tier !== 'script-only' && measure.productionLines === 2, measure ? `${measure.tier}: ${measure.reasons.join(' | ')}` : 'no measure');
  const generatedHeader = '/'.repeat(2) + ' Code generated by protoc-gen-go. DO NOT EDIT.\n';
  const marked = tierOf('gen-folder-marked', {
    before: { 'src/data.ts': DATA },
    after: { 'src/data.ts': DATA.replace('fetchUser(id)', 'fetchUser(id, 1)'), 'internal/gen/ids.go': generatedHeader + numbered(400, (index) => `const ID${index} = ${index}`) },
  });
  const unmarked = tierOf('gen-folder-unmarked', {
    before: { 'src/data.ts': DATA },
    after: { 'internal/gen/ids.go': 'package gen\n\nconst First = 1\n' },
  });
  report('review-tier.js', 'a gen/ folder is generated only when its file carries the generated marker',
    Boolean(marked.measure && unmarked.measure) && marked.measure.productionLines === 2 &&
      unmarked.measure.files.some((file) => file.path === 'internal/gen/ids.go' && file.class === 'production'),
    [marked.measure ? `${marked.measure.tier} ${marked.measure.productionLines}` : 'none', unmarked.measure ? JSON.stringify(unmarked.measure.files) : 'none']);
}
{
  const { measure } = tierOf('design-token-stylesheet', { before: { 'src/data.ts': DATA }, after: { 'src/styles/tokens.css': ':root { --space-1: 4px; }\n' } });
  const file = measure && measure.files.find((candidate) => candidate.path === 'src/styles/tokens.css');
  report('review-tier.js', 'a design-token stylesheet is a UI path, not an auth one', Boolean(file) && file.flags.join(',') === 'ui',
    `flags: ${file ? file.flags.join(',') : 'file missing'}`);
}
{
  const { run } = tierOf('text-report', { before: { 'src/data.ts': DATA }, after: { 'src/data.ts': DATA.replace('fetchUser(id)', 'fetchUser(id, 2)') } });
  const text = runScript('review-tier.js', [run.stdout ? JSON.parse(run.stdout).repo : '.', '--base', JSON.parse(run.stdout).base]);
  report('review-tier.js', 'the text report leads with the tier and its reasons', /^tier: light\n  - /.test(text.stdout), text.stdout);
}
{
  const { root } = committedRepo('tier-bad-base', { 'src/data.ts': DATA });
  const run = runScript('review-tier.js', [root, '--base', 'no-such-revision']);
  report('review-tier.js', 'an unknown base is a usage error', run.exitCode === 2, `exit ${run.exitCode}`);
}

const PRINCIPLES = [
  '# Fixture principles', '', 'Every skill applies these.', '',
  '## Mindset — lazy', '', 'Be lazy.', '',
  '## Working agreements', '',
  '- **Comments: none, the names carry the meaning.** No comments in code.',
  '- **UI containers never clip.** Verify at the content extremes.',
  '- **Wait for the answer.** Ask and stop.',
  '- **Keep the project profile current.** Map of change → doc: endpoint → `api-reference`.',
  '',
].join('\n');
const APPLICABILITY = {
  bundles: { execute: { skills: ['do-development'] } },
  rules: {
    preamble: { bundles: ['*'], digest: false, review: ['always'] },
    mindset: { bundles: ['*'], digest: false, review: ['code'] },
    'working-agreements': { bundles: ['*'], digest: false, review: ['always'] },
    'comments-none-the-names-carry-the-meaning': { bundles: ['*'], digest: true, review: ['code', 'tests'] },
    'ui-containers-never-clip': { bundles: ['ui'], digest: false, review: ['ui'] },
    'wait-for-the-answer': { bundles: ['*'], digest: true, review: ['never'] },
    'keep-the-project-profile-current': { bundles: ['*'], digest: false, review: ['code', 'docs'] },
  },
};
const FIXTURE_TREE = 'ab'.repeat(32);
const fixturePluginRoot = projectFixture('plugin', {
  'principles.md': PRINCIPLES,
  'rules/applicability.json': JSON.stringify(APPLICABILITY, null, 2),
  'scripts/scan-record.js': `process.stdout.write(JSON.stringify({ commit: 'c0ffee', tree: '${FIXTURE_TREE}' }) + '\\n');\n`,
});
const applicabilityFile = path.join(fixturePluginRoot, 'rules', 'applicability.json');

const FEATURE = 'docs/development/feat';
const SPOKE = [
  '# Spoke', '', '## 8. Acceptance criteria', '', '| ID | AC | Source |', '|---|---|---|',
  '| AC-1 | one | hub §2 |', '| AC-2 | two | hub §3 |', '| AC-3 | three | hub §5 |', '',
  '## 9. Work slices', '', '| Slice | What | AC |', '|---|---|---|', '| **W1** | a | `AC-1` `AC-2` |', '| **W2** | b | `AC-3` |', '',
].join('\n');
const PLAN = [
  '# Plan', '', '## Stages', '', '### Stage 1 — [data] `W1` — load the list', '- **Covers:** `AC-1` · `AC-2`',
  '- **Layer:** data', '- **Approach:** rung 2 — reuse the client', '', '### Stage 2 — [presentation] `W2` — the band',
  '- **Covers:** `AC-3`', '- **Section cases (UI stages):** `section-slicing/home.md` `body/C1`', '',
].join('\n');
const HUB = ['# TRD: feat', '', '## 5. API contracts', '', '| Method | Path |', '|---|---|', '| GET | /v1/list |', '', '## 6. Cross-cutting', '', 'none', ''].join('\n');
const ISSUE_TRD = [
  '# Issue TRD: feat', '', '## 4. Regression safety & acceptance criteria', '', '| ID | AC |', '|---|---|',
  '| AC-1 | loads |', '| AC-2 | empty |', '| AC-3 | journey |', '', '## 5. Blast radius & feature dependencies', '', 'none', '',
].join('\n');
const TEST_PLAN = [
  '# Test plan', '', '## AC → test coverage', '', '| ID | AC | Level | Test case | File | Status |', '|---|---|---|---|---|---|',
  '| TC1 | `AC-1` | unit | loads | `src/data.test.ts` — `loadsTheListOnOpen` | pass |',
  '| TC2 | `AC-2` | unit | empty | `showsEmptyStateWhenNoItems` | pass |',
  '| TC3 | `AC-3` | unit | band | `src/band.test.ts` | pass |', '',
  '## Bugs found', '', '| # | Bug | Severity | Level | AC | Repro steps | Fix? (user) | Attempts | Status |',
  '|---|---|---|---|---|---|---|---|---|', '| B1 | the band clips | major | UI | AC-3 | 1. open home | yes | 0 | open |', '',
].join('\n');
const DATA_TEST = "it('loadsTheListOnOpen', () => {})\nit('showsEmptyStateWhenNoItems', () => {})\n";

function featureRepo(name, extra) {
  return committedRepo('packet-' + name, {
    [`${FEATURE}/TRD.md`]: HUB,
    [`${FEATURE}/TRD-web.md`]: SPOKE,
    [`${FEATURE}/plan-web.md`]: PLAN,
    [`${FEATURE}/test-plan-web.md`]: TEST_PLAN,
    [`${FEATURE}/section-slicing/home.md`]: '# Home\n',
    'docs/basics/01-overview.md': '# Overview\n',
    'src/data.ts': DATA,
    'src/band.test.ts': "it('band', () => {})\n",
    ...(extra || {}),
  });
}

function packetRun(root, args, environment) {
  const run = runScript('review-packet.js', args, { cwd: root, env: { CLAUDE_PLUGIN_ROOT: fixturePluginRoot, ...(environment || {}) } });
  const packetPath = run.stdout.split('\n')[0];
  const text = run.exitCode === 0 && packetPath && fs.existsSync(packetPath) ? fs.readFileSync(packetPath, 'utf8') : '';
  return { ...run, packetPath, text };
}

const DATA_CHANGE = { 'src/data.ts': DATA.replace('fetchUser(id)', 'fetchUser(id, true)'), 'src/data.test.ts': DATA_TEST };
const UI_CHANGE = { ...DATA_CHANGE, 'src/components/Band.tsx': 'export const Band = () => null\n' };

const dataStage = (() => {
  const { root, base } = featureRepo('data-stage');
  writeFiles(root, { ...DATA_CHANGE, '.alpha-sdlc/verify.log': 'npm test -- data\n2 passed, exit 0\n' });
  const before = { status: gitIn(root, 'status', '--porcelain'), diff: gitIn(root, 'diff'), index: gitIn(root, 'ls-files', '-s') };
  const run = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base, '--verify', path.join(root, '.alpha-sdlc/verify.log')]);
  const after = { status: gitIn(root, 'status', '--porcelain'), diff: gitIn(root, 'diff'), index: gitIn(root, 'ls-files', '-s') };
  return { root, base, run, before, after };
})();
const dataText = dataStage.run.text;

report('review-packet.js', 'the packet is written under .alpha-sdlc/review and its path is printed first',
  dataStage.run.exitCode === 0 && dataStage.run.packetPath === path.join(fs.realpathSync(dataStage.root), '.alpha-sdlc', 'review', 'feat-web-s1-r1.md') && dataText.length > 0,
  [`exit ${dataStage.run.exitCode}`, dataStage.run.stdout, dataStage.run.stderr]);
report('review-packet.js', 'every covered AC row is copied verbatim and an uncovered one is left out',
  dataText.includes('| ID | AC | Source |\n|---|---|---|\n| AC-1 | one | hub §2 |\n| AC-2 | two | hub §3 |') && !sectionOf(dataText, 'Stage 1').includes('| AC-3 |'),
  sectionOf(dataText, 'Stage 1'));
report('review-packet.js', 'the stage block and its slice row are verbatim',
  dataText.includes('### Stage 1 — [data] `W1` — load the list\n- **Covers:** `AC-1` · `AC-2`\n- **Layer:** data\n- **Approach:** rung 2 — reuse the client') &&
    dataText.includes('| **W1** | a | `AC-1` `AC-2` |'),
  sectionOf(dataText, 'Stage 1'));
report('review-packet.js', 'the header carries the tree hash scan-record.js printed, and the tier with its reasons',
  dataText.includes(`- Tree hash: ${FIXTURE_TREE} `) && /- Tier: light — \d+ production lines/.test(dataText), sectionOf(dataText, 'Header'));
report('review-packet.js', 'every changed file has an owner in the map',
  /`src\/data\.ts` → a/.test(dataText) && /`src\/data\.test\.ts` → b/.test(dataText) && !sectionOf(dataText, 'File → dimension map').includes('UNOWNED'),
  sectionOf(dataText, 'File → dimension map'));
report('review-packet.js', 'a data-only change withholds the UI rule, naming its trigger and its line range',
  !sectionOf(dataText, 'Principles this change can violate').includes('UI containers never clip') &&
    /\*UI containers never clip\.\* — .*principles\.md lines 12–12 — review: ui — no UI path changed/.test(sectionOf(dataText, 'Withheld rules')),
  sectionOf(dataText, 'Withheld rules'));
report('review-packet.js', 'the included rules are verbatim from principles.md, in file order',
  sectionOf(dataText, 'Principles this change can violate').includes('## Mindset — lazy\n\nBe lazy.\n\n## Working agreements\n\n- **Comments: none, the names carry the meaning.** No comments in code.\n*Keep the project profile current.* (lines 14–15) is in the Change → doc map section above.'),
  sectionOf(dataText, 'Principles this change can violate'));
report('review-packet.js', 'the change → doc map rule is printed once, not again in the excerpt',
  dataText.split('Map of change → doc: endpoint').length === 2, `${dataText.split('Map of change → doc: endpoint').length - 1} copies`);
report('review-packet.js', 'a rule marked never is withheld as not a review rule',
  /\*Wait for the answer\.\* — .* — review: never — not a review rule/.test(sectionOf(dataText, 'Withheld rules')), sectionOf(dataText, 'Withheld rules'));
report('review-packet.js', 'the change → doc map is carried',
  sectionOf(dataText, 'Change → doc map').includes('Map of change → doc: endpoint → `api-reference`'), sectionOf(dataText, 'Change → doc map'));
report('review-packet.js', 'coverage and orphan outputs are settled in the packet',
  /### check-coverage\.js — exit 0\n\n`node .*check-coverage\.js .* --stage 1 --base [0-9a-f]+ --tests .*data\.test\.ts`/.test(dataText) &&
    /### find-orphans\.js --diff — exit \d/.test(dataText) && dataText.includes('nobody re-runs these unless the tree hash differs'),
  sectionOf(dataText, 'Settled script outputs'));
report('review-packet.js', 'the author\'s verification log is verbatim', sectionOf(dataText, 'Author\'s verification').includes('npm test -- data\n2 passed, exit 0'),
  sectionOf(dataText, 'Author\'s verification'));
report('review-packet.js', 'a light-tier stage goes to one reviewer that re-runs the tests, with no critic',
  dataText.includes('- Launch: one `alpha-sdlc:sdlc-reviewer` runs every dimension below (light tier); it also re-runs the stage\'s own tests and the sabotage checks.') &&
    !/^- critic/m.test(dataText) && /^- single · every dimension above \(a, b, c\) · items 1, 2, 3 · report .*feat-web-s1-r1-single\.md/m.test(dataText),
  sectionOf(dataText, 'Reviewers'));
report('review-packet.js', 'the contents line gives each section\'s real line range', (() => {
  const lines = dataText.split('\n');
  const contents = lines[2];
  return ['Header', 'Reviewers', 'File → dimension map', 'Stage 1', 'Withheld rules', 'Diff'].every((title) => {
    const match = contents.match(new RegExp(`${title} (\\d+)–(\\d+)`));
    return match && lines[Number(match[1]) - 1] === `## ${title}`;
  });
})(), dataText.split('\n')[2]);
report('review-packet.js', 'building the packet leaves the working tree and the index as they were',
  dataStage.before.status === dataStage.after.status && dataStage.before.diff === dataStage.after.diff && dataStage.before.index === dataStage.after.index,
  [dataStage.before.status, dataStage.after.status]);

{
  const { root, base } = featureRepo('ui-stage');
  writeFiles(root, UI_CHANGE);
  const { text, exitCode, stderr } = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base]);
  report('review-packet.js', 'a UI change keeps the UI rule', exitCode === 0 && sectionOf(text, 'Principles this change can violate').includes('- **UI containers never clip.**'), stderr);
  report('review-packet.js', 'a full-tier stage launches each dimension, then the gaps script and the critic',
    /^- Launch: one reviewer per dimension, the whole round in one message, in the foreground \(at most 3 in flight\)/m.test(text) &&
      /^- a · profile and design system · items 1 · agent alpha-sdlc:sdlc-reviewer · checklist .*conformance-reviewer\.md|^- a · profile and design system · items 1 · agent alpha-sdlc:sdlc-reviewer · checklist .*SKILL\.md/m.test(text) &&
      /^- b · principles and test quality · items 2 · re-runs the stage's own tests and the sabotage checks/m.test(text) &&
      /^- c · plan\/AC and the mechanical checks · items 3/m.test(text) && /^- critic · `alpha-sdlc:sdlc-reviewer-critic`/m.test(text) &&
      /^- Gaps: `node .*review-gaps\.js --packet .*feat-web-s1-r1\.md --reports .*-r1-a\.md .*-r1-b\.md .*-r1-c\.md`/m.test(text) &&
      /- Tier: full — UI path: src\/components\/Band\.tsx/.test(text),
    sectionOf(text, 'Reviewers'));
  report('review-packet.js', 'a code packet names no TRD variant, and its critic is handed no section map',
    exitCode === 0 && !/^- Variant:/m.test(text) &&
      /^- critic · .* · reads the reports, this map, the diff stat and the gaps output · the author files its report at /m.test(text),
    [sectionOf(text, 'Header'), sectionOf(text, 'Reviewers')]);
}
{
  const { root, base } = featureRepo('docs-stage');
  writeFiles(root, { 'docs/basics/01-overview.md': '# Overview\n\nMore.\n' });
  const { text } = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base]);
  report('review-packet.js', 'a docs-only stage needs no reviewer', /^- Launch: no reviewer\./m.test(text) && /- Tier: script-only/.test(text), sectionOf(text, 'Reviewers'));
}
{
  const { root, base } = featureRepo('no-applicability');
  writeFiles(root, DATA_CHANGE);
  const { text } = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base, '--applicability', path.join(root, 'missing.json')]);
  report('review-packet.js', 'without an applicability file every rule is included and the packet says so',
    text.includes('missing.json not found — every rule is included') && sectionOf(text, 'Principles this change can violate').includes('- **UI containers never clip.**') &&
      sectionOf(text, 'Withheld rules').includes('None'),
    sectionOf(text, 'Principles this change can violate').slice(0, 600));
}
{
  const { root, base } = featureRepo('round-two');
  writeFiles(root, DATA_CHANGE);
  const first = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base]);
  writeFiles(root, { 'src/data.ts': DATA.replace('fetchUser(id)', 'fetchUser(id, true)').replace('  verify(id)\n', '  verify(id, strict)\n'), '.alpha-sdlc/findings.md': 'findings:\n- item 2 · objective · measured · src/data.ts:2 · read · proof: npm test\n' });
  const second = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base, '--round', '2', '--prev', path.join(root, '.alpha-sdlc/findings.md')]);
  const previous = sectionOf(second.text, 'Previous round');
  report('review-packet.js', 'round 2 carries the previous findings and only the change since round 1',
    first.exitCode === 0 && second.packetPath.endsWith('feat-web-s1-r2.md') && previous.includes('- item 2 · objective · measured · src/data.ts:2 · read · proof: npm test') &&
      previous.includes('+  verify(id, strict)') && !previous.includes('+  return fetchUser(id, true)'),
    previous || second.stderr);
  const refused = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base, '--round', '2']);
  report('review-packet.js', 'a round after the first without previous findings is refused', refused.exitCode === 2, refused.stderr);
}
{
  const { root, base } = featureRepo('big-diff');
  writeFiles(root, { ...DATA_CHANGE, 'src/big.ts': numbered(1600, (index) => `export const value${index} = ${index}`) });
  const { text, packetPath } = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base]);
  const patchDirectory = packetPath.replace(/\.md$/, '.patches');
  const patches = fs.existsSync(patchDirectory) ? fs.readdirSync(patchDirectory) : [];
  report('review-packet.js', 'a diff over 1,500 lines is split into per-file patches next to the packet',
    sectionOf(text, 'Diff').includes('split per file') && patches.some((name) => name.includes('src_big.ts')) && !sectionOf(text, 'Diff').includes('value1599'),
    [sectionOf(text, 'Diff').slice(0, 400), patches.join(', ')]);
}
{
  const { root, base } = featureRepo('refusals');
  const noStage = packetRun(root, [path.join(root, FEATURE), 'web', '--base', base]);
  const unknownStage = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '9', '--base', base]);
  report('review-packet.js', 'a code review without a stage, or with an unknown one, is refused',
    noStage.exitCode === 2 && unknownStage.exitCode === 2 && /no Stage 9/.test(unknownStage.stderr), [noStage.stderr, unknownStage.stderr]);
}
{
  const { root, base } = featureRepo('fix-review');
  writeFiles(root, { 'src/components/Band.tsx': 'export const Band = () => null\n', 'src/band.test.ts': "it('band never clips', () => {})\n" });
  const { text, exitCode, stderr } = packetRun(root, [path.join(root, FEATURE), 'web', '--bug', 'B1', '--base', base]);
  report('review-packet.js', 'a fix review copies the bug row and the AC it names, and runs fix quality on the deep reviewer',
    exitCode === 0 && text.includes('| B1 | the band clips | major | UI | AC-3 | 1. open home | yes | 0 | open |') && sectionOf(text, 'Bug B1').includes('| AC-3 | three | hub §5 |') &&
      /^- a · fix quality · items 1 · re-runs the stage's own tests and the sabotage checks · agent alpha-sdlc:sdlc-reviewer-deep/m.test(text) &&
      /^- b · scope discipline · items 2/m.test(text) && text.includes('feat-web-b1-r1.md'),
    [stderr, sectionOf(text, 'Reviewers')]);
}
{
  const { root, base } = featureRepo('test-review');
  writeFiles(root, { 'src/data.test.ts': DATA_TEST });
  const { text, exitCode, stderr } = packetRun(root, [path.join(root, FEATURE), 'web', '--kind', 'tests', '--base', base]);
  report('review-packet.js', 'a test review settles the test-plan check and keeps both dimensions on every diff',
    exitCode === 0 && /### check-coverage\.js --test-plan — exit 0/.test(text) && /- Tier: full — test reviews keep both dimensions/.test(text) &&
      /^- a · what the tests prove · items 1, 2, 5/m.test(text) && /^- b · test theater and over-simplification · items 3, 4 · re-runs/m.test(text) &&
      sectionOf(text, 'Tests under review').includes('| GET | /v1/list |'),
    [stderr, sectionOf(text, 'Settled script outputs')]);
}
{
  const { root, base } = featureRepo('alignment');
  writeFiles(root, { [`${FEATURE}/TRD-web.md`]: SPOKE + '\nOne more line.\n' });
  const { text, exitCode, stderr } = packetRun(root, [path.join(root, FEATURE), 'web', '--kind', 'trd', '--base', base]);
  report('review-packet.js', 'a single-spoke alignment drops the cross-spoke item and folds the decisions dimension into flow and coverage',
    exitCode === 0 && /^- b · flow and coverage \+ decisions and siblings · items 3, 5, 7, 8, 9, 10/m.test(text) && !/^- c ·/m.test(text) &&
      text.includes('item 11 needs two or more spokes') && /`docs\/development\/feat\/TRD-web\.md` → a, b/.test(text),
    [stderr, sectionOf(text, 'Reviewers'), sectionOf(text, 'File → dimension map')]);
  const hub = packetRun(root, [path.join(root, FEATURE), 'hub', '--kind', 'trd', '--base', base]);
  const sectionMapCritic = /^- critic · .* · reads the reports, this map, the diff stat, the gaps output and the author's section map \(grooming-review\.md → \*How a round runs\*, step 3\) · the author files its report at /m;
  report('review-packet.js', 'a feature TRD\'s packets name the variant, and their critic reads the author\'s section map',
    exitCode === 0 && hub.exitCode === 0 && [text, hub.text].every((packet) =>
      sectionOf(packet, 'Header').includes('- Variant: feature — no variant notes; the checklist reads as written') && sectionMapCritic.test(packet)),
    [sectionOf(text, 'Header'), sectionOf(text, 'Reviewers'), sectionOf(hub.text, 'Header'), sectionOf(hub.text, 'Reviewers')]);
  report('review-packet.js', 'the hub review runs the consistency dimension on the deep reviewer',
    hub.exitCode === 0 && /^- b · consistency and flow · items 3, 4, 5 · agent alpha-sdlc:sdlc-reviewer-deep/m.test(hub.text) && hub.packetPath.endsWith('feat-hub-r1.md'),
    [hub.stderr, sectionOf(hub.text, 'Reviewers')]);
  report('review-packet.js', 'the hub review diffs the hub and its contract only, so a spoke edit is not in its map',
    hub.exitCode === 0 && !sectionOf(hub.text, 'File → dimension map').includes('TRD-web.md') && !hub.text.includes('UNOWNED'),
    sectionOf(hub.text, 'File → dimension map'));
  const scoped = packetRun(root, [path.join(root, FEATURE), 'web', '--kind', 'trd', '--base', base, '--items', '4,5,8,10', '--single']);
  report('review-packet.js', 'a scoped re-review hands exactly the items in play to one reviewer, then the critic',
    scoped.exitCode === 0 && /^- single · every dimension above \(b\) · items 4, 5, 8, 10 · report .*feat-web-align-r1-single\.md/m.test(scoped.text) &&
      /^- critic · /m.test(scoped.text) && !/^- [ac] · /m.test(scoped.text),
    sectionOf(scoped.text, 'Reviewers'));
  const only = packetRun(root, [path.join(root, FEATURE), 'web', '--kind', 'trd', '--base', base, '--dimensions', 'a']);
  report('review-packet.js', '--dimensions keeps only the named dimensions', only.exitCode === 0 && /^- a · contract and data/m.test(only.text) && !/^- b ·/m.test(only.text),
    sectionOf(only.text, 'Reviewers'));
}
{
  const prefixedSpoke = SPOKE.replace(/AC-(\d)/g, 'AC-DD-B$1');
  const { root, base } = featureRepo('prefixed-ids', {
    [`${FEATURE}/TRD-web.md`]: prefixedSpoke,
    [`${FEATURE}/plan-web.md`]: PLAN.replace(/AC-(\d)/g, 'AC-DD-B$1'),
  });
  writeFiles(root, DATA_CHANGE);
  const { text, exitCode, stderr } = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base]);
  report('review-packet.js', 'a register with prefixed AC ids still yields the covered rows verbatim',
    exitCode === 0 && sectionOf(text, 'Stage 1').includes('| AC-DD-B1 | one | hub §2 |\n| AC-DD-B2 | two | hub §3 |') && !sectionOf(text, 'Stage 1').includes('AC-DD-B3 | three'),
    [stderr, sectionOf(text, 'Stage 1')]);
}
{
  const { root, base } = featureRepo('foundation', { [`${FEATURE}/TRD.md`]: '# Foundation TRD — app\n\n## Shared decisions (hub-level)\n\nnone\n' });
  writeFiles(root, { [`${FEATURE}/TRD-web.md`]: SPOKE + '\nThe folder tree.\n' });
  const { text, exitCode, stderr } = packetRun(root, [path.join(root, FEATURE), 'web', '--kind', 'trd', '--base', base]);
  report('review-packet.js', 'a foundation spoke merges the contract and flow dimensions',
    exitCode === 0 && !/^- a · /m.test(text) && /^- b · flow and coverage \+ decisions and siblings \+ contract and data · items 1, 2, 3, 4, 5, 6, 7, 8, 9, 10/m.test(text) &&
      text.includes('a foundation spoke: dimensions a and b merge'),
    [stderr, sectionOf(text, 'Reviewers')]);
  report('review-packet.js', 'a foundation spoke\'s packet names its variant and sends the reviewers to *Variants* first',
    exitCode === 0 && sectionOf(text, 'Header').includes('- Variant: foundation — read grooming-review.md → *Variants* before the checklist'),
    sectionOf(text, 'Header'));
}
for (const [variant, title] of [['tech-debt', '# Tech-Debt TRD: feat'], ['issue', '# Issue TRD: feat']]) {
  const { root, base } = featureRepo('variant-' + variant, { [`${FEATURE}/TRD.md`]: HUB.replace('# TRD: feat', title) });
  writeFiles(root, { [`${FEATURE}/TRD.md`]: HUB.replace('# TRD: feat', title) + '\nOne more line.\n' });
  const hub = packetRun(root, [path.join(root, FEATURE), 'hub', '--kind', 'trd', '--base', base]);
  report('review-packet.js', `a ${variant} hub's packet names its variant and sends the reviewers to *Variants* first`,
    hub.exitCode === 0 && sectionOf(hub.text, 'Header').includes(`- Variant: ${variant} — read grooming-review.md → *Variants* before the checklist`),
    [hub.stderr, sectionOf(hub.text, 'Header')]);
}
{
  const quoting = HUB + '\n```markdown\n# Foundation TRD — an example title\n```\n';
  const { root, base } = featureRepo('variant-quoted-title', { [`${FEATURE}/TRD.md`]: quoting });
  writeFiles(root, { [`${FEATURE}/TRD-web.md`]: SPOKE + '\nOne more line.\n' });
  const { text, exitCode, stderr } = packetRun(root, [path.join(root, FEATURE), 'web', '--kind', 'trd', '--base', base]);
  report('review-packet.js', 'the variant is read from the hub\'s title alone, so a quoted foundation title merges no dimensions',
    exitCode === 0 && sectionOf(text, 'Header').includes('- Variant: feature') && !text.includes('dimensions a and b merge'),
    [stderr, sectionOf(text, 'Header'), sectionOf(text, 'Reviewers')]);
}
{
  const { root, base } = featureRepo('charter', { [`${FEATURE}/review-charter.md`]: '# Charter\n\nProfile commit: PENDING\n' });
  const charterPath = path.join(root, FEATURE, 'review-charter.md');
  fs.writeFileSync(charterPath, `# Charter\n\nProfile commit: ${base}\n`);
  gitIn(root, 'commit', '-q', '-am', 'charter');
  const current = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base]);
  writeFiles(root, { 'docs/basics/01-overview.md': '# Overview\n\nChanged.\n' });
  gitIn(root, 'commit', '-q', '-am', 'profile moved');
  const stale = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base]);
  report('review-packet.js', 'the charter is reported current, and stale once docs/basics moves past it',
    /→ current\./.test(sectionOf(current.text, 'Review charter')) && /→ STALE/.test(sectionOf(stale.text, 'Review charter')),
    [sectionOf(current.text, 'Review charter'), sectionOf(stale.text, 'Review charter')]);
}
{
  const { root, base } = featureRepo('real-root');
  writeFiles(root, DATA_CHANGE);
  const run = runScript('review-packet.js', [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base, '--applicability', applicabilityFile], { cwd: root, env: { CLAUDE_PLUGIN_ROOT: null } });
  const packetPath = run.stdout.split('\n')[0];
  const text = run.exitCode === 0 ? fs.readFileSync(packetPath, 'utf8') : '';
  const hash = runScript('scan-record.js', ['--hash', root], { cwd: root });
  let tree = null;
  try { tree = JSON.parse(hash.stdout).tree; } catch {}
  report('review-packet.js', 'with the plugin\'s own scripts the header tree hash matches scan-record.js --hash',
    run.exitCode === 0 && Boolean(tree) && text.includes(`- Tree hash: ${tree} `) && text.includes(path.join(pluginRoot, 'skills', 'do-development', 'conformance-reviewer.md')),
    [run.stderr, sectionOf(text, 'Header'), hash.stdout]);
}

{
  const root = projectFixture('packet-unignored', {
    [`${FEATURE}/TRD.md`]: HUB, [`${FEATURE}/TRD-web.md`]: SPOKE, [`${FEATURE}/plan-web.md`]: PLAN, 'src/data.ts': DATA,
  });
  gitIn(root, 'init', '-q');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-q', '-m', 'base');
  const base = gitIn(root, 'rev-parse', 'HEAD').trim();
  writeFiles(root, DATA_CHANGE);
  const run = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base]);
  const status = gitIn(root, 'status', '--short');
  const ignorePath = path.join(root, '.alpha-sdlc', '.gitignore');
  const ignore = fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, 'utf8') : null;
  report('review-packet.js', 'the review state directory keeps itself out of git, in a repository that does not ignore it',
    run.exitCode === 0 && ignore === '*\n' && !status.includes('.alpha-sdlc'), [run.stderr, status]);
  fs.writeFileSync(ignorePath, 'review/\n');
  const again = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base]);
  const kept = fs.readFileSync(ignorePath, 'utf8');
  report('review-packet.js', 'an existing .alpha-sdlc/.gitignore is never overwritten', again.exitCode === 0 && kept === 'review/\n', [again.stderr, kept]);
}
{
  const { root, base } = featureRepo('exclude');
  writeFiles(root, { ...DATA_CHANGE, 'backend/other-session.js': 'export const token = refresh(session)\n' });
  const whole = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base]);
  const narrowed = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base, '--exclude', 'backend/other-session.js']);
  report('review-packet.js', 'without --exclude another session\'s file stays in the packet',
    whole.exitCode === 0 && sectionOf(whole.text, 'File → dimension map').includes('backend/other-session.js'), sectionOf(whole.text, 'File → dimension map'));
  report('review-packet.js', '--exclude leaves another session\'s file out of the tier, the map, the diff and the sweep, and the header names it',
    narrowed.exitCode === 0 && /- Tier: light/.test(narrowed.text) && !sectionOf(narrowed.text, 'File → dimension map').includes('other-session') &&
      !sectionOf(narrowed.text, 'Diff').includes('other-session') &&
      sectionOf(narrowed.text, 'Header').includes('- Excluded by the author (another session\'s work — out of the tier, the map, the diff and the sweeps): `backend/other-session.js`') &&
      /find-orphans\.js .*--diff [0-9a-f]+ --exclude backend\/other-session\.js/.test(sectionOf(narrowed.text, 'Settled script outputs')) &&
      /\nexcluded: backend\/other-session\.js\n/.test(narrowed.stdout),
    [narrowed.stderr, sectionOf(narrowed.text, 'Header'), sectionOf(narrowed.text, 'File → dimension map')]);
  const outside = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base, '--exclude', '/elsewhere/file.js']);
  report('review-packet.js', 'an --exclude path outside the repository is refused', outside.exitCode === 2 && /is not inside/.test(outside.stderr), outside.stderr);
}
{
  const hubRepo = committedRepo('cross-hub-backend', {
    [`${FEATURE}/TRD.md`]: [
      '# TRD (Hub): feat', '', '## Spokes & alignment', '', '| Spoke | Repo | Link | Hub alignment |', '|---|---|---|---|',
      '| backend | `cross-hub-backend` | [TRD-backend.md](./TRD-backend.md) | ✅ reviewed 2026-10-01 |',
      `| web | \`cross-hub-web\` | [TRD-web.md](../../../../cross-hub-web/${FEATURE}/TRD-web.md) | ❌ not reviewed |`, '',
      '## 5. API contracts', '', '| Method | Path |', '|---|---|', '| GET | /v1/cross |', '',
    ].join('\n'),
    [`${FEATURE}/TRD-backend.md`]: SPOKE,
  });
  const webSpoke = SPOKE.replace('# Spoke', `# Spoke\n\n| | |\n|---|---|\n| **Hub** | [TRD.md](../../../../cross-hub-backend/${FEATURE}/TRD.md) |`);
  const { root, base } = committedRepo('cross-hub-web', { [`${FEATURE}/TRD-web.md`]: webSpoke, [`${FEATURE}/test-plan-web.md`]: TEST_PLAN, 'src/data.ts': DATA });
  writeFiles(root, { [`${FEATURE}/TRD-web.md`]: webSpoke + '\nOne more line.\n' });
  const alignment = packetRun(root, [path.join(root, FEATURE), 'web', '--kind', 'trd', '--base', base]);
  const unit = sectionOf(alignment.text, 'Spoke under review');
  report('review-packet.js', 'a spoke whose hub lives in another repository is aligned against that hub, with every spoke the hub lists',
    alignment.exitCode === 0 && unit.includes(`Hub: ${path.join(fs.realpathSync(hubRepo.root), FEATURE, 'TRD.md')} — in another repository`) &&
      unit.includes('Spokes in this feature: backend, web') && !alignment.text.includes('item 11 needs two or more spokes') &&
      /^- c · /m.test(alignment.text),
    [alignment.stderr, unit, sectionOf(alignment.text, 'Reviewers')]);
  writeFiles(root, { 'src/data.test.ts': DATA_TEST });
  const tests = packetRun(root, [path.join(root, FEATURE), 'web', '--kind', 'tests', '--base', base]);
  report('review-packet.js', 'a test review copies the API contract from a hub in another repository',
    tests.exitCode === 0 && sectionOf(tests.text, 'Tests under review').includes('| GET | /v1/cross |') &&
      sectionOf(tests.text, 'Tests under review').includes('(the hub lives in another repository)'),
    [tests.stderr, sectionOf(tests.text, 'Tests under review')]);
}
{
  const { root, base } = committedRepo('single-document', {
    [`${FEATURE}/TRD.md`]: ISSUE_TRD,
    [`${FEATURE}/test-plan-web.md`]: TEST_PLAN,
    'src/data.ts': DATA,
    'src/band.test.ts': "it('band', () => {})\n",
  });
  writeFiles(root, { 'src/data.test.ts': DATA_TEST });
  const tests = packetRun(root, [path.join(root, FEATURE), 'web', '--kind', 'tests', '--base', base]);
  const unit = sectionOf(tests.text, 'Tests under review');
  report('review-packet.js', 'a single-document Issue TRD gives the test review its AC register, and no section posing as a hub contract',
    tests.exitCode === 0 && unit.includes(`The AC register — ${path.join(fs.realpathSync(root), FEATURE, 'TRD.md')}, verbatim:`) &&
      unit.includes('| AC-3 | journey |') && !unit.includes('hub API contract') && !unit.includes('Blast radius') &&
      /### check-coverage\.js --test-plan — exit [01]\b/.test(tests.text),
    [tests.stderr, unit, sectionOf(tests.text, 'Settled script outputs')]);
  writeFiles(root, { 'src/components/Band.tsx': 'export const Band = () => null\n' });
  const fix = packetRun(root, [path.join(root, FEATURE), 'web', '--bug', 'B1', '--base', base]);
  report('review-packet.js', 'a fix review on a single-document TRD copies the AC its bug names',
    fix.exitCode === 0 && sectionOf(fix.text, 'Bug B1').includes('| AC-3 | journey |'), [fix.stderr, sectionOf(fix.text, 'Bug B1')]);
}

const GAPS_PACKET = [
  '# Review packet — feat · web · stage 1 · round 1', '', 'Contents (line ranges): Header 5–7', '',
  '## Header', '', '- Kind: code', '',
  '## Reviewers', '',
  '- Launch: one reviewer per dimension, the whole round in one message, in the foreground (at most 3 in flight).',
  '- a · profile and design system · items 1 · agent alpha-sdlc:sdlc-reviewer · checklist x · report y',
  '- b · principles and test quality · items 2 · re-runs the stage\'s own tests and the sabotage checks · agent alpha-sdlc:sdlc-reviewer · checklist x · report y',
  '- c · plan/AC and the mechanical checks · items 3 · agent alpha-sdlc:sdlc-reviewer · checklist x · report y',
  '- critic · `alpha-sdlc:sdlc-reviewer-critic` after `review-gaps.js`', '',
  '## File → dimension map', '',
  '- `src/data.ts` → a · production M +1 -1',
  '- `src/data.test.ts` → b · test A +2 -0',
  '- `docs/development/feat/plan-web.md` → c · docs M +1 -1', '',
  '## Principles this change can violate', '', '## Reviewers', '', '- z · decoy · items 9', '',
].join('\n');
const REPORT_A = 'findings:\n- item 1 · objective · measured · src/data.ts:2 · `rg -n "#fff" src` · proof: `npm run lint:tokens` exits 0\nchecked clean:\n- item 1 · layer · src/data.ts · evidence: src/data.ts:1-3 read on the working tree\nnot checked:\ncounts: objective 1 · judgment 0 · needs-eyes 0\nnext: fix the finding and close on its proof.\n';
const REPORT_B = 'findings: none\nchecked clean:\n- item 2 · zero comments · src/data.test.ts · evidence: `rg -n "//" src/data.test.ts` returns nothing\nnot checked: none\ncounts: objective 0 · judgment 0 · needs-eyes 0\nnext: nothing to fix.\n';
const REPORT_C = '## Findings\n- item 3 · judgment · inferred · docs/development/feat/plan-web.md:7 · read · needs-eyes: whether the amendment was agreed\n## Checked clean\n- item 3 · coverage · evidence: settled check-coverage exit 0\n## Not checked\n## Counts\nobjective 0 · judgment 1 · needs-eyes 1\n## Next\ntake the judgment finding to the user.\n';

function gapsRun(name, packet, reports) {
  const directory = projectFixture('gaps-' + name, { 'packet.md': packet });
  const reportArguments = Object.entries(reports).map(([fileName, content]) => {
    const [id, file] = fileName.includes('=') ? fileName.split('=') : [null, fileName];
    fs.writeFileSync(path.join(directory, file), content);
    return id ? `${id}=${path.join(directory, file)}` : path.join(directory, file);
  });
  return runScript('review-gaps.js', ['--packet', path.join(directory, 'packet.md'), '--reports', ...reportArguments]);
}

const gapsCases = [
  { name: 'complete reports leave no gap', expected: 0, reports: { 'feat-web-s1-r1-a.md': REPORT_A, 'feat-web-s1-r1-b.md': REPORT_B, 'feat-web-s1-r1-c.md': REPORT_C }, output: /^review-gaps: clean/ },
  { name: 'an unowned changed file is a gap', expected: 1, packet: GAPS_PACKET.replace('- `docs/development/feat/plan-web.md` → c', '- `src/stray.ts` → UNOWNED · production A +1 -0\n- `docs/development/feat/plan-web.md` → c'),
    reports: { 'r-a.md': REPORT_A, 'r-b.md': REPORT_B, 'r-c.md': REPORT_C }, ids: true, output: /unowned file: src\/stray\.ts/ },
  { name: 'a changed file its owner never names is a gap', expected: 1, reports: { 'x-a.md': REPORT_A, 'x-b.md': REPORT_B.replace(/src\/data\.test\.ts/g, 'the test file'), 'x-c.md': REPORT_C },
    output: /file missing from its owner's report: src\/data\.test\.ts — owner b/ },
  { name: 'a finding without a proof or a needs-eyes label is a gap', expected: 1, reports: { 'x-a.md': REPORT_A.replace(' · proof: `npm run lint:tokens` exits 0', ''), 'x-b.md': REPORT_B, 'x-c.md': REPORT_C },
    output: /finding with neither a proof nor a needs-eyes label: report a:2/ },
  { name: 'an item marked not checked is a gap', expected: 1, reports: { 'x-a.md': REPORT_A.replace('not checked:\n', 'not checked:\n- item 1 · PII handling — why: 12-security-compliance is unsigned\n'), 'x-b.md': REPORT_B, 'x-c.md': REPORT_C },
    output: /not checked: report a:6 "item 1 · PII handling/ },
  { name: 'a checklist item no report mentions is a gap', expected: 1, reports: { 'x-a.md': REPORT_A, 'x-b.md': REPORT_B, 'x-c.md': REPORT_C.replace(/item 3/g, 'the plan') },
    output: /checklist item in no report: item 3 \(dimension c/ },
  { name: 'a clean item without evidence is a gap', expected: 1, reports: { 'x-a.md': REPORT_A, 'x-b.md': REPORT_B.replace(/ · evidence: .*returns nothing/, ' · looks fine'), 'x-c.md': REPORT_C },
    output: /clean item without evidence: report b:3/ },
  { name: 'a dimension without a report is a gap', expected: 1, reports: { 'x-a.md': REPORT_A, 'x-b.md': REPORT_B },
    output: /missing report: dimension c \(plan\/AC and the mechanical checks\) has no report/ },
  { name: 'one single report covers every dimension', expected: 0, reports: { 'x-single.md': REPORT_A + REPORT_B + REPORT_C } },
  { name: 'a report named by id=path is read as that dimension', expected: 0, reports: { 'a=first.md': REPORT_A, 'b=second.md': REPORT_B, 'c=third.md': REPORT_C } },
  { name: 'a report whose dimension cannot be told is refused', expected: 2, reports: { 'notes.md': REPORT_A } },
];

for (const gapsCase of gapsCases) {
  const reports = gapsCase.ids
    ? Object.fromEntries(Object.entries(gapsCase.reports).map(([name, content]) => [`${name.match(/-(\w)\.md$/)[1]}=${name}`, content]))
    : gapsCase.reports;
  const run = gapsRun(gapsCase.name.replace(/\W+/g, '-'), gapsCase.packet || GAPS_PACKET, reports);
  const ok = run.exitCode === gapsCase.expected && (!gapsCase.output || gapsCase.output.test(run.stdout));
  report('review-gaps.js', gapsCase.name, ok, [`expected exit ${gapsCase.expected}, got ${run.exitCode}`, run.stdout, run.stderr]);
}
{
  const flawed = (labels) => [
    `${labels[0]}`, '- item 1 · objective · measured · src/data.ts:2 · read the file',
    `${labels[1]}`, '- item 1 · tokens · src/data.ts · looks fine',
    `${labels[2]}`, '- item 1 · PII handling — no access to the profile',
    `${labels[3]} objective 1 · judgment 0 · needs-eyes 0`, `${labels[4]} fix the finding.`, '',
  ].join('\n');
  const shapes = {
    'labels in backticks, as the agents print the schema': ['1. `findings:`', '2. `checked clean:`', '3. `not checked:`', '4. `counts:`', '5. `next:`'],
    'bold numbered labels': ['**1. findings:**', '**2. checked clean:**', '**3. not checked:**', '**4. counts:**', '**5. next:**'],
    'bold labels in a bullet list': ['- **findings:**', '- **checked clean:**', '- **not checked:**', '- **counts:**', '- **next:**'],
  };
  for (const [shape, labels] of Object.entries(shapes)) {
    const run = gapsRun('label-' + shape.replace(/\W+/g, '-'), GAPS_PACKET, { 'x-a.md': flawed(labels), 'x-b.md': REPORT_B, 'x-c.md': REPORT_C });
    const ok = run.exitCode === 1 && /finding with neither a proof nor a needs-eyes label: report a:2/.test(run.stdout) &&
      /not checked: report a:6 "item 1 · PII handling/.test(run.stdout) && /clean item without evidence: report a:4/.test(run.stdout);
    report('review-gaps.js', `a report with ${shape} is still read section by section`, ok, [run.stdout, run.stderr]);
  }
  const { parseReport } = require(path.join(pluginRoot, 'scripts', 'review-gaps.js'));
  const bare = parseReport('1. Findings\n- item 1 · objective · measured · a.ts:1 · read · proof: `npm test`\n2. Checked clean\n- item 2 · x · evidence: a.ts:2\n');
  const prosey = parseReport('findings:\n- item 1 · objective · measured · a.ts:1 · read · proof: `npm test`\n- next steps are listed in the plan\n');
  report('review-gaps.js', 'a bare numbered label still opens its section, and a bullet that only starts with a label word does not',
    bare.findings.length === 1 && bare.clean.length === 1 && prosey.findings.length === 2 && !prosey.next.length,
    JSON.stringify({ bare, prosey }, (key, value) => (value instanceof Set ? [...value] : value)));
  const prose = gapsRun('outside-schema', GAPS_PACKET, {
    'x-a.md': 'I looked at src/data.ts, items 1 to 3, and everything seems fine to me.\n', 'x-b.md': REPORT_B, 'x-c.md': REPORT_C,
  });
  report('review-gaps.js', 'a report with neither a findings: nor a checked clean: section is a gap',
    prose.exitCode === 1 && /report outside the schema: report a has neither a "findings:" nor a "checked clean:" section/.test(prose.stdout), prose.stdout);
}
{
  const directory = projectFixture('gaps-not-a-packet', { 'packet.md': '# nothing here\n', 'x-a.md': REPORT_A });
  const run = runScript('review-gaps.js', ['--packet', path.join(directory, 'packet.md'), '--reports', path.join(directory, 'x-a.md')]);
  report('review-gaps.js', 'a file that is not a packet is refused', run.exitCode === 2, run.stderr);
}
{
  const { root, base } = featureRepo('gaps-integration');
  writeFiles(root, UI_CHANGE);
  const packet = packetRun(root, [path.join(root, FEATURE), 'web', '--stage', '1', '--base', base]);
  const reportOf = (id) => packet.packetPath.replace(/\.md$/, `-${id}.md`);
  fs.writeFileSync(reportOf('a'), 'findings: none\nchecked clean:\n- item 1 · tokens · src/data.ts, src/components/Band.tsx · evidence: `rg -n "#[0-9a-f]{6}" src` returns nothing\nnot checked: none\ncounts: objective 0 · judgment 0 · needs-eyes 0\nnext: the stage can close.\n');
  fs.writeFileSync(reportOf('b'), 'findings: none\nchecked clean:\n- item 2 · test quality · src/data.test.ts · evidence: `npm test -- data` exit 0, and fails with the fix removed\nnot checked: none\ncounts: objective 0 · judgment 0 · needs-eyes 0\nnext: the stage can close.\n');
  fs.writeFileSync(reportOf('c'), 'findings: none\nchecked clean:\n- item 3 · plan/AC · evidence: settled check-coverage.js exit 0\nnot checked: none\ncounts: objective 0 · judgment 0 · needs-eyes 0\nnext: the stage can close.\n');
  const run = runScript('review-gaps.js', ['--packet', packet.packetPath, '--reports', reportOf('a'), reportOf('b'), reportOf('c')]);
  report('review-gaps.js', 'reports written to the paths a real packet names close with no gap', run.exitCode === 0, [run.stdout, run.stderr]);
}

const LIST_TEST = "it('loadsTheListOnOpen', () => {})\nit('showsEmptyStateWhenNoItems', () => {})\n";
const testPlanWith = (rows) => ['# Test plan', '', '## AC → test coverage', '', '| ID | AC | Level | Test case | File | Status |', '|---|---|---|---|---|---|', ...rows, ''].join('\n');
const PLAN_ROWS = [
  '| TC1 | `AC-1` | unit | loads | `src/list.test.ts` — `loadsTheListOnOpen` | pass |',
  '| TC2 | `AC-2` | unit | empty | `showsEmptyStateWhenNoItems` | pass |',
  '| TC3 | `AC-3` | e2e | journey | `e2e/journey.spec.ts` | pass |',
];
const junit = (cases) => `<?xml version="1.0"?>\n<testsuites><testsuite name="all">${cases.join('')}</testsuite></testsuites>\n`;
const passing = (name, file) => `<testcase classname="suite" name="${name}" file="${file}"/>`;
const failing = (name, file) => `<testcase classname="suite" name="${name}" file="${file}"><failure message="expected"/></testcase>`;
const ALL_PASSING = junit([passing('loadsTheListOnOpen', 'src/list.test.ts'), passing('showsEmptyStateWhenNoItems', 'src/list.test.ts'), passing('journey', 'e2e/journey.spec.ts')]);
const SENTENCE_SPEC = "test('shows the retry banner when offline', async () => {})\ntest('shows the receipt transaction id', async () => {})\n";
const SENTENCE_ROWS = [PLAN_ROWS[0], PLAN_ROWS[1], '| TC3 | `AC-3` | e2e | banner | `tests/api/payment.spec.ts` · `shows the retry banner when offline` | pass |'];

function testPlanRun(name, { rows, files, reportText, reportName }) {
  const { root } = committedRepo('test-plan-' + name, {
    [`${FEATURE}/TRD-web.md`]: SPOKE,
    [`${FEATURE}/test-plan-web.md`]: testPlanWith(rows || PLAN_ROWS),
    'src/list.test.ts': LIST_TEST,
    'e2e/journey.spec.ts': "test('journey', async () => {})\n",
    ...(files || {}),
  });
  const args = [path.join(root, FEATURE), 'web', '--test-plan'];
  if (reportText) {
    fs.writeFileSync(path.join(root, reportName || 'report.xml'), reportText);
    args.push('--report', path.join(root, reportName || 'report.xml'));
  }
  return runScript('check-coverage.js', args);
}

const testPlanCases = [
  { name: 'a plan whose tests exist is clean without a report', expected: 0 },
  { name: 'a plan whose statuses match the runner report is clean', expected: 0, reportText: ALL_PASSING },
  { name: 'an AC without a row is reported', expected: 1, rows: PLAN_ROWS.slice(0, 2), output: /AC-3 is in the AC register but in no row of the AC → test table/ },
  { name: 'a renamed test is reported', expected: 1, files: { 'src/list.test.ts': LIST_TEST.replace('loadsTheListOnOpen', 'loadsTheListWhenOpened') },
    output: /TC1 \(line 7\) claims test `loadsTheListOnOpen`, which no file .* contains — renamed or removed\?/ },
  { name: 'a test file that does not exist is reported', expected: 1, rows: [PLAN_ROWS[0], PLAN_ROWS[1], PLAN_ROWS[2].replace('e2e/journey.spec.ts', 'e2e/gone.spec.ts')],
    output: /TC3 \(line 9\) names `e2e\/gone\.spec\.ts`, which no file/ },
  { name: 'a status recorded without a run is reported', expected: 1,
    reportText: junit([passing('loadsTheListOnOpen', 'src/list.test.ts'), passing('journey', 'e2e/journey.spec.ts')]),
    output: /TC2 \(line 8\) records pass, but the runner report has no run of `showsEmptyStateWhenNoItems` — a status recorded without a run/ },
  { name: 'a pass the runner saw fail is reported', expected: 1,
    reportText: junit([failing('loadsTheListOnOpen', 'src/list.test.ts'), passing('showsEmptyStateWhenNoItems', 'src/list.test.ts'), passing('journey', 'e2e/journey.spec.ts')]),
    output: /TC1 \(line 7\) records pass, but the runner report has `loadsTheListOnOpen` failing/ },
  { name: 'a Playwright JSON report is read', expected: 0, reportName: 'report.json',
    reportText: JSON.stringify({ suites: [{ title: 'list.test.ts', file: 'src/list.test.ts', specs: [
      { title: 'loadsTheListOnOpen', ok: true, tests: [{ status: 'expected' }] },
      { title: 'showsEmptyStateWhenNoItems', ok: true, tests: [{ status: 'expected' }] }] },
    { title: 'journey.spec.ts', file: 'e2e/journey.spec.ts', specs: [{ title: 'journey', ok: true, tests: [{ status: 'expected' }] }] }] }) },
  { name: 'go test -json output is read', expected: 1, reportName: 'go.json',
    reportText: [{ Action: 'pass', Package: 'x', Test: 'loadsTheListOnOpen' }, { Action: 'fail', Package: 'x', Test: 'showsEmptyStateWhenNoItems' }].map((event) => JSON.stringify(event)).join('\n') + '\n',
    output: /TC2 \(line 8\) records pass, but the runner report has `showsEmptyStateWhenNoItems` failing/ },
  { name: 'a row naming an AC outside the register is reported', expected: 1, rows: [...PLAN_ROWS, '| TC4 | `AC-9` | unit | extra | `src/list.test.ts` | pass |'],
    output: /TC4 \(line 10\) names AC-9, which is not in the AC register/ },
  { name: 'a runner report it cannot read is a usage error', expected: 2, reportText: 'not a report\n' },
  { name: 'a test named by a sentence is found in its file', expected: 0, rows: SENTENCE_ROWS, files: { 'tests/api/payment.spec.ts': SENTENCE_SPEC },
    output: /3 test name\(s\)/ },
  { name: 'a renamed sentence-named test is reported', expected: 1, rows: SENTENCE_ROWS,
    files: { 'tests/api/payment.spec.ts': SENTENCE_SPEC.replace('shows the retry banner when offline', 'banner appears') },
    output: /TC3 \(line 9\) claims test `shows the retry banner when offline`, which no file .* contains — renamed or removed\?/ },
  { name: 'a sentence-named test is judged by its own run, not by a failing sibling in the same file', expected: 0, rows: SENTENCE_ROWS,
    files: { 'tests/api/payment.spec.ts': SENTENCE_SPEC },
    reportText: junit([passing('loadsTheListOnOpen', 'src/list.test.ts'), passing('showsEmptyStateWhenNoItems', 'src/list.test.ts'),
      passing('shows the retry banner when offline', 'tests/api/payment.spec.ts'), failing('shows the receipt transaction id', 'tests/api/payment.spec.ts')]) },
  { name: 'a jest-junit report with no file attribute matches a sentence-named test by its title', expected: 0, rows: SENTENCE_ROWS,
    files: { 'tests/api/payment.spec.ts': SENTENCE_SPEC },
    reportText: junit(['list loadsTheListOnOpen', 'list showsEmptyStateWhenNoItems', 'payment shows the retry banner when offline']
      .map((title) => `<testcase classname="${title}" name="${title}"/>`)) },
  { name: 'a command in the file column is not taken for a test name', expected: 0,
    rows: [PLAN_ROWS[0], PLAN_ROWS[1], '| TC3 | `AC-3` | e2e | journey | `e2e/journey.spec.ts` · `npx playwright test journey` | pass |'] },
  { name: 'a single-document Issue TRD holds the AC register the plan is checked against', expected: 0,
    files: { [`${FEATURE}/TRD-web.md`]: undefined, [`${FEATURE}/TRD.md`]: ISSUE_TRD }, output: /^coverage: clean — 3 acceptance criteria/ },
];

for (const testPlanCase of testPlanCases) {
  const run = testPlanRun(testPlanCase.name.replace(/\W+/g, '-'), testPlanCase);
  const ok = run.exitCode === testPlanCase.expected && (!testPlanCase.output || testPlanCase.output.test(run.stdout));
  report('check-coverage.js --test-plan', testPlanCase.name, ok, [`expected exit ${testPlanCase.expected}, got ${run.exitCode}`, run.stdout, run.stderr]);
}
{
  committedRepo('sibling-web', { 'e2e/readiness-smoke.spec.ts': "test('the readiness flags reach the screen', async () => {})\n" });
  const row = '| TC3 | `AC-3` | e2e | journey | `sibling-web/e2e/readiness-smoke.spec.ts` · `the readiness flags reach the screen` | pass |';
  const found = testPlanRun('sibling-reference', { rows: [PLAN_ROWS[0], PLAN_ROWS[1], row] });
  report('check-coverage.js --test-plan', 'a Boot & Smoke test in a sibling repository of the workspace is found there', found.exitCode === 0,
    [found.stdout, found.stderr]);
  const missing = testPlanRun('sibling-missing', { rows: [PLAN_ROWS[0], PLAN_ROWS[1], row.replace('readiness-smoke', 'gone-smoke')] });
  report('check-coverage.js --test-plan', 'a sibling-repository test file that is not there is still reported',
    missing.exitCode === 1 && /names `sibling-web\/e2e\/gone-smoke\.spec\.ts`, which no file/.test(missing.stdout), missing.stdout);
}
{
  const docs = committedRepo('two-repos/api', {
    [`${FEATURE}/TRD-web.md`]: SPOKE,
    [`${FEATURE}/test-plan-web.md`]: testPlanWith([
      '| TC1 | `AC-1` | api | loads | `tests/api/x.spec.js` · `returnsTheList` | pass |',
      '| TC2 | `AC-2` | e2e | empty | `../web/e2e/y.spec.ts` · `shows the empty state` | pass |',
      '| TC3 | `AC-3` | e2e | journey | `../web/e2e/y.spec.ts` · `walks the whole journey` | pass |',
    ]),
    'tests/api/x.spec.js': "it('returnsTheList', () => {})\n",
  });
  const web = committedRepo('two-repos/web', {
    'e2e/y.spec.ts': "test('shows the empty state', async () => {})\ntest('walks the whole journey', async () => {})\n",
  });
  const featureDirectory = path.join(docs.root, FEATURE);
  const fromDocs = runScript('check-coverage.js', [featureDirectory, 'web', '--test-plan'], { cwd: docs.root });
  const fromSibling = runScript('check-coverage.js', [featureDirectory, 'web', '--test-plan', '--repo', web.root], { cwd: web.root });
  report('check-coverage.js --test-plan', 'a plan whose tests span the docs repository and a sibling is clean from either repository',
    fromDocs.exitCode === 0 && fromSibling.exitCode === 0, [fromDocs.stdout, fromSibling.stdout, fromSibling.stderr]);
  writeFiles(web.root, { 'e2e/z.spec.ts': "test('opens the next screen', async () => {})\n" });
  const packet = packetRun(web.root, [featureDirectory, 'web', '--kind', 'tests', '--base', web.base, '--repo', web.root]);
  report('review-packet.js', 'the sibling repository\'s test packet settles the docs repository\'s rows clean',
    packet.exitCode === 0 && /### check-coverage\.js --test-plan — exit 0\n/.test(packet.text),
    [packet.stderr, sectionOf(packet.text, 'Settled script outputs')]);
}

function frontMatterOf(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  const fields = {};
  for (const line of (match ? match[1] : '').split('\n')) {
    const field = line.match(/^(\w+):\s*(.*)$/);
    if (field) fields[field[1]] = field[2].trim();
  }
  return { fields, body: match ? text.slice(match[0].length) : text };
}
const agent = (name) => frontMatterOf(fs.readFileSync(path.join(pluginRoot, 'agents', `${name}.md`), 'utf8'));
const reviewer = agent('sdlc-reviewer');
const deep = agent('sdlc-reviewer-deep');
const critic = agent('sdlc-reviewer-critic');
const AGENT_BODY_LIMIT = 6500;

report('agents', 'sdlc-reviewer runs on Opus at effort high with Bash',
  reviewer.fields.name === 'sdlc-reviewer' && reviewer.fields.model === 'opus' && reviewer.fields.effort === 'high' && /\bBash\b/.test(reviewer.fields.tools || ''),
  JSON.stringify(reviewer.fields));
report('agents', 'sdlc-reviewer-deep is the same body at effort max',
  deep.fields.name === 'sdlc-reviewer-deep' && deep.fields.model === 'opus' && deep.fields.effort === 'max' && deep.body === reviewer.body &&
    /hub-review consistency dimension \(b\)/.test(deep.fields.description || '') && /fix-quality dimension/.test(deep.fields.description || ''),
  JSON.stringify(deep.fields));
report('agents', 'sdlc-reviewer-critic runs on Opus at effort medium without Bash',
  critic.fields.name === 'sdlc-reviewer-critic' && critic.fields.model === 'opus' && critic.fields.effort === 'medium' &&
    (critic.fields.tools || '').split(',').map((tool) => tool.trim()).sort().join(',') === 'Glob,Grep,Read',
  JSON.stringify(critic.fields));
report('agents', 'every reviewer body stays within the agent budget',
  [reviewer, deep, critic].every(({ body }) => body.trim().length <= AGENT_BODY_LIMIT),
  [reviewer, deep, critic].map(({ fields, body }) => `${fields.name}: ${body.trim().length}`));
const reviewerDuties = [
  'review-packet.js',
  'Open `principles.md` only by section, for a rule the packet names but withholds',
  'nobody re-runs plugin scripts unless',
  'The stage\'s own tests and the sabotage checks are re-run only by',
  'the test-quality dimension or the single light-tier reviewer',
  'Anyone re-runs what they doubt, and\n  lists each re-run with why',
  'together in one message',
  'One round is the target: report everything you find now; never defer a finding to a later\n  round.',
  'The packet is the minimum, not the boundary — but the change is the boundary.',
  'Hold the work to the hub\'s boundary.',
  'Label every finding measured or inferred.',
  'Leave the working tree exactly as you found it.',
  'Split findings by kind.',
  'never soften one into the other',
];
const missingDuties = reviewerDuties.filter((duty) => !reviewer.body.includes(duty));
report('agents', 'the reviewer brief carries the packet rules and keeps every existing duty', !missingDuties.length, missingDuties);
const schemaOrder = ['`findings:`', '`checked clean:`', '`not checked:`', '`counts:`', '`next:`'].map((label) => reviewer.body.indexOf(label));
report('agents', 'the report schema is fixed, in order', schemaOrder.every((position, index) => position > 0 && (index === 0 || position > schemaOrder[index - 1])) &&
  reviewer.body.includes('Report in this order and nothing else') && reviewer.body.includes('proof: <command>') && reviewer.body.includes('needs-eyes: <why>'),
  schemaOrder.join(', '));
report('agents', 'the critic reads the reports, the map, the diff stat and the gaps output, and reports in the same schema',
  critic.body.includes('review-gaps.js') && critic.body.includes('File →\n  dimension map') && critic.body.includes('*Diff stat*') &&
    critic.body.includes('load-bearing claim with no command behind it') && ['`findings:`', '`checked clean:`', '`not checked:`', '`counts:`', '`next:`'].every((label) => critic.body.includes(label)),
  critic.body.slice(0, 400));

const dimensions = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'scripts', 'review-dimensions.json'), 'utf8'));
const dimensionProblems = [];
for (const [kind, definition] of Object.entries(dimensions)) {
  const ids = definition.dimensions.map((dimension) => dimension.id);
  if (new Set(ids).size !== ids.length) dimensionProblems.push(`${kind}: duplicate ids`);
  const items = definition.dimensions.flatMap((dimension) => dimension.items);
  if (new Set(items).size !== items.length) dimensionProblems.push(`${kind}: an item is owned twice`);
  for (const dimension of definition.dimensions) {
    if (!dimension.name || !Array.isArray(dimension.items) || !dimension.items.length || !dimension.items.every(Number.isInteger)) dimensionProblems.push(`${kind}.${dimension.id}: items`);
    if (!Array.isArray(dimension.owns) || !dimension.owns.length) dimensionProblems.push(`${kind}.${dimension.id}: owns`);
    const checklist = path.join(pluginRoot, dimension.checklistFile || '');
    const fallback = path.join(pluginRoot, 'skills', definition.skill || '', 'SKILL.md');
    if (!dimension.checklistFile || (!fs.existsSync(checklist) && !fs.existsSync(fallback))) dimensionProblems.push(`${kind}.${dimension.id}: no checklist file`);
  }
}
const flagged = (kind, key) => dimensions[kind].dimensions.filter((dimension) => dimension[key]).map((dimension) => dimension.id).join(',');
report('review-dimensions.json', 'every kind names its dimensions, items, owned files and checklist', !dimensionProblems.length && ['code', 'fix', 'tests', 'hub', 'trd'].every((kind) => dimensions[kind]),
  dimensionProblems);
report('review-dimensions.json', 'tests and sabotage belong to one test-quality dimension per kind',
  flagged('code', 'testQuality') === 'b' && flagged('fix', 'testQuality') === 'a' && flagged('tests', 'testQuality') === 'b' && !flagged('hub', 'testQuality') && !flagged('trd', 'testQuality'),
  ['code', 'fix', 'tests'].map((kind) => `${kind}: ${flagged(kind, 'testQuality')}`));
report('review-dimensions.json', 'only hub consistency and fix quality run on the deep reviewer',
  Object.entries(dimensions).flatMap(([kind, definition]) => definition.dimensions.filter((dimension) => dimension.agent).map((dimension) => `${kind}.${dimension.id}=${dimension.agent}`)).sort().join(' ') ===
    'fix.a=alpha-sdlc:sdlc-reviewer-deep hub.b=alpha-sdlc:sdlc-reviewer-deep',
  JSON.stringify(dimensions.hub));

const checklist = fs.readFileSync(path.join(pluginRoot, 'skills', 'do-development', 'conformance-reviewer.md'), 'utf8');
report('conformance-reviewer.md', 'the header describes the packet file, not principles.md and the touched docs',
  checklist.includes('`scripts/review-packet.js` writes') && !checklist.includes('`../../principles.md`, and the `docs/basics/` docs the diff touches'), checklist.slice(0, 500));
report('conformance-reviewer.md', 'the checklist keeps its three parts and the comment allowlist exception',
  ['1. **Profile conformance**', '2. **Principles conformance**', '3. **Plan/AC conformance**'].every((part) => checklist.includes(part)) &&
    checklist.includes('comment allowlist permits them') && checklist.includes('**zero comments** — the diff adds none at all') && checklist.includes('**case completeness**'),
  checklist.length);

finish();
