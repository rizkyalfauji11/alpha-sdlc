#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { isSdlcContext, sessionStateDirectoryFor } = require('./lib/sdlc-context');

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

function readPayload() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')) || {}; } catch { return {}; }
}

function sessionFileName(sessionId) {
  return (String(sessionId || '').replace(/[^A-Za-z0-9_-]/g, '') || 'unknown') + '.md';
}

function keepOutOfGit(stateDirectory) {
  const ignorePath = path.join(stateDirectory, '.gitignore');
  if (!fs.existsSync(ignorePath)) fs.writeFileSync(ignorePath, '*\n');
}

function pruneExpired(directory, now) {
  for (const name of fs.readdirSync(directory)) {
    if (!name.endsWith('.md')) continue;
    const filePath = path.join(directory, name);
    try {
      if (now - fs.statSync(filePath).mtimeMs > RETENTION_MS) fs.unlinkSync(filePath);
    } catch {}
  }
}

function isRewriteOfSaved(payload, snapshotPath, message, headerOf) {
  if (payload.stop_hook_active !== true) return false;
  let saved;
  try { saved = fs.readFileSync(snapshotPath, 'utf8'); } catch { return false; }
  const header = headerOf(message);
  return Boolean(header) && header === headerOf(saved);
}

function main() {
  const payload = readPayload();
  const message = typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : '';
  if (!message.trim()) return;
  const cwd = path.resolve(payload.cwd || process.cwd());
  if (!isSdlcContext(cwd)) return;
  const { hasStepSummaryMarkers, splitMessage } = require('./stop-judge');
  if (!hasStepSummaryMarkers(message)) return;
  const stateDirectory = sessionStateDirectoryFor(cwd);
  if (!stateDirectory) return;
  const directory = path.join(stateDirectory, 'handoff', 'last-stop');
  const snapshotPath = path.join(directory, sessionFileName(payload.session_id));
  if (isRewriteOfSaved(payload, snapshotPath, message, (text) => splitMessage(text).header)) return;
  fs.mkdirSync(directory, { recursive: true });
  keepOutOfGit(stateDirectory);
  fs.writeFileSync(snapshotPath, message.replace(/\n*$/, '\n'));
  pruneExpired(directory, Date.now());
}

try { main(); } catch {}
