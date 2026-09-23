#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const pluginRoot = path.resolve(process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..'));
const principlesPath = path.join(pluginRoot, 'principles.md');

let payload = {};
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch {}
const projectRoot = payload.cwd || process.cwd();

let principles;
try {
  principles = fs.readFileSync(principlesPath, 'utf8');
} catch {
  process.exit(0);
}

const SECTION_HEADING = /^##\s+(.+?)\s*$/;
const RULE_LEAD = /^(?:[-*]|\d+\.)\s+\*\*(.+?)\*\*/;

const entries = [];
let sectionCount = 0;
let ruleCount = 0;

for (const line of principles.split('\n')) {
  const section = line.match(SECTION_HEADING);
  if (section) {
    entries.push((entries.length ? '\n' : '') + section[1]);
    sectionCount++;
    continue;
  }
  const rule = line.match(RULE_LEAD);
  if (rule) {
    entries.push('  · ' + rule[1].replace(/\s+/g, ' ').trim());
    ruleCount++;
  }
}

if (!ruleCount) process.exit(0);

const additionalContext = [
  'alpha-sdlc plugin — this is the INDEX of the shared principles. Titles only.',
  '',
  'The binding text lives in ' + principlesPath + ' — every rule below carries conditions,',
  'exceptions and a worked reason that are NOT in this list, and several are hard STOPs whose',
  'wording decides the outcome. This index exists so you know which rules exist; it is never a',
  'substitute for reading them, and a session that has only this list has not read the principles.',
  '',
  '**Read that file in full before your first action in any alpha-sdlc skill** — and again when a',
  'title below is about to apply and you have not read its text this session.',
  '',
  entries.join('\n'),
  '',
  ruleCount + ' rules across ' + sectionCount + ' sections. This index is derived from the file at',
  'run time, so it is never stale — but it is never the rule either. Read the file.',
].join('\n');

const LANGUAGE_NAMES = { id: /indonesia/i };

function readOrEmpty(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function plainLanguageCode() {
  try {
    const settings = JSON.parse(readOrEmpty(path.join(projectRoot, 'docs/basics/.alpha-sdlc.json')));
    if (typeof settings.plainLanguage === 'string') return settings.plainLanguage.trim().toLowerCase();
  } catch {}
  const overview = readOrEmpty(path.join(projectRoot, 'docs/basics/01-overview.md'));
  const settingRow = overview.split('\n').find((line) => /\*\*Plain-language layer\*\*/.test(line)) || '';
  const settingValue = settingRow.split('|')[2] || '';
  return Object.keys(LANGUAGE_NAMES).find((code) => LANGUAGE_NAMES[code].test(settingValue)) || '';
}

const languageCode = plainLanguageCode();
const languageGuidePath = /^[a-z]{2,3}$/.test(languageCode)
  ? path.join(pluginRoot, 'plain-language', languageCode + '.md')
  : '';
const languageGuide = languageGuidePath ? readOrEmpty(languageGuidePath).trim() : '';

const contextWithGuide = languageGuide
  ? [
      additionalContext,
      '',
      'This project presents the plain layer of every step summary in the language below. The guide',
      'binds that layer in every phase; its glossary and examples win over improvisation. Source: ' +
        languageGuidePath,
      '',
      languageGuide,
    ].join('\n')
  : additionalContext;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: contextWithGuide,
  },
}));
process.exit(0);
