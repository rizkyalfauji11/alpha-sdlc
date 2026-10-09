#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createSuite, testPlan, pluginRoot } = require('../lib/harness');

const suite = createSuite('auto-run');
const { projectFixture, runHook, report, finish } = suite;

const AUTO_RUN = 'continue-auto-run.js';
const HOOK_ENVIRONMENT = { CLAUDE_PLUGIN_ROOT: pluginRoot };
const cases = [];
const blocks = (name, payload) => cases.push({ name, payload, expected: 2 });
const passes = (name, payload) => cases.push({ name, payload, expected: 0 });

function autoRunPayload(name, marker, transcript) {
  const files = {};
  if (marker !== undefined) files['.alpha-sdlc/auto-run.json'] = typeof marker === 'string' ? marker : JSON.stringify(marker);
  if (transcript !== undefined) files['transcript.jsonl'] = transcript;
  const projectRoot = projectFixture('auto-run-' + name, files);
  return { hook_event_name: 'Stop', cwd: projectRoot, transcript_path: path.join(projectRoot, 'transcript.jsonl') };
}

const TOOL_LINE = '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Edit"}]}}\n';
const TEXT_LINE = '{"type":"assistant","message":{"content":[{"type":"text","text":"Stage 4 done."}]}}\n';

passes('no marker lets the session stop', autoRunPayload('none'));
blocks('a running chain blocks its first stop', autoRunPayload('first', { feature: 'f', platform: 'web', status: 'running' }, TEXT_LINE));
passes('a halted chain lets the session stop', autoRunPayload('halted', { status: 'halted', reason: 'no design' }, TEXT_LINE));
blocks('a halted chain with no reason recorded is sent back once for one',
  autoRunPayload('halted-silent', { status: 'halted' }, TEXT_LINE + TOOL_LINE));
passes('a halted chain whose reason sits under another reason key is accepted',
  autoRunPayload('halted-other-key', { status: 'halted', haltedReason: 'daemon not installed' }, TEXT_LINE));
passes('a finished chain lets the session stop', autoRunPayload('done', { status: 'done' }, TEXT_LINE));
passes('an unreadable marker fails open', autoRunPayload('broken', '{not json', TEXT_LINE));
blocks('a running chain that used a tool since the last push blocks again',
  autoRunPayload('progress', { status: 'running', lastBlock: { transcriptSize: TEXT_LINE.length } }, TEXT_LINE + TOOL_LINE + TEXT_LINE));
passes('a running chain with no tool since the last push is let go',
  autoRunPayload('stalled', { status: 'running', lastBlock: { transcriptSize: TOOL_LINE.length } }, TOOL_LINE + TEXT_LINE));
passes('a unit-scope chain handed off to a fresh session lets the session stop',
  autoRunPayload('handoff', { status: 'handoff', scope: 'unit', feature: 'f', platform: 'web' }, TEXT_LINE + TOOL_LINE));
passes('a chain the user stopped lets the session stop', autoRunPayload('stopped', { status: 'stopped' }, TEXT_LINE + TOOL_LINE));

function sameTranscriptPayload(name, lastBlockFor, transcript, extra) {
  const projectRoot = projectFixture('auto-run-' + name, { 'transcript.jsonl': transcript });
  const transcriptPath = path.join(projectRoot, 'transcript.jsonl');
  const marker = { status: 'running', feature: 'f', platform: 'web', lastBlock: lastBlockFor(transcriptPath), ...(extra || {}) };
  fs.mkdirSync(path.join(projectRoot, '.alpha-sdlc'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, '.alpha-sdlc', 'auto-run.json'), JSON.stringify(marker));
  return { hook_event_name: 'Stop', cwd: projectRoot, transcript_path: transcriptPath, session_id: 'session-now' };
}

blocks('a stop in a new transcript after /clear is pushed, though the new file is smaller than the old offset',
  sameTranscriptPayload('cleared', () => ({
    transcriptPath: '/elsewhere/old-session.jsonl', sessionId: 'session-before', transcriptSize: 5000000,
  }), TEXT_LINE));
blocks('a stop from another session on the same transcript file is pushed',
  sameTranscriptPayload('other-session', (transcriptPath) => ({
    transcriptPath, sessionId: 'session-before', transcriptSize: 5000000,
  }), TEXT_LINE));
passes('the same transcript and session with no tool since the last push is let go',
  sameTranscriptPayload('same-stalled', (transcriptPath) => ({
    transcriptPath, sessionId: 'session-now', transcriptSize: TOOL_LINE.length,
  }), TOOL_LINE + TEXT_LINE));
blocks('the same transcript and session with a tool since the last push blocks again',
  sameTranscriptPayload('same-progress', (transcriptPath) => ({
    transcriptPath, sessionId: 'session-now', transcriptSize: TEXT_LINE.length,
  }), TEXT_LINE + TOOL_LINE + TEXT_LINE));

function autoRunPayloadWith(name, marker, files) {
  const projectRoot = projectFixture('auto-run-' + name, {
    '.alpha-sdlc/auto-run.json': JSON.stringify(marker),
    'transcript.jsonl': TEXT_LINE + TOOL_LINE,
    ...files,
  });
  return { hook_event_name: 'Stop', cwd: projectRoot, transcript_path: path.join(projectRoot, 'transcript.jsonl') };
}

blocks('a done chain whose test plan still has Boot & Smoke blocked is refused',
  autoRunPayloadWith('done-blocked', { status: 'done', feature: 'f', platform: 'web', featureDir: 'feature' },
    { 'feature/test-plan-web.md': testPlan({ smoke: '**2 of 3 critical journeys pass; journey 3 is BLOCKED** — mandatory' }) }));
passes('a done chain whose test plan passed is let stop',
  autoRunPayloadWith('done-green', { status: 'done', feature: 'f', platform: 'web', featureDir: 'feature' },
    { 'feature/test-plan-web.md': testPlan() }));
passes('a done chain that names no feature directory is let stop',
  autoRunPayloadWith('done-unnamed', { status: 'done' }, {}));

for (const testCase of cases) {
  const { exitCode, stderr } = runHook(AUTO_RUN, testCase.payload, { env: HOOK_ENVIRONMENT });
  const verb = testCase.expected === 2 ? 'must block' : 'must pass';
  report(AUTO_RUN, `${verb}: ${testCase.name}`, exitCode === testCase.expected, [
    `expected exit ${testCase.expected}, got ${exitCode}`,
    stderr.trim() ? stderr.trim().split('\n')[0] : '',
  ]);
}

function markerAfter(payload) {
  const result = runHook(AUTO_RUN, payload, { env: HOOK_ENVIRONMENT });
  let marker = null;
  try { marker = JSON.parse(fs.readFileSync(path.join(payload.cwd, '.alpha-sdlc', 'auto-run.json'), 'utf8')); } catch {}
  return { ...result, marker };
}

{
  const payload = {
    ...autoRunPayload('records-session', {
      status: 'running', feature: 'f', platform: 'web',
      decisions: [{ at: '2026-10-08', decision: 'decided: auto ★A' }],
    }, TEXT_LINE + TOOL_LINE),
    session_id: 'session-recorded',
  };
  const { exitCode, marker } = markerAfter(payload);
  const lastBlock = (marker && marker.lastBlock) || {};
  report(AUTO_RUN, 'a push records the transcript path, the session and the size it saw',
    exitCode === 2 && lastBlock.transcriptPath === payload.transcript_path && lastBlock.sessionId === 'session-recorded' &&
      lastBlock.transcriptSize === (TEXT_LINE + TOOL_LINE).length && !Number.isNaN(Date.parse(lastBlock.at)),
    `exit ${exitCode}, lastBlock ${JSON.stringify(lastBlock)}`);
  report(AUTO_RUN, 'a push keeps the decisions ledger the chain wrote into the marker',
    Boolean(marker && Array.isArray(marker.decisions) && marker.decisions.length === 1 && marker.decisions[0].decision === 'decided: auto ★A'),
    `marker after the push: ${JSON.stringify(marker)}`);
}

{
  const payload = {
    ...autoRunPayload('second-stop', { status: 'running', feature: 'f', platform: 'web' }, TEXT_LINE + TOOL_LINE),
    session_id: 'session-twice',
  };
  const first = markerAfter(payload);
  const second = markerAfter(payload);
  report(AUTO_RUN, 'a second stop in the same session with nothing new since the push is let go',
    first.exitCode === 2 && second.exitCode === 0, `first exit ${first.exitCode}, second exit ${second.exitCode}`);
  fs.appendFileSync(payload.transcript_path, TOOL_LINE);
  const afterClear = markerAfter({ ...payload, transcript_path: path.join(payload.cwd, 'fresh.jsonl'), session_id: 'session-fresh' });
  report(AUTO_RUN, 'the first stop of the session after /clear is pushed even though its transcript does not exist yet',
    afterClear.exitCode === 2 && afterClear.marker.lastBlock.sessionId === 'session-fresh',
    `exit ${afterClear.exitCode}, lastBlock ${JSON.stringify(afterClear.marker && afterClear.marker.lastBlock)}`);
}

{
  const timedLine = (minutesAgo) => JSON.stringify({
    type: 'user', timestamp: new Date(Date.now() - minutesAgo * 60000).toISOString(), message: { role: 'user', content: 'a question' },
  }) + '\n';
  const twoSessions = (name, ownerWrittenAt, otherBornMinutesAgo = 1) => {
    const projectRoot = projectFixture('auto-run-' + name, {
      'owner.jsonl': TEXT_LINE + TOOL_LINE,
      'other.jsonl': timedLine(otherBornMinutesAgo) + TEXT_LINE,
    });
    const owner = path.join(projectRoot, 'owner.jsonl');
    const other = path.join(projectRoot, 'other.jsonl');
    const otherBorn = new Date(Date.now() - otherBornMinutesAgo * 60000);
    fs.utimesSync(other, otherBorn, otherBorn);
    fs.utimesSync(other, new Date(), new Date());
    fs.utimesSync(owner, ownerWrittenAt, ownerWrittenAt);
    const marker = { status: 'running', feature: 'f', platform: 'web',
      lastBlock: { transcriptPath: owner, sessionId: 'session-owner', transcriptSize: 10, at: new Date().toISOString() } };
    fs.mkdirSync(path.join(projectRoot, '.alpha-sdlc'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, '.alpha-sdlc', 'auto-run.json'), JSON.stringify(marker));
    return { payload: { hook_event_name: 'Stop', cwd: projectRoot, transcript_path: other, session_id: 'session-other' }, marker };
  };
  const live = twoSessions('second-live-session', new Date(Date.now() + 60000));
  const liveRun = markerAfter(live.payload);
  report(AUTO_RUN, 'a second live session in the tree may stop: the chain stays with the session still writing it',
    liveRun.exitCode === 0 && /belongs to another live session/.test(liveRun.stderr) &&
      JSON.stringify(liveRun.marker.lastBlock) === JSON.stringify(live.marker.lastBlock),
    `exit ${liveRun.exitCode}: ${liveRun.stderr.trim()} · lastBlock ${JSON.stringify(liveRun.marker && liveRun.marker.lastBlock)}`);
  const quiet = twoSessions('owner-went-quiet', new Date(Date.now() - 30 * 60000));
  const quietRun = markerAfter(quiet.payload);
  report(AUTO_RUN, 'a new session whose predecessor went quiet before it began is pushed to continue the chain',
    quietRun.exitCode === 2 && quietRun.marker.lastBlock.sessionId === 'session-other', `exit ${quietRun.exitCode}: ${quietRun.stderr.trim()}`);
  const stale = twoSessions('owner-long-gone', new Date(Date.now() - 2 * 60 * 60000), 3 * 60);
  const staleRun = markerAfter(stale.payload);
  report(AUTO_RUN, 'a chain whose recorded session went silent over an hour ago is pushed in the session that stops now',
    staleRun.exitCode === 2, `exit ${staleRun.exitCode}: ${staleRun.stderr.trim()}`);
}

{
  const payload = autoRunPayload('handoff-untouched', { status: 'handoff', scope: 'unit' }, TEXT_LINE + TOOL_LINE);
  const before = fs.readFileSync(path.join(payload.cwd, '.alpha-sdlc', 'auto-run.json'), 'utf8');
  runHook(AUTO_RUN, payload, { env: HOOK_ENVIRONMENT });
  const after = fs.readFileSync(path.join(payload.cwd, '.alpha-sdlc', 'auto-run.json'), 'utf8');
  report(AUTO_RUN, 'a handed-off marker is left exactly as the chain wrote it', before === after, `before ${before}\nafter ${after}`);
}

{
  const { exitCode, stderr } = runHook(AUTO_RUN,
    autoRunPayload('unit-scope-push', { status: 'running', scope: 'unit', feature: 'f', platform: 'web' }, TEXT_LINE),
    { env: HOOK_ENVIRONMENT });
  report(AUTO_RUN, 'a unit-scope push says to hand off once the unit closes',
    exitCode === 2 && /"status": "handoff"/.test(stderr), `exit ${exitCode}: ${stderr.trim()}`);
}

finish();
