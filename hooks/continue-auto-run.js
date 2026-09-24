#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

let payload;
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

const projectRoot = payload.cwd || process.cwd();
const markerPath = path.join(projectRoot, '.alpha-sdlc', 'auto-run.json');

let marker;
try { marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')); } catch { process.exit(0); }
if (!marker || marker.status !== 'running') process.exit(0);

const TOOL_USE = '"type":"tool_use"';

function transcriptSize() {
  try { return fs.statSync(payload.transcript_path).size; } catch { return null; }
}

function toolUsedSince(offset) {
  if (offset === null || offset === undefined || !payload.transcript_path) return true;
  let handle;
  try {
    handle = fs.openSync(payload.transcript_path, 'r');
    const size = fs.fstatSync(handle).size;
    if (size <= offset) return false;
    const length = Math.min(size - offset, 64 * 1024 * 1024);
    const buffer = Buffer.alloc(length);
    fs.readSync(handle, buffer, 0, length, size - length);
    return buffer.toString('utf8').includes(TOOL_USE);
  } catch {
    return true;
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

const size = transcriptSize();
const previous = marker.lastBlock || null;
const madeProgress = !previous || toolUsedSince(previous.transcriptSize);

marker.lastBlock = { transcriptSize: size, at: new Date().toISOString() };
try { fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n'); } catch {}

if (!madeProgress) {
  process.stderr.write(
    'alpha-sdlc auto-run: no tool ran since the last push to continue, so this stop is allowed. ' +
    'The chain is still marked running; say what blocks it, or set "status": "halted" with a "reason".\n',
  );
  process.exit(0);
}

const scope = [marker.feature, marker.platform].filter(Boolean).join(' · ');
process.stderr.write(
  'alpha-sdlc auto-run is still running' + (scope ? ' for ' + scope : '') +
  (marker.until ? ' (until: ' + marker.until + ')' : '') + '. ' +
  'A stage report or a checkpoint is not a stop, and neither is waiting for a reviewer — continue now ' +
  'with the next step of the chain: the next stage, then testing, fixing, re-test' +
  (marker.until ? ', up to ' + marker.until : '') + '. ' +
  'Stop only for one of the five halting cases (failed verification tooling, an input that does not exist, ' +
  'an external write, a fix that failed three times, a change the hub would need) — and before stopping, ' +
  'set "status": "halted" and a "reason" in .alpha-sdlc/auto-run.json. When the chain ends, set ' +
  '"status": "done".\n',
);
process.exit(2);
