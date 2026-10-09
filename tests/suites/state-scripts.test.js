#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createSuite, environmentWith, pluginRoot } = require('../lib/harness');

const suite = createSuite('state-scripts');
const { sdlcProject, projectFixture, runScript, report, finish } = suite;

const GIT_ENVIRONMENT = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
};
const SCRIPT_ENVIRONMENT = { ...GIT_ENVIRONMENT, CLAUDE_PLUGIN_ROOT: pluginRoot };

function gitIn(directory, args, extraEnvironment) {
  const result = spawnSync('git', args, {
    cwd: directory,
    encoding: 'utf8',
    env: environmentWith({ ...GIT_ENVIRONMENT, ...(extraEnvironment || {}) }),
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${directory}: ${result.stderr}`);
  return result.stdout.trim();
}

function initRepository(directory) {
  gitIn(directory, ['init', '-q', '-b', 'main']);
}

function commitAll(directory, message, date) {
  gitIn(directory, ['add', '-A']);
  gitIn(directory, ['commit', '-q', '--no-verify', '-m', message], date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {});
  return gitIn(directory, ['rev-parse', 'HEAD']);
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

const HUB_TITLES = [
  '1. Context / scope', '2. Feature dependencies', '3. Feature flow', '4. System design',
  '5. API contracts', '6. Cross-cutting concerns', '7. Change manifest',
];
const SPOKE_TITLES = [
  '1. Scope (this platform)', '2. Design', '3. Assets', '4. Data / persistence', '5. Performance impact',
  '6. Release considerations', '7. Risks / dependencies (this platform)', '8. Acceptance criteria', '9. Work slices',
];

function markerFor(state) {
  if (state === 'approved') return '_Approved: 2026-10-01 · a1b2c3d_';
  if (state === 'pending') return '_Pending_';
  if (state === 'placeholder') return '_Approved: <YYYY-MM-DD>_';
  if (state === 'old') return '_Approved: 2026-08-01_';
  return null;
}

function sectionsText(titles, states, bodies) {
  return titles.map((title, index) => {
    const marker = markerFor(states[index] || 'approved');
    const body = (bodies && bodies[index + 1]) || `Decisions for ${title}.`;
    return `## ${title}\n${marker ? marker + '\n' : ''}\n${body}\n`;
  }).join('\n');
}

function hubDocument({ states = [], review = '✅ reviewed 2026-10-01 · rev `a1b2c3d` · rounds `2 · 0`', spokes = null, extra = '' } = {}) {
  const spokeTable = spokes
    ? '## Spokes & alignment\n\n| Spoke | Repo | Link | Hub alignment | Platform exceptions (decided divergences) |\n' +
      '|-------|------|------|---------------|-------------------------------------------|\n' +
      spokes.map(([name, cell]) => `| ${name} | — | [TRD-${name}.md](./TRD-${name}.md) | ${cell} | none |`).join('\n') + '\n\n'
    : '';
  return '# TRD (Hub): Checkout\n\n| | |\n|---|---|\n| **Status** | Draft |\n' +
    (review === null ? '' : `| **Hub review** | ${review} |\n`) +
    '| **Date** | 2026-10-01 |\n\n' + spokeTable + sectionsText(HUB_TITLES, states) + extra;
}

const AC_TABLE = (ids) =>
  '| ID | Acceptance criterion (assertable, one sentence) | Source |\n|----|----|----|\n' +
  ids.map((id) => `| AC-${id} | the list shows criterion ${id} | hub §2 |`).join('\n');

function spokeDocument({
  platform = 'Backend',
  states = [],
  alignment = '✅ reviewed 2026-10-01 · hub rev 2026-10-01',
  rounds = '`3 · 0`',
  acs = [1, 2, 3],
  slices = '- [ ] **`BE1`** — everything — AC: `AC-1` … `AC-3`',
  extra = '',
} = {}) {
  return `# TRD (${platform}): Checkout\n\n| | |\n|---|---|\n| **Status** | Draft |\n| **Platform** | ${platform} |\n` +
    `| **Hub** | [./TRD.md](./TRD.md) |\n| **Hub alignment** | ${alignment} |\n| **Alignment rounds** | ${rounds} |\n` +
    '| **Date** | 2026-10-01 |\n\n## Open Decisions\n\n| # | Gap | Why | Options | Status |\n|---|---|---|---|---|\n' +
    '| D1 | a gap | a reason | ★ A / B | decided: A |\n\n' +
    sectionsText(SPOKE_TITLES, states, { 8: AC_TABLE(acs), 9: slices }) + extra;
}

function stageBlock({
  number,
  slice = 'BE1',
  covers = `\`AC-${number}\``,
  approved = 'commit `abc1234` · approved 2026-10-02',
  status = 'pending',
  verdict = 'pending',
  files = `\`src/stage${number}.ts\``,
  heading = null,
  extra = null,
}) {
  return [
    heading || `### Stage ${number} — [domain] \`${slice}\` — goal ${number}`,
    `- **Covers:** ${covers}`,
    `- **Files / modules:** ${files}`,
    '- **Approach:** rung 2 — reuse the existing module',
    approved === null ? null : `- **Approved (plan gate):** ${approved}`,
    status === null ? null : `- **Status:** ${status}`,
    verdict === null ? null : `- **Checkpoint verdict:** ${verdict}`,
    extra,
    '- **⏸ Checkpoint — review here.** **Safe to stop after?** yes — compiles and tests pass',
    '',
  ].filter((line) => line !== null).join('\n');
}

const DONE = { status: 'done 2026-10-03', verdict: 'approved 2026-10-03' };

function planDocument({
  platform = 'Backend',
  scope = '2026-10-02',
  layout = '_Approved: 2026-10-02_',
  breakdown = null,
  stages = [],
  sequencing = true,
} = {}) {
  const header = `# Dev Plan (${platform}): Checkout\n\n| | |\n|---|---|\n| **Platform** | ${platform} |\n` +
    (scope === null ? '' : `| **Scope confirmed** | ${scope} |\n`) + '| **Date** | 2026-10-02 |\n\n';
  const layoutSection = '## Architecture & package layout\n\n' + (layout ? layout + '\n\n' : '') +
    '**Approach (ladder rung · world-wide standard):** rung 2 — reuse the existing packages · standard: agrees\n\n';
  const breakdownSection = breakdown
    ? `## Stage breakdown — approved ${breakdown.date}\n\n| Stage | Layer | Slice | Goal | Detail |\n|---|---|---|---|---|\n` +
      breakdown.rows.map(([number, detail]) => `| ${number} | [domain] | BE1 | goal ${number} | ${detail} |`).join('\n') + '\n\n'
    : '';
  const sequencingSection = sequencing
    ? '## Sequencing & stop points\n\n- **Order / dependencies:** in order\n- **Uncovered tasks / AC:** coverage: clean — none\n'
    : '';
  return header + layoutSection + breakdownSection + '## Stages\n\n' + stages.map(stageBlock).join('\n') + '\n' + sequencingSection;
}

function testPlanDocument({
  planApproved = 'auto 2026-10-05',
  environment = 'local stack · 2026-10-05',
  review = 'reviewed 2026-10-06 · rounds 1 · clean',
  tests = [['TC1', 'pass'], ['TC2', 'pass']],
  procedures = [['TC1', '2026-10-05'], ['TC2', '2026-10-05']],
  bugs = null,
  smoke = '**pass** — all three journeys',
  covered = '**3 of 3** covered and passing',
} = {}) {
  const header = '# Test Plan (Backend): Checkout\n\n| | |\n|---|---|\n| **Platform** | Backend |\n' +
    (planApproved === null ? '' : `| **Plan approved** | ${planApproved} |\n`) +
    (environment === null ? '' : `| **Environment approved** | ${environment} |\n`) +
    (review === null ? '' : `| **Test review** | ${review} |\n`) + '| **Date** | 2026-10-05 |\n\n';
  const coverage = '## AC → test coverage\n\n| ID | AC | Level | Test case | File | Status |\n|----|----|----|----|----|----|\n' +
    tests.map(([id, status], index) => `| ${id} | AC-${index + 1} — the list shows it | API | asserts it | test/checkout.test.ts | ${status} |`).join('\n') + '\n\n';
  const procedureSection = '## Test procedures (step-by-step)\n\n' + procedures.map(([id, approved]) =>
    `### ${id} — what it verifies\n` + (approved === null ? '' : `- **Approved:** ${approved}\n`) +
    '- **AC:** AC-1\n- **Steps:**\n  1. call it\n- **Expected:** it answers\n').join('\n') + '\n';
  const bugSection = '## Bugs found\n\n' + (bugs || '| # | Bug | Severity | Level | AC | Repro steps | Fix? (user) | Attempts | Status |\n' +
    '|---|-----|----------|-------|----|-------------|-------------|----------|--------|\n' +
    '| none | no test failed | — | — | — | — | — | — | — |') + '\n\n';
  const summary = `## Coverage summary\n\n- **AC covered:** ${covered}\n- **Boot & Smoke (integrated):** ${smoke}\n`;
  return header + coverage + procedureSection + bugSection + summary;
}

const BUG_HEADER = '| # | Bug | Severity | Level | AC | Repro steps | Fix? (user) | Attempts | Status |\n' +
  '|---|-----|----------|-------|----|-------------|-------------|----------|--------|\n';
const bugRow = (id, severity, fix, attempts, status) =>
  `| ${id} | ${id} breaks the list | ${severity} | API | AC-1 | 1. call it | ${fix} | ${attempts} | ${status} |`;

const RUN_RECIPE = '# Environment\n\n## Full-stack run recipe\n\n- backend: `make run`\n';

function featureProject(name, files, options = {}) {
  const featureFiles = {};
  for (const [relativePath, content] of Object.entries(files)) {
    featureFiles[relativePath.startsWith('/') ? relativePath.slice(1) : `docs/development/checkout/${relativePath}`] = content;
  }
  const make = options.withoutProfile ? projectFixture : sdlcProject;
  const projectRoot = make('next-' + name, {
    ...(options.withoutProfile ? {} : { 'docs/basics/09-environment.md': RUN_RECIPE }),
    ...featureFiles,
  });
  return { projectRoot, featureDirectory: path.join(projectRoot, 'docs', 'development', 'checkout') };
}

function nextStep(featureDirectory, extraArguments = [], options = {}) {
  const run = runScript('next-step.js', [featureDirectory, ...extraArguments, '--json'], {
    cwd: options.cwd || featureDirectory,
    env: { ...SCRIPT_ENVIRONMENT, ...(options.env || {}) },
  });
  let json = null;
  try { json = JSON.parse(run.stdout); } catch {}
  return { ...run, json };
}

const rereadNames = (json) => (json.reread || []).map((entry) => `${path.basename(path.dirname(entry.path))}/${path.basename(entry.path)}`);

function expectNext(name, outcome, expectations) {
  const json = outcome.json || {};
  const stops = json.stops || [];
  const problems = [];
  const has = (list, pattern) => (list || []).some((item) => pattern.test(typeof item === 'string' ? item : item.path));
  if (expectations.rereadOrder && JSON.stringify(rereadNames(json)) !== JSON.stringify(expectations.rereadOrder)) {
    problems.push(`re-read list ${JSON.stringify(rereadNames(json))}, expected ${JSON.stringify(expectations.rereadOrder)}`);
  }
  for (const [file, pattern] of Object.entries(expectations.rereadWhy || {})) {
    const entry = (json.reread || []).find((candidate) => candidate.path.split(path.sep).join('/').endsWith(`/${file}`));
    if (!entry || !pattern.test(entry.why)) problems.push(`re-read ${file} is ${entry ? `"${entry.why}"` : 'not listed'}, expected ${pattern}`);
  }
  if (!outcome.json) problems.push('the output is not JSON');
  if (expectations.exit !== undefined && outcome.exitCode !== expectations.exit) problems.push(`exit ${outcome.exitCode}, expected ${expectations.exit}`);
  if (expectations.phase && json.phase !== expectations.phase) problems.push(`phase ${json.phase}, expected ${expectations.phase}`);
  if (expectations.unit && !(json.next && expectations.unit.test(json.next.unit))) problems.push(`next ${JSON.stringify(json.next)} does not name ${expectations.unit}`);
  if (expectations.step && !(json.next && expectations.step.test(json.next.step))) problems.push(`next ${JSON.stringify(json.next)} does not say ${expectations.step}`);
  if (expectations.stop && !has(stops, expectations.stop)) problems.push(`no STOP matching ${expectations.stop}; stops: ${JSON.stringify(stops)}`);
  if (expectations.noStop && stops.length) problems.push(`unexpected STOP: ${stops.join(' | ')}`);
  if (expectations.fact && !has(json.facts, expectations.fact)) problems.push(`no fact matching ${expectations.fact}; facts: ${JSON.stringify(json.facts)}`);
  if (expectations.note && !has(json.notes, expectations.note)) problems.push(`no note matching ${expectations.note}; notes: ${JSON.stringify(json.notes)}`);
  if (expectations.gate && !(json.gate && expectations.gate.test(json.gate))) problems.push(`gate ${json.gate} does not match ${expectations.gate}`);
  if (expectations.reread && !has(json.reread, expectations.reread)) problems.push(`re-read list lacks ${expectations.reread}: ${JSON.stringify((json.reread || []).map((entry) => entry.path))}`);
  if (expectations.notReread && has(json.reread, expectations.notReread)) problems.push(`re-read list should not hold ${expectations.notReread}`);
  if (expectations.unknown && !(json.unknown && expectations.unknown.test(json.unknown.reason))) problems.push(`unknown ${JSON.stringify(json.unknown)} does not match ${expectations.unknown}`);
  if (expectations.block && !(json.block && expectations.block.test(json.block.text))) problems.push(`block ${JSON.stringify(json.block)} does not match ${expectations.block}`);
  if (expectations.check && !expectations.check(json)) problems.push('the custom check failed');
  report('next-step.js', name, problems.length === 0,
    problems.length ? [...problems, outcome.stdout.slice(0, 1600), outcome.stderr.slice(0, 600)] : []);
}

{
  const { featureDirectory } = featureProject('skeleton', {
    'TRD.md': hubDocument({ states: ['approved', 'approved', 'pending', 'pending', 'pending', 'pending', 'pending'], review: '❌ not reviewed' }),
  });
  expectNext('a grooming skeleton resumes at its first _Pending_ heading, never at Gate 0', nextStep(featureDirectory),
    { exit: 0, phase: 'grooming', unit: /3\. Feature flow/, step: /per-section loop/, gate: /one section at a time/, fact: /2 of 7.*_Pending_/ });
}

{
  const { featureDirectory } = featureProject('placeholder-stamp', {
    'TRD.md': hubDocument({ states: ['approved', 'placeholder', 'pending'] }),
  });
  expectNext('a section still carrying the template stamp is not approved', nextStep(featureDirectory),
    { exit: 0, unit: /2\. Feature dependencies/ });
}

{
  const { featureDirectory } = featureProject('carry-forward', {
    'TRD.md': hubDocument({ states: ['approved', 'pending'], extra: '\n## Carry-forward answers\n\n- §5: the list is paged by 50\n' }),
  });
  expectNext('carry-forward answers waiting for a later section are surfaced', nextStep(featureDirectory),
    { exit: 0, fact: /carry-forward answers.*paged by 50/ });
}

{
  const { featureDirectory } = featureProject('no-hub', { 'notes.md': 'nothing yet\n' });
  expectNext('a feature with no hub starts at Gate 0', nextStep(featureDirectory),
    { exit: 0, unit: /hub TRD\.md/, step: /Gate 0/, gate: /approve or edit the outline/ });
}

{
  const projectRoot = sdlcProject('next-nothing-groomed', { 'docs/basics/09-environment.md': RUN_RECIPE });
  const missing = path.join(projectRoot, 'docs', 'development', 'checkout');
  expectNext('grooming a feature that has no directory yet starts at Gate 0, not at a usage error',
    nextStep(missing, ['--phase', 'grooming'], { cwd: projectRoot }),
    {
      exit: 0, unit: /^nothing groomed yet$/, step: /^Gate 0 — /, gate: /approve or edit the outline/,
      fact: /^no feature directory at \S*docs\/development\/checkout — nothing is groomed under that name yet$/,
      rereadOrder: ['do-grooming/TRD-hub-template.md', 'do-grooming/hub.md'], check: (json) => json.skill === 'do-grooming',
    });
  const text = runScript('next-step.js', [missing, '--phase', 'grooming'], { cwd: projectRoot, env: SCRIPT_ENVIRONMENT });
  report('next-step.js', 'the text report reads "nothing groomed yet — Gate 0"',
    text.exitCode === 0 && /\nnext: nothing groomed yet — Gate 0 — /.test(text.stdout), [`exit ${text.exitCode}`, text.stdout, text.stderr]);
  expectNext('a foundation with no directory yet starts at Gate 0 with the foundation skill and template',
    nextStep(path.join(projectRoot, 'docs', 'development', 'foundation'), ['--phase', 'grooming'], { cwd: projectRoot }),
    {
      exit: 0, unit: /^nothing groomed yet$/, rereadOrder: ['do-foundation-grooming/foundation-TRD-template.md'],
      check: (json) => json.skill === 'do-foundation-grooming',
    });
  const planning = runScript('next-step.js', [missing, 'backend', '--phase', 'planning'], { cwd: projectRoot, env: SCRIPT_ENVIRONMENT });
  report('next-step.js', 'any other phase with no feature directory is still a usage error',
    planning.exitCode === 2 && /no feature directory at/.test(planning.stderr), [`exit ${planning.exitCode}`, planning.stderr]);
}

{
  const { featureDirectory } = featureProject('no-profile', { 'notes.md': 'nothing yet\n' }, { withoutProfile: true });
  expectNext('grooming with no docs/basics stops for do-project-setup', nextStep(featureDirectory),
    { exit: 1, stop: /run `do-project-setup` first/ });
}

{
  const { featureDirectory } = featureProject('spoke-no-hub', { 'notes.md': 'x\n' });
  expectNext('a spoke with no hub stops: groom the hub first', nextStep(featureDirectory, ['backend', '--phase', 'grooming']),
    { exit: 1, stop: /groom the hub \(through at least its approved API contract\)/ });
}

{
  const { featureDirectory } = featureProject('spoke-contract-pending', {
    'TRD.md': hubDocument({ states: ['approved', 'approved', 'approved', 'approved', 'pending', 'pending', 'pending'] }),
  });
  expectNext('a spoke whose hub contract is not approved stops', nextStep(featureDirectory, ['backend', '--phase', 'grooming']),
    { exit: 1, stop: /API-contract section isn't approved yet/ });
}

{
  const { featureDirectory } = featureProject('spoke-hub-unreviewed', {
    'TRD.md': hubDocument({ review: '❌ not reviewed' }),
  });
  expectNext('a spoke whose hub review has not passed stops', nextStep(featureDirectory, ['backend', '--phase', 'grooming']),
    { exit: 1, stop: /finish the hub and its review first/ });
}

for (const [kind, title] of [['tech-debt', '# Tech-Debt TRD: Checkout'], ['issue', '# Issue TRD: Checkout'], ['foundation', '# Foundation TRD — Checkout']]) {
  const { featureDirectory } = featureProject(`spoke-${kind}-hub-unreviewed`, {
    'TRD.md': hubDocument({ review: '❌ not reviewed · rounds `4`' }).replace('# TRD (Hub): Checkout', title),
    'TRD-backend.md': spokeDocument({ states: ['approved', 'pending'] }),
  });
  expectNext(`a spoke whose ${kind} hub review has not passed stops too`, nextStep(featureDirectory, ['backend', '--phase', 'grooming']),
    {
      exit: 1, unit: /^the hub$/, step: /^the hub review \(`do-grooming` → Step 2a\)$/,
      stop: /finish the hub and its review first/, fact: /^hub review: ❌ not reviewed/,
    });
}

{
  const { featureDirectory } = featureProject('spoke-tech-debt-hub-reviewed', {
    'TRD.md': hubDocument({ states: ['approved', 'approved', 'approved', 'approved', 'pending'] }).replace('# TRD (Hub): Checkout', '# Tech-Debt TRD: Checkout'),
    'TRD-backend.md': spokeDocument({ states: ['approved', 'pending'] }),
  });
  expectNext('a reviewed variant hub opens its spoke — the API-contract gate is the product hub\'s alone',
    nextStep(featureDirectory, ['backend', '--phase', 'grooming']), { exit: 0, unit: /2\. Design/, noStop: true });
}

{
  const { featureDirectory } = featureProject('hub-review-rising', {
    'TRD.md': hubDocument({ review: '⚠️ round 3 found 7 · rounds `5 · 6 · 7`' }),
  });
  expectNext('hub review rounds flat or rising across three rounds are a STOP', nextStep(featureDirectory),
    { exit: 1, unit: /the hub/, step: /hub review/, stop: /Hub review rounds 5 · 6 · 7: flat or rising/ });
}

{
  const { featureDirectory } = featureProject('hub-spokes', {
    'TRD.md': hubDocument({ spokes: [['web', '✅ reviewed 2026-10-01 · hub rev `a1b2c3d`'], ['backend', '❌ not reviewed']] }),
    'TRD-web.md': spokeDocument({ platform: 'Web' }),
    'TRD-backend.md': spokeDocument(),
  });
  expectNext('a reviewed hub names the first spoke still awaiting alignment', nextStep(featureDirectory),
    { exit: 0, unit: /spoke backend/, step: /hub-alignment review/, fact: /spoke web: reviewed — .* · alignment rounds 3 · 0$/ });
}

{
  const { featureDirectory } = featureProject('spoke-rounds-rising', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument({ alignment: '`NOT REVIEWED`', rounds: '`7 · 7 · 8`' }),
  });
  expectNext('alignment rounds rising across three rounds are a STOP', nextStep(featureDirectory, ['backend', '--phase', 'grooming']),
    { exit: 1, step: /hub-alignment review/, stop: /Alignment rounds 7 · 7 · 8/ });
}

{
  const { featureDirectory } = featureProject('spoke-rounds-falling', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument({ alignment: '`NOT REVIEWED`', rounds: '`9 · 4 · 2`' }),
  });
  expectNext('falling alignment rounds carry on to the next round', nextStep(featureDirectory, ['backend', '--phase', 'grooming']),
    { exit: 0, step: /hub-alignment review/, noStop: true });
}

{
  const { featureDirectory } = featureProject('old-format-gap', {
    'TRD.md': hubDocument({ states: ['old', 'old', 'old'], review: '<✅ reviewed YYYY-MM-DD · rev `<hash>` — or ❌ not reviewed>' })
      .replace(/## 4\.[\s\S]*$/, ''),
  });
  expectNext('an older TRD whose remaining outline is not on disk is reported unknown, not guessed', nextStep(featureDirectory),
    { exit: 2, unknown: /template's sections not written yet: 4\. System design/, reread: /TRD-hub-template\.md$/ });
}

{
  const droppedOutline = (stamp) => hubDocument({ review: '❌ not reviewed' })
    .replace(/_Approved: 2026-10-01 · a1b2c3d_/g, stamp).replace(/## 6\.[\s\S]*$/, '');
  const { featureDirectory } = featureProject('letters-only-commit', { 'TRD.md': droppedOutline('_Approved: 2026-10-01 · abcdefa_') });
  expectNext('a stamp whose commit is only the letters a–f still marks a TRD written from its skeleton', nextStep(featureDirectory),
    { exit: 0, unit: /^the hub$/, step: /^Step 2a — hub review/ });
  const remark = featureProject('hex-word-remark', { 'TRD.md': droppedOutline('_Approved: 2026-10-01 — signed off · acceded_') });
  expectNext('a word of the letters a–f outside the stamp position is no commit', nextStep(remark.featureDirectory),
    { exit: 2, unknown: /template's sections not written yet: 6\. Cross-cutting concerns/ });
}

{
  const { featureDirectory } = featureProject('branch-hub', { 'TRD.md': hubDocument({ states: ['approved', 'pending'], review: '❌ not reviewed' }) });
  expectNext('grooming the hub re-reads its template, then the hub branch file', nextStep(featureDirectory),
    {
      exit: 0, unit: /2\. Feature dependencies/,
      rereadOrder: ['checkout/TRD.md', 'do-grooming/TRD-hub-template.md', 'do-grooming/hub.md'],
      rereadWhy: { 'do-grooming/hub.md': /^the branch file — what only the hub decides/ },
    });
  write(path.join(featureDirectory, 'TRD.md'),
    hubDocument({ states: ['approved', 'pending'], review: '❌ not reviewed' }).replace('# TRD (Hub): Checkout', '# Tech-Debt TRD: Checkout'));
  expectNext('a tech-debt hub has no branch file', nextStep(featureDirectory),
    { exit: 0, rereadOrder: ['checkout/TRD.md', 'do-tech-debt-grooming/tech-debt-TRD-template.md'] });
}

{
  const { featureDirectory } = featureProject('branch-spokes', {
    'TRD.md': hubDocument(),
    'TRD-web.md': spokeDocument({ platform: 'Web', states: ['approved', 'pending'] }),
    'TRD-backend.md': spokeDocument({ states: ['approved', 'pending'] }),
  });
  expectNext('a web spoke re-reads its template, then the client-spoke branch file', nextStep(featureDirectory, ['web', '--phase', 'grooming']),
    {
      exit: 0, unit: /2\. Design/,
      rereadOrder: ['checkout/TRD.md', 'checkout/TRD-web.md', 'do-grooming/TRD-spoke-template.md', 'do-grooming/client-spoke.md'],
      rereadWhy: { 'do-grooming/client-spoke.md': /^the branch file — design capture, widget specs and section slicing$/ },
    });
  expectNext('a backend spoke has no branch file', nextStep(featureDirectory, ['backend', '--phase', 'grooming']),
    { exit: 0, unit: /2\. Design/, rereadOrder: ['checkout/TRD.md', 'checkout/TRD-backend.md', 'do-grooming/TRD-spoke-template.md'] });
  write(path.join(featureDirectory, 'TRD.md'), hubDocument().replace('# TRD (Hub): Checkout', '# Tech-Debt TRD: Checkout'));
  expectNext('a web spoke of a tech-debt hub has no branch file — that skill authors no per-screen docs',
    nextStep(featureDirectory, ['web', '--phase', 'grooming']),
    { exit: 0, unit: /2\. Design/, rereadOrder: ['checkout/TRD.md', 'checkout/TRD-web.md', 'do-grooming/TRD-spoke-template.md'] });
}

const ISSUE_HEADER = '# Issue TRD: Checkout\n\n| | |\n|---|---|\n| **Status** | Draft |\n| **Severity** | pending |\n' +
  '| **Hub review** | pending |\n| **Date** | 2026-10-05 |\n\n';

function issueDocument({ notes = [], outline = [] } = {}) {
  const gateZero = notes.length ? `\n**Gate-0 notes** — Gate 0's approved record:\n${notes.map((note) => `- ${note}`).join('\n')}\n` : '';
  return ISSUE_HEADER +
    `## 1. Issue & reproduction\n_Pending_\n\nThe list crashes when a name is localized.\n${gateZero}\n` +
    '## 2. Audit findings (whole-project)\n_Pending_\n\n**Issue class:** a localized object rendered raw — 3 sites.\n\n' +
    outline.map((title) => `## ${title}\n_Pending_\n`).join('\n');
}

{
  const { featureDirectory } = featureProject('issue-gate-zero', { 'TRD.md': issueDocument() });
  const trdPath = path.join(featureDirectory, 'TRD.md');
  const scope = '**Scope confirmed** 2026-10-05: major · systemic · sites 1–3';
  expectNext('an issue TRD whose Gate-0 notes record no confirmed scope resumes at Gate 0 step 3, not at §1', nextStep(featureDirectory),
    {
      exit: 0, unit: /^Gate 0$/, step: /^step 3 — .*confirm the audit scope.*never re-run it/, gate: /get the user to confirm the scope/,
      fact: /Gate-0 notes record no confirmed scope/, check: (json) => json.skill === 'do-issue-grooming',
    });
  write(trdPath, issueDocument({ notes: [scope] }));
  expectNext('a confirmed scope with no approved outline resumes at Gate 0 step 4', nextStep(featureDirectory),
    { exit: 0, unit: /^Gate 0$/, step: /^step 4 — propose the section outline/, gate: /approve or edit the outline/ });
  write(trdPath, issueDocument({
    notes: [scope, '**Outline approved** 2026-10-05'],
    outline: ['3. Fix scope & approach', '4. Regression safety & acceptance criteria', '5. Blast radius & feature dependencies', '6. Change manifest'],
  }));
  expectNext('once the Gate-0 notes record both, the issue TRD resumes at its first pending section', nextStep(featureDirectory),
    { exit: 0, unit: /1\. Issue & reproduction/, step: /per-section loop/ });
  write(trdPath, ISSUE_HEADER + '## 1. Issue & reproduction\n_Approved: 2026-08-01_\n\nThe list crashes.\n\n' +
    '## 2. Audit findings (whole-project)\n_Approved: 2026-08-01_\n\nThree sites.\n');
  expectNext('an older issue TRD with approved sections and no Gate-0 notes is not sent back to Gate 0', nextStep(featureDirectory),
    { exit: 2, unknown: /template's sections not written yet: 3\. Fix scope/ });
}

{
  const widgetSpec = '# Widget Spec — cart\n\n| | |\n|---|---|\n| **Approved** | commit `abc1234` · approved 2026-10-01 |\n';
  const { featureDirectory } = featureProject('screens', {
    'TRD.md': hubDocument(),
    'TRD-web.md': spokeDocument({ platform: 'Web', alignment: '`NOT REVIEWED`', rounds: '<objective-violation count per round>' }),
    'widget-spec/cart.md': widgetSpec,
  });
  expectNext('a client spoke with a widget spec but no section slicing goes back to Step 3', nextStep(featureDirectory, ['web', '--phase', 'grooming']),
    { exit: 0, unit: /screen cart/, step: /Step 3 .*no section-slicing doc/, noStop: true });
  const started = featureProject('screens-during-review', {
    'TRD.md': hubDocument(),
    'TRD-web.md': spokeDocument({ platform: 'Web', alignment: '`NOT REVIEWED`', rounds: '`4`' }),
    'widget-spec/cart.md': widgetSpec,
    'section-slicing/cart.md': '# Section Slicing — cart\n\n| | |\n|---|---|\n| **Approved (screen)** | commit `abc1234` · approved 2026-10-01 |\n\n' +
      '## Coverage checklist\n\n- [x] Every section has a block.\n- [ ] Every case has a crop.\n',
  });
  expectNext('a screen left incomplete once the alignment review has started is a STOP back to Step 3',
    nextStep(started.featureDirectory, ['web', '--phase', 'grooming']),
    { exit: 1, unit: /screen cart/, step: /1 Coverage checklist line\(s\) unchecked/, stop: /cart: any screen missing either doc, or with its Coverage checklist unchecked → STOP, back to Step 3/ });
}

{
  const { projectRoot, featureDirectory } = featureProject('alignment-stale', {
    'TRD.md': hubDocument(),
  });
  initRepository(projectRoot);
  const hubRevision = commitAll(projectRoot, 'hub', '2026-10-01T10:00:00');
  write(path.join(featureDirectory, 'TRD-backend.md'), spokeDocument({ alignment: `✅ reviewed 2026-10-02 · hub rev \`${hubRevision.slice(0, 7)}\`` }));
  commitAll(projectRoot, 'spoke', '2026-10-02T10:00:00');
  expectNext('a spoke aligned with the current hub is done grooming', nextStep(featureDirectory, ['backend', '--phase', 'grooming']),
    { exit: 0, step: /aligned with the current hub/ });
  const hubPath = path.join(featureDirectory, 'TRD.md');
  write(hubPath, fs.readFileSync(hubPath, 'utf8').replace('Decisions for 5. API contracts.', 'Decisions for 5. API contracts, now paged.'));
  commitAll(projectRoot, 'hub moves', '2026-10-03T10:00:00');
  expectNext('a hub edited after the spoke\'s stamp makes the alignment stale', nextStep(featureDirectory, ['backend', '--phase', 'grooming']),
    { exit: 0, step: /re-run the hub-alignment review/, fact: /stale: the hub changed since rev/ });
  expectNext('planning refuses a spoke whose stamp is older than the hub\'s last change', nextStep(featureDirectory, ['backend', '--phase', 'planning']),
    { exit: 1, stop: /older than the hub's last change/ });
  write(hubPath, fs.readFileSync(hubPath, 'utf8').replace('| **Status** | Draft |', '| **Status** | Approved |'));
  write(path.join(featureDirectory, 'TRD-backend.md'), spokeDocument({ alignment: `✅ reviewed 2026-10-04 · hub rev \`${commitAll(projectRoot, 'restamp', '2026-10-04T10:00:00').slice(0, 7)}\`` }));
  commitAll(projectRoot, 'spoke restamped', '2026-10-04T11:00:00');
  write(hubPath, fs.readFileSync(hubPath, 'utf8').replace('| **Status** | Approved |', '| **Status** | Done |'));
  expectNext('a bookkeeping-only hub edit (its Status row) leaves the alignment fresh', nextStep(featureDirectory, ['backend', '--phase', 'planning']),
    { noStop: true, fact: /hub alignment/ });
}

{
  const manifest = '\n## 7. Change manifest\n_Approved: 2026-10-01 · a1b2c3d_\n\n**Work slice summary**\n- [ ] [BE] list the orders\n- [ ] [Web] show the list\n';
  const hub = hubDocument().replace(/\n## 7\. Change manifest[\s\S]*$/, manifest);
  const { projectRoot, featureDirectory } = featureProject('tracker-write-back', { 'TRD.md': hub });
  initRepository(projectRoot);
  const hubRevision = commitAll(projectRoot, 'hub', '2026-10-01T10:00:00');
  write(path.join(featureDirectory, 'TRD-backend.md'), spokeDocument({ alignment: `✅ reviewed 2026-10-02 · hub rev \`${hubRevision.slice(0, 7)}\`` }));
  commitAll(projectRoot, 'spoke', '2026-10-02T10:00:00');
  const hubPath = path.join(featureDirectory, 'TRD.md');
  write(hubPath, fs.readFileSync(hubPath, 'utf8')
    .replace('- [ ] [BE] list the orders', '- [x] [BE] list the orders — PROJ-12')
    .replace('- [ ] [Web] show the list', '- [ ] [Web] show the list — [PROJ-13](https://jira.example/browse/PROJ-13)'));
  commitAll(projectRoot, 'write back the tracker keys', '2026-10-03T10:00:00');
  expectNext('tracker keys written back into the hub\'s work slices leave the alignment fresh',
    nextStep(featureDirectory, ['backend', '--phase', 'planning']), { noStop: true, fact: /hub alignment/ });
  write(hubPath, fs.readFileSync(hubPath, 'utf8').replace('- [x] [BE] list the orders — PROJ-12', '- [x] [BE] list and page the orders — PROJ-12'));
  commitAll(projectRoot, 'a slice changes', '2026-10-04T10:00:00');
  expectNext('a work slice whose words change beside its key is a hub change', nextStep(featureDirectory, ['backend', '--phase', 'planning']),
    { exit: 1, stop: /older than the hub's last change/ });
}

{
  const { projectRoot, featureDirectory } = featureProject('hub-moved-lines', {
    'TRD.md': hubDocument().replace('Decisions for 1. Context / scope.', '- in scope: export to CSV\n- out of scope: none'),
  });
  initRepository(projectRoot);
  const hubRevision = commitAll(projectRoot, 'hub', '2026-10-01T10:00:00');
  write(path.join(featureDirectory, 'TRD-backend.md'), spokeDocument({ alignment: `✅ reviewed 2026-10-02 · hub rev \`${hubRevision.slice(0, 7)}\`` }));
  commitAll(projectRoot, 'spoke', '2026-10-02T10:00:00');
  const hubPath = path.join(featureDirectory, 'TRD.md');
  write(hubPath, fs.readFileSync(hubPath, 'utf8').replace('- in scope: export to CSV', '- in scope: export to PDF'));
  commitAll(projectRoot, 'hub moves', '2026-10-03T10:00:00');
  expectNext('a hub line changed in place is still a hub change', nextStep(featureDirectory, ['backend', '--phase', 'planning']),
    { exit: 1, stop: /older than the hub's last change/ });
}

{
  const { projectRoot, featureDirectory } = featureProject('hub-uncommitted', { 'notes.md': 'x\n' });
  initRepository(projectRoot);
  const head = commitAll(projectRoot, 'profile', '2026-10-01T10:00:00');
  write(path.join(featureDirectory, 'TRD.md'), hubDocument());
  write(path.join(featureDirectory, 'TRD-backend.md'), spokeDocument({ alignment: `✅ reviewed 2026-10-02 · hub rev \`${head.slice(0, 7)}\`` }));
  const hubPath = path.join(featureDirectory, 'TRD.md');
  write(hubPath, fs.readFileSync(hubPath, 'utf8').replace('Decisions for 5. API contracts.', 'Decisions for 5. API contracts, with an Idempotency-Key header.'));
  expectNext('a hub that was not committed at the stamp\'s rev leaves the alignment unverified, said in a note',
    nextStep(featureDirectory, ['backend', '--phase', 'grooming']),
    { exit: 0, step: /aligned with the current hub/, note: /alignment freshness not verified: the hub was not committed at rev/ });
  commitAll(projectRoot, 'groomed TRDs', '2026-10-03T10:00:00');
  expectNext('committing a hub that was untracked at the stamp\'s rev is not read as a hub change',
    nextStep(featureDirectory, ['backend', '--phase', 'planning']),
    { noStop: true, note: /hub alignment freshness not verified: the hub was not committed at rev/ });
}

{
  const foundationHub = (spokesCell, omissions) => '# Foundation TRD — Checkout\n\n| | |\n|---|---|\n' +
    '| **Platforms in scope** | backend |\n' + `| **Spokes** | ${spokesCell} |\n` +
    '| **Hub review** | ✅ reviewed 2026-10-01 · rev `a1b2c3d` · rounds `1 · 0` |\n\n' +
    '## Intent & constraints\n_Approved: 2026-10-01 · a1b2c3d_\n\nA scaffold.\n\n' +
    '## Shared decisions (hub-level)\n_Approved: 2026-10-01 · a1b2c3d_\n\nDecided.\n\n' + (omissions || '') +
    '## Open Decisions\n_Approved: 2026-10-01 · a1b2c3d_\n\n| # | Decision needed | Options | Status |\n|---|---|---|---|\n| D1 | a | ★ a | decided: a |\n';
  const foundationSpoke = (states) => '# Foundation spoke — backend\n\n' + ['Framework & scaffold', 'Folder structure', 'Architecture skeleton',
    'Build / run / test harness', 'Repo hygiene', 'Acceptance criteria (mechanically checkable)', 'Open Decisions']
    .map((title, index) => `## ${title}\n${markerFor(states[index] || 'approved')}\n\nWritten.\n`).join('\n');
  const OMISSIONS = '## Deliberate omissions & deferrals\n_Approved: 2026-10-01 · a1b2c3d_\n\n| Not in the base | Why | When |\n|---|---|---|\n| auth | none yet | first feature |\n\n';
  const project = (name, files) => {
    const featureDirectory = path.join(sdlcProject('next-' + name, { 'docs/basics/09-environment.md': RUN_RECIPE }), 'docs', 'development', 'foundation');
    fs.mkdirSync(featureDirectory, { recursive: true });
    for (const [file, content] of Object.entries(files)) write(path.join(featureDirectory, file), content);
    return featureDirectory;
  };
  const rising = project('foundation-rounds', {
    'TRD.md': foundationHub('TRD-backend.md ❌ not reviewed · rounds `6 · 6 · 7`', OMISSIONS),
    'TRD-backend.md': foundationSpoke([]),
  });
  expectNext('a foundation spoke\'s rounds in the hub\'s Spokes row rising across three rounds are a STOP',
    nextStep(rising, ['backend', '--phase', 'grooming']), { exit: 1, stop: /Alignment rounds 6 · 6 · 7: flat or rising/ });
  const omissionsDue = project('foundation-omissions', {
    'TRD.md': foundationHub('TRD-backend.md ❌ not reviewed'),
    'TRD-backend.md': foundationSpoke(['approved', 'approved', 'approved', 'approved', 'approved', 'approved', 'pending']),
  });
  expectNext('a foundation spoke past its AC gate goes to the hub\'s omissions register before Open Decisions',
    nextStep(omissionsDue, ['backend', '--phase', 'grooming']),
    { exit: 0, unit: /^the omissions register \(hub\)$/, step: /omissions gate/, gate: /one section at a time/ });
  expectNext('a foundation hub without its omissions register is not called complete', nextStep(omissionsDue),
    { exit: 0, unit: /the spokes/, note: /omissions register .* is missing/ });
  const omissionsWritten = project('foundation-omissions-written', {
    'TRD.md': foundationHub('TRD-backend.md ❌ not reviewed', OMISSIONS),
    'TRD-backend.md': foundationSpoke(['approved', 'approved', 'approved', 'approved', 'approved', 'approved', 'pending']),
  });
  expectNext('a foundation spoke whose omissions register is written moves on to Open Decisions',
    nextStep(omissionsWritten, ['backend', '--phase', 'grooming']), { exit: 0, unit: /§ Open Decisions/ });
  const empty = project('foundation-empty', {});
  expectNext('an empty foundation directory is groomed with the foundation template and skill',
    nextStep(empty, ['--phase', 'grooming']),
    {
      exit: 0, step: /Gate 0/, rereadOrder: ['do-foundation-grooming/foundation-TRD-template.md'],
      check: (json) => json.skill === 'do-foundation-grooming',
    });
  expectNext('a foundation spoke with no hub stops for the foundation hub, never the API contract',
    nextStep(empty, ['backend', '--phase', 'grooming']),
    {
      exit: 1, stop: /no foundation hub yet/,
      check: (json) => json.skill === 'do-foundation-grooming' && !json.stops.some((stop) => /API-contract/.test(stop)),
    });
  const declined = project('foundation-uncommitted', {
    'TRD.md': foundationHub('TRD-backend.md ❌ not reviewed')
      .replace(/_Approved: 2026-10-01 · a1b2c3d_/g, '_Approved: 2026-10-09 · uncommitted_')
      .replace('✅ reviewed 2026-10-01 · rev `a1b2c3d` · rounds `1 · 0`', '❌ not reviewed'),
  });
  expectNext('a foundation hub stamped `uncommitted` (its first commit declined) resumes at its hub review, not an unknown format',
    nextStep(declined, ['--phase', 'grooming']),
    { exit: 0, unit: /^the hub$/, step: /^Step 2a — hub review/, gate: /Present the verdict and STOP/, check: (json) => json.unknown === null });
}

{
  const { featureDirectory } = featureProject('feature-named-foundation', {
    'TRD.md': hubDocument({ states: ['approved', 'pending'] }).replace('# TRD (Hub): Checkout', '# TRD (Hub): design-system foundation'),
  });
  expectNext('a feature hub whose title mentions foundation is still a feature hub', nextStep(featureDirectory),
    {
      exit: 0, rereadOrder: ['checkout/TRD.md', 'do-grooming/TRD-hub-template.md', 'do-grooming/hub.md'],
      check: (json) => json.skill === 'do-grooming',
    });
}

{
  const note = '\n> A hub-wrong finding goes in here as one row with the status `pending hub change`.\n';
  const openDecisions = (rows) => '\n## Open Decisions\n' + note + '\n| # | Decision | Options | Status |\n|---|---|---|---|\n' + rows + '\n';
  const quiet = featureProject('pending-note', {
    'TRD.md': hubDocument({ extra: openDecisions('| H1 | page size | ★ 50 | decided: 50 · 2026-10-01 |') }),
  });
  const reported = (json) => (json.facts || []).some((fact) => /pending hub change/.test(fact));
  expectNext('the template note naming "pending hub change" is no pending hub change', nextStep(quiet.featureDirectory),
    { exit: 0, check: (json) => !reported(json) });
  const pending = featureProject('pending-row', {
    'TRD.md': hubDocument({ extra: openDecisions('| H2 | the contract misses a field | ★ add it | pending hub change |') }),
  });
  expectNext('an Open Decisions row whose status is pending hub change is counted', nextStep(pending.featureDirectory),
    { exit: 0, fact: /"pending hub change": 1/ });
}

{
  const { featureDirectory } = featureProject('ungroomed-spoke-gate', {
    'TRD.md': hubDocument({ spokes: [['backend', '❌ not reviewed']] }),
  });
  expectNext('a spoke not groomed yet is shown the outline gate, not the review verdict', nextStep(featureDirectory),
    { exit: 0, unit: /spoke backend/, step: /groom the spoke \(Gate 0\)/, gate: /approve or edit the outline/ });
}

{
  const { featureDirectory } = featureProject('tech-debt-web-spoke', {
    'TRD.md': hubDocument().replace('# TRD (Hub): Checkout', '# Tech-Debt TRD: Checkout'),
    'TRD-web.md': spokeDocument({ platform: 'Web', alignment: '`NOT REVIEWED`' }),
  });
  expectNext('a tech-debt web spoke is never sent to write widget specs or slicing docs', nextStep(featureDirectory, ['web', '--phase', 'grooming']),
    { exit: 0, step: /hub-alignment review/, check: (json) => !(json.notes || []).some((item) => /widget spec/.test(item)) });
}

{
  const { featureDirectory } = featureProject('review-step-reread', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument({ alignment: '`NOT REVIEWED`' }),
  });
  expectNext('a spoke at its alignment review re-reads the review file, not the section template', nextStep(featureDirectory, ['backend', '--phase', 'grooming']),
    { exit: 0, step: /hub-alignment review/, reread: /grooming-review\.md$/, notReread: /TRD-spoke-template\.md$/ });
  expectNext('a hub handed off to planning re-reads no template or branch file', nextStep(featureDirectory),
    { exit: 0, notReread: /TRD-hub-template\.md$|do-grooming\/hub\.md$/ });
}

{
  const { featureDirectory } = featureProject('plan-none', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument({ alignment: '`NOT REVIEWED`' }),
  });
  expectNext('planning a spoke that is not aligned stops back to do-grooming', nextStep(featureDirectory, ['backend', '--phase', 'planning']),
    { exit: 1, unit: /Step 1/, stop: /`NOT REVIEWED` → STOP and send it back to `do-grooming`/, gate: /wait for confirmation/ });
}

{
  const { featureDirectory } = featureProject('plan-layout', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ layout: '_Approved: <YYYY-MM-DD — the layout gate>_', stages: [] }),
  });
  expectNext('a confirmed scope with no approved layout resumes at the layout gate', nextStep(featureDirectory, ['backend', '--phase', 'planning']),
    { exit: 0, unit: /Step 2/, gate: /Do not start the stage breakdown/, fact: /scope confirmed: 2026-10-02/ });
}

{
  const { featureDirectory } = featureProject('plan-breakdown-gate', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ breakdown: { date: '<YYYY-MM-DD>', rows: [[1, 'pending'], [2, 'pending']] } }),
  });
  expectNext('a stage breakdown written but not approved is its own gate', nextStep(featureDirectory, ['backend', '--phase', 'planning']),
    { exit: 0, unit: /Step 3/, gate: /Do not detail any stage/ });
}

{
  const { featureDirectory } = featureProject('plan-resume', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({
      breakdown: { date: '2026-10-02', rows: [[1, 'written'], [2, 'written'], [3, 'pending']] },
      stages: [{ number: 1 }, { number: 2, approved: null }],
      sequencing: false,
    }),
  });
  expectNext('planning resumes at the first stage without an Approved stamp', nextStep(featureDirectory, ['backend', '--phase', 'planning']),
    { exit: 0, unit: /Stage 2/, step: /Approved stamp is missing/, gate: /do not draft the next stage/, fact: /stage breakdown: approved/ });
}

{
  const { featureDirectory } = featureProject('plan-undetailed', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({
      breakdown: { date: '2026-10-02', rows: [[1, 'written'], [2, 'written'], [3, 'pending']] },
      stages: [{ number: 1 }, { number: 2 }],
      sequencing: false,
    }),
  });
  expectNext('a stage in the approved breakdown with no detail yet is drafted next', nextStep(featureDirectory, ['backend', '--phase', 'planning']),
    { exit: 0, unit: /Stage 3/, step: /draft this stage's detail/ });
}

{
  const { featureDirectory } = featureProject('plan-carry-forward', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({
      breakdown: { date: '2026-10-02', rows: [[1, 'written'], [2, 'pending']] },
      stages: [{ number: 1 }],
      sequencing: false,
    }).replace('## Architecture & package layout',
      '## Carry-forward answers\n\n- Stage 2: page the list by 50 (2026-10-02)\n\n## Architecture & package layout'),
  });
  expectNext('carry-forward answers waiting for a stage not written yet are surfaced', nextStep(featureDirectory, ['backend', '--phase', 'planning']),
    { exit: 0, unit: /Stage 2/, step: /draft this stage's detail/, fact: /^carry-forward answers waiting for a stage: Stage 2: page the list by 50 \(2026-10-02\)$/ });
}

{
  const { featureDirectory } = featureProject('plan-complete', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'review-charter.md': '# Review charter\n\n| | |\n|---|---|\n| **Built from profile commit** | `abc1234` |\n',
    'plan-backend.md': planDocument({
      breakdown: { date: '2026-10-02', rows: [[1, 'written'], [2, 'written'], [3, 'written']] },
      stages: [{ number: 1 }, { number: 2 }, { number: 3 }],
    }),
  });
  expectNext('a fully approved plan with its charter hands off to do-development', nextStep(featureDirectory, ['backend', '--phase', 'planning']),
    { exit: 0, step: /hand off to `do-development`/ });
  expectNext('the detected phase of a fully approved plan with nothing built is development', nextStep(featureDirectory, ['backend']),
    { exit: 0, phase: 'development', unit: /Stage 1/ });
}

{
  const { featureDirectory } = featureProject('plan-no-charter', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ stages: [{ number: 1 }, { number: 2 }, { number: 3 }] }),
  });
  expectNext('a plan with no review charter writes it before development', nextStep(featureDirectory, ['backend', '--phase', 'planning']),
    { exit: 0, unit: /review charter/ });
}

{
  const { featureDirectory } = featureProject('dev-no-plan', { 'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument() });
  expectNext('development with no plan points to do-planning', nextStep(featureDirectory, ['backend', '--phase', 'development']),
    { exit: 1, stop: /point the user to `do-planning` first/ });
}

{
  const { featureDirectory } = featureProject('dev-next', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({
      stages: [{ number: 1, ...DONE }, { number: 2, extra: '- **Carry-forward:** keep the page size at 50 (Stage 1 checkpoint)' }, { number: 3 }],
    }),
  });
  expectNext('development resumes at the first stage not done, with its block and covered AC', nextStep(featureDirectory, ['backend']),
    {
      exit: 0, phase: 'development', unit: /Stage 2/, step: /build it/, block: /^### Stage 2 — \[domain\][\s\S]*Covers:\*\* `AC-2`/,
      fact: /covers: AC-2 — the list shows criterion 2/, gate: /do not touch the next stage/,
      rereadOrder: ['do-development/stage-steps.md', 'do-development/conformance-reviewer.md'],
      rereadWhy: {
        'do-development/stage-steps.md': /^every rule the stage's steps apply — once per session, again after a compaction$/,
        'do-development/conformance-reviewer.md': /^the reviewers' checklist — read it yourself only to run the review inline$/,
      },
      check: (json) => json.facts.includes('platform: backend — backend: client-ui-rules.md and client-ui.md are not needed'),
    });
  expectNext('a carry-forward remark in the next stage is surfaced', nextStep(featureDirectory, ['backend']),
    { fact: /carry-forward: keep the page size at 50/ });
}

{
  const { featureDirectory } = featureProject('dev-unclaimed', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ stages: [{ number: 1, ...DONE }, { number: 2 }] }),
  });
  expectNext('an AC no stage claims returns the STOP back to do-planning', nextStep(featureDirectory, ['backend', '--phase', 'development']),
    { exit: 1, stop: /AC-3: an AC in the TRD's numbered AC register that no stage's `Covers:` claims → STOP back to `do-planning`/ });
}

{
  const { featureDirectory } = featureProject('dev-stamp-missing', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ stages: [{ number: 1, ...DONE }, { number: 2, approved: null }, { number: 3 }] }),
  });
  expectNext('a stage with no plan-gate stamp is sent back to do-planning', nextStep(featureDirectory, ['backend', '--phase', 'development']),
    { exit: 1, unit: /Stage 2/, stop: /Stage 2's `Approved \(plan gate\)` stamp is missing → STOP\. Send it back to `do-planning`/ });
}

{
  const { featureDirectory } = featureProject('dev-stamp-placeholder', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({
      stages: [{ number: 1, ...DONE }, { number: 2, approved: '<commit `<hash>` · approved <YYYY-MM-DD> — set by do-planning>' }, { number: 3 }],
    }),
  });
  expectNext('a stage whose stamp is still the template placeholder is sent back', nextStep(featureDirectory, ['backend', '--phase', 'development']),
    { exit: 1, stop: /still the template placeholder/ });
}

{
  const { featureDirectory } = featureProject('dev-closing', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ stages: [{ number: 1, ...DONE }, { number: 2, verdict: 'approved 2026-10-04' }, { number: 3 }] }),
  });
  expectNext('a stage with its verdict recorded but Status not done finishes step 9', nextStep(featureDirectory, ['backend', '--phase', 'development']),
    { exit: 0, unit: /Stage 2/, step: /step 9 is unfinished/ });
}

{
  const { featureDirectory } = featureProject('dev-gap', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ stages: [{ number: 1, status: null, verdict: null }, { number: 2, ...DONE }, { number: 3 }] }),
  });
  expectNext('an unmarked stage before a done one is reported unknown, not assumed unbuilt', nextStep(featureDirectory, ['backend', '--phase', 'development']),
    { exit: 2, unknown: /Stage 1 carries no Status line.*Stage 2 after it is done/ });
}

{
  const { featureDirectory } = featureProject('dev-unmarked', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ stages: [1, 2, 3].map((number) => ({ number, status: null, verdict: null })) }),
  });
  expectNext('a plan with no status of any kind is reported unknown', nextStep(featureDirectory, ['backend', '--phase', 'development']),
    { exit: 2, unknown: /no stage carries a Status line/ });
}

{
  const { featureDirectory } = featureProject('dev-heading-marks', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({
      stages: [
        { number: 1, status: null, verdict: null, heading: '### Stage 1 — [domain] `BE1` — the rule ✅ BUILT 2026-08-27' },
        { number: 2, status: null, verdict: null, heading: '### Stage 2 — [data] `BE1` — the store — ✅ DONE (2026-08-28)' },
        { number: 3, status: null, verdict: null, heading: '### Stage 3 — [api] `BE1` — mark the order done when paid' },
      ],
    }).replace('### Stage 3 — [api]', '### Stage 2\'s deferred extremes\n\nprose\n\n### Stage 3 — [api]'),
  });
  expectNext('done marks in stage headings are read, a "done" word in a title is not, and "Stage 2\'s …" is no stage',
    nextStep(featureDirectory, ['backend', '--phase', 'development']), { exit: 0, unit: /^Stage 3 — \[api\]/ });
}

{
  const { featureDirectory } = featureProject('dev-bold-status', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({
      stages: [
        { number: 1, status: null, verdict: null, extra: '- **Status: ✅ DONE** — approved; committed.' },
        { number: 2, status: null, verdict: null, extra: '- **Status: pending**' },
        { number: 3 },
      ],
    }),
  });
  expectNext('a status written inside the bold label is read', nextStep(featureDirectory, ['backend', '--phase', 'development']),
    { unit: /Stage 2/ });
}

{
  const { featureDirectory } = featureProject('dev-client', {
    'TRD.md': hubDocument(),
    'TRD-web.md': spokeDocument({ platform: 'Web', slices: '- [ ] **`W1`** — everything — AC: `AC-1` … `AC-3`' }),
    'plan-web.md': planDocument({ platform: 'Web', stages: [1, 2, 3].map((number) => ({ number, slice: 'W1' })) }),
  });
  expectNext('a client plan re-reads stage-steps.md, then client-ui-rules.md and client-ui.md', nextStep(featureDirectory, ['web', '--phase', 'development']),
    {
      exit: 0, unit: /Stage 1/, fact: /client \(read client-ui-rules\.md and client-ui\.md once per session, again after a compaction\)/,
      rereadOrder: ['do-development/stage-steps.md', 'do-development/client-ui-rules.md', 'do-development/client-ui.md', 'do-development/conformance-reviewer.md'],
      rereadWhy: {
        'do-development/client-ui-rules.md': /^the UI rules — once per session, again after a compaction$/,
        'do-development/client-ui.md': /^the UI mechanics — once per session, again after a compaction$/,
      },
    });
}

{
  const builds = ['widget-spec/cart.md', 'section-slicing/cart.md', 'widget-spec/pay.md', 'section-slicing/pay.md', 'section-slicing/done.md', 'widget-spec/done.md'];
  const screenDocs = builds.slice(0, 4);
  const uiFiles = ['do-development/stage-steps.md', 'do-development/client-ui-rules.md', 'do-development/client-ui.md'];
  const { projectRoot, featureDirectory } = featureProject('dev-reviewer-room', {
    'TRD.md': hubDocument(),
    'TRD-web.md': spokeDocument({ platform: 'Web', slices: '- [ ] **`W1`** — everything — AC: `AC-1` … `AC-3`' }),
    'plan-web.md': planDocument({
      platform: 'Web',
      stages: [1, 2, 3].map((number) => ({ number, slice: 'W1', extra: number === 1 ? `- **Builds:** ${builds.map((doc) => `\`${doc}\``).join(', ')}` : null })),
    }),
    ...Object.fromEntries(screenDocs.map((doc) => [doc, `# ${doc}\n`])),
  });
  const noLeftOff = (json) => !(json.notes || []).some((note) => /left off the re-read list/.test(note));
  expectNext('the reviewers\' checklist is listed while the re-read list has room for it', nextStep(featureDirectory, ['web', '--phase', 'development']),
    { exit: 0, rereadOrder: [...uiFiles, ...screenDocs, 'do-development/conformance-reviewer.md'] });
  const handoffPath = path.join(projectRoot, '.alpha-sdlc', 'handoff', 'checkout--web.md');
  write(handoffPath, '# Handoff\n\n- web on :3000\n');
  expectNext('a handoff takes the last place, and the reviewers\' checklist is dropped rather than overflow the list',
    nextStep(featureDirectory, ['web', '--phase', 'development']),
    { exit: 0, rereadOrder: ['handoff/checkout--web.md', ...uiFiles, ...screenDocs], check: noLeftOff });
  fs.rmSync(handoffPath);
  write(path.join(featureDirectory, builds[4]), `# ${builds[4]}\n`);
  expectNext('eight files the stage needs leave no room for the reviewers\' checklist', nextStep(featureDirectory, ['web', '--phase', 'development']),
    { exit: 0, rereadOrder: [...uiFiles, ...builds.slice(0, 5)], check: noLeftOff });
  write(path.join(featureDirectory, builds[5]), `# ${builds[5]}\n`);
  expectNext('a ninth file the stage needs is left off the bounded list, and the note names it',
    nextStep(featureDirectory, ['web', '--phase', 'development']),
    {
      exit: 0, rereadOrder: [...uiFiles, ...builds.slice(0, 5)],
      note: /^1 more file\(s\) left off the re-read list to keep it bounded: \S*widget-spec\/done\.md \(a per-screen contract this stage builds\) — read one when the step needs it$/,
    });
}

{
  const { projectRoot, featureDirectory } = featureProject('dev-git', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ stages: [{ number: 1, ...DONE }, { number: 2 }, { number: 3 }] }),
    '/docs/basics/02-architecture.md': '# Architecture\n\nlayers\n',
    '/src/stage2.ts': 'export const stage = 2;\n',
  });
  initRepository(projectRoot);
  const profileCommit = commitAll(projectRoot, 'plan approved', '2026-10-02T10:00:00');
  write(path.join(featureDirectory, 'review-charter.md'), `# Review charter\n\n| | |\n|---|---|\n| **Built from profile commit** | \`${profileCommit.slice(0, 7)}\` |\n`);
  commitAll(projectRoot, 'charter', '2026-10-02T11:00:00');
  const planPath = path.join(featureDirectory, 'plan-backend.md');
  const planText = fs.readFileSync(planPath, 'utf8');

  expectNext('a stamp with no edit to its block since is fresh, and a fresh charter is re-read',
    nextStep(featureDirectory, ['backend', '--phase', 'development'], { cwd: projectRoot }),
    { exit: 0, unit: /Stage 2/, noStop: true, fact: /approved \(plan gate\).*no edit to the block since/, reread: /review-charter\.md$/ });

  write(planPath, planText
    .replace('- **Status:** pending\n- **Checkpoint verdict:** pending\n- **⏸ Checkpoint — review here.** **Safe to stop after?** yes — compiles and tests pass\n\n### Stage 3',
      '- **Status:** pending\n- **Checkpoint verdict:** pending\n- **Carry-forward:** keep the page size at 50\n- **⏸ Checkpoint — review here.** **Safe to stop after?** yes — compiles and tests pass\n\n### Stage 3'));
  commitAll(projectRoot, 'carry a remark forward', '2026-10-03T10:00:00');
  expectNext('development\'s own lines (carry-forward, status, verdict) never stale a stamp',
    nextStep(featureDirectory, ['backend', '--phase', 'development'], { cwd: projectRoot }),
    { exit: 0, noStop: true });

  write(planPath, fs.readFileSync(planPath, 'utf8').replace('- **Covers:** `AC-2`', '- **Covers:** `AC-2` — and the empty state'));
  expectNext('an uncommitted edit to the block after its stamp is stale',
    nextStep(featureDirectory, ['backend', '--phase', 'development'], { cwd: projectRoot }),
    { exit: 1, stop: /recorded before this stage's own last edit: the working tree changes/ });

  commitAll(projectRoot, 'planted edit after approval', '2026-10-04T10:00:00');
  expectNext('a planted post-stamp edit is reported stale, naming the commit',
    nextStep(featureDirectory, ['backend', '--phase', 'development'], { cwd: projectRoot }),
    { exit: 1, stop: /Stage 2's `Approved \(plan gate\)` stamp is recorded before this stage's own last edit: [0-9a-f]{7} \(2026-10-04\) changed/ });

  write(planPath, fs.readFileSync(planPath, 'utf8').replace('- **Approved (plan gate):** commit `abc1234` · approved 2026-10-02\n- **Status:** pending\n- **Checkpoint verdict:** pending\n- **Carry-forward',
    '- **Approved (plan gate):** commit `def5678` · approved 2026-10-05\n- **Status:** pending\n- **Checkpoint verdict:** pending\n- **Carry-forward'));
  commitAll(projectRoot, 're-gated', '2026-10-05T10:00:00');
  expectNext('re-approving the edited stage makes its stamp fresh again',
    nextStep(featureDirectory, ['backend', '--phase', 'development'], { cwd: projectRoot }),
    { exit: 0, noStop: true });

  write(path.join(projectRoot, 'src', 'stage2.ts'), 'export const stage = 22;\n');
  expectNext('uncommitted work in the stage\'s own files is in-progress work, never discarded',
    nextStep(featureDirectory, ['backend', '--phase', 'development'], { cwd: projectRoot }),
    { note: /uncommitted changes in this stage's files \(src\/stage2\.ts\).*never discard/ });

  write(path.join(projectRoot, 'tools', 'seed.js'), 'export const seed = 1;\n');
  expectNext('another session\'s uncommitted paths are listed relative to the project root, ready for review-packet.js --exclude',
    nextStep(featureDirectory, ['backend', '--phase', 'development'], { cwd: projectRoot }),
    { note: /^1 other uncommitted path\(s\) \(tools\/seed\.js\) — another session's or an earlier stage's work; leave them as they are$/ });
  for (const name of ['a', 'b', 'c', 'd', 'e']) write(path.join(projectRoot, 'tools', `${name}.js`), `export const ${name}Value = 1;\n`);
  expectNext('more than five other uncommitted paths list the first five and mark the rest',
    nextStep(featureDirectory, ['backend', '--phase', 'development'], { cwd: projectRoot }),
    { note: /^6 other uncommitted path\(s\) \(tools\/a\.js, tools\/b\.js, tools\/c\.js, tools\/d\.js, tools\/e\.js, …\) — another session's/ });

  write(path.join(projectRoot, 'docs', 'basics', '02-architecture.md'), '# Architecture\n\nlayers, and a new seam\n');
  commitAll(projectRoot, 'profile moved', '2026-10-06T10:00:00');
  expectNext('a charter whose profile commit moved is stale and its docs replace it',
    nextStep(featureDirectory, ['backend', '--phase', 'development'], { cwd: projectRoot }),
    { fact: /review charter: stale — built from profile commit [0-9a-f]{7}.*02-architecture\.md/, notReread: /review-charter\.md$/ });
}

{
  const { featureDirectory } = featureProject('dev-all-done', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ stages: [1, 2, 3].map((number) => ({ number, ...DONE })) }),
  });
  expectNext('every stage done hands off to do-testing', nextStep(featureDirectory, ['backend', '--phase', 'development']),
    { exit: 0, step: /hand off to `do-testing`/ });
  expectNext('the detected phase after the last stage is testing', nextStep(featureDirectory, ['backend']),
    { exit: 0, phase: 'testing', unit: /Step 1/, gate: /ask before standing it up/ });
}

const builtPlan = planDocument({ stages: [1, 2, 3].map((number) => ({ number, ...DONE })) });

{
  const { featureDirectory } = featureProject('test-plan-gate', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({ planApproved: '<YYYY-MM-DD — the pyramid/plan gate>', tests: [['TC1', ''], ['TC2', '']], procedures: [] }),
  });
  expectNext('a test plan not yet approved is presented again', nextStep(featureDirectory, ['backend', '--phase', 'testing']),
    { exit: 0, unit: /Step 1/, step: /not approved/ });
}

{
  const { featureDirectory } = featureProject('test-approve', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({ tests: [['TC1', 'pass'], ['TC2', '']], procedures: [['TC1', '2026-10-05'], ['TC2', null]], review: null }),
  });
  expectNext('the next test without an Approved stamp is presented for approval', nextStep(featureDirectory, ['backend', '--phase', 'testing']),
    { exit: 0, unit: /^TC2$/, step: /present the written test for approval/, gate: /one test at a time/ });
}

{
  const { featureDirectory } = featureProject('test-run', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({ tests: [['TC1', '✅'], ['TC2', 'pending']], review: null }),
  });
  expectNext('an approved test with no recorded result is run next', nextStep(featureDirectory, ['backend', '--phase', 'testing']),
    { exit: 0, unit: /^TC2$/, step: /run the approved test/ });
}

{
  const { featureDirectory } = featureProject('test-write', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({ tests: [['TC1', 'pass'], ['TC2', '']], procedures: [['TC1', '2026-10-05']], review: null }),
  });
  expectNext('a test in the table with no procedure block is written next', nextStep(featureDirectory, ['backend', '--phase', 'testing']),
    { exit: 0, unit: /^TC2$/, step: /write its procedure block/ });
}

{
  const { featureDirectory } = featureProject('test-review', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({ review: null }),
  });
  expectNext('every test run and no Test review line: the test review is next', nextStep(featureDirectory, ['backend', '--phase', 'testing']),
    { exit: 0, unit: /Step 3/, step: /test review/ });
}

{
  const { featureDirectory } = featureProject('test-triage', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({ bugs: BUG_HEADER + bugRow('B1', 'major', '', 0, 'open → (do-fixing)') }),
  });
  expectNext('an untriaged bug report is presented for triage', nextStep(featureDirectory, ['backend', '--phase', 'testing']),
    { exit: 0, unit: /Step 4/, gate: /let the user triage/, fact: /open bugs: B1/ });
}

{
  const { featureDirectory } = featureProject('test-done', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({ bugs: BUG_HEADER + bugRow('B1', 'major', 'yes 2026-10-06', 1, '**fixed** 2026-10-07') }),
  });
  expectNext('a green feature moves on to the profile reconcile', nextStep(featureDirectory, ['backend', '--phase', 'testing']),
    { exit: 0, unit: /^done$/, step: /refresh mode/ });
}

{
  const { featureDirectory } = featureProject('test-smoke-blocked', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({ smoke: '**2 of 3 journeys pass; journey 3 is BLOCKED**' }),
  });
  expectNext('Boot & Smoke not passed keeps the feature in step 4', nextStep(featureDirectory, ['backend', '--phase', 'testing']),
    { exit: 0, unit: /Step 4/, fact: /not done: Boot & Smoke has not passed/ });
}

{
  const { projectRoot, featureDirectory } = featureProject('test-no-recipe', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
  });
  write(path.join(projectRoot, 'docs', 'basics', '09-environment.md'), '# Environment\n\nnothing about running it\n');
  expectNext('no Full-stack run recipe is the first testing blocker', nextStep(featureDirectory, ['backend', '--phase', 'testing']),
    { exit: 1, stop: /no \*Full-stack run recipe\*.*send it to `do-project-setup`/ });
}

const CHARTER = '# Review charter\n\n| | |\n|---|---|\n| **Built from profile commit** | `abc1234` |\n';

{
  const { featureDirectory } = featureProject('test-reread-backend', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan, 'review-charter.md': CHARTER,
    'test-plan-backend.md': testPlanDocument({ review: null }),
  });
  expectNext('testing re-reads boot-smoke.md on a backend, never ui-levels.md', nextStep(featureDirectory, ['backend', '--phase', 'testing']),
    {
      exit: 0, unit: /Step 3/,
      rereadOrder: ['checkout/test-plan-backend.md', 'checkout/TRD-backend.md', 'checkout/TRD.md', 'do-testing/boot-smoke.md',
        'checkout/review-charter.md', 'basics/09-environment.md'],
      rereadWhy: { 'do-testing/boot-smoke.md': /^the full Boot & Smoke run$/ },
    });
}

{
  const { projectRoot, featureDirectory } = featureProject('test-reread-client', {
    'TRD.md': hubDocument(), 'TRD-web.md': spokeDocument({ platform: 'Web' }), 'plan-web.md': builtPlan, 'review-charter.md': CHARTER,
    'test-plan-web.md': testPlanDocument({ review: null }),
    '/docs/basics/13-auth.md': '# Auth\n\ntest users\n',
  });
  const stateFiles = ['checkout/test-plan-web.md', 'checkout/TRD-web.md', 'checkout/TRD.md'];
  const references = ['do-testing/boot-smoke.md', 'do-testing/ui-levels.md'];
  expectNext('testing on a client re-reads boot-smoke.md and ui-levels.md after the state files, ahead of the charter and profile docs',
    nextStep(featureDirectory, ['web', '--phase', 'testing']),
    { exit: 0, unit: /Step 3/, rereadOrder: [...stateFiles, ...references, 'checkout/review-charter.md', 'basics/09-environment.md', 'basics/13-auth.md'] });
  write(path.join(projectRoot, '.alpha-sdlc', 'handoff', 'checkout--web.md'), '# Handoff\n\n- web on :3000\n');
  expectNext('a full testing list keeps ui-levels.md and the review charter, and names the profile doc it trims',
    nextStep(featureDirectory, ['web', '--phase', 'testing']),
    {
      exit: 0,
      rereadOrder: ['handoff/checkout--web.md', ...stateFiles, ...references, 'checkout/review-charter.md', 'basics/09-environment.md'],
      note: /^1 more file\(s\) left off the re-read list to keep it bounded: \S*basics\/13-auth\.md \(test auth\)/,
    });
}

{
  const { featureDirectory } = featureProject('dev-long-criterion', {
    'TRD.md': hubDocument(),
    'TRD-backend.md': spokeDocument().replace('| AC-2 | the list shows criterion 2 |',
      '| AC-2 | greet returns a greeting with the name, trims surrounding whitespace, keeps the original casing, and returns "unavailable" (never throws) when the name is null or undefined |'),
    'plan-backend.md': planDocument({ stages: [{ number: 1, ...DONE }, { number: 2 }, { number: 3 }] }),
  });
  expectNext('a covered acceptance criterion is printed whole, however long', nextStep(featureDirectory, ['backend', '--phase', 'development']),
    { exit: 0, unit: /Stage 2/, fact: /covers: AC-2 — .*returns "unavailable" \(never throws\) when the name is null or undefined$/ });
}

{
  const issueTrd = '# Issue TRD: Checkout\n\n## 1. Issue & reproduction\n_Approved: 2026-10-01 · a1b2c3d_\n\nIt breaks.\n\n' +
    '## 2. Audit findings (whole-project)\n_Approved: 2026-10-01 · a1b2c3d_\n\n| Site | Status |\n|---|---|\n| src/a.ts:3 | open |\n\n' +
    '## 4. Regression safety & acceptance criteria\n_Approved: 2026-10-01 · a1b2c3d_\n\n| ID | AC |\n|---|---|\n| AC-1 | it holds |\n';
  const { featureDirectory } = featureProject('fix-issue-route', { 'TRD.md': issueTrd });
  expectNext('the issue-TRD small-fix route has no test plan and is sent to its audit table, never to do-testing',
    nextStep(featureDirectory, ['backend', '--phase', 'fixing']),
    {
      exit: 2, unknown: /issue-TRD path .* §2's audit table/,
      check: (json) => json.skill === 'do-fixing' && !json.stops.length && json.unknown.files.some((file) => file.endsWith('TRD.md')),
    });
}

{
  const { featureDirectory } = featureProject('test-hand-off', {
    'TRD.md': hubDocument(), 'TRD-web.md': spokeDocument({ platform: 'Web' }), 'plan-web.md': builtPlan,
    'test-plan-web.md': testPlanDocument({ bugs: BUG_HEADER + bugRow('B1', 'major', 'yes 2026-10-06', 0, 'open') }),
  });
  expectNext('a test plan handed off to fixing re-reads no Boot & Smoke or UI-level file', nextStep(featureDirectory, ['web', '--phase', 'testing']),
    { exit: 0, unit: /^hand-off$/, notReread: /boot-smoke\.md$|ui-levels\.md$/ });
}

{
  const { featureDirectory } = featureProject('fix-triage', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({ bugs: BUG_HEADER + bugRow('B1', 'major', 'yes 2026-10-06', 0, 'open') + '\n' + bugRow('B2', 'minor', '', 0, 'open') }),
  });
  expectNext('a blank Fix? cell returns "ask triage"', nextStep(featureDirectory, ['backend', '--phase', 'fixing']),
    { exit: 1, unit: /^B1$/, stop: /B2: `Fix\? \(user\)` is not filled — ask triage/ });
}

{
  const { featureDirectory } = featureProject('fix-order', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({
      bugs: BUG_HEADER + [
        bugRow('B1', 'minor', 'yes', 0, 'open'),
        bugRow('B2', 'blocker', 'yes', 2, 'open → (do-fixing)'),
        bugRow('B3', 'major', 'no', 0, 'open'),
        bugRow('B4', 'major', 'yes', 1, '**fixed** 2026-10-07'),
      ].join('\n'),
    }),
  });
  expectNext('fixing takes the triaged bugs blockers first, with their attempts', nextStep(featureDirectory, ['backend']),
    { exit: 0, phase: 'fixing', unit: /^B2$/, block: /B2 breaks the list/, fact: /B2: blocker · fix\? yes · attempts 2/, gate: /Do not touch the next bug/ });
}

{
  const { featureDirectory } = featureProject('fix-strikes', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({ bugs: BUG_HEADER + bugRow('B1', 'major', 'yes', 3, 'open — not re-verified') }),
  });
  expectNext('a bug that failed three times is the wrong fix: STOP', nextStep(featureDirectory, ['backend', '--phase', 'fixing']),
    { exit: 1, unit: /^B1$/, stop: /B1 has failed re-verification 3 times — a fix that does not hold three times is the wrong fix/ });
}

{
  const { featureDirectory } = featureProject('fix-no-column', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({ bugs: '| # | Bug | Severity | Status |\n|---|---|---|---|\n| B1 | it breaks | major | open |' }),
  });
  expectNext('a bug table with no triage column asks which bugs to fix', nextStep(featureDirectory, ['backend', '--phase', 'fixing']),
    { exit: 1, unit: /triage/, stop: /records no triage/ });
}

{
  const { projectRoot, featureDirectory } = featureProject('fix-auto', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({ bugs: BUG_HEADER + bugRow('B1', 'major', '', 0, 'open') }),
  });
  write(path.join(projectRoot, '.alpha-sdlc', 'auto-run.json'), JSON.stringify({
    feature: 'checkout', platform: 'backend', featureDir: 'docs/development/checkout', status: 'running', until: 're-test green',
  }));
  expectNext('under a running auto-run every open bug is fixed without a triage stop', nextStep(featureDirectory, ['backend', '--phase', 'fixing'], { cwd: projectRoot }),
    { exit: 0, unit: /^B1$/, noStop: true, fact: /auto-run marker .*running/ });
}

{
  const { featureDirectory } = featureProject('fix-done', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(), 'plan-backend.md': builtPlan,
    'test-plan-backend.md': testPlanDocument({ bugs: BUG_HEADER + bugRow('B1', 'major', 'yes', 1, '**fixed** 2026-10-07') }),
  });
  expectNext('with every triaged bug fixed, fixing hands back to do-testing', nextStep(featureDirectory, ['backend', '--phase', 'fixing']),
    { exit: 0, step: /hand back to `do-testing`/ });
}

{
  const { featureDirectory } = featureProject('fix-no-report', { 'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument() });
  expectNext('fixing with no test plan runs do-testing first', nextStep(featureDirectory, ['backend', '--phase', 'fixing']),
    { exit: 1, stop: /run `do-testing` first/ });
}

{
  const bugs = BUG_HEADER + bugRow('B1', 'major', 'yes', 0, 'open');
  const { featureDirectory } = featureProject('fix-reread', {
    'TRD.md': hubDocument(), 'TRD-web.md': spokeDocument({ platform: 'Web' }), 'TRD-backend.md': spokeDocument(),
    'plan-web.md': builtPlan, 'plan-backend.md': builtPlan,
    'test-plan-web.md': testPlanDocument({ bugs }), 'test-plan-backend.md': testPlanDocument({ bugs }),
  });
  expectNext('fixing on a client re-reads ui-bugs.md, and the fix-review checklist only for an inline review',
    nextStep(featureDirectory, ['web', '--phase', 'fixing']),
    {
      exit: 0, unit: /^B1$/,
      rereadOrder: ['checkout/test-plan-web.md', 'checkout/TRD-web.md', 'do-fixing/ui-bugs.md', 'do-fixing/fix-reviewer.md'],
      rereadWhy: { 'do-fixing/fix-reviewer.md': /^the fix-review checklist — read it only to run the review inline$/ },
    });
  expectNext('a backend fix never reads ui-bugs.md', nextStep(featureDirectory, ['backend', '--phase', 'fixing']),
    { exit: 0, unit: /^B1$/, rereadOrder: ['checkout/test-plan-backend.md', 'checkout/TRD-backend.md', 'do-fixing/fix-reviewer.md'] });
}

{
  const { projectRoot, featureDirectory } = featureProject('session-files', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ stages: [{ number: 1, ...DONE }, { number: 2 }, { number: 3 }] }),
  });
  write(path.join(projectRoot, '.alpha-sdlc', 'next', 'checkout--backend.json'), JSON.stringify({
    skill: 'alpha-sdlc:do-development', args: 'checkout backend', unit: 'Stage 2', status: 'ready', at: '2026-10-08T09:00:00Z',
  }));
  write(path.join(projectRoot, '.alpha-sdlc', 'handoff', 'checkout--backend.md'), '# Handoff\n\n- backend on :8088 (pid 4242)\n');
  const outcome = nextStep(featureDirectory, ['backend'], { cwd: projectRoot });
  expectNext('a ready next-file and its handoff are surfaced, the handoff read first', outcome, {
    exit: 0, fact: /next-file .*checkout--backend\.json: ready · unit Stage 2 .*set its status to consumed/,
    check: (json) => json.reread.length > 0 && /handoff[\\/]checkout--backend\.md$/.test(json.reread[0].path),
  });
}

{
  const { featureDirectory } = featureProject('text-output', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ stages: [{ number: 1, ...DONE }, { number: 2, approved: null }, { number: 3 }] }),
  });
  const run = runScript('next-step.js', [featureDirectory, 'backend'], { cwd: featureDirectory, env: SCRIPT_ENVIRONMENT });
  const text = run.stdout;
  report('next-step.js', 'the text report leads with where, next and the STOP, then the bounded re-read list and the block',
    run.exitCode === 1 && /^next-step · checkout · backend · development \(detected: 1 of 3 stages done\)\n/.test(text) &&
      /\nnext: Stage 2 — .*\(plan-backend\.md:\d+\)\n/.test(text) && /\nSTOP: Stage 2's `Approved \(plan gate\)` stamp is missing/.test(text) &&
      /\nre-read \(bounded, in this order\):\n/.test(text) && /\nresume: \/alpha-sdlc:do-development checkout backend\n/.test(text) &&
      /\nblock \(plan-backend\.md:\d+\):\n {2}### Stage 2/.test(text),
    [`exit ${run.exitCode}`, text]);
}

{
  const longNotes = Array.from({ length: 900 }, (_, index) => `  note ${index}: ${'the stage keeps every edge case the plan names '.repeat(6)}`).join('\n');
  const { featureDirectory } = featureProject('long-block', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ stages: [{ number: 1, ...DONE }, { number: 2, extra: `- **Notes:** long\n${longNotes}` }, { number: 3 }] }),
  });
  const outcome = nextStep(featureDirectory, ['backend', '--phase', 'development']);
  expectNext('a long stage block arrives whole through a pipe, capped at 400 lines with a pointer to the rest', outcome, {
    exit: 0, unit: /Stage 2/, block: /… \d+ more line\(s\) in plan-backend\.md:\d+$/,
    check: (json) => outcome.stdout.length > 65536 && json.block.text.split('\n').length === 401,
  });
}

{
  const { featureDirectory } = featureProject('single-platform', {
    'TRD.md': hubDocument(), 'TRD-backend.md': spokeDocument(),
    'plan-backend.md': planDocument({ stages: [{ number: 1, ...DONE }, { number: 2 }, { number: 3 }] }),
  });
  expectNext('a phase that needs a platform uses the only one the feature has', nextStep(featureDirectory, ['--phase', 'development']),
    { exit: 0, unit: /Stage 2/, note: /platform backend — the only one/ });
}

{
  const { featureDirectory } = featureProject('usage', { 'TRD-web.md': spokeDocument({ platform: 'Web' }), 'TRD-backend.md': spokeDocument() });
  const unknownPhase = runScript('next-step.js', [featureDirectory, 'web', '--phase', 'deploying'], { env: SCRIPT_ENVIRONMENT });
  const missingDirectory = runScript('next-step.js', [path.join(featureDirectory, 'nope'), 'web'], { env: SCRIPT_ENVIRONMENT });
  const ambiguous = runScript('next-step.js', [featureDirectory, '--phase', 'planning'], { env: SCRIPT_ENVIRONMENT });
  report('next-step.js', 'usage errors exit 2: an unknown phase, a missing directory, a platform it cannot pick',
    unknownPhase.exitCode === 2 && /unknown phase/.test(unknownPhase.stderr) && missingDirectory.exitCode === 2 &&
      ambiguous.exitCode === 2 && /this feature has: backend, web/.test(ambiguous.stderr),
    [unknownPhase.stderr, missingDirectory.stderr, ambiguous.stderr]);
}

function scanRepository(name) {
  const repository = projectFixture('scan-' + name, {
    'src/app.ts': 'export const app = 1;\n',
    'src/db/schema.sql': 'create table t (id int);\n',
    'README.md': '# app\n',
    'docs/basics/02-architecture.md': '# Architecture\n',
    '.gitignore': 'dist/\n',
  });
  initRepository(repository);
  commitAll(repository, 'initial', '2026-10-01T10:00:00');
  return repository;
}

const scanRecord = (repository, args) => runScript('scan-record.js', args, { cwd: repository, env: GIT_ENVIRONMENT });

function recordScan(repository, format) {
  const hash = JSON.parse(scanRecord(repository, ['--hash', repository]).stdout);
  const body = format === 'markdown'
    ? `# Scan record\n\n- **Commit:** \`${hash.commit}\`\n- **Tree:** \`${hash.tree}\`\n\n## Area: src\n\n- covered: src/\n`
    : `# Scan record\n\n${JSON.stringify(hash)}\n`;
  write(path.join(repository, '.alpha-sdlc', 'scan.md'), body);
  return hash;
}

const check = (repository, extra = []) => scanRecord(repository, ['--check', path.join(repository, '.alpha-sdlc', 'scan.md'), repository, ...extra]);

{
  const repository = scanRepository('hash');
  const first = scanRecord(repository, ['--hash', repository]);
  const second = scanRecord(repository, ['--hash', repository]);
  let parsed = null;
  try { parsed = JSON.parse(first.stdout); } catch {}
  report('scan-record.js', '--hash prints {commit, tree} for HEAD and the working tree, the same twice',
    first.exitCode === 0 && parsed && /^[0-9a-f]{40}$/.test(parsed.commit) && /^[0-9a-f]{64}$/.test(parsed.tree) && first.stdout === second.stdout,
    [first.stdout, first.stderr]);
}

{
  const repository = scanRepository('fresh');
  recordScan(repository, 'markdown');
  const outcome = check(repository);
  report('scan-record.js', 'an unchanged tree is fresh (record in markdown form)', outcome.exitCode === 0 && /^fresh — /.test(outcome.stdout), [outcome.stdout, outcome.stderr]);
  write(path.join(repository, 'docs', 'basics', '02-architecture.md'), '# Architecture\n\nrewritten\n');
  write(path.join(repository, '.alpha-sdlc', 'drafts', '03.md'), 'draft\n');
  const excluded = check(repository);
  report('scan-record.js', 'changes inside docs/basics/ and .alpha-sdlc/ leave the record fresh', excluded.exitCode === 0, [excluded.stdout]);
  commitAll(repository, 'profile only', '2026-10-02T10:00:00');
  const moved = check(repository);
  report('scan-record.js', 'a commit that only touched the profile keeps it fresh, and says HEAD moved',
    moved.exitCode === 0 && /HEAD moved since the record, but only inside docs\/basics\//.test(moved.stdout), [moved.stdout]);
}

{
  const repository = scanRepository('stale');
  recordScan(repository, 'json');
  write(path.join(repository, 'src', 'app.ts'), 'export const app = 2;\n');
  write(path.join(repository, 'scripts', 'new.sh'), 'echo new\n');
  const dirty = check(repository);
  report('scan-record.js', 'a modified file and a new untracked file make it stale, grouped by top-level area',
    dirty.exitCode === 1 && /^stale — 2 changed path\(s\)/.test(dirty.stdout) && /\n {2}scripts\/ \(1\): scripts\/new\.sh \*\n/.test(dirty.stdout) &&
      /\n {2}src\/ \(1\): src\/app\.ts \*\n/.test(dirty.stdout), [dirty.stdout]);
  commitAll(repository, 'work', '2026-10-02T10:00:00');
  write(path.join(repository, 'dist', 'bundle.js'), 'ignored\n');
  const committed = check(repository, ['--json']);
  let parsed = null;
  try { parsed = JSON.parse(committed.stdout); } catch {}
  report('scan-record.js', 'committed changes since the record are listed by area, ignored files are not',
    committed.exitCode === 1 && parsed && parsed.status === 'stale' && JSON.stringify(parsed.areas) === JSON.stringify({ 'scripts/': ['scripts/new.sh'], 'src/': ['src/app.ts'] }) &&
      parsed.uncommitted.length === 0, [committed.stdout]);
}

{
  const repository = scanRepository('many-paths');
  recordScan(repository, 'json');
  for (let area = 0; area < 30; area++) {
    for (let file = 0; file < 50; file++) {
      write(path.join(repository, `area-${area}`, `a-generated-module-with-a-long-descriptive-name-${file}.ts`), `export const value = ${file};\n`);
    }
  }
  const outcome = check(repository, ['--json']);
  let parsed = null;
  try { parsed = JSON.parse(outcome.stdout); } catch {}
  report('scan-record.js', 'a stale report with 1,500 changed paths arrives whole through a pipe',
    outcome.exitCode === 1 && outcome.stdout.length > 65536 && parsed && Object.keys(parsed.areas).length === 30 &&
      Object.values(parsed.areas).every((files) => files.length === 50),
    [`exit ${outcome.exitCode}, ${outcome.stdout.length} bytes`, outcome.stdout.slice(-300)]);
}

{
  const repository = scanRepository('hidden-areas');
  recordScan(repository, 'json');
  for (let file = 1; file <= 60; file++) write(path.join(repository, 'src', 'api', `f${String(file).padStart(2, '0')}.ts`), `export const f = ${file};\n`);
  write(path.join(repository, 'src', 'web', 'page.tsx'), 'export const page = 1;\n');
  const outcome = check(repository);
  report('scan-record.js', 'a top-level area over 50 paths still names every directory its hidden paths sit in',
    outcome.exitCode === 1 && /\n {2}src\/ \(61\): .*, … and 11 more, under src\/api\/, src\/web\/\n/.test(outcome.stdout), [outcome.stdout.slice(-400)]);
}

{
  const repository = scanRepository('staging');
  write(path.join(repository, 'src', 'app.ts'), 'export const app = 3;\n');
  const before = scanRecord(repository, ['--hash', repository]).stdout;
  gitIn(repository, ['add', 'src/app.ts']);
  const after = scanRecord(repository, ['--hash', repository]).stdout;
  report('scan-record.js', 'staging a change does not change the tree hash — only the working tree counts', before === after, [before, after]);
}

{
  const repository = scanRepository('unreadable');
  const missing = check(repository);
  write(path.join(repository, '.alpha-sdlc', 'scan.md'), '# Scan record\n\ncommit: abcdef1\n');
  const noTree = check(repository);
  const notRepository = projectFixture('scan-not-a-repository', { 'a.txt': 'x\n' });
  const outside = scanRecord(notRepository, ['--hash', notRepository]);
  const noMode = scanRecord(repository, []);
  report('scan-record.js', 'a missing record, a record with no tree line, a non-repository and no mode all exit 2',
    missing.exitCode === 2 && noTree.exitCode === 2 && /no "tree" line/.test(noTree.stdout) && outside.exitCode === 2 && noMode.exitCode === 2,
    [missing.stdout, noTree.stdout, outside.stdout, noMode.stderr]);
}

{
  const repository = scanRepository('foreign-commit');
  const hash = JSON.parse(scanRecord(repository, ['--hash', repository]).stdout);
  write(path.join(repository, '.alpha-sdlc', 'scan.md'), `| **Commit** | \`${'1234567'.repeat(5).slice(0, 40)}\` |\n| **Tree** | \`${hash.tree}\` |\n`);
  write(path.join(repository, 'src', 'app.ts'), 'export const app = 4;\n');
  const outcome = check(repository);
  report('scan-record.js', 'a recorded commit missing from history says to re-scan every area (record in table form)',
    outcome.exitCode === 1 && /not in this repository's history — re-scan every area/.test(outcome.stdout), [outcome.stdout]);
}

finish();
