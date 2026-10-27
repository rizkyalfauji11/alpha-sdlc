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
const DESIGN_QUESTION = /^Do you have a design for the screen “[^”]+”\?$/;
const DRAFT_PATH = /^design\/[A-Za-z0-9._-]+\.html$/;

const isString = (value) => typeof value === 'string';
const isInteger = (value) => Number.isInteger(value);
const rowIdOf = (key) => key.slice(0, key.lastIndexOf('@'));
const isRowId = (id) => SECTION_ID.test(id) || SCREEN_ROW_ID.test(id);
const isBlock = (block) => block && isString(block.label) && isString(block.text);

function groupFor(id, group) {
  if (!id.includes('/')) return /^TRD(?:-[A-Za-z0-9-]+)?\.md$/.test(group || '');
  const [screen, part] = id.split('/');
  if (part === 'draft') return group === `design/${screen}.html`;
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
  if ('halted' in report) need(isString(report.halted) && report.halted.trim().length > 0, 'halted is a non-empty string');
  return problems;
}

function expectedTrend(rounds, index) {
  if (rounds[index].findings === 0) return 'clean';
  if (index === 0) return 'first';
  const before = rounds[index - 1].findings;
  if (rounds[index].findings < before) return 'falling';
  return rounds[index].findings === before ? 'flat' : 'rising';
}

function haltProblems(report, halt, sessionStarts, rows) {
  if (!isString(report.halted)) return [];
  const problems = [];
  const need = (ok, what) => { if (!ok) problems.push(what); };
  need(report.sessionEnded === true, 'halted comes with sessionEnded: true');
  need(!report.gate && !report.questions.length, 'halted is never sent with a gate or a question open');
  need(report.trdComplete !== true, 'halted never comes with trdComplete');
  need(!/[\n`*]/.test(report.halted) && /\bthen Continue\.?$/.test(report.halted), 'halted is one plain sentence that ends on "then Continue"');
  need(isString(report.commitRead), 'a halted report names the commit it read at');
  if (halt && sessionStarts && report.halted === halt.text) {
    need(report.onlyWhatChanged !== true && report.commitRead === halt.commitRead && JSON.stringify(rows) === halt.rows,
      'a halt sent again at the next session\'s start is the same report, whole, at the same commitRead');
  }
  return problems;
}

function replay(files) {
  const problems = [];
  let mirror = new Map();
  let halt = null;
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
      const drafted = rowIdOf(gate.documentKey).endsWith('/draft');
      if (!drafted && 'draft' in gate) fail('draft is sent only on a design draft\'s gate');
      if (drafted) {
        const screen = rowIdOf(gate.documentKey).split('/')[0];
        const draftPath = (gate.draft || {}).path;
        if (!DRAFT_PATH.test(draftPath || '') || draftPath !== `design/${screen}.html`) fail(`a draft's gate names its draft, design/${screen}.html`);
      }
    }

    for (const question of report.questions) {
      if (!QUESTION_ID.test(question.id)) fail(`question id ${question.id} is <row id>:<what it asks>`);
      if (answered.has(question.id)) fail(`question id ${question.id} was answered before and is never reused`);
      if (!mirror.has(question.documentKey)) fail(`question ${question.id} sits on a row's current key`);
      if (question.blocks.some((key) => !mirror.has(key))) fail(`question ${question.id} blocks only current row keys`);
      if (!question.evidence) fail(`question ${question.id} carries evidence`);
      if (![...question.options, ...question.actions].some((choice) => choice.requiresReason)) fail(`question ${question.id} offers a way out that requires a reason`);
      if (!RFC3339.test(question.askedAt || '')) fail(`question ${question.id} has an RFC 3339 askedAt`);
      if (/^design:/.test(question.id)) {
        const [draft, figma] = question.options;
        if (!DESIGN_QUESTION.test(question.title)) fail(`question ${question.id} reads "Do you have a design for the screen “<screen>”?"`);
        if (question.options.map((option) => option.id).join('|') !== 'draft|figma') fail(`question ${question.id} offers draft then figma`);
        else if (draft.label !== 'Claude drafts it' || !draft.recommended || draft.requiresReason ||
          figma.label !== 'I have a Figma link' || figma.recommended || !figma.requiresReason) {
          fail(`question ${question.id}: "Claude drafts it" recommended, "I have a Figma link" requiring the link`);
        }
      }
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
    for (const problem of haltProblems(report, halt, sessionStarts, [...mirror.values()])) fail(problem);
    if (isString(report.halted)) halt = { text: report.halted, commitRead: report.commitRead, rows: JSON.stringify([...mirror.values()]) };
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

const stories = ['hub', 'platform', 'draft', 'review', 'review-fallback', 'halted', 'add-platform', 'add-platform-fallback']
  .map((story) => ({ story, files: storyFiles(story) }));
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
covers("every screen's design question in one report", (sent) => sent.questions.filter((question) => /^design:/.test(question.id)).length > 1);
covers("a draft's gate naming its draft", (sent) => sent.gate && rowIdOf(sent.gate.documentKey).endsWith('/draft') && sent.gate.draft);
covers('a redrawn draft shown again under its next revision', (sent) => sent.onlyWhatChanged === false && sent.gate &&
  rowIdOf(sent.gate.documentKey).endsWith('/draft') && revisionOf(sent.gate.documentKey) > 1);
covers('a row being fixed while its fix waits on an answer', (sent) => sent.documents.some((row) => row.state.label === 'being fixed') && sent.questions.length > 0);
const reviewRow = (sent) => sent.documents.find((row) => rowIdOf(row.key) === 'grooming-review');
const noted = (row, label) => Boolean(row) && (row.notes || []).some((note) => note.label === label);
covers("the grooming review's row added to the hub's run once it reaches every spoke", (sent) => noted(reviewRow(sent), 'Reaches every spoke') &&
  reviewRow(sent).state.label === 'being fixed');
covers("the grooming review's verdict gate with its needs-eyes and hub-change questions", (sent) => sent.gate && sent.gate.documentKey.startsWith('grooming-review@') &&
  sent.questions.some((question) => question.id === 'grooming-review:hub-change') && sent.questions.length > 1 &&
  sent.questions.every((question) => question.blocks.includes(sent.gate.documentKey)));
covers('the push of every clone the review wrote, asked on its row', (sent) => sent.questions.some((question) => question.id === 'push' &&
  question.documentKey.startsWith('grooming-review@') && question.evidence.groups.length > 1));
covers('a review that falls back to a terminal, nothing written and nothing open', (sent) => noted(reviewRow(sent), 'Runs from a terminal') &&
  reviewRow(sent).state.label === 'pending' && sent.sessionEnded === true && !sent.gate && !sent.questions.length && sent.trdComplete !== true);
covers('a review sent to a terminal halting the run, its note kept', (sent) => isString(sent.halted) && sent.sessionEnded === true &&
  noted(reviewRow(sent), 'Runs from a terminal'));
covers('a halt sent again, whole, at the next session\'s start', (sent) => isString(sent.halted) && sent.onlyWhatChanged === false &&
  every.filter(({ report: other }) => other.halted === sent.halted).length > 1);
covers("Add a platform re-walking the spokes in its run", (sent) => sent.documents.some((row) => noted(row, 'Spokes re-walked')));
covers("Add a platform sending the spokes' re-walk to a terminal and pushing the hub alone", (sent) =>
  sent.documents.some((row) => noted(row, 'Spokes re-walk from a terminal')) && sent.questions.some((question) => question.id === 'push' &&
  question.evidence.groups.length === 1));

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
  const draftStory = storyFiles('draft');
  const changed = (name, change) => draftStory.map((file) => file.name.endsWith(name) ? { ...file, report: change(JSON.parse(JSON.stringify(file.report))) } : file);
  report('checker', 'catches draft on a gate that is not a draft\'s',
    replay(changed('03-widget-spec-gate.json', (sent) => ({ ...sent, gate: { ...sent.gate, draft: { path: 'design/reminder-list.html' } } })))
      .some((problem) => problem.includes('draft is sent only on a design draft')));
  report('checker', 'catches a draft\'s gate without its draft',
    replay(changed('04-draft-gate.json', (sent) => { delete sent.gate.draft; return sent; })).some((problem) => problem.includes('names its draft')));
  report('checker', 'catches a draft path that is not the screen\'s',
    replay(changed('04-draft-gate.json', (sent) => ({ ...sent, gate: { ...sent.gate, draft: { path: '../design/reminder-list.html' } } })))
      .some((problem) => problem.includes('names its draft')));
  report('checker', 'catches the design question worded with straight quotes',
    replay(changed('01-design-questions.json', (sent) => { sent.questions[0].title = 'Do you have a design for the screen "Reminder list"?'; return sent; }))
      .some((problem) => problem.includes('reads "Do you have a design')));
  const reviewStory = storyFiles('review');
  const reviewChanged = (name, change) => reviewStory.map((file) => file.name.endsWith(name) ? { ...file, report: change(JSON.parse(JSON.stringify(file.report))) } : file);
  report('checker', 'catches trdComplete while the review\'s verdict questions are open',
    replay(reviewChanged('02-verdict-gate.json', (sent) => ({ ...sent, trdComplete: true }))).some((problem) => problem.includes('trdComplete is never sent while a blocking question is open')));
  report('checker', 'catches a verdict gate whose approve does not name the review',
    replay(reviewChanged('02-verdict-gate.json', (sent) => { sent.gate.actions[0].label = 'Approve the verdict'; return sent; }))
      .some((problem) => problem.includes('approve reads "Approve Grooming review"')));
  report('checker', 'catches a fallback report that leaves a question open as the session ends',
    replay(storyFiles('review-fallback').map((file) => ({ ...file, report: { ...file.report, questions: reviewStory[1].report.questions } })))
      .some((problem) => problem.includes('a session ends with nothing open')));
  const halted = storyFiles('halted');
  const haltChanged = (name, change) => halted.map((file) => file.name.endsWith(name) ? { ...file, report: change(JSON.parse(JSON.stringify(file.report))) } : file);
  report('checker', 'catches a halt sent with a gate open',
    replay(haltChanged('01-review-runs-from-a-terminal.json', (sent) => ({ ...sent, sessionEnded: false, gate: reviewStory[1].report.gate })))
      .some((problem) => problem.includes('never sent with a gate or a question')));
  report('checker', 'catches a halt sent with trdComplete',
    replay(haltChanged('01-review-runs-from-a-terminal.json', (sent) => ({ ...sent, trdComplete: true }))).some((problem) => problem.includes('never comes with trdComplete')));
  report('checker', 'catches a halt sent again with its rows changed',
    replay(haltChanged('02-halt-unchanged.json', (sent) => { sent.documents[0].notes = [{ label: 'Stopped', text: 'another' }]; return sent; }))
      .some((problem) => problem.includes('same report, whole')));
  report('checker', 'catches a design question whose draft option is renamed',
    replay(changed('01-design-questions.json', (sent) => { sent.questions[0].options[0].id = 'claude'; return sent; }))
      .some((problem) => problem.includes('offers draft then figma')));
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
  const haltMinimum = (/`halted` needs (\d+\.\d+\.\d+)/.exec(guide) || [])[1];
  report('version', 'the guide names the version halted needs, and every halted fixture reports it',
    Boolean(haltMinimum) && atLeast(version, haltMinimum) && every.filter(({ report: sent }) => 'halted' in sent).every(({ report: sent }) => atLeast(sent.pluginVersion, haltMinimum)));
  const review = fs.readFileSync(path.join(pluginRoot, 'skills', 'do-grooming', 'grooming-run-review.md'), 'utf8');
  report('skill', 'the guide and the review fallback point a halt at the shared halt file', guide.includes('`run-halt.md`') && review.includes('`run-halt.md`') &&
    /then `halted`, `sessionEnded: true`/.test(review.replace(/\s+/g, ' ')));
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'do-grooming', 'SKILL.md'), 'utf8');
  report('skill', 'do-grooming reads the guide under a grooming-run schema', /grooming-run schema \(`--json-schema`\), read\s+`grooming-run-schema\.md` before the first report/.test(skill));
}

finish();
