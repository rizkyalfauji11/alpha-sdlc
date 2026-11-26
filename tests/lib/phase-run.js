const fs = require('fs');
const path = require('path');
const { haltSentence, haltShapeProblems } = require('./run-halt');

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const TONES = ['neutral', 'progress', 'attention', 'blocked', 'done', 'skipped'];
const AUTO_DECISION_FIELDS = ['askedIn', 'question', 'taken', 'recordedIn'];
const RUN_FLAGS = ['trdComplete', 'reviewRounds', 'planComplete', 'planCoverage', 'developmentComplete', 'testingComplete', 'fixingComplete'];

const isString = (value) => typeof value === 'string';
const isInteger = (value) => Number.isInteger(value);
const rowOf = (key) => key.slice(0, key.lastIndexOf('@'));
const revisionOf = (key) => Number(key.slice(key.lastIndexOf('@') + 1));
const isBlock = (block) => block && isString(block.label) && isString(block.text);
const isAutoGate = (gate) => Boolean(gate) && gate.statusLabel === 'auto';
const hasNote = (row, label) => (row.notes || []).some((note) => note.label === label);

function storyFiles(directory, story) {
  const folder = path.join(directory, story);
  return fs.readdirSync(folder).filter((name) => name.endsWith('.json')).sort()
    .map((name) => ({ name: `${story}/${name}`, report: JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8')) }));
}

function evidenceIsWhole(evidence) {
  return evidence === null || evidence === undefined || (isString(evidence.caption) && Array.isArray(evidence.groups) &&
    evidence.groups.every((group) => Array.isArray(group.rows) && group.rows.every((row) => isString(row.label) && Array.isArray(row.lines))));
}

function shapeProblems(sent, completeFlag) {
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
  for (const flag of [completeFlag, 'sessionEnded', 'onlyWhatChanged']) {
    if (flag in sent) need(typeof sent[flag] === 'boolean', `${flag} is a boolean`);
  }
  if ('halted' in sent) problems.push(...haltShapeProblems(sent.halted));
  if ('autoDecisions' in sent) {
    need(Array.isArray(sent.autoDecisions) && sent.autoDecisions.every((entry) => AUTO_DECISION_FIELDS.every((field) => isString(entry[field]) && entry[field].length > 0)),
      'autoDecisions is a list of {askedIn, question, taken, recordedIn}');
  }
  const foreign = RUN_FLAGS.filter((field) => field !== completeFlag && field in sent);
  need(!foreign.length, `a report of this run sends no other run's fields (${foreign.join(', ')})`);
  return problems;
}

const standardActions = (approve) => [
  { id: 'approve', label: approve, role: 'primary', requiresReason: false, requiresBody: false },
  { id: 'request-changes', label: 'Request changes', role: 'secondary', requiresReason: true, requiresBody: false },
  { id: 'stop', label: 'Stop here', role: 'secondary', requiresReason: false, requiresBody: false },
];

function replayer(config) {
  return function replay(files) {
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
      for (const problem of shapeProblems(sent, config.completeFlag)) fail(problem);
      const isFull = sent.onlyWhatChanged !== true;
      const keys = sent.documents.map((row) => row.key);
      const ordinals = sent.documents.map((row) => row.ordinal);

      if (keys.some((key) => !/@[1-9]\d*$/.test(key) || !config.rowPattern.test(rowOf(key)))) fail(`every row key is <row id>@<revision>, the row id ${config.rowPattern}`);
      if (new Set(keys.map(rowOf)).size !== keys.length) fail('a report names each row once');
      if (ordinals.some((ordinal, index) => index > 0 && ordinal <= ordinals[index - 1])) fail('rows are sent in ascending ordinal');

      const before = new Map([...mirror.values()].map((row) => [rowOf(row.key), row.key]));
      const rekeyed = keys.filter((key) => before.has(rowOf(key)) && before.get(rowOf(key)) !== key);
      const added = keys.filter((key) => mirror.size && !before.has(rowOf(key)));
      if ((rekeyed.length || added.length) && !isFull) fail('a report that re-keys or adds a row is a full snapshot');
      if (sessionStarts && !isFull) fail("the session's first report is whole");
      if (!sessionStarts && isFull && !rekeyed.length && !added.length) fail('a later report in a session sends only what changed');
      if (isFull) {
        const labels = sent.states.map((entry) => entry.label).sort();
        if (labels.join('|') !== Object.keys(config.vocabulary).sort().join('|')) fail('a full report carries the whole state vocabulary');
        mirror = new Map(sent.documents.map((row) => [row.key, row]));
      } else {
        if (sent.states.length) fail('a partial report sends states: []');
        for (const row of sent.documents) {
          for (const key of [...mirror.keys()]) if (rowOf(key) === rowOf(row.key)) mirror.delete(key);
          mirror.set(row.key, row);
        }
      }
      const rows = [...mirror.values()].sort((a, b) => a.ordinal - b.ordinal);
      for (const problem of config.rowProblems(rows, isFull)) fail(problem);
      for (const row of rows) {
        if (!(row.state.label in config.vocabulary) || row.state.settled !== config.vocabulary[row.state.label]) fail(`row ${row.key} holds a state of the vocabulary, its settled flag the vocabulary's`);
      }
      if (sent.step.total !== mirror.size || sent.step.ordinal < 1 || sent.step.ordinal > sent.step.total) fail('step is the row the run is on, out of the row count');

      const gate = sent.gate;
      if (gate) {
        const row = mirror.get(gate.documentKey);
        if (!row) fail(`the gate's key ${gate.documentKey} is a row's current key`);
        else {
          const auto = isAutoGate(gate);
          const expected = config.gate(sent, row, rows);
          if (gate.stampLine !== (auto ? `${expected.stampLine} · auto` : expected.stampLine)) fail(`stampLine reads "${auto ? `${expected.stampLine} · auto` : expected.stampLine}"`);
          const panes = (gate.detail || {}).panes || [];
          const pane = panes[0] || {};
          if (panes.length !== 1 || pane.editable !== false || !isString(pane.body)) fail('the gate carries one pane, not editable, its body the unit');
          if (pane.label !== expected.pane || pane.note !== expected.note) fail(`the pane is "${expected.pane}", its note "${expected.note}"`);
          for (const problem of expected.problems || []) fail(problem);
          if (auto) {
            if (row.state.label !== 'done') fail('a gate stamped auto sits on a done row');
            if (gate.actions.length || gate.consequences.length) fail('a gate stamped auto asks for no decision: no actions, no consequences');
            if (sent.sessionEnded !== true) fail("a gate stamped auto is the session's last report");
          } else {
            if (gate.statusLabel !== 'waiting on you' || row.state.label !== 'waiting on you') fail('a step-by-step gate and its row read "waiting on you"');
            if (JSON.stringify(gate.actions) !== JSON.stringify(standardActions(expected.approve))) fail(`the gate offers exactly ${expected.approve}, Request changes and Stop here`);
            if (expected.consequences && !expected.consequences(gate.consequences)) fail(`the gate's consequences say what ${expected.approve} commits and that nothing is pushed`);
          }
          const id = rowOf(gate.documentKey);
          if (stopped.has(id)) {
            if (revisionOf(gate.documentKey) <= revisionOf(stopped.get(id))) fail(`the gate on ${id} returns after Stop here under its next revision`);
            stopped.delete(id);
          }
          if (lastGate && rowOf(lastGate.documentKey) === id && !auto) {
            const sameKey = lastGate.documentKey === gate.documentKey;
            if (sameKey && JSON.stringify(lastGate.detail) !== JSON.stringify(gate.detail)) fail(`a gate that returns with a new body on ${id} takes the row's next revision`);
            if (!sameKey && revisionOf(gate.documentKey) < revisionOf(lastGate.documentKey)) fail(`${id}'s revision never goes back`);
          }
        }
        lastGate = gate;
      }
      for (const row of sent.documents) {
        if (row.state.label === 'stopped here') {
          if (!hasNote(row, 'Stopped here')) fail(`row ${row.key} stopped here names its kept work in a Stopped here note`);
          if (sent.sessionEnded !== true || sent.gate) fail('Stop here ends the session with no gate');
          stopped.set(rowOf(row.key), row.key);
        }
      }

      for (const question of sent.questions) {
        if (!config.questionPattern.test(question.id)) fail(`question id ${question.id} is <row id>:<what it asks>`);
        if (/(?:^|:)push/.test(question.id)) fail('the run never asks to push');
        if (answered.has(question.id)) fail(`question id ${question.id} was answered before and is never reused`);
        if (!mirror.has(question.documentKey)) fail(`question ${question.id} sits on a row's current key`);
        if (question.blocks.some((key) => !mirror.has(key))) fail(`question ${question.id} blocks only current row keys`);
        if (!question.evidence) fail(`question ${question.id} carries evidence`);
        if (![...question.options, ...question.actions].some((choice) => choice.requiresReason)) fail(`question ${question.id} offers a way out that requires a reason`);
        if (question.askedAt !== null && !RFC3339.test(question.askedAt || '')) fail(`question ${question.id}'s askedAt is RFC 3339 or null`);
        if (askedAt.has(question.id) && askedAt.get(question.id) !== question.askedAt) fail(`question ${question.id} keeps its askedAt`);
        askedAt.set(question.id, question.askedAt);
        if (/:finding-\d+$/.test(question.id) && !/^Finding \d+ · /.test(question.title)) fail(`the finding ${question.id} is titled "Finding <n> · …"`);
        for (const problem of (config.questionProblems || (() => []))(question)) fail(problem);
      }
      const nowOpen = sent.questions.map((question) => question.id);
      for (const id of open) if (!nowOpen.includes(id)) answered.add(id);
      open = nowOpen;

      const sendsAuto = 'autoDecisions' in sent || isAutoGate(gate);
      if (autoRun === null) autoRun = sendsAuto;
      if (autoRun) {
        if (!Array.isArray(sent.autoDecisions)) fail('every report of an auto-run sends autoDecisions');
        else {
          if (JSON.stringify(sent.autoDecisions.slice(0, decisions.length)) !== JSON.stringify(decisions)) fail("autoDecisions is the run's whole list, in order, never shortened");
          decisions = sent.autoDecisions;
        }
        if (sent.questions.length) fail('auto-run never reports a question: it takes the ★');
        if (gate && !isAutoGate(gate)) fail('every gate of an auto-run is stamped auto');
      } else if (sendsAuto) fail('a step-by-step run never sends autoDecisions or a gate stamped auto');

      const openGate = gate && !isAutoGate(gate);
      if (sent.sessionEnded && (openGate || sent.questions.length)) fail('a session ends with nothing open');
      const sentence = haltSentence(sent.halted);
      if (sentence !== null) {
        if (sent.sessionEnded !== true) fail('halted comes with sessionEnded: true');
        if (gate || sent.questions.length) fail('halted is never sent with a gate or a question');
        if (sent[config.completeFlag] === true) fail(`halted never comes with ${config.completeFlag}`);
        if (/[\n`*]/.test(sentence) || !/\bthen Continue(?: in auto-run)?\.?$/.test(sentence)) fail('halted is one plain sentence that ends on "then Continue"');
        if (!sentence.startsWith(config.haltLead)) fail(`halted opens "${config.haltLead}"`);
        if (!isString(sent.commitRead)) fail('a halted report names the commit it read at');
        if (!rows.some((row) => hasNote(row, 'Stopped'))) fail('a halt keeps its reason in a Stopped note on its row');
        if (rows.some((row) => hasNote(row, 'Stopped') && row.state.label !== 'pending')) fail('the halted row reads pending');
      }
      if (sent[config.completeFlag]) {
        if (completed) fail(`${config.completeFlag} is sent once`);
        completed = true;
        for (const problem of config.completeProblems(rows, sent)) fail(problem);
        if (sent.questions.length) fail(`${config.completeFlag} comes with no question open`);
        if (!sent.sessionEnded) fail(`${config.completeFlag} is the session's last report`);
      }
      sessionStarts = sent.sessionEnded === true;
    }
    return problems;
  };
}

module.exports = { replayer, storyFiles, rowOf, revisionOf, isAutoGate, hasNote, isString };
