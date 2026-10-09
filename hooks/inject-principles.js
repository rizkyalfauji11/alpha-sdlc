#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { isSdlcContext, stateDirectoriesFor } = require('./lib/sdlc-context');

const pluginRoot = path.resolve(process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..'));

const POINTER_LIMIT = 600;
const NOTICE_LIMIT = 1500;
const FIELD_LIMIT = 160;
const LABEL_PART_LIMIT = 60;
const HOUR_MS = 60 * 60 * 1000;
const NEXT_FILE_MAX_AGE_MS = 14 * 24 * HOUR_MS;
const LAST_STOP_MAX_AGE_MS = 24 * HOUR_MS;
const GIT_TIMEOUT_MS = 5000;
const RESUME_SOURCES = new Set(['startup', 'clear', 'resume']);
const COMMIT_ID = /^[0-9a-f]{7,64}$/i;

function readPayload() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')) || {}; } catch { return {}; }
}

function pointerText() {
  const enforced = ' (generated from principles.md) when it starts. Hooks enforce zero code comments, a filled ' +
    'Approach/rung line in every plan stage and TRD design section, valid doc tables, and docs written only with ' +
    'Edit or Write.';
  const withRoot = 'alpha-sdlc: each skill loads its binding rules from ' +
    path.join(pluginRoot, 'rules', '<bundle>.md') + enforced;
  if (withRoot.length <= POINTER_LIMIT) return withRoot;
  return 'alpha-sdlc: each skill loads its binding rules from rules/<bundle>.md under the plugin root' + enforced;
}

function clip(value, limit) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : text.slice(0, limit - 1) + '…';
}

function sessionFileName(sessionId) {
  return (String(sessionId || '').replace(/[^A-Za-z0-9_-]/g, '') || 'unknown') + '.md';
}

function readNextEntries(stateDirectory) {
  const directory = path.join(stateDirectory, 'next');
  let names;
  try { names = fs.readdirSync(directory).filter((name) => name.endsWith('.json')); } catch { return []; }
  const entries = [];
  for (const name of names) {
    try {
      const entry = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
      if (entry && typeof entry === 'object') {
        entries.push({ name, entry, at: Date.parse(entry.at), directory, root: path.dirname(stateDirectory) });
      }
    } catch {}
  }
  return entries;
}

function isResumable({ entry, at }, now) {
  return entry.status === 'ready' && Boolean(entry.skill) && Number.isFinite(at) && now - at <= NEXT_FILE_MAX_AGE_MS;
}

function commitStanding(repository, head) {
  if (!COMMIT_ID.test(String(head || ''))) return 'unverified';
  const result = spawnSync('git', ['-C', repository, 'merge-base', '--is-ancestor', String(head), 'HEAD'], {
    stdio: 'ignore',
    timeout: GIT_TIMEOUT_MS,
  });
  if (result.status === 0) return 'verified';
  if (result.status === 1) return 'moved';
  return 'unverified';
}

function resumeLine({ name, entry }, standing) {
  const stem = name.replace(/\.json$/, '');
  const split = stem.lastIndexOf('--');
  const fileFeature = split === -1 ? stem : stem.slice(0, split);
  const filePlatform = split === -1 ? '' : stem.slice(split + 2);
  const label = [entry.feature || fileFeature, entry.platform || filePlatform, entry.unit]
    .filter(Boolean)
    .map((part) => clip(part, LABEL_PART_LIMIT))
    .join(' · ');
  const caveat = standing === 'unverified' ? '; unverified: git could not confirm its recorded commit' : '';
  const argumentsText = Array.isArray(entry.args) ? entry.args.join(' ') : entry.args;
  const invocation = 'invoke `' + clip(entry.skill, FIELD_LIMIT) + '`' +
    (argumentsText ? ' with `' + clip(argumentsText, FIELD_LIMIT) + '`' : '');
  const handoff = entry.handoff ? ' and read `' + clip(entry.handoff, FIELD_LIMIT) + '` first' : '';
  return 'Resume pending (' + label + caveat + "): when the user's next message continues the work " +
    "(e.g. 'lanjut'), " + invocation + handoff + '; otherwise do what the user asks.';
}

function lastStopLine(stateDirectories, sessionId, now) {
  const ownName = sessionFileName(sessionId);
  let newest = null;
  for (const stateDirectory of stateDirectories) {
    const directory = path.join(stateDirectory, 'handoff', 'last-stop');
    let names;
    try { names = fs.readdirSync(directory); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith('.md') || name === ownName) continue;
      let modified;
      try { modified = fs.statSync(path.join(directory, name)).mtimeMs; } catch { continue; }
      if (now - modified > LAST_STOP_MAX_AGE_MS) continue;
      if (!newest || modified > newest.modified) newest = { filePath: path.join(directory, name), modified };
    }
  }
  if (!newest) return '';
  return 'The last step summary before the clear is saved at ' + newest.filePath + ' — read it if the user answers it.';
}

function resumeNotice(payload, cwd) {
  const now = Date.now();
  const stateDirectories = stateDirectoriesFor(cwd);
  const lastStop = lastStopLine(stateDirectories, payload.session_id, now);
  const candidates = stateDirectories
    .flatMap(readNextEntries)
    .filter((candidate) => isResumable(candidate, now))
    .sort((first, second) => second.at - first.at);
  const moreLine = (count, directories) => count + ' more ready next-file' + (count === 1 ? '' : 's') + ' in ' +
    [...directories].join(', ') + ' — read them only when the user asks.';
  const reserve = (lastStop ? lastStop.length + 1 : 0) +
    moreLine(candidates.length, new Set(candidates.map((candidate) => candidate.directory))).length + 1;
  const lines = [];
  const unshownDirectories = new Set();
  let used = 0;
  let unshown = 0;
  for (const candidate of candidates) {
    if (unshown) {
      unshown++;
      unshownDirectories.add(candidate.directory);
      continue;
    }
    const repository = path.resolve(candidate.root, String(candidate.entry.repo || '.'));
    const standing = commitStanding(repository, candidate.entry.head);
    if (standing === 'moved') continue;
    const line = resumeLine(candidate, standing);
    if (used + line.length + 1 > NOTICE_LIMIT - reserve) {
      unshown++;
      unshownDirectories.add(candidate.directory);
      continue;
    }
    lines.push(line);
    used += line.length + 1;
  }
  if (unshown) lines.push(moreLine(unshown, unshownDirectories));
  if (lastStop) lines.push(lastStop);
  return lines.join('\n').slice(0, NOTICE_LIMIT);
}

function main() {
  const payload = readPayload();
  const cwd = path.resolve(payload.cwd || process.cwd());
  if (!isSdlcContext(cwd)) return;
  const parts = [pointerText()];
  if (RESUME_SOURCES.has(payload.source || 'startup')) {
    const notice = resumeNotice(payload, cwd);
    if (notice) parts.push(notice);
  }
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.join('\n\n') },
  }));
}

try { main(); } catch {}
