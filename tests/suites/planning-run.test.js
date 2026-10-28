#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createSuite, pluginRoot } = require('../lib/harness');

const suite = createSuite('planning-run');
const { report, finish } = suite;

const FIXTURES = path.join(pluginRoot, 'tests', 'fixtures', 'planning-run');
const GUIDE = path.join(pluginRoot, 'skills', 'do-planning', 'planning-run-schema.md');
const STEP = /^(?:scope|layout|breakdown|stage-[1-9]\d*)$/;
const PLAN_FILE = /^plan-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const QUESTION_ID = /^(?:scope|layout|breakdown|stage-[1-9]\d*):[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const TONES = ['neutral', 'progress', 'attention', 'blocked', 'done', 'skipped'];
const VOCABULARY = { pending: false, 'waiting on you': false, approved: true };
const FIXED = {
  scope: { name: 'Scope', ordinal: 1, actions: ['Confirm the scope', 'Confirm with edits', 'regenerate', 'Regenerate'] },
  layout: { name: 'Architecture & package layout', ordinal: 2, actions: ['Approve the layout', 'Approve with edits', 'regenerate', 'Regenerate with feedback'] },
  breakdown: { name: 'Stage breakdown', ordinal: 3, actions: ['Approve the breakdown', 'Approve with edits', 're-split', 'Re-split'] },
};
const NOTHING_PUSHED = 'Nothing is pushed until every stage is approved';

const isString = (value) => typeof value === 'string';
const isInteger = (value) => Number.isInteger(value);
const stepOf = (key) => key.slice(0, key.lastIndexOf('@'));
const revisionOf = (key) => Number(key.slice(key.lastIndexOf('@') + 1));
const isStage = (step) => step.startsWith('stage-');
const stageNumber = (step) => Number(step.slice('stage-'.length));
const isBlock = (block) => block && isString(block.label) && isString(block.text);
const PLUGIN_PATH = /\b(?:skills|scripts|hooks|agents|rules)\/[\w./-]+/;
const promptsOf = (sent) => sent.questions.flatMap((question) => question.options.filter((option) => isString(option.pluginPrompt)));

function expectedOrdinal(step) {
  return isStage(step) ? 3 + stageNumber(step) : FIXED[step].ordinal;
}

function expectedActions(step) {
  const [approve, edits, thirdId, thirdLabel] = isStage(step)
    ? [`Approve Stage ${stageNumber(step)}`, 'Approve with edits', 're-split', 'Re-split']
    : FIXED[step].actions;
  return [
    { id: 'approve', label: approve, role: 'primary', requiresReason: false, requiresBody: false },
    { id: 'approve-with-edits', label: edits, role: 'secondary', requiresReason: false, requiresBody: true },
    { id: thirdId, label: thirdLabel, role: 'secondary', requiresReason: true, requiresBody: false },
  ];
}

function expectedStampLine(plan, step, stageCount) {
  if (step === 'scope') return `${plan} · scope · before anything is written`;
  if (!isStage(step)) return `${plan} · ${step}`;
  return `${plan} · Stage ${stageNumber(step)} of ${stageCount}`;
}

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
    need((question.options || []).every((option) => !('pluginPrompt' in option) || option.pluginPrompt === null ||
      (isString(option.pluginPrompt) && option.pluginPrompt.trim().length > 0)), `question ${question.id}'s pluginPrompt is a non-empty string or null`);
    need(evidenceIsWhole(question.evidence), `question ${question.id}'s evidence is {caption, groups[{rows[{label, lines}]}]}`);
    need((question.notes || []).every(isBlock), `question ${question.id}'s notes are {label, text}`);
  }
  if (sent.gate) {
    need(['documentKey', 'statusLabel', 'stampLine'].every((field) => isString(sent.gate[field])) && sent.gate.summary &&
      Array.isArray(sent.gate.consequences) && Array.isArray(sent.gate.actions), 'the gate has every required field');
    need(sent.gate.summary && Array.isArray(sent.gate.summary.blocks) && sent.gate.summary.blocks.every(isBlock) && isString(sent.gate.summary.needFromYou),
      "the gate's summary is {blocks, needFromYou}");
    need(sent.gate.detail && isString(sent.gate.detail.caption) && Array.isArray(sent.gate.detail.panes) &&
      sent.gate.detail.panes.every((pane) => isString(pane.label) && isString(pane.note) && typeof pane.editable === 'boolean'), "the gate's panes are whole");
    need(evidenceIsWhole(sent.gate.evidence), "the gate's evidence is whole");
  }
  for (const flag of ['planComplete', 'sessionEnded', 'onlyWhatChanged']) {
    if (flag in sent) need(typeof sent[flag] === 'boolean', `${flag} is a boolean`);
  }
  if ('halted' in sent) need(isString(sent.halted) && sent.halted.trim().length > 0, 'halted is a non-empty string');
  need(!('trdComplete' in sent) && !('reviewRounds' in sent), "a planning report sends none of grooming's fields");
  return problems;
}

function haltProblems(sent, halt, sessionStarts, rows) {
  if (!isString(sent.halted)) return [];
  const problems = [];
  const need = (ok, what) => { if (!ok) problems.push(what); };
  need(sent.sessionEnded === true, 'halted comes with sessionEnded: true');
  need(!sent.gate && !sent.questions.length, 'halted is never sent with a gate or a question open');
  need(sent.planComplete !== true, 'halted never comes with planComplete');
  need(!/[\n`*]/.test(sent.halted) && /\bthen Continue\.?$/.test(sent.halted), 'halted is one plain sentence that ends on "then Continue"');
  need(isString(sent.commitRead), 'a halted report names the commit it read at');
  if (halt && sessionStarts && sent.halted === halt.text) {
    need(sent.onlyWhatChanged !== true && sent.commitRead === halt.commitRead && JSON.stringify(rows) === halt.rows,
      'a halt sent again at the next session\'s start is the same report, whole, at the same commitRead');
  }
  return problems;
}

function replay(files) {
  const problems = [];
  let mirror = new Map();
  let sessionStarts = true;
  let approvedBreakdown = null;
  let completed = false;
  let halt = null;
  const approvedSteps = new Set();
  const answered = new Set();
  const askedAt = new Map();
  let open = [];
  for (const { name, report: sent } of files) {
    const fail = (what) => problems.push(`${name}: ${what}`);
    for (const problem of shapeProblems(sent)) fail(problem);
    const isFull = sent.onlyWhatChanged !== true;
    const keys = sent.documents.map((row) => row.key);
    const ordinals = sent.documents.map((row) => row.ordinal);

    if (keys.some((key) => !/@[1-9]\d*$/.test(key) || !STEP.test(stepOf(key)))) fail('every row key is <step>@<revision>, the step scope, layout, breakdown or stage-<n>');
    if (new Set(keys.map(stepOf)).size !== keys.length) fail('a report names each step once');
    if (ordinals.some((ordinal, index) => index > 0 && ordinal <= ordinals[index - 1])) fail('rows are sent in ascending ordinal');
    for (const row of sent.documents) {
      const step = stepOf(row.key);
      if (!STEP.test(step)) continue;
      if (!PLAN_FILE.test(row.group || '') || row.description !== row.group) fail(`row ${row.key}'s group and description are the plan file`);
      if (row.ordinal !== expectedOrdinal(step)) fail(`row ${row.key}'s ordinal is ${expectedOrdinal(step)}`);
      if (!isStage(step) && row.name !== FIXED[step].name) fail(`row ${row.key} is named "${FIXED[step].name}"`);
      if (isStage(step) && (/^stage\s+\d/i.test(row.name) || row.name.includes('`') || !row.name.startsWith('['))) {
        fail(`row ${row.key}'s name is the stage's title, its layer tag first, plain text, never "Stage n"`);
      }
      if (!(row.state.label in VOCABULARY) || row.state.settled !== VOCABULARY[row.state.label]) fail(`row ${row.key} holds a state of the vocabulary, only approved settled`);
    }
    const groups = new Set([...mirror.values(), ...sent.documents].map((row) => row.group));
    if (groups.size > 1) fail('every row of a run names the same plan file');

    const before = new Map([...mirror.values()].map((row) => [stepOf(row.key), row.key]));
    const rekeyed = keys.filter((key) => before.has(stepOf(key)) && before.get(stepOf(key)) !== key);
    if (rekeyed.length && !isFull) fail(`re-keys ${rekeyed.map((key) => before.get(stepOf(key))).join(', ')} in a partial report, which can never remove the old key`);
    if (sessionStarts && !isFull) fail("the session's first report is whole");
    const dropped = isFull ? [...before.keys()].filter((step) => !keys.some((key) => stepOf(key) === step)) : [];
    if (!sessionStarts && isFull && !rekeyed.length && !dropped.length) fail('a later report in a session sends only what changed');

    if (isFull) {
      const labels = sent.states.map((entry) => entry.label).sort();
      if (labels.join('|') !== Object.keys(VOCABULARY).sort().join('|')) fail('a full report carries the whole state vocabulary');
      mirror = new Map(sent.documents.map((row) => [row.key, row]));
    } else {
      if (sent.states.length) fail('a partial report sends states: []');
      for (const row of sent.documents) mirror.set(row.key, row);
    }
    const mirrorSteps = [...mirror.keys()].map(stepOf);
    if (new Set(mirrorSteps).size !== mirrorSteps.length) fail('the mirror holds one key per step');
    const rows = [...mirror.values()];
    const breakdown = rows.find((row) => stepOf(row.key) === 'breakdown');
    const breakdownApproved = Boolean(breakdown && breakdown.state.label === 'approved');
    const stageRows = rows.filter((row) => isStage(stepOf(row.key)));
    if (stageRows.length && !approvedBreakdown && !breakdownApproved) fail('stage rows appear only once the breakdown is approved');
    if (breakdownApproved) {
      if (approvedBreakdown && approvedBreakdown !== breakdown.key) {
        for (const key of rekeyed) if (isStage(stepOf(key))) approvedSteps.delete(stepOf(key));
      }
      approvedBreakdown = breakdown.key;
    }
    if (sent.step.ordinal < 1 || sent.step.ordinal > sent.step.total || sent.step.total !== mirror.size) fail('step is the row the run is on, out of the row count');

    const gate = sent.gate;
    if (gate) {
      const row = mirror.get(gate.documentKey);
      if (!row) fail(`the gate's key ${gate.documentKey} is a row's current key`);
      else {
        const step = stepOf(row.key);
        const expected = expectedStampLine(row.group, step, stageRows.length);
        if (gate.stampLine !== expected) fail(`stampLine reads "${expected}"`);
        if (row.state.label !== 'waiting on you') fail('the gated row reads "waiting on you"');
        if (JSON.stringify(gate.actions) !== JSON.stringify(expectedActions(step))) fail(`the ${step} gate offers exactly its three actions, labelled as the screen expects`);
        if (JSON.stringify(gate.consequences) !== JSON.stringify([`Approving writes the step into ${row.group} and commits it to ${gate.consequences[0].split(' commits it to ')[1]}`, NOTHING_PUSHED]) ||
          !/ commits it to feat\/[a-z0-9-]+$/.test(gate.consequences[0])) {
          fail('the gate carries the two consequence lines: what Approve writes and commits to feat/<feature>, and that nothing is pushed');
        }
        const panes = (gate.detail || {}).panes || [];
        const proposed = panes.find((pane) => pane.label === 'Proposed');
        const current = panes.find((pane) => pane.label === 'Current');
        if (!proposed || !proposed.editable || !isString(proposed.body)) fail('the Proposed pane is editable and holds the step\'s Markdown');
        if (!current || current.editable) fail('the Current pane is sent, not editable');
        const hadApproved = approvedSteps.has(step);
        if (current && (current.body !== null) !== hadApproved) fail(`the Current pane's body is ${hadApproved ? 'the approved text' : 'null for a step never approved'}`);
        const note = `what would be written into ${row.group}${hadApproved ? '' : ' · it has nothing here yet'}`;
        if (proposed && proposed.note !== note) fail(`the Proposed pane's note reads "${note}"`);
      }
      if (gate.statusLabel !== 'waiting on you') fail('statusLabel reads "waiting on you"');
    }
    for (const row of rows) if (row.state.label === 'approved') approvedSteps.add(stepOf(row.key));

    for (const question of sent.questions) {
      if (!QUESTION_ID.test(question.id)) fail(`question id ${question.id} is <step>:<what it asks>`);
      if (/^push/.test(question.id) || /:push/.test(question.id)) fail('a planning run never asks to push');
      if (answered.has(question.id)) fail(`question id ${question.id} was answered before and is never reused`);
      if (!mirror.has(question.documentKey)) fail(`question ${question.id} sits on a row's current key`);
      if (question.blocks.some((key) => !mirror.has(key))) fail(`question ${question.id} blocks only current row keys`);
      if (!question.evidence) fail(`question ${question.id} carries evidence`);
      if (![...question.options, ...question.actions].some((choice) => choice.requiresReason)) fail(`question ${question.id} offers a way out that requires a reason`);
      if (question.askedAt !== null && !RFC3339.test(question.askedAt || '')) fail(`question ${question.id}'s askedAt is RFC 3339 or null`);
      if (askedAt.has(question.id) && askedAt.get(question.id) !== question.askedAt) fail(`question ${question.id} keeps its askedAt`);
      askedAt.set(question.id, question.askedAt);
      const row = mirror.get(question.documentKey);
      for (const option of question.options.filter((choice) => isString(choice.pluginPrompt))) {
        if (!option.requiresReason) fail(`question ${question.id}'s option ${option.id} waits on the plugin, so it is a way out that requires a reason`);
        if (row && !option.pluginPrompt.includes(row.group)) fail(`question ${question.id}'s pluginPrompt names the platform's plan file ${row.group}`);
        if (!PLUGIN_PATH.test(option.pluginPrompt)) fail(`question ${question.id}'s pluginPrompt names the plugin file or guide to change`);
        if (!/\bprove\b/i.test(option.pluginPrompt)) fail(`question ${question.id}'s pluginPrompt says how to prove the change`);
      }
    }
    const nowOpen = sent.questions.map((question) => question.id);
    for (const id of open) if (!nowOpen.includes(id)) answered.add(id);
    open = nowOpen;

    if (sent.sessionEnded && (sent.gate || sent.questions.length)) fail('a session ends with nothing open');
    for (const problem of haltProblems(sent, halt, sessionStarts, rows)) fail(problem);
    if (isString(sent.halted)) halt = { text: sent.halted, commitRead: sent.commitRead, rows: JSON.stringify(rows) };
    if ('planCoverage' in sent && sent.planComplete !== true) fail('planCoverage comes only with planComplete');
    if (sent.planComplete && completed) fail('planComplete is sent once');
    if (sent.planComplete) {
      completed = true;
      if (rows.some((row) => row.state.label !== 'approved')) fail('planComplete comes after every row is approved');
      if (!stageRows.length) fail('planComplete comes after the stages exist');
      if (rows.some((row) => (row.notes || []).some((note) => note.label === 'Held back'))) fail('a plan that holds a slice back never sends planComplete');
      const coverage = sent.planCoverage || {};
      if (!['acceptanceCriteria', 'workSlices', 'stages'].every((field) => isInteger(coverage[field]) && coverage[field] >= 0) || coverage.stages < 1) {
        fail('planCoverage carries the three counts');
      } else if (coverage.stages !== stageRows.length) fail('planCoverage.stages is the number of stage rows');
      if (!sent.sessionEnded) fail("planComplete is the session's last report");
    }
    sessionStarts = sent.sessionEnded === true;
  }
  return problems;
}

const stories = ['plan', 'held-back', 'halted', 'plugin-prompt'].map((story) => ({ story, files: storyFiles(story) }));
for (const { story, files } of stories) {
  const problems = replay(files);
  report('fixtures', `the ${story} story conforms to the planning-run guide`, problems.length === 0, problems.join('\n'));
}

const every = stories.flatMap(({ files }) => files);
const covers = (what, predicate) => report('fixtures', `a fixture shows ${what}`, every.some(({ report: sent }) => predicate(sent)));
const gateStep = (sent) => sent.gate && stepOf(sent.gate.documentKey);
const currentBody = (sent) => ((sent.gate.detail.panes.find((pane) => pane.label === 'Current') || {}).body);
covers('the scope gate', (sent) => gateStep(sent) === 'scope');
covers('a regenerated step re-keyed in a full snapshot', (sent) => sent.onlyWhatChanged === false && sent.gate && revisionOf(sent.gate.documentKey) > 1 && gateStep(sent) === 'scope');
covers('footprint debt asked before the layout gate, blocking it', (sent) => !sent.gate && sent.questions.some((question) => question.id.startsWith('layout:') && question.blocks.includes(question.documentKey)));
covers('the stage rows added by a partial report once the breakdown is approved', (sent) => sent.onlyWhatChanged === true &&
  sent.documents.some((row) => stepOf(row.key) === 'breakdown' && row.state.label === 'approved') && sent.documents.some((row) => isStage(stepOf(row.key))));
covers('a question that blocks its stage', (sent) => sent.questions.some((question) => question.id.startsWith('stage-') && question.blocks.includes(question.documentKey)));
covers('a session ended at a stamped stage', (sent) => sent.sessionEnded === true && sent.planComplete !== true && sent.documents.some((row) => isStage(stepOf(row.key))));
covers('a re-split: the breakdown\'s next revision with the approved breakdown in its Current pane', (sent) => gateStep(sent) === 'breakdown' &&
  revisionOf(sent.gate.documentKey) > 1 && isString(currentBody(sent)) && sent.documents.some((row) => isStage(stepOf(row.key))));
covers('the new breakdown\'s stage rows, a changed stage under its next revision', (sent) => sent.onlyWhatChanged === false &&
  sent.documents.some((row) => isStage(stepOf(row.key)) && revisionOf(row.key) > 1));
covers('planComplete with planCoverage', (sent) => sent.planComplete === true && Boolean(sent.planCoverage));
covers('a refusal ending the session with its reason', (sent) => sent.sessionEnded === true && !sent.gate &&
  sent.documents.some((row) => (row.notes || []).some((note) => note.label === 'Stopped')));
covers('a depended-on feature not built, asked on the scope', (sent) => sent.questions.some((question) => question.id.startsWith('scope:prerequisite')));
covers('a coverage problem fixed by an approved stage\'s next revision', (sent) => gateStep(sent) && isStage(gateStep(sent)) &&
  revisionOf(sent.gate.documentKey) > 1 && isString(currentBody(sent)));
covers('a halt naming what must happen, its row\'s Stopped note kept', (sent) => isString(sent.halted) && sent.sessionEnded === true &&
  sent.documents.some((row) => (row.notes || []).some((note) => note.label === 'Stopped')));
covers('a halt sent again, whole, at the next session\'s start', (sent) => isString(sent.halted) && sent.onlyWhatChanged === false);
covers('a spoke\'s prerequisite that is an unreleased plugin guide, pluginPrompt on the stop option and null on the others', (sent) => sent.questions.some((question) =>
  question.id.startsWith('scope:prerequisite') && /^plan-(?!web)/.test((sent.documents.find((row) => row.key === question.documentKey) || {}).group || '') &&
  question.options.filter((option) => isString(option.pluginPrompt)).map((option) => option.id).join() === 'stop' &&
  question.options.filter((option) => option.id !== 'stop').every((option) => option.pluginPrompt === null)));
covers('a halt that waits on the plugin release', (sent) => isString(sent.halted) && sent.halted.startsWith('Planning waits for the alpha-sdlc plugin:'));
covers('a held-back slice ending the session without planComplete', (sent) => sent.sessionEnded === true && sent.planComplete !== true &&
  sent.documents.some((row) => (row.notes || []).some((note) => note.label === 'Held back')));

{
  const files = storyFiles('plan');
  const swap = (suffix, change) => files.map((file) => file.name.endsWith(suffix) ? { ...file, report: change(file.report) } : file);
  const partialResplit = swap('11-re-split.json', (sent) => ({ ...sent, onlyWhatChanged: true, states: [], documents: sent.documents.filter((row) => stepOf(row.key) === 'breakdown') }));
  report('checker', 'catches a re-split sent as a partial report', replay(partialResplit).some((problem) => problem.includes('re-keys breakdown@1')));
  const early = swap('13-stage-4-gate.json', (sent) => ({ ...sent, gate: null, sessionEnded: true, planComplete: true, planCoverage: { acceptanceCriteria: 9, workSlices: 3, stages: 4 } }));
  report('checker', 'catches planComplete before every stage is approved', replay(early).some((problem) => problem.includes('planComplete comes after every row is approved')));
  const pushed = swap('07-stage-question.json', (sent) => ({ ...sent, questions: [...sent.questions, { ...sent.questions[0], id: 'push' }] }));
  report('checker', 'catches a push question', replay(pushed).some((problem) => problem.includes('never asks to push')));
  const numbered = swap('12-new-stage-rows.json', (sent) => ({ ...sent, documents: sent.documents.map((row) => row.key === 'stage-3@2' ? { ...row, name: `Stage 3 — ${row.name}` } : row) }));
  report('checker', 'catches a stage named "Stage n — …"', replay(numbered).some((problem) => problem.includes("stage's title")));
  const premature = swap('05-breakdown-gate.json', (sent) => ({ ...sent, documents: [...sent.documents, { ...sent.documents[1], key: 'stage-1@1', ordinal: 4, name: '[contract] early', state: { ...sent.documents[0].state, label: 'pending', settled: false } }] }));
  report('checker', 'catches stage rows before the breakdown is approved', replay(premature).some((problem) => problem.includes('only once the breakdown is approved')));
  const relabelled = swap('06-stages-added.json', (sent) => ({ ...sent, gate: { ...sent.gate, actions: sent.gate.actions.map((action) => action.id === 're-split' ? { ...action, id: 'regenerate' } : action) } }));
  report('checker', "catches a stage gate offering regenerate in place of re-split", replay(relabelled).some((problem) => problem.includes('exactly its three actions')));
  const heldBack = storyFiles('held-back');
  const finished = heldBack.map((file) => file.name.endsWith('11-held-back-end.json')
    ? { ...file, report: { ...file.report, planComplete: true, planCoverage: { acceptanceCriteria: 12, workSlices: 3, stages: 4 } } }
    : file);
  report('checker', 'catches planComplete from a plan that holds a slice back', replay(finished).some((problem) => problem.includes('holds a slice back')));
  const halted = storyFiles('halted');
  const swapHalt = (suffix, change) => halted.map((file) => file.name.endsWith(suffix) ? { ...file, report: change(file.report) } : file);
  const haltOpen = swapHalt('02-sent-to-grooming.json', (sent) => ({ ...sent, questions: storyFiles('halted')[0].report.questions }));
  report('checker', 'catches a halt sent with a question open', replay(haltOpen).some((problem) => problem.includes('never sent with a gate or a question')));
  const haltRunsOn = swapHalt('02-sent-to-grooming.json', (sent) => { const { sessionEnded: _ended, ...rest } = sent; return rest; });
  report('checker', 'catches a halt that does not end the session', replay(haltRunsOn).some((problem) => problem.includes('comes with sessionEnded')));
  const haltMarkdown = swapHalt('02-sent-to-grooming.json', (sent) => ({ ...sent, halted: 'Planning waits for grooming: run `/alpha-sdlc:do-grooming platform-development`' }));
  report('checker', 'catches a halt that is Markdown, or does not end on Continue', replay(haltMarkdown).some((problem) => problem.includes('one plain sentence')));
  const haltMoved = swapHalt('03-halt-unchanged.json', (sent) => ({ ...sent, commitRead: '0000000' }));
  report('checker', 'catches a halt sent again at another commitRead', replay(haltMoved).some((problem) => problem.includes('same report, whole')));
  const haltCompletes = swapHalt('02-sent-to-grooming.json', (sent) => ({ ...sent, planComplete: true }));
  report('checker', 'catches a halt sent with planComplete', replay(haltCompletes).some((problem) => problem.includes('never comes with planComplete')));
  const waits = storyFiles('plugin-prompt');
  const swapPrompt = (change) => waits.map((file) => file.name.endsWith('01-prerequisite-plugin-question.json')
    ? { ...file, report: { ...file.report, questions: file.report.questions.map((question) => ({ ...question, options: question.options.map(change) })) } }
    : file);
  const onHoldBack = swapPrompt((option) => option.id === 'hold-back' ? { ...option, pluginPrompt: waits[0].report.questions[0].options[1].pluginPrompt } : option);
  report('checker', 'catches a pluginPrompt on an option that does not wait on the plugin', replay(onHoldBack).some((problem) => problem.includes('option hold-back waits on the plugin')));
  const empty = swapPrompt((option) => option.id === 'stop' ? { ...option, pluginPrompt: ' ' } : option);
  report('checker', 'catches an empty pluginPrompt', replay(empty).some((problem) => problem.includes('non-empty string or null')));
  const unproven = swapPrompt((option) => option.id === 'stop' ? { ...option, pluginPrompt: option.pluginPrompt.replace(/How to prove it:.*$/, '') } : option);
  report('checker', 'catches a pluginPrompt that does not say how to prove the change', replay(unproven).some((problem) => problem.includes('how to prove')));
  const nowhere = swapPrompt((option) => option.id === 'stop' ? { ...option, pluginPrompt: option.pluginPrompt.split('plan-backend.md').join('the plan') } : option);
  report('checker', 'catches a pluginPrompt that does not name the platform\'s plan file', replay(nowhere).some((problem) => problem.includes('names the platform\'s plan file')));
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
  report('version', 'the release notes publish the minimum', Boolean(minimum) && readme.includes(`From ${minimum} \`do-planning\``) && readme.includes('planning-run'));
  report('version', 'every fixture reports a version at or above the minimum',
    every.every(({ report: sent }) => minimum && atLeast(sent.pluginVersion, minimum)));
  const haltMinimum = (/`halted` needs \*\*(\d+\.\d+\.\d+)\*\*/.exec(guide) || [])[1];
  report('version', 'the guide names the version halted needs, and every halted fixture reports it',
    Boolean(haltMinimum) && atLeast(version, haltMinimum) && every.filter(({ report: sent }) => 'halted' in sent).every(({ report: sent }) => atLeast(sent.pluginVersion, haltMinimum)));
  const promptMinimum = (/`pluginPrompt` needs \*\*(\d+\.\d+\.\d+)\*\*/.exec(guide) || [])[1];
  report('version', 'the guide names the version pluginPrompt needs, and every fixture that sends one reports it',
    Boolean(promptMinimum) && atLeast(version, promptMinimum) && every.filter(({ report: sent }) => promptsOf(sent).length).length > 0 &&
    every.filter(({ report: sent }) => promptsOf(sent).length).every(({ report: sent }) => atLeast(sent.pluginVersion, promptMinimum)));
  const questionsSection = (text, heading) => (text.split(`\n## ${heading}\n`)[1] || '').split('\n## ')[0];
  const guides = [
    ['setup', path.join(pluginRoot, 'skills', 'do-project-setup', 'setup-run-schema.md'), 'Every question'],
    ['grooming', path.join(pluginRoot, 'skills', 'do-grooming', 'grooming-run-schema.md'), 'Questions'],
    ['planning', GUIDE, 'Questions'],
  ];
  for (const [run, file, heading] of guides) {
    const section = questionsSection(fs.readFileSync(file, 'utf8'), heading);
    report('guide', `the ${run}-run guide's ${heading} section sets pluginPrompt only on an option that waits on the plugin`,
      section.includes('`pluginPrompt`') && /change to the plugin itself|waits on the plugin/.test(section) && /null/.test(section), section.slice(0, 200));
  }
  report('skill', 'the guide points a halt at the shared halt file', guide.includes('../do-grooming/run-halt.md'));
  const skill = fs.readFileSync(path.join(pluginRoot, 'skills', 'do-planning', 'SKILL.md'), 'utf8');
  report('skill', 'do-planning reads the guide under a planning-run schema', /planning-run schema \(`--json-schema`\), read\s+`planning-run-schema\.md` before the first report/.test(skill));
  const template = fs.readFileSync(path.join(pluginRoot, 'skills', 'do-planning', 'plan-template.md'), 'utf8');
  report('template', 'the plan template keeps the two lines the platform parses',
    template.includes('- **Approved (plan gate):** <commit `<hash>` · approved <YYYY-MM-DD>') && template.includes('- **Uncovered tasks / AC:**'));
}

finish();
