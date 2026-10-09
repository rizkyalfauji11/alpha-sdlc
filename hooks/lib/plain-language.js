const fs = require('fs');
const path = require('path');
const { profileRootsFor } = require('./sdlc-context');

const LANGUAGE_NAMES = { id: /indonesia/i };
const LANGUAGE_CODE = /^[a-z]{2,3}$/;

function readOrEmpty(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function languageOfRoot(root) {
  try {
    const settings = JSON.parse(readOrEmpty(path.join(root, 'docs', 'basics', '.alpha-sdlc.json')));
    if (typeof settings.plainLanguage === 'string') return settings.plainLanguage.trim().toLowerCase();
  } catch {}
  const overview = readOrEmpty(path.join(root, 'docs', 'basics', '01-overview.md'));
  const settingRow = overview.split('\n').find((line) => /\*\*Plain-language layer\*\*/.test(line)) || '';
  const settingValue = settingRow.split('|')[2] || '';
  return Object.keys(LANGUAGE_NAMES).find((code) => LANGUAGE_NAMES[code].test(settingValue)) || '';
}

function resolveGuide(cwd, pluginRoot) {
  const reposByCode = new Map();
  for (const root of profileRootsFor(cwd)) {
    const code = languageOfRoot(root);
    if (!LANGUAGE_CODE.test(code) || code === 'en') continue;
    if (!reposByCode.has(code)) reposByCode.set(code, []);
    reposByCode.get(code).push(root);
  }
  if (reposByCode.size !== 1) return null;
  const [[code, repos]] = [...reposByCode.entries()];
  const guidePath = path.join(pluginRoot, 'plain-language', code + '.md');
  const text = readOrEmpty(guidePath).trim();
  if (!text) return null;
  return { code, guidePath, text, repos };
}

module.exports = { languageOfRoot, resolveGuide };
