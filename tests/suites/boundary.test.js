#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createSuite, pluginRoot, hooksDirectory } = require('../lib/harness');

const suite = createSuite('boundary');
const { fixtureDirectory, projectFixture, sdlcProject, run, runHook, report, finish } = suite;

const GUARD = 'boundary-guard.js';
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const LARGE_CONTEXT = 305000;
const SMALL_CONTEXT = 150000;
const ADVICE = "Tell the user in one line that a fresh session continues from the files at a fraction of the cost (/clear, then 'lanjut'), then do what they asked.";
const DENIAL = "write the next-file and handoff, then ask the user to /clear; the next session resumes with 'lanjut'";
const pluginData = path.join(fixtureDirectory, 'plugin-data');

const minutesAgo = (minutes) => new Date(Date.now() - minutes * MINUTE_MS).toISOString();

function usageLine(context, minutes, extra) {
  return JSON.stringify({
    type: 'assistant',
    timestamp: minutesAgo(minutes),
    message: {
      model: 'claude-opus-5-5',
      role: 'assistant',
      usage: { input_tokens: 12, cache_creation_input_tokens: 4000, cache_read_input_tokens: context - 4012, output_tokens: 300 },
      content: [{ type: 'text', text: 'Stage 2 is done.' }],
    },
    ...extra,
  }) + '\n';
}

const userLine = (minutes) => JSON.stringify({
  type: 'user', timestamp: minutesAgo(minutes), message: { role: 'user', content: 'lanjut' },
}) + '\n';
const syntheticLine = (minutes) => JSON.stringify({
  type: 'assistant', timestamp: minutesAgo(minutes),
  message: { model: '<synthetic>', role: 'assistant', usage: { input_tokens: 0, output_tokens: 0 }, content: [{ type: 'text', text: 'No response requested.' }] },
}) + '\n';

const nextFile = (overrides) => JSON.stringify({
  skill: 'alpha-sdlc:do-development', args: 'recipe-management web', unit: 'Stage 3', status: 'ready',
  at: minutesAgo(2), head: 'abc1234', repo: '.', handoff: '.alpha-sdlc/handoff/recipe-management--web.md',
  ...overrides,
});

let projectCount = 0;
function guardProject({ settings, next, transcript, autoRun, children } = {}) {
  projectCount++;
  const files = { 'transcript.jsonl': transcript === undefined ? usageLine(LARGE_CONTEXT, 1) : transcript };
  if (next !== undefined) files['.alpha-sdlc/next/recipe-management--web.json'] = next;
  if (autoRun !== undefined) files['.alpha-sdlc/auto-run.json'] = JSON.stringify(autoRun);
  if (children) {
    for (const [child, childSettings] of Object.entries(children)) {
      files[`${child}/docs/basics/.alpha-sdlc.json`] = JSON.stringify(childSettings);
    }
    return projectFixture(`workspace-${projectCount}`, files);
  }
  if (settings !== undefined) files['docs/basics/.alpha-sdlc.json'] = JSON.stringify(settings);
  return sdlcProject(`guard-${projectCount}`, files);
}

function guard(payload, environment) {
  const result = runHook(GUARD, payload, { env: { CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PLUGIN_DATA: pluginData, ...environment } });
  let output = null;
  if (result.stdout.trim()) {
    try { output = JSON.parse(result.stdout); } catch { output = { unparsable: result.stdout }; }
  }
  return { ...result, output };
}

const prompt = (project, sessionId, text, environment) => guard({
  hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: project,
  transcript_path: path.join(project, 'transcript.jsonl'), prompt: text || 'lanjut',
}, environment);

const skillCall = (project, sessionId, skill, toolName) => guard({
  hook_event_name: 'PreToolUse', session_id: sessionId, cwd: project, transcript_path: path.join(project, 'transcript.jsonl'),
  tool_name: toolName || 'Skill', tool_input: { skill: skill || 'alpha-sdlc:do-testing', args: 'recipe-management web' },
});

const adviceOf = (result) => ((result.output || {}).hookSpecificOutput || {}).additionalContext || '';
const isSilent = (result) => result.exitCode === 0 && result.stdout === '';
const describe = (result) => `exit ${result.exitCode}, stdout ${result.stdout || '(empty)'}${result.stderr ? ', stderr ' + result.stderr : ''}`;

{
  const project = guardProject({ next: nextFile() });
  const first = prompt(project, 'advise-next', 'lanjut');
  const advice = adviceOf(first);
  report(GUARD, 'advises a fresh session when the context is large and a ready next-file exists',
    first.exitCode === 0 && first.output.hookSpecificOutput.hookEventName === 'UserPromptSubmit' &&
      advice.startsWith('alpha-sdlc: this session carries about 305K tokens.') && advice.includes(ADVICE) &&
      !advice.includes('went cold'),
    describe(first));
  report(GUARD, 'advises once per trigger in a session', isSilent(prompt(project, 'advise-next', 'and the next one')));
  report(GUARD, 'advises again in another session', adviceOf(prompt(project, 'advise-next-other', 'lanjut')).includes(ADVICE));
  fs.writeFileSync(path.join(project, '.alpha-sdlc', 'next', 'recipe-management--web.json'), nextFile({ unit: 'Stage 4', at: minutesAgo(1) }));
  report(GUARD, 'a newly written next-file is a new trigger', adviceOf(prompt(project, 'advise-next', 'lanjut')).includes(ADVICE));
}

{
  const cold = guardProject({ transcript: usageLine(LARGE_CONTEXT, 90) });
  const advice = adviceOf(prompt(cold, 'cold', 'what changed?'));
  report(GUARD, 'advises after the cache went cold, with the idle minutes',
    advice.startsWith('alpha-sdlc: this session carries about 305K tokens, and the cache went cold after 90 min.') && advice.includes(ADVICE),
    advice);
  const coldAfterPrompt = guardProject({ transcript: usageLine(LARGE_CONTEXT, 90) + userLine(0) });
  report(GUARD, 'measures idle time from the last model call, not from the prompt line',
    adviceOf(prompt(coldAfterPrompt, 'cold-prompt', 'what changed?')).includes('went cold after 90 min'));
  const warm = guardProject({ transcript: usageLine(LARGE_CONTEXT, 30) });
  report(GUARD, 'stays silent while the cache is warm and no next-file is ready', isSilent(prompt(warm, 'warm', 'lanjut')));
}

{
  const small = guardProject({ next: nextFile(), transcript: usageLine(SMALL_CONTEXT, 90) });
  report(GUARD, 'stays silent below the 200K default threshold', isSilent(prompt(small, 'small', 'lanjut')));
  const raised = guardProject({ next: nextFile(), settings: { sessionBoundaryTokens: 400000 } });
  report(GUARD, 'reads the threshold from sessionBoundaryTokens', isSilent(prompt(raised, 'raised', 'lanjut')));
  const lowered = guardProject({ next: nextFile(), settings: { sessionBoundaryTokens: '100000' }, transcript: usageLine(SMALL_CONTEXT, 1) });
  report(GUARD, 'a lower sessionBoundaryTokens catches a smaller context',
    adviceOf(prompt(lowered, 'lowered', 'lanjut')).includes('about 150K tokens'));
  const off = guardProject({ next: nextFile(), settings: { sessionBoundaries: 'off' }, transcript: usageLine(LARGE_CONTEXT, 90) });
  report(GUARD, 'does nothing when sessionBoundaries is off', isSilent(prompt(off, 'off', 'lanjut')));
}

{
  const stale = guardProject({ next: nextFile({ at: new Date(Date.now() - 20 * DAY_MS).toISOString() }) });
  report(GUARD, 'a next-file older than 14 days is not a trigger', isSilent(prompt(stale, 'stale', 'lanjut')));
  const consumed = guardProject({ next: nextFile({ status: 'consumed' }) });
  report(GUARD, 'a consumed next-file is not a trigger', isSilent(prompt(consumed, 'consumed', 'lanjut')));
  const garbled = guardProject({ next: '{not json' });
  report(GUARD, 'an unreadable next-file is not a trigger', isSilent(prompt(garbled, 'garbled', 'lanjut')));
}

{
  const synthetic = guardProject({ next: nextFile(), transcript: usageLine(LARGE_CONTEXT, 3) + syntheticLine(1) });
  report(GUARD, 'skips a synthetic message to read the last real usage',
    adviceOf(prompt(synthetic, 'synthetic', 'lanjut')).includes('about 305K tokens'));
  const sidechain = guardProject({
    next: nextFile(), transcript: usageLine(SMALL_CONTEXT, 3) + usageLine(LARGE_CONTEXT, 1, { isSidechain: true }),
  });
  report(GUARD, 'ignores a subagent usage line and reads the main thread', isSilent(prompt(sidechain, 'sidechain', 'lanjut')));
  const shrunk = guardProject({ next: nextFile(), transcript: usageLine(LARGE_CONTEXT, 5) + usageLine(SMALL_CONTEXT, 1) });
  report(GUARD, 'uses the last assistant usage, not an earlier larger one', isSilent(prompt(shrunk, 'shrunk', 'lanjut')));
  const padding = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'x'.repeat(600 * 1024) }] } }) + '\n';
  const buried = guardProject({ next: nextFile(), transcript: usageLine(LARGE_CONTEXT, 5) + padding });
  report(GUARD, 'reads only the last 512 KB of the transcript', isSilent(prompt(buried, 'buried', 'lanjut')));
}

{
  const enforce = { sessionBoundaries: 'enforce' };
  const blocked = guardProject({ next: nextFile(), settings: enforce });
  const first = prompt(blocked, 'enforce', 'lanjut');
  report(GUARD, 'enforce blocks the prompt with the fresh-session sentence',
    first.exitCode === 0 && first.output && first.output.decision === 'block' &&
      first.output.reason.startsWith('alpha-sdlc: this session carries about 305K tokens.') &&
      first.output.reason.includes("type /clear, then 'lanjut'") && first.output.reason.includes("'stay'"),
    describe(first));
  report(GUARD, 'enforce blocks once per trigger, so a resent prompt goes through', isSilent(prompt(blocked, 'enforce', 'lanjut')));

  const stayed = guardProject({ next: nextFile(), settings: enforce });
  report(GUARD, "a prompt saying 'tetap' passes in enforce mode", isSilent(prompt(stayed, 'stayed', 'tetap di sini, lanjut stage 4')));
  fs.writeFileSync(path.join(stayed, '.alpha-sdlc', 'next', 'recipe-management--web.json'), nextFile({ unit: 'Stage 4', at: minutesAgo(1) }));
  report(GUARD, 'the recorded override lets later triggers pass in that session', isSilent(prompt(stayed, 'stayed', 'lanjut')));
  report(GUARD, 'the override also lets alpha-sdlc skills start', isSilent(skillCall(stayed, 'stayed')));
  report(GUARD, 'the override belongs to its session only',
    (prompt(stayed, 'stayed-other', 'lanjut').output || {}).decision === 'block');
  const english = guardProject({ next: nextFile(), settings: enforce });
  report(GUARD, "a prompt saying 'stay' passes in enforce mode", isSilent(prompt(english, 'english', 'stay here and continue')));

  const workspace = guardProject({ next: nextFile(), children: { 'adp-web': enforce } });
  const fromChild = prompt(workspace, 'workspace', 'lanjut');
  report(GUARD, 'a workspace parent takes the mode from its child repo mirror',
    Boolean(fromChild.output && fromChild.output.decision === 'block'), describe(fromChild));

  const mixed = guardProject({
    next: nextFile(),
    children: {
      'adp-web': { sessionBoundaries: 'enforce', sessionBoundaryTokens: 400000 },
      'development-platform': { sessionBoundaryTokens: 250000 },
      'adp-api': { sessionBoundaries: 'off' },
    },
  });
  const strictest = prompt(mixed, 'mixed', 'lanjut');
  report(GUARD, 'across child repos the strictest mode and the lowest threshold apply',
    Boolean(strictest.output && strictest.output.decision === 'block'), describe(strictest));
  const allOff = guardProject({ next: nextFile(), children: { 'adp-web': { sessionBoundaries: 'off' }, 'adp-api': { sessionBoundaries: 'off' } } });
  report(GUARD, 'the guard is off in a workspace only when every child repo turns it off', isSilent(prompt(allOff, 'all-off', 'lanjut')));
}

{
  const enforce = { sessionBoundaries: 'enforce' };
  const project = guardProject({ next: nextFile(), settings: enforce });
  const denied = skillCall(project, 'skill-enforce');
  const decision = ((denied.output || {}).hookSpecificOutput) || {};
  report(GUARD, 'enforce denies starting an alpha-sdlc skill at a boundary',
    denied.exitCode === 0 && decision.hookEventName === 'PreToolUse' && decision.permissionDecision === 'deny' &&
      decision.permissionDecisionReason.includes('Before starting alpha-sdlc:do-testing: ' + DENIAL),
    describe(denied));
  report(GUARD, 'denies a skill once per trigger', isSilent(skillCall(project, 'skill-enforce')));
  report(GUARD, 'never touches a skill from another plugin', isSilent(skillCall(project, 'skill-other', 'superpowers:brainstorming')));
  report(GUARD, 'never touches a tool other than Skill', isSilent(skillCall(project, 'skill-bash', 'alpha-sdlc:do-testing', 'Bash')));
  const advise = guardProject({ next: nextFile() });
  report(GUARD, 'advise mode never denies a skill', isSilent(skillCall(advise, 'skill-advise')));
  const chain = guardProject({ next: nextFile(), settings: enforce, autoRun: { status: 'running', feature: 'recipe-management', platform: 'web' } });
  report(GUARD, 'a running auto-run chain is not stopped at a skill change', isSilent(skillCall(chain, 'skill-chain')));
  const quiet = guardProject({ settings: enforce, transcript: usageLine(LARGE_CONTEXT, 1) });
  report(GUARD, 'no next-file and a warm cache let the skill start', isSilent(skillCall(quiet, 'skill-quiet')));
}

{
  const outside = projectFixture('outside', {
    'transcript.jsonl': usageLine(LARGE_CONTEXT, 90),
    '.alpha-sdlc-not/next/recipe-management--web.json': nextFile(),
  });
  report(GUARD, 'does nothing outside an SDLC project', isSilent(prompt(outside, 'outside', 'lanjut')));
  const missing = guardProject({ next: nextFile() });
  fs.rmSync(path.join(missing, 'transcript.jsonl'));
  report(GUARD, 'fails open without a transcript', isSilent(prompt(missing, 'missing', 'lanjut')));
  const garbage = run(path.join(hooksDirectory, GUARD), [], { input: '{not json', cwd: outside });
  report(GUARD, 'fails open on unreadable input', isSilent(garbage), describe(garbage));
  const otherEvent = guardProject({ next: nextFile(), transcript: usageLine(LARGE_CONTEXT, 90) });
  const stopPayload = guard({
    hook_event_name: 'Stop', session_id: 'other-event', cwd: otherEvent, transcript_path: path.join(otherEvent, 'transcript.jsonl'),
  });
  report(GUARD, 'answers only the prompt and Skill events it is registered for', isSilent(stopPayload), describe(stopPayload));
  const blockedData = path.join(fixtureDirectory, 'plugin-data-is-a-file');
  fs.writeFileSync(blockedData, 'not a directory\n');
  const unwritable = guardProject({ next: nextFile(), settings: { sessionBoundaries: 'enforce' } });
  report(GUARD, 'never blocks when it cannot record the once-per-trigger state',
    isSilent(prompt(unwritable, 'unwritable', 'lanjut', { CLAUDE_PLUGIN_DATA: blockedData })));
}

{
  const compactBoundary = JSON.stringify({ type: 'system', subtype: 'compact_boundary', timestamp: minutesAgo(1), content: 'Conversation compacted' }) + '\n';
  const compactSummary = JSON.stringify({ type: 'user', isCompactSummary: true, timestamp: minutesAgo(1), message: { role: 'user', content: 'This session is being continued.' } }) + '\n';
  const compacted = guardProject({ next: nextFile(), transcript: usageLine(LARGE_CONTEXT, 2) + compactBoundary + compactSummary + userLine(0) });
  report(GUARD, 'after a manual /compact the old context size is not reported', isSilent(prompt(compacted, 'after-compact', 'lanjut')));
  const recompacted = guardProject({ next: nextFile(), transcript: usageLine(LARGE_CONTEXT, 5) + compactBoundary + usageLine(LARGE_CONTEXT, 1) });
  report(GUARD, 'a model call after the compaction is measured again', adviceOf(prompt(recompacted, 'after-compact-call', 'lanjut')).includes('305K tokens'));
}

{
  const workspace = projectFixture('guard-launched', { '.alpha-sdlc/next/recipe-management--web.json': nextFile() });
  const child = sdlcProject(path.join('guard-launched', 'adp-web'), { 'transcript.jsonl': usageLine(LARGE_CONTEXT, 1) });
  const nudged = prompt(child, 'launched-workspace', 'lanjut', { CLAUDE_PROJECT_DIR: workspace });
  report(GUARD, 'a ready next-file at the start directory counts while the shell sits in a child repo', adviceOf(nudged).includes(ADVICE), describe(nudged));
}

{
  const hooks = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const command = `node "\${CLAUDE_PLUGIN_ROOT}/hooks/${GUARD}"`;
  const registered = (event, matcher) => (hooks[event] || [])
    .filter((group) => (group.matcher || '') === matcher)
    .some((group) => group.hooks.some((hook) => hook.type === 'command' && hook.command === command));
  report('hooks.json', 'the guard runs on every prompt and before every Skill call',
    registered('UserPromptSubmit', '') && registered('PreToolUse', 'Skill'));
}

finish();
