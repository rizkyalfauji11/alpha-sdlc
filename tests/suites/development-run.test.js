#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createSuite, pluginRoot } = require('../lib/harness');

const suite = createSuite('development-run');
const { report, finish, sdlcProject, runScript } = suite;

const FIXTURES = path.join(pluginRoot, 'tests', 'fixtures', 'development-run');
const GUIDE = path.join(pluginRoot, 'skills', 'do-development', 'development-run-schema.md');
const ROW = /^(?:stage-[1-9]\d*|feature-review)$/;
const PLAN_FILE = /^plan-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const QUESTION_ID = /^(?:stage-[1-9]\d*|feature-review):[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const TONES = ['neutral', 'progress', 'attention', 'blocked', 'done', 'skipped'];
const VOCABULARY = { pending: false, building: false, 'waiting on you': false, 'stopped here': false, done: true };
const REPORT_SECTIONS = ['Plan summary', 'Tests written first', 'Changes', 'Self-review', 'Profile updates', 'Verification'];
const AUTO_DECISION_FIELDS = ['askedIn', 'question', 'taken', 'recordedIn'];

const isString = (value) => typeof value === 'string';
const isInteger = (value) => Number.isInteger(value);
const rowOf = (key) => key.slice(0, key.lastIndexOf('@'));
const revisionOf = (key) => Number(key.slice(key.lastIndexOf('@') + 1));
const isStage = (id) => id.startsWith('stage-');
const stageNumber = (id) => Number(id.slice('stage-'.length));
const isBlock = (block) => block && isString(block.label) && isString(block.text);
const isAutoGate = (gate) => Boolean(gate) && gate.statusLabel === 'auto';

function storyFiles(story) {
  const directory = path.join(FIXTURES, story);
  return fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort()
    .map((name) => ({ name: `${story}/${name}`, report: JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) }));
}

function evidenceIsWhole(evidence) {
  return evidence === null || evidence === undefined || (isString(evidence.caption) && Array.isArray(evidence.groups) &&
    evidence.groups.every((group) => Array.isArray(group.rows) && group.rows.every((row) => isString(row.label) && Array.isArray(row.lines))));
}

function shapeProblems(sent) {
  const problems = [];
  const need = (ok, what) => { if (!ok) problems.push(what); };
  need(isString(sent.pluginVersion) && sent.pluginVersion.length >= 1 && sent.pluginVersion.length <= 64, 'pluginVersion is a 1–64 character string');
  need(sent.step && isInteger(sent.step.ordinal) && isInteger(sent.step.total), 'step has integer ordinal and total');
  need(Array.isArray(sent.states) && Array.isArray(sent.documents) && Array.isArray(sent.questions), 'states, documents and questions are arrays');
  for (const entry of sent.states || []) {
    need(isString(entry.label) && typeof entry.settled === 'boolean' && TONES.includes(entry.tone) && isString(entry.description) && isString(entry.unsticks),
      `state ${JSON.stringify(entry.label)} has label, settled, a known tone, description and unsticks`);
  }
  for (const row of sent.documents || []) {
    need(isString(row.key) && isInteger(row.ordinal) && isString(row.name) && isString(row.description) && row.state && isString(row.state.label),
      `row ${row.key} has key, ordinal, name, description and state`);
    need((row.notes || []).every(isBlock), `row ${row.key}'s notes are {label, text}`);
  }
  for (const question of sent.questions || []) {
    need(['id', 'documentKey', 'title'].every((field) => isString(question[field])) &&
      ['options', 'consequences', 'actions', 'blocks'].every((field) => Array.isArray(question[field])) && 'summary' in question,
    `question ${question.id} has every required field`);
    need((question.options || []).every((option) => ['id', 'label', 'why', 'trade'].every((field) => isString(option[field])) &&
      typeof option.recommended === 'boolean' && typeof option.requiresReason === 'boolean'), `question ${question.id}'s options are whole`);
    need((question.options || []).filter((option) => option.recommended).length === 1, `question ${question.id} recommends one option`);
    need(evidenceIsWhole(question.evidence), `question ${question.id}'s evidence is whole`);
  }
  if (sent.gate) {
    need(['documentKey', 'statusLabel', 'stampLine'].every((field) => isString(sent.gate[field])) && sent.gate.summary &&
      Array.isArray(sent.gate.consequences) && Array.isArray(sent.gate.actions), 'the gate has every required field');
    need(sent.gate.summary && Array.isArray(sent.gate.summary.blocks) && sent.gate.summary.blocks.every(isBlock) && isString(sent.gate.summary.needFromYou),
      "the gate's summary is {blocks, needFromYou}");
    need(evidenceIsWhole(sent.gate.evidence), "the gate's evidence is whole");
  }
  for (const flag of ['developmentComplete', 'sessionEnded', 'onlyWhatChanged']) {
    if (flag in sent) need(typeof sent[flag] === 'boolean', `${flag} is a boolean`);
  }
  if ('halted' in sent) need(isString(sent.halted) && sent.halted.trim().length > 0, 'halted is a non-empty string');
  if ('autoDecisions' in sent) {
    need(Array.isArray(sent.autoDecisions) && sent.autoDecisions.every((entry) => AUTO_DECISION_FIELDS.every((field) => isString(entry[field]) && entry[field].length > 0)),
      'autoDecisions is a list of {askedIn, question, taken, recordedIn}');
  }
  need(!['trdComplete', 'reviewRounds', 'planComplete', 'planCoverage'].some((field) => field in sent), "a development report sends none of grooming's or planning's fields");
  return problems;
}

function gateProblems(sent, row, stageCount) {
  const problems = [];
  const need = (ok, what) => { if (!ok) problems.push(what); };
  const gate = sent.gate;
  const id = rowOf(row.key);
  const auto = isAutoGate(gate);
  const plain = isStage(id) ? `${row.group} · Stage ${stageNumber(id)} of ${stageCount}` : `${row.group} · Feature review`;
  need(gate.stampLine === (auto ? `${plain} · auto` : plain), `stampLine reads "${auto ? `${plain} · auto` : plain}"`);
  const panes = (gate.detail || {}).panes || [];
  const pane = panes[0] || {};
  need(panes.length === 1 && pane.editable === false && isString(pane.body), 'the gate carries one pane, not editable, its body the report');
  if (isStage(id)) {
    const n = stageNumber(id);
    need(pane.label === 'Report' && pane.note === `what Stage ${n} built · nothing is committed yet`, `the pane is "Report", its note "what Stage ${n} built · nothing is committed yet"`);
    need(REPORT_SECTIONS.every((section) => new RegExp(`^## ${section}$`, 'm').test(pane.body || '')), "the stage's report holds its six sections");
    need((gate.evidence || {}).caption === 'Read while building', 'a stage\'s evidence reads "Read while building"');
  } else {
    need(pane.label === 'Verdict', 'the feature review\'s pane is "Verdict"');
    need((gate.evidence || {}).caption === 'Read while reviewing', 'the feature review\'s evidence reads "Read while reviewing"');
  }
  if (auto) {
    need(row.state.label === 'done', 'a gate stamped auto sits on a done row');
    need(!gate.actions.length && !gate.consequences.length, 'a gate stamped auto asks for no decision: no actions, no consequences');
    need(sent.sessionEnded === true, 'a gate stamped auto is the session\'s last report');
    return problems;
  }
  need(gate.statusLabel === 'waiting on you' && row.state.label === 'waiting on you', 'a step-by-step gate and its row read "waiting on you"');
  const approve = isStage(id) ? `Approve Stage ${stageNumber(id)}` : 'Close the feature review';
  const expected = [
    { id: 'approve', label: approve, role: 'primary', requiresReason: false, requiresBody: false },
    { id: 'request-changes', label: 'Request changes', role: 'secondary', requiresReason: true, requiresBody: false },
    { id: 'stop', label: 'Stop here', role: 'secondary', requiresReason: false, requiresBody: false },
  ];
  need(JSON.stringify(gate.actions) === JSON.stringify(expected), `the gate offers exactly ${approve}, Request changes and Stop here`);
  const branch = / feat\/[a-z0-9-]+/;
  if (isStage(id)) {
    const n = stageNumber(id);
    const next = n === stageCount ? 'the feature review' : `Stage ${n + 1}`;
    need(gate.consequences.length === 2 && gate.consequences[0].startsWith(`Approving commits Stage ${n} to feat/`) && branch.test(gate.consequences[0]) &&
      gate.consequences[0].endsWith(`, and the run carries on at ${next}`) && gate.consequences[1] === 'Nothing is pushed until the feature review closes',
    'a stage\'s gate says what Approve commits, where the run carries on, and that nothing is pushed');
    need((row.notes || []).some((note) => note.label === 'Safe to stop'), 'a stage\'s gate carries the Safe to stop note on its row');
  } else {
    need(gate.consequences.length === 2 && gate.consequences[0].startsWith('Closing the review commits its fixes to feat/') &&
      gate.consequences[0].endsWith(`finishes the development of ${row.group}`) && gate.consequences[1] === 'Nothing is pushed until the finish card',
    'the review\'s gate says what closing commits and that nothing is pushed');
  }
  return problems;
}

function replay(files) {
  const problems = [];
  let mirror = new Map();
  let sessionStarts = true;
  let completed = false;
  let lastGate = null;
  let autoRun = null;
  let decisions = [];
  const stopped = new Map();
  const answered = new Set();
  const askedAt = new Map();
  let open = [];
  for (const { name, report: sent } of files) {
    const fail = (what) => problems.push(`${name}: ${what}`);
    for (const problem of shapeProblems(sent)) fail(problem);
    const isFull = sent.onlyWhatChanged !== true;
    const keys = sent.documents.map((row) => row.key);
    const ordinals = sent.documents.map((row) => row.ordinal);

    if (keys.some((key) => !/@[1-9]\d*$/.test(key) || !ROW.test(rowOf(key)))) fail('every row key is stage-<n>@<revision> or feature-review@<revision>');
    if (new Set(keys.map(rowOf)).size !== keys.length) fail('a report names each row once');
    if (ordinals.some((ordinal, index) => index > 0 && ordinal <= ordinals[index - 1])) fail('rows are sent in ascending ordinal');

    const before = new Map([...mirror.values()].map((row) => [rowOf(row.key), row.key]));
    const rekeyed = keys.filter((key) => before.has(rowOf(key)) && before.get(rowOf(key)) !== key);
    if (rekeyed.length && !isFull) fail(`re-keys ${rekeyed.map((key) => before.get(rowOf(key))).join(', ')} in a partial report, which can never remove the old key`);
    if (sessionStarts && !isFull) fail("the session's first report is whole");
    if (!sessionStarts && isFull && !rekeyed.length) fail('a later report in a session sends only what changed');
    if (isFull) {
      const labels = sent.states.map((entry) => entry.label).sort();
      if (labels.join('|') !== Object.keys(VOCABULARY).sort().join('|')) fail('a full report carries the whole state vocabulary');
      mirror = new Map(sent.documents.map((row) => [row.key, row]));
    } else {
      if (sent.states.length) fail('a partial report sends states: []');
      for (const row of sent.documents) {
        for (const key of [...mirror.keys()]) if (rowOf(key) === rowOf(row.key)) mirror.delete(key);
        mirror.set(row.key, row);
      }
    }
    const rows = [...mirror.values()].sort((a, b) => a.ordinal - b.ordinal);
    const stageRows = rows.filter((row) => isStage(rowOf(row.key)));
    const review = rows.find((row) => rowOf(row.key) === 'feature-review');
    if (isFull && (!review || !stageRows.length)) fail('a full report holds every stage row and the feature review\'s');
    for (const row of rows) {
      const id = rowOf(row.key);
      if (!PLAN_FILE.test(row.group || '') || row.description !== row.group) fail(`row ${row.key}'s group and description are the plan file`);
      if (isStage(id)) {
        if (row.ordinal !== stageNumber(id)) fail(`row ${row.key}'s ordinal is ${stageNumber(id)}`);
        if (/^stage\s+\d/i.test(row.name) || row.name.includes('`') || !row.name.startsWith('[')) fail(`row ${row.key}'s name is the stage's title, its layer tag first, never "Stage n"`);
      } else {
        if (row.ordinal !== stageRows.length + 1) fail('the feature review\'s ordinal is the stage count plus one');
        if (row.name !== 'The feature review') fail('the feature review\'s row is named "The feature review"');
      }
      if (!(row.state.label in VOCABULARY) || row.state.settled !== VOCABULARY[row.state.label]) fail(`row ${row.key} holds a state of the vocabulary, only done settled`);
    }
    if (sent.step.total !== mirror.size || sent.step.ordinal < 1 || sent.step.ordinal > sent.step.total) fail('step is the row the run is on, out of the row count');

    const gate = sent.gate;
    if (gate) {
      const row = mirror.get(gate.documentKey);
      if (!row) fail(`the gate's key ${gate.documentKey} is a row's current key`);
      else {
        for (const problem of gateProblems(sent, row, stageRows.length)) fail(problem);
        const id = rowOf(gate.documentKey);
        if (stopped.has(id)) {
          if (revisionOf(gate.documentKey) <= revisionOf(stopped.get(id))) fail(`the checkpoint ${id} returns after Stop here under its next revision`);
          stopped.delete(id);
        }
        if (lastGate && rowOf(lastGate.documentKey) === id && !isAutoGate(gate)) {
          const sameKey = lastGate.documentKey === gate.documentKey;
          const sameBody = JSON.stringify(lastGate.detail) === JSON.stringify(gate.detail);
          if (sameKey && !sameBody) fail(`a checkpoint that returns with a new report on ${id} takes the row's next revision`);
          if (!sameKey && revisionOf(gate.documentKey) < revisionOf(lastGate.documentKey)) fail(`${id}'s revision never goes back`);
        }
      }
      lastGate = gate;
    }
    for (const row of sent.documents) {
      if (row.state.label === 'stopped here') {
        if (!(row.notes || []).some((note) => note.label === 'Stopped here')) fail(`row ${row.key} stopped here names its kept work in a Stopped here note`);
        if (sent.sessionEnded !== true || sent.gate) fail('Stop here ends the session with no gate');
        stopped.set(rowOf(row.key), row.key);
      }
    }

    for (const question of sent.questions) {
      if (!QUESTION_ID.test(question.id)) fail(`question id ${question.id} is <row id>:<what it asks>`);
      if (/(?:^|:)push/.test(question.id)) fail('a development run never asks to push');
      if (answered.has(question.id)) fail(`question id ${question.id} was answered before and is never reused`);
      if (!mirror.has(question.documentKey)) fail(`question ${question.id} sits on a row's current key`);
      if (question.blocks.some((key) => !mirror.has(key))) fail(`question ${question.id} blocks only current row keys`);
      if (!question.evidence) fail(`question ${question.id} carries evidence`);
      if (![...question.options, ...question.actions].some((choice) => choice.requiresReason)) fail(`question ${question.id} offers a way out that requires a reason`);
      if (question.askedAt !== null && !RFC3339.test(question.askedAt || '')) fail(`question ${question.id}'s askedAt is RFC 3339 or null`);
      if (askedAt.has(question.id) && askedAt.get(question.id) !== question.askedAt) fail(`question ${question.id} keeps its askedAt`);
      askedAt.set(question.id, question.askedAt);
      if (rowOf(question.documentKey) === 'feature-review' && !/^Finding \d+ · /.test(question.title)) fail(`the feature review's question ${question.id} is titled "Finding <n> · …"`);
    }
    const nowOpen = sent.questions.map((question) => question.id);
    for (const id of open) if (!nowOpen.includes(id)) answered.add(id);
    open = nowOpen;

    const sendsAuto = 'autoDecisions' in sent || isAutoGate(gate);
    if (autoRun === null) autoRun = sendsAuto;
    if (autoRun) {
      if (!Array.isArray(sent.autoDecisions)) fail('every report of an auto-run sends autoDecisions');
      else {
        if (JSON.stringify(sent.autoDecisions.slice(0, decisions.length)) !== JSON.stringify(decisions)) fail('autoDecisions is the run\'s whole list, in order, never shortened');
        decisions = sent.autoDecisions;
      }
      if (sent.questions.length) fail('auto-run never reports a question: it takes the ★');
      if (gate && !isAutoGate(gate)) fail('every gate of an auto-run is stamped auto');
    } else if (sendsAuto) fail('a step-by-step run never sends autoDecisions or a gate stamped auto');

    const openGate = gate && !isAutoGate(gate);
    if (sent.sessionEnded && (openGate || sent.questions.length)) fail('a session ends with nothing open');
    if (isString(sent.halted)) {
      if (sent.sessionEnded !== true) fail('halted comes with sessionEnded: true');
      if (gate || sent.questions.length) fail('halted is never sent with a gate or a question');
      if (sent.developmentComplete === true) fail('halted never comes with developmentComplete');
      if (/[\n`*]/.test(sent.halted) || !/\bthen Continue(?: in auto-run)?\.?$/.test(sent.halted)) fail('halted is one plain sentence that ends on "then Continue"');
      if (!isString(sent.commitRead)) fail('a halted report names the commit it read at');
      if (!rows.some((row) => (row.notes || []).some((note) => note.label === 'Stopped'))) fail('a halt keeps its reason in a Stopped note on its row');
    }
    if (sent.developmentComplete) {
      if (completed) fail('developmentComplete is sent once');
      completed = true;
      if (rows.some((row) => row.state.label !== 'done')) fail('developmentComplete comes once every stage and the feature review are done');
      if (sent.questions.length) fail('developmentComplete comes with no question open');
      if (!sent.sessionEnded) fail("developmentComplete is the session's last report");
    }
    sessionStarts = sent.sessionEnded === true;
  }
  return problems;
}

const stories = ['step', 'auto'].map((story) => ({ story, files: storyFiles(story) }));
for (const { story, files } of stories) {
  const problems = replay(files);
  report('fixtures', `the ${story} story conforms to the development-run guide`, problems.length === 0, problems.join('\n'));
}

const every = stories.flatMap(({ files }) => files);
const covers = (what, predicate) => report('fixtures', `a fixture shows ${what}`, every.some(({ report: sent }) => predicate(sent)));
const gateRow = (sent) => sent.gate && rowOf(sent.gate.documentKey);
covers('a step-by-step stage gate with its Safe to stop note', (sent) => sent.gate && !isAutoGate(sent.gate) && isStage(gateRow(sent)) &&
  sent.documents.some((row) => row.key === sent.gate.documentKey && (row.notes || []).some((note) => note.label === 'Safe to stop')));
covers('a request-changes rework under the next revision, in a full snapshot', (sent) => sent.gate && isStage(gateRow(sent)) && revisionOf(sent.gate.documentKey) > 1 && sent.onlyWhatChanged === false && !sent.sessionEnded);
covers('a stage approved and committed, ending the session', (sent) => sent.sessionEnded && !sent.gate && sent.documents.some((row) => isStage(rowOf(row.key)) && row.state.label === 'done'));
covers('a question during a stage, blocking it', (sent) => sent.questions.some((question) => question.id.startsWith('stage-') && question.blocks.includes(question.documentKey)));
covers('Stop here: the stage stopped here, its work kept, the session ended', (sent) => sent.sessionEnded && sent.documents.some((row) => row.state.label === 'stopped here'));
covers('the feature review\'s verdict with a needs-eyes question on its row', (sent) => gateRow(sent) === 'feature-review' && !isAutoGate(sent.gate) &&
  sent.questions.some((question) => question.documentKey === sent.gate.documentKey));
covers('developmentComplete in a step-by-step run', (sent) => sent.developmentComplete === true && !('autoDecisions' in sent));
covers('an auto-run checkpoint stamped auto with autoDecisions', (sent) => isAutoGate(sent.gate) && isStage(gateRow(sent)) && sent.autoDecisions.length > 0);
covers('a halt with its reason, in auto-run', (sent) => isString(sent.halted) && Array.isArray(sent.autoDecisions));
covers('an auto-run finished: the review closed stamped auto with developmentComplete', (sent) => isAutoGate(sent.gate) && gateRow(sent) === 'feature-review' && sent.developmentComplete === true);

{
  const step = storyFiles('step');
  const auto = storyFiles('auto');
  const swap = (files, suffix, change) => files.map((file) => file.name.endsWith(suffix) ? { ...file, report: change(file.report) } : file);
  const caught = (files, phrase) => replay(files).some((problem) => problem.includes(phrase));
  report('checker', 'catches an approve labelled other than "Approve Stage n"',
    caught(swap(step, '01-stage-1-gate.json', (sent) => ({ ...sent, gate: { ...sent.gate, actions: sent.gate.actions.map((action) => action.id === 'approve' ? { ...action, label: 'Approve' } : action) } })), 'offers exactly'));
  report('checker', 'catches a stage gate without its Safe to stop note',
    caught(swap(step, '01-stage-1-gate.json', (sent) => ({ ...sent, documents: sent.documents.map((row) => ({ ...row, notes: undefined })) })), 'Safe to stop'));
  report('checker', 'catches a reworked checkpoint sent under the same key',
    caught(swap(step, '02-stage-1-reworked.json', (sent) => ({ ...sent, documents: sent.documents.map((row) => row.key === 'stage-1@2' ? { ...row, key: 'stage-1@1' } : row), gate: { ...sent.gate, documentKey: 'stage-1@1' } })), 'next revision'));
  report('checker', 'catches a checkpoint brought back after Stop here under the same key',
    caught(swap(step, '07-stage-2-back.json', (sent) => ({ ...sent, documents: sent.documents.map((row) => row.key === 'stage-2@2' ? { ...row, key: 'stage-2@1' } : row), gate: { ...sent.gate, documentKey: 'stage-2@1' } })), 'after Stop here'));
  report('checker', 'catches a stage report missing one of its six sections',
    caught(swap(step, '01-stage-1-gate.json', (sent) => ({ ...sent, gate: { ...sent.gate, detail: { ...sent.gate.detail, panes: sent.gate.detail.panes.map((pane) => ({ ...pane, body: pane.body.replace('## Profile updates', '## Profile') })) } } })), 'six sections'));
  report('checker', 'catches developmentComplete before the feature review is done',
    caught(swap(step, '08-stage-2-approved.json', (sent) => ({ ...sent, developmentComplete: true })), 'stage and the feature review are done'));
  report('checker', 'catches a push question',
    caught(swap(step, '04-stage-2-question.json', (sent) => ({ ...sent, questions: [...sent.questions, { ...sent.questions[0], id: 'push' }] })), 'never asks to push'));
  report('checker', 'catches a gate stamped auto that still offers actions',
    caught(swap(auto, '01-stage-1-auto.json', (sent) => ({ ...sent, gate: { ...sent.gate, actions: step[0].report.gate.actions } })), 'asks for no decision'));
  report('checker', 'catches autoDecisions shortened between reports',
    caught(swap(auto, '03-stage-2-auto.json', (sent) => ({ ...sent, autoDecisions: sent.autoDecisions.slice(1) })), 'never shortened'));
  report('checker', 'catches a question reported in auto-run',
    caught(swap(auto, '03-stage-2-auto.json', (sent) => ({ ...sent, questions: step[3].report.questions.map((question) => ({ ...question, documentKey: 'stage-2@1', blocks: ['stage-2@1'] })) })), 'never reports a question'));
  report('checker', 'catches a halt sent with a gate',
    caught(swap(auto, '02-halted.json', (sent) => ({ ...sent, gate: auto[0].report.gate })), 'never sent with a gate'));
  report('checker', 'catches a halt that does not end the session',
    caught(swap(auto, '02-halted.json', (sent) => { const { sessionEnded: _ended, ...rest } = sent; return rest; }), 'halted comes with sessionEnded'));
  report('checker', 'catches a step-by-step run sending autoDecisions',
    caught(swap(step, '03-stage-1-approved.json', (sent) => ({ ...sent, autoDecisions: [] })), 'never sends autoDecisions'));
}

{
  const guide = fs.readFileSync(GUIDE, 'utf8');
  const minimum = (/ships in alpha-sdlc \*\*(\d+\.\d+\.\d+)\*\*/.exec(guide) || [])[1];
  const version = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  const parts = (value) => String(value).split('.').map(Number);
  const atLeast = (value, floor) => {
    const [a, b] = [parts(value), parts(floor)];
    for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] > b[index];
    return true;
  };
  report('version', 'the guide names the minimum plugin version it ships in', Boolean(minimum), guide.slice(0, 200));
  report('version', 'plugin.json is at or above that minimum', /^\d+\.\d+\.\d+$/.test(version) && minimum && atLeast(version, minimum), version);
  const readme = fs.readFileSync(path.join(pluginRoot, 'README.md'), 'utf8');
  report('version', 'the release notes publish the minimum', Boolean(minimum) && readme.includes(`From ${minimum} \`do-development\``));
  report('version', 'every fixture reports a version at or above the minimum', every.every(({ report: sent }) => minimum && atLeast(sent.pluginVersion, minimum)));
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'do-development', 'SKILL.md'), 'utf8');
  report('skill', 'do-development reads the guide under a development-run schema', /development-run schema \(`--json-schema`\), read\s+`development-run-schema\.md` before the first report/.test(skill));
  const sections = ['## Version', '## The session', '## Rows', '## The gate', '## Questions', '## Decisions on stdin', '## Auto-run', '## The end'];
  report('guide', 'the guide holds the sections the planning and grooming guides hold, and auto-run', sections.every((heading) => guide.includes(`\n${heading}\n`)));
  report('guide', 'the guide names the auto-run marker, its unit scope and that it is never committed',
    guide.includes('`.alpha-sdlc/auto-run.json`') && guide.includes('"scope": "unit"') && /never committed/.test(guide));
  report('guide', 'the guide declines auto-run where the Org settings do not permit it', /declined/.test(guide) && guide.includes('autoRunPermitted: true'));
}

{
  const mirror = (settings) => sdlcProject(`mirror-${Object.keys(settings).join('-') || 'empty'}-${Math.random().toString(36).slice(2, 8)}`,
    { 'docs/basics/.alpha-sdlc.json': JSON.stringify(settings) });
  const written = mirror({
    developmentCommands: ['make test', 'go test', 'make build'],
    developmentCommandsDecidedAt: '2026-10-28',
    autoRunCommands: ['make up', 'make seed'],
    autoRunCommandsDecidedAt: '2026-10-28',
  });
  const ok = runScript('check-run-commands.js', [written]);
  report('setup', 'developmentCommands and autoRunCommands written with their decision dates pass',
    ok.exitCode === 0 && /ok: developmentCommands — 3 command\(s\) · decided 2026-10-28/.test(ok.stdout) && /ok: autoRunCommands — 2 command\(s\)/.test(ok.stdout), ok.stdout + ok.stderr);
  const bare = runScript('check-run-commands.js', [mirror({ developmentCommands: ['make test', 'node'], developmentCommandsDecidedAt: '2026-10-28' })]);
  report('setup', 'a bare interpreter entry is refused', bare.exitCode === 1 && /refused: developmentCommands\[1\] "node" — a bare interpreter or build tool/.test(bare.stdout), bare.stdout);
  const evaluated = runScript('check-run-commands.js', ['--entry', 'bash -c']);
  const runner = runScript('check-run-commands.js', ['--entry', 'npm run']);
  const chained = runScript('check-run-commands.js', ['--entry', 'make test && rm -rf build']);
  const named = runScript('check-run-commands.js', ['--entry', 'npm run test:unit']);
  report('setup', 'an entry that runs whatever follows, names no target or chains a shell operator is refused; a named target passes',
    evaluated.exitCode === 1 && runner.exitCode === 1 && chained.exitCode === 1 && named.exitCode === 0, [evaluated.stdout, runner.stdout, chained.stdout, named.stdout].join(''));
  const undated = runScript('check-run-commands.js', [mirror({ developmentCommands: ['make test'] })]);
  report('setup', 'a list without its decision date is refused', undated.exitCode === 1 && /no developmentCommandsDecidedAt date/.test(undated.stdout), undated.stdout);
  const decidedOn = runScript('check-run-commands.js', [mirror({ developmentCommands: ['make test'], decidedOn: { developmentCommands: '2026-10-28' } })]);
  report('setup', 'a mirror that keeps its dates in decidedOn is read there', decidedOn.exitCode === 0, decidedOn.stdout);
  const missing = runScript('check-run-commands.js', [mirror({ plainLanguage: 'id' })]);
  report('setup', 'a mirror with no developmentCommands is refused, and no autoRunCommands is only noted',
    missing.exitCode === 1 && /refused: developmentCommands — not recorded/.test(missing.stdout) && /none: autoRunCommands/.test(missing.stdout), missing.stdout);
  const unreadable = runScript('check-run-commands.js', [sdlcProject('no-mirror', {})]);
  report('setup', 'an unreadable mirror exits 2', unreadable.exitCode === 2, unreadable.stdout);
  const template = fs.readFileSync(path.join(pluginRoot, 'skills', 'do-project-setup', 'templates', '01-overview.md'), 'utf8');
  const setupSkill = fs.readFileSync(path.join(pluginRoot, 'skills', 'do-project-setup', 'SKILL.md'), 'utf8');
  report('setup', 'do-project-setup decides both lists with their keys, dates and the named-entry rule',
    ['`developmentCommandsDecidedAt`', '`autoRunCommandsDecidedAt`', 'never a bare interpreter or build tool', 'check-run-commands.js'].every((text) => template.includes(text)) &&
    setupSkill.includes('`development-commands`') && setupSkill.includes('`auto-run-commands`'));
  const refresh = fs.readFileSync(path.join(pluginRoot, 'skills', 'do-project-setup', 'refresh.md'), 'utf8');
  report('setup', 'refresh mode decides a missing list and offers a changed one as a reversal', refresh.includes('`developmentCommands`') && /reversal/.test(refresh));
}

finish();
