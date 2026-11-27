#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createSuite, pluginRoot } = require('../lib/harness');
const { replayer, storyFiles, rowOf, revisionOf, isAutoGate, hasNote, isString } = require('../lib/phase-run');

const suite = createSuite('testing-run');
const { report, finish, runScript, projectFixture } = suite;

const FIXTURES = path.join(pluginRoot, 'tests', 'fixtures', 'testing-run');
const GUIDE = path.join(pluginRoot, 'skills', 'do-testing', 'testing-run-schema.md');
const FIXED_ROWS = ['plan', 'environment', 'boot-smoke', 'test-review', 'report'];
const TEST_ID = /^TC[1-9]\d*[a-z]?$/;
const ROW = /^(?:plan|environment|boot-smoke|test-review|report|TC[1-9]\d*[a-z]?)$/;
const QUESTION_ID = /^(?:plan|environment|boot-smoke|test-review|report|TC[1-9]\d*[a-z]?):[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VOCABULARY = { pending: false, running: false, 'waiting on you': false, 'stopped here': false, 'marked manual': true, done: true };
const PLAN_FILE = /^test-plan-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const NAMES = { plan: 'The test plan', environment: 'The environment', 'boot-smoke': 'Boot & Smoke', 'test-review': 'The test review', report: 'The coverage and bug report' };
const PANES = {
  plan: ['Plan', 'the pyramid, the critical journeys, the environment · nothing is stamped yet', 'Approve the plan', 'Test plan'],
  environment: ['Environment', 'what is stood up, and how it is ended · nothing is running yet', 'Approve the environment', 'Environment'],
  'boot-smoke': ['Journeys', 'the stack and every critical journey · not run yet', 'Approve and run Boot & Smoke', 'Boot & Smoke'],
  'test-review': ['Verdict', "the suite's diff · its fixes are not committed yet", 'Close the test review', 'Test review'],
  report: ['Report', 'coverage, Boot & Smoke and every bug · fix nothing here', 'Close testing', 'Coverage and bugs'],
};

function rowProblems(rows, isFull) {
  const problems = [];
  const tests = rows.filter((row) => TEST_ID.test(rowOf(row.key)));
  const ids = rows.map((row) => rowOf(row.key));
  if (isFull && !FIXED_ROWS.every((id) => ids.includes(id))) problems.push('a full report holds the plan, environment, Boot & Smoke, test review and report rows');
  const order = ['plan', 'environment', ...tests.map((row) => rowOf(row.key)), 'boot-smoke', 'test-review', 'report'];
  rows.forEach((row) => {
    const id = rowOf(row.key);
    if (!PLAN_FILE.test(row.group || '') || row.description !== row.group) problems.push(`row ${row.key}'s group and description are the test plan file`);
    if (row.ordinal !== order.indexOf(id) + 1) problems.push(`row ${row.key}'s ordinal is ${order.indexOf(id) + 1}: plan, environment, each test, Boot & Smoke, the test review, the report`);
    if (NAMES[id] && row.name !== NAMES[id]) problems.push(`row ${row.key} is named "${NAMES[id]}"`);
    if (TEST_ID.test(id)) {
      if (!/^\[[A-Za-z][^\]]*\] \S/.test(row.name) || /^test\s+\d/i.test(row.name) || row.name.includes('`')) problems.push(`row ${row.key}'s name is "[<level>] <what it verifies>", never "Test n"`);
      if (row.state.label === 'done' && !hasNote(row, 'Result')) problems.push(`row ${row.key} ran and carries its Result note`);
    }
    if (row.state.label === 'marked manual' && !TEST_ID.test(id)) problems.push(`only a test row is marked manual, never ${id}`);
  });
  return problems;
}

function gate(sent, row, rows) {
  const id = rowOf(row.key);
  const total = rows.filter((each) => TEST_ID.test(rowOf(each.key))).length;
  if (TEST_ID.test(id)) {
    const index = rows.filter((each) => TEST_ID.test(rowOf(each.key))).findIndex((each) => rowOf(each.key) === id) + 1;
    return {
      stampLine: `${row.group} · ${id} · test ${index} of ${total}`, pane: 'Test', note: 'its procedure and its code · not run yet', approve: `Approve and run ${id}`,
      consequences: (lines) => lines[0] === `Approving stamps Approved on ${id}, runs it and records its result` && lines[1] === 'A failure is logged as a bug for the report; testing fixes nothing',
      problems: (sent.gate.evidence || {}).caption === 'Read while writing' ? [] : ['a test\'s evidence reads "Read while writing"'],
    };
  }
  if (!PANES[id]) return { stampLine: '', pane: '', note: '', approve: '', problems: [`the gate sits on ${id}, which is no row of a testing run`] };
  const [pane, note, approve, stamp] = PANES[id];
  const pushed = (lines) => lines.some((line) => /Nothing is pushed until the finish card|Nothing is stood up until the environment is approved|never marked manual|asked at the coverage and bug report|lets the run stand up what it names/.test(line));
  const problems = [];
  if (id === 'report' && !isAutoGate(sent.gate) && !sent.gate.consequences.some((line) => /hands the bugs to fix to do-fixing|finishes the testing of/.test(line))) problems.push("the report's gate says whether closing hands bugs to do-fixing or finishes testing");
  return { stampLine: `${row.group} · ${stamp}`, pane, note, approve, consequences: pushed, problems };
}

function completeProblems(rows) {
  const problems = [];
  if (rows.some((row) => !['done', 'marked manual'].includes(row.state.label))) problems.push('testingComplete comes once every row is done, a test marked manual included');
  const boot = rows.find((row) => rowOf(row.key) === 'boot-smoke');
  if (!boot || boot.state.label !== 'done') problems.push('testingComplete needs Boot & Smoke done — it is never marked manual');
  return problems;
}

function questionProblems(question) {
  const problems = [];
  if (/^report:triage-/.test(question.id)) {
    const ids = question.options.map((option) => option.id).join('|');
    if (ids !== 'fix|defer|no') problems.push(`the triage ${question.id} offers fix, defer and no`);
    if (question.options.some((option) => option.id !== 'fix' && !option.requiresReason)) problems.push(`the triage ${question.id}'s defer and no each require a reason`);
    if (!/^B[1-9]\d* · /.test(question.title)) problems.push(`the triage ${question.id} is titled "<bug id> · <what's wrong>"`);
    if (rowOf(question.documentKey) !== 'report' || !question.blocks.includes(question.documentKey)) problems.push(`the triage ${question.id} sits on the report's row and blocks its close`);
  }
  return problems;
}

const replay = replayer({
  completeFlag: 'testingComplete', vocabulary: VOCABULARY, rowPattern: ROW, questionPattern: QUESTION_ID,
  rowProblems, gate, completeProblems, questionProblems, haltLead: 'Testing waits for ',
});

const STORIES = ['step', 'stop', 'refusal', 'auto', 'retest'];
const stories = STORIES.map((story) => ({ story, files: storyFiles(FIXTURES, story) }));
for (const { story, files } of stories) {
  const problems = replay(files);
  report('fixtures', `the ${story} story conforms to the testing-run guide`, problems.length === 0, problems.join('\n'));
}

const every = stories.flatMap(({ files }) => files);
const covers = (what, predicate) => report('fixtures', `a fixture shows ${what}`, every.some(({ report: sent }) => predicate(sent)));
const gateRow = (sent) => sent.gate && rowOf(sent.gate.documentKey);
covers("the plan's gate before any test row exists", (sent) => gateRow(sent) === 'plan' && !sent.documents.some((row) => TEST_ID.test(rowOf(row.key))));
covers("the plan's approval adding the test rows in a full snapshot", (sent) => gateRow(sent) === 'environment' && sent.onlyWhatChanged === false && sent.documents.some((row) => TEST_ID.test(rowOf(row.key))));
covers('a test keyed by its test ID, gated before it runs', (sent) => !isAutoGate(sent.gate) && TEST_ID.test(gateRow(sent) || ''));
covers('a test that failed, its Result naming its bug', (sent) => sent.documents.some((row) => (row.notes || []).some((note) => note.label === 'Result' && /fail → B\d/.test(note.text))));
covers('a test reworked under its next revision, in a full snapshot', (sent) => TEST_ID.test(gateRow(sent) || '') && revisionOf(sent.gate.documentKey) > 1 && sent.onlyWhatChanged === false);
covers("Boot & Smoke's own gate", (sent) => gateRow(sent) === 'boot-smoke' && !isAutoGate(sent.gate));
covers("the test review's verdict", (sent) => gateRow(sent) === 'test-review' && !isAutoGate(sent.gate));
covers('the triage asked per bug on the report, blocking its close', (sent) => gateRow(sent) === 'report' && sent.questions.some((question) => /^report:triage-b\d+$/.test(question.id)));
covers("a needs-eyes finding of the test review asked at the report", (sent) => sent.questions.some((question) => question.id.startsWith('report:finding-')));
covers('Stop here: the test stopped here, its work kept, the session ended', (sent) => sent.sessionEnded && sent.documents.some((row) => row.state.label === 'stopped here'));
covers('a refusal ending on a halt', (sent) => isString(sent.halted && sent.halted.sentence) && !('autoDecisions' in sent));
covers('a halt that waits on the commands that boot and end a stack', (sent) => Array.isArray(sent.halted && sent.halted.commands) && sent.halted.commands.length >= 2);
covers('testingComplete in a step-by-step run', (sent) => sent.testingComplete === true && !('autoDecisions' in sent) && !sent.gate);
covers('an auto-run checkpoint stamped auto with autoDecisions', (sent) => isAutoGate(sent.gate) && TEST_ID.test(gateRow(sent)) && sent.autoDecisions.length > 0);
covers('an auto-run finished: the report stamped auto with testingComplete and each triage in autoDecisions', (sent) => isAutoGate(sent.gate) && gateRow(sent) === 'report' && sent.testingComplete === true &&
  sent.autoDecisions.some((entry) => /Fix\? \(user\)/.test(entry.recordedIn)));
covers('the re-test: the report back under its next revision, no test re-gated', (sent) => gateRow(sent) === 'report' && revisionOf(sent.gate.documentKey) > 1 &&
  sent.documents.filter((row) => TEST_ID.test(rowOf(row.key))).every((row) => row.state.label === 'done'));

{
  const step = storyFiles(FIXTURES, 'step');
  const auto = storyFiles(FIXTURES, 'auto');
  const swap = (files, suffix, change) => files.map((file) => file.name.endsWith(suffix) ? { ...file, report: change(file.report) } : file);
  const caught = (files, phrase) => replay(files).some((problem) => problem.includes(phrase));
  report('checker', 'catches a test keyed other than by its test ID',
    caught(swap(step, '03-tc1-gate.json', (sent) => ({ ...sent, documents: sent.documents.map((row) => row.key === 'TC1@1' ? { ...row, key: 'test-1@1' } : row), gate: { ...sent.gate, documentKey: 'test-1@1' } })), 'row key'));
  report('checker', 'catches a test row named "Test 1"',
    caught(swap(step, '03-tc1-gate.json', (sent) => ({ ...sent, documents: sent.documents.map((row) => row.key === 'TC1@1' ? { ...row, name: 'Test 1' } : row) })), 'never "Test n"'));
  report('checker', 'catches a test approve that does not say it runs',
    caught(swap(step, '03-tc1-gate.json', (sent) => ({ ...sent, gate: { ...sent.gate, actions: sent.gate.actions.map((action) => action.id === 'approve' ? { ...action, label: 'Approve TC1' } : action) } })), 'offers exactly'));
  report('checker', 'catches test rows added in a partial report',
    caught(swap(step, '02-environment-gate.json', (sent) => ({ ...sent, onlyWhatChanged: true, states: [] })), 'adds a row is a full snapshot'));
  report('checker', 'catches a triage that offers no way to defer',
    caught(swap(step, '08-report-gate.json', (sent) => ({ ...sent, questions: sent.questions.map((question) => question.id.startsWith('report:triage-') ? { ...question, options: question.options.filter((option) => option.id !== 'defer') } : question) })), 'offers fix, defer and no'));
  report('checker', 'catches a triage asked on a test row',
    caught(swap(step, '08-report-gate.json', (sent) => ({ ...sent, questions: sent.questions.map((question) => question.id.startsWith('report:triage-') ? { ...question, documentKey: 'test-review@1', blocks: ['test-review@1'] } : question) })), "sits on the report's row"));
  report('checker', 'catches Boot & Smoke marked manual',
    caught(swap(step, '07-test-review-gate.json', (sent) => ({ ...sent, documents: sent.documents.map((row) => row.key === 'boot-smoke@1' ? { ...row, state: { ...row.state, label: 'marked manual', settled: true, tone: 'skipped' } } : row) })), 'never boot-smoke'));
  report('checker', 'catches testingComplete before the report closes',
    caught(swap(step, '07-test-review-gate.json', (sent) => ({ ...sent, gate: null, testingComplete: true, sessionEnded: true })), 'every row is done'));
  report('checker', 'catches testingComplete sent with a halt',
    caught(swap(auto, '05-halted.json', (sent) => ({ ...sent, testingComplete: true })), 'never comes with testingComplete'));
  report('checker', "catches a development run's flag in a testing report",
    caught(swap(step, '09-testing-complete.json', (sent) => ({ ...sent, developmentComplete: true })), "no other run's fields"));
  report('checker', 'catches a halt that waits on a command its sentence does not name',
    caught(swap(auto, '05-halted.json', (sent) => ({ ...sent, halted: { ...sent.halted, commands: [...sent.halted.commands, 'make e2e'] } })), 'names each one in its sentence'));
  report('checker', 'catches a halt that does not open "Testing waits for"',
    caught(swap(auto, '05-halted.json', (sent) => ({ ...sent, halted: { ...sent.halted, sentence: sent.halted.sentence.replace('Testing waits for', 'Development waits for') } })), 'halted opens'));
  report('checker', 'catches a question reported in auto-run',
    caught(swap(auto, '03-tc1-auto.json', (sent) => ({ ...sent, questions: step[7].report.questions.map((question) => ({ ...question, documentKey: 'report@1', blocks: ['report@1'] })) })), 'never reports a question'));
  report('checker', 'catches autoDecisions shortened between reports',
    caught(swap(auto, '04-tc2-auto.json', (sent) => ({ ...sent, autoDecisions: [] })), 'never shortened'));
  const halted = auto.find((file) => file.name.endsWith('05-halted.json')).report.halted;
  const checked = halted.commands.map((entry) => runScript('check-run-commands.js', ['--entry', entry]));
  report('halt', "the boot and stop commands a testing halt waits on pass the command check", checked.every((run) => run.exitCode === 0), checked.map((run) => run.stdout).join(''));
}

{
  const guide = fs.readFileSync(GUIDE, 'utf8');
  const flat = guide.replace(/\s+/g, ' ');
  const sections = ['## Version', '## The session', '## The stack', '## Rows', '## The gate', '## Questions', '## Decisions on stdin', '## Auto-run', '## The end'];
  report('guide', 'the guide holds the run guides\' sections, and The stack', sections.every((heading) => guide.includes(`\n${heading}\n`)), sections.filter((heading) => !guide.includes(`\n${heading}\n`)).join(', '));
  report('guide', 'the guide names what a platform run may run: git subcommands, the plugin scripts, doc checks and the recorded commands',
    /git's `add`, `commit`, `fetch`, `status`, `diff`, `log`, `rev-parse` and `show`/.test(flat) && /`check-feature-done\.js`/.test(flat) &&
    /doc checks as exact strings/.test(flat) && /`developmentCommands` and `autoRunCommands` as a prefix/.test(flat) && /never pushes/.test(flat));
  report('guide', "the guide boots Boot & Smoke's stack within the session that drives it and ends it before its last report",
    /\*\*Booted within the session that drives it\*\*/.test(flat) && /\*\*Ended within the session\*\*/.test(flat) && /before its last report/.test(flat) &&
    /`\.\.\/<repo>\/<script> <subcommand>`/.test(flat) && /runs its `stop` commands first/.test(flat) && /never stopped/.test(flat));
  report('guide', 'the guide asks the triage per bug and writes each answer to its Fix? (user) cell',
    /`report:triage-<bug id>`/.test(flat) && /writes the bug's `Fix\? \(user\)` cell/.test(flat));
  report('guide', 'the guide sends testingComplete once the triage is recorded or check-feature-done.js exits 0',
    /\*\*`testingComplete: true`\*\* — sent once/.test(flat) && /check-feature-done\.js <feature dir> <name>` exits 0/.test(flat) && /every bug's `Fix\? \(user\)` is recorded/.test(flat));
  report('guide', "the guide's halts are RunHalts with their commands, and auto-run records checkpoints and autoDecisions as development's",
    /`\.\.\/do-grooming\/run-halt\.md`'s and its `commands`/.test(flat) && /stamped `auto`/.test(flat) && /`autoDecisions` on every report of the run/.test(flat) && /`"until"` `the report`/.test(flat));
  const minimum = (/ships in alpha-sdlc \*\*(\d+\.\d+\.\d+)\*\*/.exec(guide) || [])[1];
  const version = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  const at = (value) => String(value).split('.').map(Number).reduce((sum, part) => sum * 1000 + part, 0);
  report('version', 'the guide names its minimum and plugin.json is at or above it', Boolean(minimum) && at(version) >= at(minimum), `${minimum} · ${version}`);
  report('version', 'every fixture reports a version at or above the minimum', every.every(({ report: sent }) => minimum && at(sent.pluginVersion) >= at(minimum)));
  const readme = fs.readFileSync(path.join(pluginRoot, 'README.md'), 'utf8');
  report('version', 'the release notes publish the minimum', Boolean(minimum) && readme.includes(`From ${minimum} \`do-testing\``));
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'do-testing', 'SKILL.md'), 'utf8');
  report('skill', 'do-testing reads the guide under a testing-run schema', /testing-run schema \(`--json-schema`\), read\s+`testing-run-schema\.md` before the first report/.test(skill));
  const halt = fs.readFileSync(path.join(pluginRoot, 'skills', 'do-grooming', 'run-halt.md'), 'utf8').replace(/\s+/g, ' ');
  report('halt', 'run-halt.md lets a testing or fixing run send commands', /sent only by a development, testing or fixing run/.test(halt));
}

{
  const plan = (rows, smoke) => '# Test plan\n\n## Bugs found\n\n| # | Bug | Severity | Level | AC | Repro steps | Fix? (user) | Attempts | Status |\n' +
    '|---|---|---|---|---|---|---|---|---|\n' + rows.map((row) => `| ${row.join(' | ')} |`).join('\n') + '\n\n' +
    '## Coverage summary\n\n- **AC covered:** **2 of 2** covered and passing\n' + `- **Boot & Smoke (integrated):** ${smoke}\n`;
  const resultOf = (name, text) => {
    const run = runScript('check-feature-done.js', [projectFixture(`result-${name}`, { 'test-plan-backend.md': text }), 'backend', '--result']);
    let result = null;
    try { result = JSON.parse(run.stdout); } catch {}
    return { ...run, result };
  };
  const toFix = resultOf('to-fix', plan([
    ['B1', 'a share to a non-member returns 500', 'major', 'API', 'AC-3', '1. POST a share', 'yes 2026-11-26', '0', 'open → (do-fixing)'],
  ], '**pass** — the one journey'));
  report('result', 'a test plan with one bug triaged yes yields toFix 1 and done false',
    toFix.exitCode === 1 && toFix.result && toFix.result.done === false && JSON.stringify(toFix.result.bugs) === JSON.stringify({ toFix: 1, fixed: 0, wontFix: 0, deferred: 0 }), toFix.stdout + toFix.stderr);
  const finished = resultOf('done', plan([
    ['B1', 'a share to a non-member returns 500', 'major', 'API', 'AC-3', '1. POST a share', 'yes 2026-11-26', '1', '**fixed** 2026-11-27'],
    ['B2', 'the list repeats a member', 'minor', 'Integration', 'AC-1', '1. share twice', 'defer 2026-11-26', '0', 'deferred — next release'],
    ['B3', 'a tooltip is cut off', 'trivial', 'UI', 'AC-2', '1. hover', 'no 2026-11-26', '0', "won't fix — accepted as is"],
  ], '**pass** — the one journey'));
  report('result', 'a test plan with every bug fixed, deferred or won\'t fix and check-feature-done.js exiting 0 yields toFix 0 and done true',
    finished.exitCode === 0 && finished.result && finished.result.done === true && JSON.stringify(finished.result.bugs) === JSON.stringify({ toFix: 0, fixed: 1, wontFix: 1, deferred: 1 }), finished.stdout + finished.stderr);
  const blocked = resultOf('blocked', plan([], '**blocked** — the stack would not boot'));
  report('result', 'done follows the script: Boot & Smoke blocked with no bug is done false', blocked.exitCode === 1 && blocked.result && blocked.result.done === false, blocked.stdout);
  const plain = runScript('check-feature-done.js', [projectFixture('result-plain', { 'test-plan-backend.md': plan([], '**pass** — the one journey') }), 'backend']);
  report('result', 'without --result the script prints its usual verdict', plain.exitCode === 0 && /^feature: done/.test(plain.stdout), plain.stdout);

  const step = storyFiles(FIXTURES, 'step');
  const swap = (files, suffix, change) => files.map((file) => file.name.endsWith(suffix) ? { ...file, report: change(file.report) } : file);
  const caught = (files, phrase) => replay(files).some((problem) => problem.includes(phrase));
  report('checker', 'catches testingComplete sent without testingResult',
    caught(swap(step, '09-testing-complete.json', (sent) => { const { testingResult: _result, ...rest } = sent; return rest; }), 'carries testingResult'));
  report('checker', 'catches testingResult on a report that does not send testingComplete',
    caught(swap(step, '08-report-gate.json', (sent) => ({ ...sent, testingResult: { done: false, bugs: { toFix: 1, fixed: 0, wontFix: 0, deferred: 0 } } })), 'only on the report that sends testingComplete'));
  report('checker', 'catches a testingResult count that is not a whole number',
    caught(swap(step, '09-testing-complete.json', (sent) => ({ ...sent, testingResult: { ...sent.testingResult, bugs: { ...sent.testingResult.bugs, toFix: -1 } } })), 'integer of 0 or more'));
  report('checker', 'catches a testingResult done with a bug still to fix',
    caught(swap(step, '09-testing-complete.json', (sent) => ({ ...sent, testingResult: { ...sent.testingResult, done: true } })), 'cannot be done'));
  const fixtureResults = every.filter(({ report: sent }) => sent.testingComplete === true).map(({ report: sent }) => sent.testingResult);
  report('fixtures', 'every testingComplete fixture carries testingResult — one handing bugs to do-fixing, one done',
    fixtureResults.every(Boolean) && fixtureResults.some((result) => result.bugs.toFix > 0 && !result.done) && fixtureResults.some((result) => result.done && result.bugs.toFix === 0));
  const guide = fs.readFileSync(GUIDE, 'utf8').replace(/\s+/g, ' ');
  report('guide', 'the guide lists testingResult among its optional fields and sends it with testingComplete only, from check-feature-done.js --result',
    /Six optional fields go beyond setup's report: `testingComplete`, `testingResult` and `autoDecisions`/.test(guide) &&
    /\*\*`testingResult`\*\* — sent on the report that sends `testingComplete`, and on no other, under auto-run too/.test(guide) &&
    /check-feature-done\.js <feature dir> <name> --result`/.test(guide) && /`testingResult` needs \*\*0\.57\.0\*\*/.test(guide));
  const readme = fs.readFileSync(path.join(pluginRoot, 'README.md'), 'utf8');
  report('version', 'the release notes publish testingResult\'s minimum', readme.includes('From 0.57.0 a testing run'));
}

finish();
