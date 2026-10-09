#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { isSdlcContext, profileRootsFor, stateDirectoryFor, stateDirectoriesFor } = require('./lib/sdlc-context');

const MODES = ['off', 'advise', 'enforce'];
const DEFAULT_MODE = 'advise';
const DEFAULT_THRESHOLD_TOKENS = 200000;
const IDLE_MINUTES = 60;
const TAIL_BYTES = 512 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const NEXT_FILE_MAX_AGE_MS = 14 * DAY_MS;
const STATE_RETENTION_MS = 14 * DAY_MS;
const OVERRIDE_WORD = /\b(?:stay|tetap)\b/i;
const PLUGIN_SKILL = /^alpha-sdlc:/;
const COMPACTION_MARKERS = ['compact_boundary', 'isCompactSummary'];

function readPayload() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')) || {}; } catch { return {}; }
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function positiveCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function boundarySettings(cwd) {
  let modeRank = -1;
  let threshold = null;
  for (const root of profileRootsFor(cwd)) {
    const settings = readJson(path.join(root, 'docs', 'basics', '.alpha-sdlc.json')) || {};
    const declared = typeof settings.sessionBoundaries === 'string' ? settings.sessionBoundaries.trim().toLowerCase() : '';
    modeRank = Math.max(modeRank, MODES.indexOf(MODES.includes(declared) ? declared : DEFAULT_MODE));
    const raw = settings.sessionBoundaryTokens;
    const tokens = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN;
    if (Number.isFinite(tokens) && tokens > 0) threshold = threshold === null ? tokens : Math.min(threshold, tokens);
  }
  return {
    mode: modeRank < 0 ? DEFAULT_MODE : MODES[modeRank],
    threshold: threshold === null ? DEFAULT_THRESHOLD_TOKENS : threshold,
  };
}

function lastAssistantUsage(transcriptPath) {
  let handle;
  try {
    handle = fs.openSync(transcriptPath, 'r');
    const size = fs.fstatSync(handle).size;
    const length = Math.min(size, TAIL_BYTES);
    const tail = Buffer.alloc(length);
    fs.readSync(handle, tail, 0, length, size - length);
    const lines = tail.toString('utf8').split('\n');
    if (length < size) lines.shift();
    for (let index = lines.length - 1; index >= 0; index--) {
      const compaction = COMPACTION_MARKERS.some((marker) => lines[index].includes(marker));
      if (!compaction && !lines[index].includes('"usage"')) continue;
      let entry;
      try { entry = JSON.parse(lines[index]); } catch { continue; }
      if (!entry || entry.isSidechain) continue;
      if (compaction && (entry.isCompactSummary === true || (entry.type === 'system' && entry.subtype === 'compact_boundary'))) {
        return null;
      }
      if (entry.type !== 'assistant') continue;
      const message = entry.message || {};
      if (message.model === '<synthetic>') continue;
      const usage = message.usage || {};
      const context = positiveCount(usage.input_tokens) + positiveCount(usage.cache_creation_input_tokens) +
        positiveCount(usage.cache_read_input_tokens);
      if (context > 0) return { context, at: Date.parse(entry.timestamp) };
    }
    return null;
  } catch {
    return null;
  } finally {
    if (handle !== undefined) try { fs.closeSync(handle); } catch {}
  }
}

function newestReadyNextFile(cwd, now) {
  let newest = null;
  for (const stateDirectory of stateDirectoriesFor(cwd)) {
    const directory = path.join(stateDirectory, 'next');
    let names;
    try { names = fs.readdirSync(directory).filter((name) => name.endsWith('.json')); } catch { continue; }
    for (const name of names) {
      const entry = readJson(path.join(directory, name));
      if (!entry || entry.status !== 'ready') continue;
      const at = Date.parse(entry.at);
      if (!Number.isFinite(at) || now - at > NEXT_FILE_MAX_AGE_MS) continue;
      if (!newest || at > newest.at) newest = { name, at };
    }
  }
  return newest;
}

function autoRunIsRunning(cwd) {
  const marker = readJson(path.join(stateDirectoryFor(cwd), 'auto-run.json'));
  return Boolean(marker) && marker.status === 'running';
}

function stateFileFor(sessionId) {
  const dataDirectory = process.env.CLAUDE_PLUGIN_DATA || path.join(os.tmpdir(), 'alpha-sdlc');
  const name = String(sessionId || '').replace(/[^A-Za-z0-9_-]/g, '') || 'unknown';
  return path.join(dataDirectory, 'boundary-guard', name + '.json');
}

function loadState(stateFile) {
  const saved = readJson(stateFile) || {};
  return { fired: Array.isArray(saved.fired) ? saved.fired : [], override: saved.override === true };
}

function saveState(stateFile, state, now) {
  try {
    const directory = path.dirname(stateFile);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state) + '\n');
    for (const name of fs.readdirSync(directory)) {
      const filePath = path.join(directory, name);
      try {
        if (filePath !== stateFile && now - fs.statSync(filePath).mtimeMs > STATE_RETENTION_MS) fs.unlinkSync(filePath);
      } catch {}
    }
    return true;
  } catch {
    return false;
  }
}

function boundaryTriggers(cwd, usage, idleMinutes, now) {
  const triggers = [];
  const readyNext = newestReadyNextFile(cwd, now);
  if (readyNext) triggers.push('next:' + readyNext.name + '@' + readyNext.at);
  if (idleMinutes > IDLE_MINUTES) triggers.push('idle:' + usage.at);
  return triggers;
}

function sessionFacts(usage, idleMinutes) {
  return 'alpha-sdlc: this session carries about ' + Math.round(usage.context / 1000) + 'K tokens' +
    (idleMinutes > IDLE_MINUTES ? ', and the cache went cold after ' + idleMinutes + ' min' : '') + '.';
}

function respond(isSkillCall, mode, skill, facts) {
  if (isSkillCall) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: facts + ' Before starting ' + skill + ': write the next-file and handoff, then ask ' +
          "the user to /clear; the next session resumes with 'lanjut'.",
      },
    };
  }
  if (mode === 'enforce') {
    return {
      decision: 'block',
      reason: facts + " A fresh session continues from the files at a fraction of the cost: type /clear, then 'lanjut'. " +
        "To stay in this session, send your message again; add 'stay' (or 'tetap') to skip this check for the rest of " +
        'the session.',
    };
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: facts + ' Tell the user in one line that a fresh session continues from the files at a ' +
        "fraction of the cost (/clear, then 'lanjut'), then do what they asked.",
    },
  };
}

function main() {
  const payload = readPayload();
  const event = payload.hook_event_name || (payload.tool_name === undefined ? 'UserPromptSubmit' : 'PreToolUse');
  if (event !== 'UserPromptSubmit' && event !== 'PreToolUse') return;
  const isSkillCall = event === 'PreToolUse';
  const skill = String((payload.tool_input || {}).skill || '');
  if (isSkillCall && (payload.tool_name !== 'Skill' || !PLUGIN_SKILL.test(skill))) return;
  const cwd = path.resolve(payload.cwd || process.cwd());
  if (!isSdlcContext(cwd)) return;
  const { mode, threshold } = boundarySettings(cwd);
  if (mode === 'off' || (isSkillCall && (mode !== 'enforce' || autoRunIsRunning(cwd)))) return;
  const usage = payload.transcript_path ? lastAssistantUsage(payload.transcript_path) : null;
  if (!usage || usage.context <= threshold) return;
  const now = Date.now();
  const idleMinutes = Number.isFinite(usage.at) ? Math.floor((now - usage.at) / 60000) : 0;
  const firedScope = isSkillCall ? 'skill' : 'prompt';
  const stateFile = stateFileFor(payload.session_id);
  const state = loadState(stateFile);
  const unfired = boundaryTriggers(cwd, usage, idleMinutes, now)
    .map((trigger) => firedScope + ':' + trigger)
    .filter((key) => !state.fired.includes(key));
  if (state.override || !unfired.length) return;
  if (!isSkillCall && mode === 'enforce' && OVERRIDE_WORD.test(String(payload.prompt || ''))) {
    saveState(stateFile, { ...state, override: true }, now);
    return;
  }
  if (!saveState(stateFile, { ...state, fired: [...state.fired, ...unfired] }, now)) return;
  process.stdout.write(JSON.stringify(respond(isSkillCall, mode, skill, sessionFacts(usage, idleMinutes))));
}

try { main(); } catch {}
