#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { isSdlcContext, stateDirectoryFor } = require('./lib/sdlc-context');

const pluginRoot = path.resolve(process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..'));

const OUTPUT_LIMIT = 9000;
const SCAN_LIMIT_BYTES = 64 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;
const LINE_LIMIT_BYTES = 8 * 1024 * 1024;
const FIELD_LIMIT = 80;
const NEWLINE = 0x0a;
const PLUGIN_MARKER = Buffer.from('alpha-sdlc');
const BASE_MARKER = Buffer.from('Base directory for this skill');
const SKILL_NAME = '([a-z0-9][a-z0-9-]*)';
const SKILL_TOOL_INPUT = new RegExp('^alpha-sdlc:' + SKILL_NAME + '$');
const COMMAND_NAME = new RegExp('<command-name>\\/?alpha-sdlc:' + SKILL_NAME + '<\\/command-name>');
const BASE_DIRECTORY = /^Base directory for this skill: (\S+)/;
const INSTALLED_SKILL_DIRECTORY = new RegExp(
  '[\\\\/]alpha-sdlc(?:[\\\\/][^\\\\/\\s]+)?[\\\\/]skills[\\\\/]' + SKILL_NAME + '[\\\\/]?$',
);
const FENCE = /^\s{0,3}(?:```|~~~)/;
const SECTION_HEADING = /^##\s/;
const GATES_HEADING = /^##\s+Gates\b/i;
const CUT_NOTE = '\n… (cut to fit the hook output limit; the full text is in the files named here)';

function readPayload() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')) || {}; } catch { return {}; }
}

function readOrEmpty(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function clip(value, limit) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : text.slice(0, limit - 1) + '…';
}

function* linesFromEnd(handle, size, floor) {
  let position = size;
  let pending = [];
  let pendingBytes = 0;
  let oversized = false;
  while (position > floor) {
    const length = Math.min(CHUNK_BYTES, position - floor);
    position -= length;
    const chunk = Buffer.alloc(length);
    fs.readSync(handle, chunk, 0, length, position);
    let end = length;
    let newline = chunk.lastIndexOf(NEWLINE, end - 1);
    while (newline !== -1) {
      const piece = chunk.subarray(newline + 1, end);
      if (!oversized) yield pending.length ? Buffer.concat([piece, ...pending]) : piece;
      pending = [];
      pendingBytes = 0;
      oversized = false;
      end = newline;
      newline = end > 0 ? chunk.lastIndexOf(NEWLINE, end - 1) : -1;
    }
    if (oversized) continue;
    pending.unshift(chunk.subarray(0, end));
    pendingBytes += end;
    if (pendingBytes > LINE_LIMIT_BYTES) {
      pending = [];
      pendingBytes = 0;
      oversized = true;
    }
  }
  if (floor === 0 && !oversized && pendingBytes) yield Buffer.concat(pending);
}

function textsOf(content) {
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  return content.filter((item) => item && item.type === 'text' && typeof item.text === 'string').map((item) => item.text);
}

function skillOfBaseDirectory(directory) {
  const installed = INSTALLED_SKILL_DIRECTORY.exec(directory);
  if (installed) return installed[1];
  const skillsDirectory = path.join(pluginRoot, 'skills');
  const relative = path.relative(skillsDirectory, path.resolve(directory));
  return /^[a-z0-9][a-z0-9-]*$/.test(relative) ? relative : null;
}

function invokedSkill(entry) {
  if (!entry || entry.isSidechain || entry.isCompactSummary) return null;
  const content = (entry.message || {}).content;
  if (entry.type === 'assistant' && Array.isArray(content)) {
    for (let index = content.length - 1; index >= 0; index--) {
      const item = content[index];
      if (!item || item.type !== 'tool_use' || item.name !== 'Skill' || !item.input) continue;
      const match = SKILL_TOOL_INPUT.exec(String(item.input.skill || ''));
      if (match) return match[1];
    }
    return null;
  }
  if (entry.type !== 'user') return null;
  for (const text of textsOf(content).reverse()) {
    const command = COMMAND_NAME.exec(text);
    if (command) return command[1];
    const base = BASE_DIRECTORY.exec(text);
    const fromBase = base && skillOfBaseDirectory(base[1]);
    if (fromBase) return fromBase;
  }
  return null;
}

function activeSkill(transcriptPath) {
  let handle;
  try {
    handle = fs.openSync(transcriptPath, 'r');
    const size = fs.fstatSync(handle).size;
    for (const line of linesFromEnd(handle, size, Math.max(0, size - SCAN_LIMIT_BYTES))) {
      if (!line.length || (line.indexOf(PLUGIN_MARKER) === -1 && line.indexOf(BASE_MARKER) === -1)) continue;
      let entry;
      try { entry = JSON.parse(line.toString('utf8')); } catch { continue; }
      const name = invokedSkill(entry);
      if (name) return name;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (handle !== undefined) try { fs.closeSync(handle); } catch {}
  }
}

function gatesSection(markdown) {
  const collected = [];
  let inside = false;
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      if (inside) collected.push(line);
      continue;
    }
    if (!fenced && SECTION_HEADING.test(line)) {
      if (inside) break;
      inside = GATES_HEADING.test(line);
      continue;
    }
    if (inside) collected.push(line);
  }
  return collected.join('\n').trim();
}

function rereadLine(skillName, skillText) {
  const rulesDirectory = path.join(pluginRoot, 'rules');
  const bundles = ((readJson(path.join(rulesDirectory, 'applicability.json')) || {}).bundles) || {};
  const bundleOf = (name) => bundles[name] || {};
  const owning = Object.keys(bundles).find((name) => [].concat(bundleOf(name).skills || []).includes(skillName));
  const owningPath = owning && path.join(rulesDirectory, owning + '.md');
  const primary = owningPath && fs.existsSync(owningPath) ? owningPath : path.join(pluginRoot, 'principles.md');
  const conditional = Object.keys(bundles)
    .filter((name) => name !== owning && bundleOf(name).readWhen && skillText.includes('rules/' + name + '.md'))
    .filter((name) => fs.existsSync(path.join(rulesDirectory, name + '.md')))
    .map((name) => ' (and `' + path.join(rulesDirectory, name + '.md') + '` when ' + bundleOf(name).readWhen + ')');
  return 'Re-read `' + primary + '`' + conditional.join('') +
    ' and the reference file of your current step before the next gate.';
}

function autoRunLine(cwd) {
  const marker = readJson(path.join(stateDirectoryFor(cwd), 'auto-run.json'));
  if (!marker || marker.status !== 'running') return '';
  const target = [marker.feature, marker.platform].filter(Boolean).map((part) => clip(part, FIELD_LIMIT)).join(' · ');
  const limits = [
    marker.until ? 'until: ' + clip(marker.until, FIELD_LIMIT) : '',
    marker.scope ? 'scope: ' + clip(marker.scope, FIELD_LIMIT) : '',
  ].filter(Boolean).join('; ');
  return 'Auto-run is running' + (target ? ' for ' + target : '') + (limits ? ' (' + limits + ')' : '') +
    ': continue the chain; stop only where the auto-run rule allows, after setting its "status" in ' +
    '.alpha-sdlc/auto-run.json as that rule says.';
}

function compactContext(skillName, cwd) {
  const skillPath = path.join(pluginRoot, 'skills', skillName, 'SKILL.md');
  const skillText = readOrEmpty(skillPath);
  const digest = readOrEmpty(path.join(pluginRoot, 'rules', 'compact-digest.md')).trim();
  const gates = gatesSection(skillText);
  const parts = ['alpha-sdlc after compaction: the active skill is `alpha-sdlc:' + skillName + '`.'];
  const autoRun = autoRunLine(cwd);
  if (autoRun) parts.push(autoRun);
  if (digest) parts.push(digest);
  if (gates) parts.push('Gates of `' + skillName + '` (the `## Gates` section of ' + skillPath + '):\n' + gates);
  const body = parts.join('\n\n');
  const closing = rereadLine(skillName, skillText);
  const full = body + '\n\n' + closing;
  if (full.length <= OUTPUT_LIMIT) return full;
  return body.slice(0, OUTPUT_LIMIT - closing.length - CUT_NOTE.length - 2) + CUT_NOTE + '\n\n' + closing;
}

function main() {
  const payload = readPayload();
  if (payload.source && payload.source !== 'compact') return;
  const cwd = path.resolve(payload.cwd || process.cwd());
  if (!payload.transcript_path || !isSdlcContext(cwd)) return;
  const skillName = activeSkill(payload.transcript_path);
  if (!skillName) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: compactContext(skillName, cwd) },
  }));
}

try { main(); } catch {}
