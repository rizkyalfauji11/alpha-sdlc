#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ancestorsOf } = require('./lib/sdlc-context');
const { resolveGuide } = require('./lib/plain-language');

const pluginRoot = path.resolve(process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..'));
const OUTPUT_LIMIT = 9000;

function readPayload() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')) || {}; } catch { return {}; }
}

function scopeSentence(guide, cwd) {
  const enclosing = new Set(ancestorsOf(cwd));
  const ownRepository = guide.repos.some((repository) => enclosing.has(path.resolve(repository)));
  if (ownRepository) return 'This project presents the plain layer of every step summary in the language below.';
  const names = guide.repos.map((repository) => path.relative(cwd, repository) || path.basename(repository));
  return 'In this workspace, ' + names.join(', ') + (names.length === 1 ? ' presents' : ' present') +
    ' the plain layer of every step summary in the language below; a summary about any other repo follows ' +
    "that repo's own setting.";
}

function guideContext(guide, cwd) {
  const preface = 'alpha-sdlc: ' + scopeSentence(guide, cwd) + ' The guide binds that layer in every phase; its ' +
    'glossary and examples win over improvisation. Source: ' + guide.guidePath;
  const full = preface + '\n\n' + guide.text;
  if (full.length <= OUTPUT_LIMIT) return full;
  const continuation = '\n\n… the guide continues in ' + guide.guidePath + '; read the rest before the next step summary.';
  return full.slice(0, OUTPUT_LIMIT - continuation.length) + continuation;
}

function main() {
  const payload = readPayload();
  const cwd = path.resolve(payload.cwd || process.cwd());
  const guide = resolveGuide(cwd, pluginRoot);
  if (!guide) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: guideContext(guide, cwd) },
  }));
}

try { main(); } catch {}
