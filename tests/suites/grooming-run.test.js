#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createSuite, pluginRoot } = require('../lib/harness');

const suite = createSuite('grooming-run');
const { report, finish } = suite;

const FIXTURES = path.join(pluginRoot, 'tests', 'fixtures', 'grooming-run');
const GUIDE = path.join(pluginRoot, 'skills', 'do-grooming', 'grooming-run-schema.md');
const SECTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCREEN_ROW_ID = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*$/;
const QUESTION_ID = /^(?:push(?::refused)?|[A-Za-z0-9./-]+:[a-z0-9-]+)(?:-\d+)?$/;
const SECTION_NUMBER = /§\s*\d|(?:^|\s)\d+\.\s|\bsection \d/i;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const TONES = ['neutral', 'progress', 'attention', 'blocked', 'done', 'skipped'];
const VOCABULARY = { pending: false, 'waiting on you': false, 'being fixed': false, approved: true };
const GATE_ACTIONS = ['approve', 'approve-with-edits', 'regenerate'];

const isString = (value) => typeof value === 'string';
const isInteger = (value) => Number.isInteger(value);
const rowIdOf = (key) => key.slice(0, key.lastIndexOf('@'));
const isRowId = (id) => SECTION_ID.test(id) || SCREEN_ROW_ID.test(id);
const isBlock = (block) => block && isString(block.label) && isString(block.text);

function groupFor(id, group) {
  if (!id.includes('/')) return /^TRD(?:-[A-Za-z0-9-]+)?\.md$/.test(group || '');
  const [screen, part] = id.split('/');
  return group === (part === 'widget-spec' ? `widget-spec/${screen}.md` : `section-slicing/${screen}.md`);
}
const revisionOf = (key) => Number(key.slice(key.lastIndexOf('@') + 1));

function storyFiles(story) {
  const directory = path.join(FIXTURES, story);
  return fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort()
    .map((name) => ({ name: `${story}/${name}`, report: JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) }));
}

function evidenceIsWhole(evidence) {
  return evidence === null || evidence === undefined || (isString(evidence.caption) && Array.isArray(evidence.groups) &&
    evidence.groups.every((group) => Array.isArray(group.rows) && group.rows.every((row) => isString(row.label) && Array.isArray(row.lines))));
}

function shapeProblems(report) {
  const problems = [];
  const need = (ok, what) => { if (!ok) problems.push(what); };
  need(isString(report.pluginVersion) && report.pluginVersion.length >= 1 && report.pluginVersion.length <= 64, 'pluginVersion is a 1–64 character string');
  need(report.step && isInteger(report.step.ordinal) && isInteger(report.step.total), 'step has integer ordinal and total');
  need(Array.isArray(report.states) && Array.isArray(report.documents) && Array.isArray(report.questions), 'states, documents and questions are arrays');
  for (const entry of report.states || []) {
    need(isString(entry.label) && typeof entry.settled === 'boolean' && TONES.includes(entry.tone) && isString(entry.description) && isString(entry.unsticks),
      `state ${JSON.stringify(entry.label)} has label, settled, a known tone, description and unsticks`);
  }
  for (const row of report.documents || []) {
    need(isString(row.key) && isInteger(row.ordinal) && isString(row.name) && isString(row.description) && row.state && isString(row.state.label),
      `row ${row.key} has key, ordinal, name, description and state`);
  }
  for (const question of report.questions || []) {
    need(['id', 'documentKey', 'title'].every((field) => isString(question[field])) &&
      ['options', 'consequences', 'actions', 'blocks'].every((field) => Array.isArray(question[field])) && 'summary' in question,
    `question ${question.id} has every required field`);
    need(question.summary === null || (Array.isArray(question.summary.blocks) && question.summary.blocks.every(isBlock) && isString(question.summary.needFromYou)),
      `question ${question.id}'s summary is {blocks, needFromYou}`);
    need((question.options || []).every((option) => ['id', 'label', 'why', 'trade'].every((field) => isString(option[field])) &&
      typeof option.recommended === 'boolean' && typeof option.requiresReason === 'boolean'), `question ${question.id}'s options are whole`);
    need((question.options || []).filter((option) => option.recommended).length === 1, `question ${question.id} recommends one option`);
    need(evidenceIsWhole(question.evidence), `question ${question.id}'s evidence is {caption, groups[{rows[{label, lines}]}]}`);
    need((question.notes || []).every(isBlock), `question ${question.id}'s notes are {label, text}`);
  }
  if (report.gate) {
    need(['documentKey', 'statusLabel', 'stampLine'].every((field) => isString(report.gate[field])) && report.gate.summary &&
      Array.isArray(report.gate.consequences) && Array.isArray(report.gate.actions), 'the gate has every required field');
    need(report.gate.summary && Array.isArray(report.gate.summary.blocks) && report.gate.summary.blocks.every(isBlock) && isString(report.gate.summary.needFromYou),
      "the gate's summary is {blocks, needFromYou}");
    need(report.gate.detail === null || (isString(report.gate.detail.caption) && Array.isArray(report.gate.detail.panes) &&
      report.gate.detail.panes.every((pane) => isString(pane.label) && isString(pane.note) && typeof pane.editable === 'boolean')), "the gate's panes are whole");
    need(evidenceIsWhole(report.gate.evidence), "the gate's evidence is whole");
    need(report.gate.actions.every((action) => ['id', 'label', 'role'].every((field) => isString(action[field])) &&
      typeof action.requiresReason === 'boolean' && typeof action.requiresBody === 'boolean'), "the gate's actions are whole");
  }
  if ('reviewRounds' in report) {
    need(Array.isArray(report.reviewRounds) && report.reviewRounds.every((round) => isInteger(round.round) && round.round >= 1 &&
      isInteger(round.findings) && round.findings >= 0 && isString(round.trend)), 'reviewRounds items are {round ≥ 1, findings ≥ 0, trend}');
  }
  for (const flag of ['trdComplete', 'sessionEnded', 'onlyWhatChanged']) {
    if (flag in report) need(typeof report[flag] === 'boolean', `${flag} is a boolean`);
  }
  return problems;
}

function expectedTrend(rounds, index) {
  if (rounds[index].findings === 0) return 'clean';
  if (index === 0) return 'first';
  const before = rounds[index - 1].findings;
  if (rounds[index].findings < before) return 'falling';
  return rounds[index].findings === before ? 'flat' : 'rising';
}

function replay(files) {
  const problems = [];
  let mirror = new Map();
  let rounds = null;
  let sessionStarts = true;
  const answered = new Set();
  const askedAt = new Map();
  let open = [];
  let completed = false;
  for (const { name, report } of files) {
    const fail = (what) => problems.push(`${name}: ${what}`);
    for (const problem of shapeProblems(report)) fail(problem);
    const isFull = report.onlyWhatChanged !== true;
    const keys = report.documents.map((row) => row.key);
    const ordinals = report.documents.map((row) => row.ordinal);

    if (keys.some((key) => !/@[1-9]\d*$/.test(key) || !isRowId(rowIdOf(key)))) fail('every row key is <id>@<revision>');
    for (const row of report.documents) if (!groupFor(rowIdOf(row.key), row.group)) fail(`row ${row.key}'s group is the file it writes`);
    for (const row of report.documents) for (const note of row.notes || []) if (!isBlock(note)) fail(`row ${row.key}'s notes are {label, text}`);
    if (new Set(keys.map(rowIdOf)).size !== keys.length) fail('a report names each row once');
    if (ordinals.some((ordinal, index) => index > 0 && ordinal <= ordinals[index - 1])) fail('rows are sent in ascending ordinal');
    for (const row of report.documents) {
      if ((rowIdOf(row.key) === 'outline') !== (row.name === 'Outline')) fail(`only the outline row is named "Outline" (${row.key})`);
      if (!(row.state.label in VOCABULARY) || row.state.settled !== VOCABULARY[row.state.label]) fail(`row ${row.key} holds a state of the vocabulary, only approved settled`);
    }

    const rekeyed = [...mirror.keys()].filter((key) => keys.some((next) => rowIdOf(next) === rowIdOf(key) && next !== key));
    if (rekeyed.length && !isFull) fail(`re-keys ${rekeyed.join(', ')} in a partial report, which can never remove the old key`);
    const outlineDropped = [...mirror.keys()].some((key) => rowIdOf(key) === 'outline') && keys.length > 0 &&
      !keys.some((key) => rowIdOf(key) === 'outline');
    if (outlineDropped && !isFull) fail('drops the Outline row in a partial report');
    if (sessionStarts && !isFull) fail("the session's first report is whole");
    if (!sessionStarts && isFull && !rekeyed.length && !outlineDropped) fail('a later report in a session sends only what changed');

    if (isFull) {
      const labels = report.states.map((entry) => entry.label).sort();
      if (labels.join('|') !== Object.keys(VOCABULARY).sort().join('|')) fail('a full report carries the whole state vocabulary');
      mirror = new Map(report.documents.map((row) => [row.key, row]));
    } else {
      if (report.states.length) fail('a partial report sends states: []');
      for (const row of report.documents) mirror.set(row.key, row);
    }
    const mirrorIds = [...mirror.keys()].map(rowIdOf);
    if (new Set(mirrorIds).size !== mirrorIds.length) fail('the mirror holds one key per row');
    if (mirrorIds.includes('outline') && mirrorIds.length > 1) fail('the Outline row exists only while the outline is not yet approved');
    if (report.step.ordinal < 1 || report.step.ordinal > report.step.total || report.step.total !== mirror.size) fail('step is the row the run is on, out of the row count');

    const gate = report.gate;
    if (gate) {
      const row = mirror.get(gate.documentKey);
      if (!row) fail(`the gate's key ${gate.documentKey} is a row's current key`);
      else {
        const expected = rowIdOf(row.key) === 'outline' ? `${row.group} · outline` : `${row.group} · ${row.name}`;
        if (gate.stampLine !== expected) fail(`stampLine reads "${expected}"`);
        if (row.state.label !== 'waiting on you') fail('the gated row reads "waiting on you"');
        const approveLabel = rowIdOf(row.key) === 'outline' ? 'Approve the outline' : `Approve ${row.name}`;
        if ((gate.actions.find((action) => action.id === 'approve') || {}).label !== approveLabel) fail(`approve reads "${approveLabel}"`);
      }
      if (gate.statusLabel !== 'waiting on you') fail('statusLabel reads "waiting on you"');
      if (gate.consequences.length !== 2) fail('the gate carries two consequence lines');
      if (SECTION_NUMBER.test(gate.stampLine) || gate.actions.some((action) => SECTION_NUMBER.test(action.label))) fail('neither stampLine nor an action label names a section number');
      const byId = Object.fromEntries(gate.actions.map((action) => [action.id, action]));
      if (gate.actions.map((action) => action.id).sort().join('|') !== [...GATE_ACTIONS].sort().join('|')) fail('the gate offers approve, approve-with-edits and regenerate');
      if (gate.actions.filter((action) => action.role === 'primary').length !== 1 || (byId.approve || {}).role !== 'primary') fail('approve is the one primary action');
      if (!(byId['approve-with-edits'] || {}).requiresBody || !((gate.detail || {}).panes || []).some((pane) => pane.editable && isString(pane.body))) fail('approve-with-edits needs a body and an editable pane holding the proposal');
      if (!(byId.regenerate || {}).requiresReason) fail('regenerate needs the feedback as its reason');
    }

    for (const question of report.questions) {
      if (!QUESTION_ID.test(question.id)) fail(`question id ${question.id} is <row id>:<what it asks>`);
      if (answered.has(question.id)) fail(`question id ${question.id} was answered before and is never reused`);
      if (!mirror.has(question.documentKey)) fail(`question ${question.id} sits on a row's current key`);
      if (question.blocks.some((key) => !mirror.has(key))) fail(`question ${question.id} blocks only current row keys`);
      if (!question.evidence) fail(`question ${question.id} carries evidence`);
      if (![...question.options, ...question.actions].some((choice) => choice.requiresReason)) fail(`question ${question.id} offers a way out that requires a reason`);
      if (!RFC3339.test(question.askedAt || '')) fail(`question ${question.id} has an RFC 3339 askedAt`);
      if (askedAt.has(question.id) && askedAt.get(question.id) !== question.askedAt) fail(`question ${question.id} keeps its askedAt`);
      const asked = mirror.get(question.documentKey);
      if (/^push/.test(question.id) && asked && asked.state.label !== 'approved') fail(`the ${question.id} question leaves its row approved`);
      askedAt.set(question.id, question.askedAt);
    }
    const nowOpen = report.questions.map((question) => question.id);
    for (const id of open) if (!nowOpen.includes(id)) answered.add(id);
    open = nowOpen;

    if ('reviewRounds' in report) {
      if (rounds && JSON.stringify(report.reviewRounds.slice(0, rounds.length)) !== JSON.stringify(rounds)) fail('reviewRounds only grows: a later list keeps the rounds sent before');
      rounds = report.reviewRounds;
      rounds.forEach((round, index) => {
        if (round.round !== index + 1) fail('reviewRounds are numbered from 1, oldest first');
        if (round.trend !== expectedTrend(rounds, index)) fail(`round ${round.round}'s trend reads "${expectedTrend(rounds, index)}"`);
      });
    }

    if (report.sessionEnded && (report.gate || report.questions.length)) fail('a session ends with nothing open');
    if (report.trdComplete && completed) fail('trdComplete is sent once');
    if (report.trdComplete) {
      completed = true;
      if (report.questions.some((question) => question.blocks.length)) fail('trdComplete is never sent while a blocking question is open');
      const last = rounds && rounds[rounds.length - 1];
      if (!last || last.trend !== 'clean' || last.findings !== 0) fail("trdComplete waits for the review's last round to be clean");
      if ([...mirror.values()].some((row) => row.state.label !== 'approved')) fail('trdComplete comes after every row is approved');
      if (!report.sessionEnded) fail("trdComplete is the session's last report");
    }
    sessionStarts = report.sessionEnded === true;
  }
  return problems;
}

const stories = ['hub', 'platform'].map((story) => ({ story, files: storyFiles(story) }));
for (const { story, files } of stories) {
  const problems = replay(files);
  report('fixtures', `the ${story} story conforms to the grooming-run guide`, problems.length === 0, problems.join('\n'));
}

const every = stories.flatMap(({ files }) => files);
const covers = (what, predicate) => report('fixtures', `a fixture shows ${what}`, every.some(({ report: sent }) => predicate(sent)));
covers('an open outline gate', (sent) => sent.gate && rowIdOf(sent.gate.documentKey) === 'outline');
covers('the section rows, the Outline row dropped in a full snapshot', (sent) => sent.onlyWhatChanged === false &&
  sent.documents.length > 1 && !sent.documents.some((row) => rowIdOf(row.key) === 'outline'));
covers('a re-keyed section in a full snapshot', (sent) => sent.onlyWhatChanged === false && sent.gate && revisionOf(sent.gate.documentKey) > 1 &&
  rowIdOf(sent.gate.documentKey) !== 'outline');
covers('a question that blocks its row', (sent) => sent.questions.some((question) => question.blocks.includes(question.documentKey)));
covers('reviewRounds', (sent) => Array.isArray(sent.reviewRounds) && sent.reviewRounds.length > 0);
covers('trdComplete true', (sent) => sent.trdComplete === true);
covers('a refused push', (sent) => sent.questions.some((question) => question.id === 'push:refused'));
covers('the push asked before it runs', (sent) => sent.questions.some((question) => question.id === 'push'));
covers('a session ended at a boundary', (sent) => sent.sessionEnded === true && sent.trdComplete !== true);
covers("a client screen's rows grouped by their own files", (sent) => sent.documents.some((row) => row.group === `widget-spec/${row.key.split('/')[0]}.md`) &&
  sent.documents.some((row) => row.group === `section-slicing/${row.key.split('/')[0]}.md`));
covers('a review fix re-gating its row under the next revision', (sent) => sent.onlyWhatChanged === false && sent.gate &&
  revisionOf(sent.gate.documentKey) > 1 && sent.documents.some((row) => (row.notes || []).some((note) => note.label === 'Fixed by the review')));
covers('a row being fixed while its fix waits on an answer', (sent) => sent.documents.some((row) => row.state.label === 'being fixed') && sent.questions.length > 0);

{
  const files = storyFiles('hub');
  const partialRekey = files.map((file) => file.name.endsWith('07-section-regenerated.json')
    ? { ...file, report: { ...file.report, onlyWhatChanged: true, states: [], documents: file.report.documents.filter((row) => rowIdOf(row.key) === 'system-design') } }
    : file);
  report('checker', 'catches a re-key sent as a partial report', replay(partialRekey).some((problem) => problem.includes('re-keys system-design@1')));
  const numbered = files.map((file) => file.name.endsWith('05-next-session-gate.json')
    ? { ...file, report: { ...file.report, gate: { ...file.report.gate, stampLine: 'TRD.md · 1. Context / scope' } } }
    : file);
  report('checker', 'catches a section number in stampLine', replay(numbered).some((problem) => problem.includes('section number')));
  const early = files.map((file) => file.name.endsWith('09-self-review.json')
    ? { ...file, report: { ...file.report, trdComplete: true, sessionEnded: true, questions: [] } }
    : file);
  report('checker', 'catches trdComplete before the review is clean', replay(early).some((problem) => problem.includes('trdComplete waits')));
  const platform = storyFiles('platform');
  const refused = platform.find((file) => file.name.endsWith('04-push-refused.json')).report.questions[0];
  const askedAgain = [...platform.slice(0, 5), {
    name: 'platform/re-ask.json',
    report: { ...platform.find((file) => file.name.endsWith('03-review-clean-push-question.json')).report, questions: [refused] },
  }];
  report('checker', 'catches an answered push:refused asked again under the same id',
    replay(askedAgain).some((problem) => problem.includes('push:refused was answered before')));
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
  report('version', 'plugin.json is at or above that minimum, plain x.y.z', /^\d+\.\d+\.\d+$/.test(version) && minimum && atLeast(version, minimum), version);
  const readme = fs.readFileSync(path.join(pluginRoot, 'README.md'), 'utf8');
  report('version', 'the release notes publish the minimum', Boolean(minimum) && readme.includes(`From ${minimum}`) && readme.includes('grooming-run'));
  report('version', 'every fixture reports a version at or above the minimum',
    every.every(({ report: sent }) => minimum && atLeast(sent.pluginVersion, minimum)));
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'do-grooming', 'SKILL.md'), 'utf8');
  report('skill', 'do-grooming reads the guide under a grooming-run schema', /grooming-run schema \(`--json-schema`\), read\s+`grooming-run-schema\.md` before the first report/.test(skill));
}

finish();
