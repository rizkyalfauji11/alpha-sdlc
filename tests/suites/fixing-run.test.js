#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createSuite, pluginRoot } = require('../lib/harness');
const { replayer, storyFiles, rowOf, revisionOf, isAutoGate, hasNote, isString } = require('../lib/phase-run');

const suite = createSuite('fixing-run');
const { report, finish } = suite;

const FIXTURES = path.join(pluginRoot, 'tests', 'fixtures', 'fixing-run');
const GUIDE = path.join(pluginRoot, 'skills', 'do-fixing', 'fixing-run-schema.md');
const BUG = /^B[1-9]\d*$/;
const ROW = /^(?:B[1-9]\d*|fix-review)$/;
const QUESTION_ID = /^(?:B[1-9]\d*|fix-review):[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VOCABULARY = { pending: false, fixing: false, 'waiting on you': false, 'stopped here': false, 'not fixing': true, done: true };
const PLAN_FILE = /^test-plan-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const FIX_SECTIONS = ['Root cause', 'Regression test', 'Fix', 'Re-verification', 'Profile updates', 'Self-review'];
const SEVERITY = /^\[(?:blocker|major|minor|trivial)\] \S/;

function rowProblems(rows, isFull) {
  const problems = [];
  const bugs = rows.filter((row) => BUG.test(rowOf(row.key)));
  const review = rows.find((row) => rowOf(row.key) === 'fix-review');
  if (isFull && (!review || !bugs.length)) problems.push("a full report holds every bug row and the fix review's");
  bugs.forEach((row, index) => {
    if (row.ordinal !== index + 1) problems.push(`row ${row.key}'s ordinal is ${index + 1}`);
    if (!SEVERITY.test(row.name)) problems.push(`row ${row.key}'s name is "[<severity>] <what's wrong>"`);
  });
  if (review && review.ordinal !== bugs.length + 1) problems.push("the fix review's ordinal is the bug count plus one");
  if (review && review.name !== 'The fix review') problems.push('the fix review\'s row is named "The fix review"');
  for (const row of rows) {
    if (!PLAN_FILE.test(row.group || '') || row.description !== row.group) problems.push(`row ${row.key}'s group and description are the test plan file`);
    const attempts = (row.notes || []).find((note) => note.label === 'Attempts');
    if (attempts && !/^[1-3] of 3 · \S/.test(attempts.text)) problems.push(`row ${row.key}'s Attempts note reads "<n> of 3 · <why it failed>"`);
  }
  return problems;
}

function gate(sent, row, rows) {
  const id = rowOf(row.key);
  const bugs = rows.filter((each) => BUG.test(rowOf(each.key)));
  const problems = [];
  const body = ((sent.gate.detail || {}).panes || [{}])[0].body || '';
  if (id === 'fix-review') {
    if ((sent.gate.evidence || {}).caption !== 'Read while reviewing') problems.push('the fix review\'s evidence reads "Read while reviewing"');
    return {
      stampLine: `${row.group} · Fix review`, pane: 'Verdict', note: 'every fix of the batch · its fixes are not committed yet', approve: 'Close the fix review', problems,
      consequences: (lines) => lines.length === 2 && /^Closing the review commits its fixes to feat\/[a-z0-9-]+ and hands back to do-testing for the re-test$/.test(lines[0]) && lines[1] === 'Nothing is pushed until the finish card',
    };
  }
  if (!BUG.test(id)) return { stampLine: '', pane: '', note: '', approve: '', problems: [`the gate sits on ${id}, which is no row of a fixing run`] };
  const index = bugs.findIndex((each) => rowOf(each.key) === id);
  const next = index === bugs.length - 1 ? 'the fix review' : rowOf(bugs[index + 1].key);
  if (!FIX_SECTIONS.every((section) => new RegExp(`^## ${section}$`, 'm').test(body))) problems.push("a bug's report holds its six sections");
  if ((sent.gate.evidence || {}).caption !== 'Read while fixing') problems.push('a bug\'s evidence reads "Read while fixing"');
  return {
    stampLine: `${row.group} · ${id} · bug ${index + 1} of ${bugs.length}`, pane: 'Fix', note: `${id}'s fix · nothing is committed yet`, approve: `Approve the fix to ${id}`, problems,
    consequences: (lines) => lines.length === 2 && lines[0].startsWith(`Approving marks ${id} fixed and commits its fix to feat/`) && lines[0].endsWith(`, and the run carries on at ${next}`) &&
      lines[1] === 'Nothing is pushed until the fix review closes',
  };
}

function completeProblems(rows) {
  const problems = [];
  if (rows.some((row) => !['done', 'not fixing'].includes(row.state.label))) problems.push('fixingComplete comes once every bug is done or not fixing and the fix review is done');
  const review = rows.find((row) => rowOf(row.key) === 'fix-review');
  if (!review || review.state.label !== 'done') problems.push('fixingComplete comes on the fix review\'s close');
  return problems;
}

const replay = replayer({
  completeFlag: 'fixingComplete', vocabulary: VOCABULARY, rowPattern: ROW, questionPattern: QUESTION_ID,
  rowProblems, gate, completeProblems, haltLead: 'Fixing waits for ',
});

const STORIES = ['step', 'strikes', 'auto'];
const stories = STORIES.map((story) => ({ story, files: storyFiles(FIXTURES, story) }));
for (const { story, files } of stories) {
  const problems = replay(files);
  report('fixtures', `the ${story} story conforms to the fixing-run guide`, problems.length === 0, problems.join('\n'));
}

const every = stories.flatMap(({ files }) => files);
const covers = (what, predicate) => report('fixtures', `a fixture shows ${what}`, every.some(({ report: sent }) => predicate(sent)));
const gateRow = (sent) => sent.gate && rowOf(sent.gate.documentKey);
covers("a bug's gate keyed by its bug ID", (sent) => !isAutoGate(sent.gate) && BUG.test(gateRow(sent) || ''));
covers('a bug approved and committed, ending the session', (sent) => sent.sessionEnded && !sent.gate && sent.documents.some((row) => BUG.test(rowOf(row.key)) && row.state.label === 'done'));
covers('a failed re-verification counted in an Attempts note', (sent) => sent.documents.some((row) => /^[12] of 3/.test(((row.notes || []).find((note) => note.label === 'Attempts') || {}).text || '')));
covers('a fix reworked under its next revision, in a full snapshot', (sent) => BUG.test(gateRow(sent) || '') && revisionOf(sent.gate.documentKey) > 1 && sent.onlyWhatChanged === false);
covers("the fix review's verdict with a needs-eyes question on its row", (sent) => gateRow(sent) === 'fix-review' && !isAutoGate(sent.gate) && sent.questions.some((question) => question.documentKey === sent.gate.documentKey));
covers('three strikes as a halt: Attempts at 3, no gate, the Open Decision named', (sent) => isString(sent.halted && sent.halted.sentence) &&
  /three times/.test(sent.halted.sentence) && sent.documents.some((row) => /^3 of 3/.test(((row.notes || []).find((note) => note.label === 'Attempts') || {}).text || '')));
covers('fixingComplete in a step-by-step run', (sent) => sent.fixingComplete === true && !('autoDecisions' in sent));
covers('an auto-run fix stamped auto with autoDecisions', (sent) => isAutoGate(sent.gate) && BUG.test(gateRow(sent)) && sent.autoDecisions.length > 0);
covers('an auto-run finished: the fix review stamped auto with fixingComplete', (sent) => isAutoGate(sent.gate) && gateRow(sent) === 'fix-review' && sent.fixingComplete === true);

{
  const step = storyFiles(FIXTURES, 'step');
  const strikes = storyFiles(FIXTURES, 'strikes');
  const swap = (files, suffix, change) => files.map((file) => file.name.endsWith(suffix) ? { ...file, report: change(file.report) } : file);
  const caught = (files, phrase) => replay(files).some((problem) => problem.includes(phrase));
  report('checker', 'catches an approve labelled other than "Approve the fix to B<n>"',
    caught(swap(step, '01-b1-gate.json', (sent) => ({ ...sent, gate: { ...sent.gate, actions: sent.gate.actions.map((action) => action.id === 'approve' ? { ...action, label: 'Approve' } : action) } })), 'offers exactly'));
  report('checker', "catches a bug's report missing one of its six sections",
    caught(swap(step, '01-b1-gate.json', (sent) => ({ ...sent, gate: { ...sent.gate, detail: { ...sent.gate.detail, panes: sent.gate.detail.panes.map((pane) => ({ ...pane, body: pane.body.replace('## Root cause', '## Cause') })) } } })), 'six sections'));
  report('checker', 'catches a bug row named without its severity',
    caught(swap(step, '01-b1-gate.json', (sent) => ({ ...sent, documents: sent.documents.map((row) => row.key === 'B1@1' ? { ...row, name: 'Bug 1' } : row) })), '[<severity>]'));
  report('checker', 'catches a fourth attempt',
    caught(swap(step, '03-b2-gate.json', (sent) => ({ ...sent, documents: sent.documents.map((row) => row.key === 'B2@1' ? { ...row, notes: [{ label: 'Attempts', text: '4 of 3 · again' }] } : row) })), 'Attempts note'));
  report('checker', 'catches three strikes reported as a gate instead of a halt',
    caught(swap(strikes, '01-three-strikes.json', (sent) => ({ ...sent, gate: step[0].report.gate })), 'never sent with a gate'));
  report('checker', 'catches a three-strikes halt whose row is not pending',
    caught(swap(strikes, '01-three-strikes.json', (sent) => ({ ...sent, documents: sent.documents.map((row) => row.key === 'B2@3' ? { ...row, state: step[0].report.states.find((state) => state.label === 'waiting on you') } : row) })), 'halted row reads pending'));
  report('checker', 'catches fixingComplete before the fix review closes',
    caught(swap(step, '05-b2-approved.json', (sent) => ({ ...sent, fixingComplete: true })), "fix review's close"));
  report('checker', "catches a testing run's flag in a fixing report",
    caught(swap(step, '07-fixing-complete.json', (sent) => ({ ...sent, testingComplete: true })), "no other run's fields"));
  report('checker', 'catches a fix review whose close does not hand back to the re-test',
    caught(swap(step, '06-review-verdict.json', (sent) => ({ ...sent, gate: { ...sent.gate, consequences: ['Closing the review commits its fixes', 'Nothing is pushed until the finish card'] } })), 'consequences'));
}

{
  const guide = fs.readFileSync(GUIDE, 'utf8');
  const flat = guide.replace(/\s+/g, ' ');
  const sections = ['## Version', '## The session', '## Rows', '## The gate', '## Questions', '## Decisions on stdin', '## Auto-run', '## The end'];
  report('guide', "the guide holds the run guides' sections", sections.every((heading) => guide.includes(`\n${heading}\n`)), sections.filter((heading) => !guide.includes(`\n${heading}\n`)).join(', '));
  report('guide', 'the guide names what a platform run may run: git subcommands, the plugin scripts, doc checks and the recorded commands',
    /git's `add`, `commit`, `fetch`, `status`, `diff`, `log`, `rev-parse` and `show`/.test(flat) && /`review-packet\.js`/.test(flat) &&
    /doc checks as exact strings/.test(flat) && /`developmentCommands` and `autoRunCommands` as a prefix/.test(flat) && /never pushes/.test(flat));
  report('guide', "the guide boots a re-verification's stack within the session and ends it, as testing's The stack says",
    /\*\*The stack\.\*\*/.test(flat) && /booted within the session/.test(flat) && /ended by its stop commands before the session's last report/.test(flat) && /testing's \*The stack\*/.test(flat));
  report('guide', 'the guide offers approve, request changes and stop on each bug and on the fix review',
    /`Approve the fix to <bug id>` \| `Request changes` \| `Stop here`/.test(flat) && /`Close the fix review` \| `Request changes` \| `Stop here`/.test(flat));
  report('guide', 'the guide halts on three strikes, Attempts kept in the file and never reset',
    /\*\*Three strikes\.\*\*/.test(flat) && /At 3 the fix is wrong by design/.test(flat) && /no fourth attempt/.test(flat) && /`Attempts` never resets/.test(flat));
  report('guide', 'the guide sends fixingComplete once the fix review closes',
    /\*\*`fixingComplete: true`\*\* — sent once, on the fix review's close/.test(flat));
  const minimum = (/ships in alpha-sdlc \*\*(\d+\.\d+\.\d+)\*\*/.exec(guide) || [])[1];
  const version = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  const at = (value) => String(value).split('.').map(Number).reduce((sum, part) => sum * 1000 + part, 0);
  report('version', 'the guide names its minimum and plugin.json is at or above it', Boolean(minimum) && at(version) >= at(minimum), `${minimum} · ${version}`);
  report('version', 'every fixture reports a version at or above the minimum', every.every(({ report: sent }) => minimum && at(sent.pluginVersion) >= at(minimum)));
  const readme = fs.readFileSync(path.join(pluginRoot, 'README.md'), 'utf8');
  report('version', 'the release notes publish the minimum', Boolean(minimum) && readme.includes(`From ${minimum} \`do-testing\` and \`do-fixing\``));
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'do-fixing', 'SKILL.md'), 'utf8');
  report('skill', 'do-fixing reads the guide under a fixing-run schema', /fixing-run schema \(`--json-schema`\), read\s+`fixing-run-schema\.md` before the first report/.test(skill));
}

finish();
