#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const USAGE = 'usage: check-draft.js <feature-dir>/design/<screen>.html [--spec <widget-spec.md>]\n' +
  '  Checks a Claude design draft against the rules of the platform\'s draft tab: one file under design/,\n' +
  '  a plain .html name, under 1 MiB, inline CSS and inline SVG only — no script, no event-handler\n' +
  '  attribute, no javascript: or data: URL, no outside URL, image, font or stylesheet — and a\n' +
  '  data-frame. With --spec, every Test ID of the widget spec\'s Elements table must be on an\n' +
  '  element as id or data-testid. Exit 0 clean, 1 with every problem listed, 2 on usage.\n';

const ONE_MIB = 1024 * 1024;
const PLAIN_DRAFT_NAME = /^[A-Za-z0-9._-]+\.html$/;
const FORBIDDEN_ELEMENTS = ['script', 'img', 'image', 'link', 'iframe', 'frame', 'object', 'embed', 'base', 'video', 'audio', 'source', 'track', 'picture', 'form', 'foreignobject'];
const URL_ATTRIBUTES = /^(?:src|srcset|href|xlink:href|action|formaction|poster|background|data|ping|cite|longdesc|manifest|codebase)$/i;
const OUTSIDE_URL = /(?:^|[\s"'(=,])(?:[a-z][a-z0-9+.-]*:)?\/\/[^\s"'<>)]/i;

const argv = process.argv.slice(2);
const specIndex = argv.indexOf('--spec');
const specPath = specIndex >= 0 ? argv[specIndex + 1] : null;
const [draftPath] = argv.filter((_, index) => specIndex < 0 || (index !== specIndex && index !== specIndex + 1));
if (!draftPath || (specIndex >= 0 && !specPath)) {
  process.stderr.write(USAGE);
  process.exit(2);
}

let bytes;
try {
  bytes = fs.readFileSync(draftPath);
} catch (error) {
  process.stderr.write(`check-draft: cannot read ${draftPath}: ${error.message}\n`);
  process.exit(2);
}

const problems = [];
const name = path.basename(draftPath);
if (!PLAIN_DRAFT_NAME.test(name)) problems.push(`the file name ${name} does not match ${PLAIN_DRAFT_NAME}`);
if (path.basename(path.dirname(path.resolve(draftPath))) !== 'design') problems.push('the draft is not directly under the feature folder\'s design/');
if (bytes.length >= ONE_MIB) problems.push(`${bytes.length} bytes — a draft stays under 1 MiB (${ONE_MIB} bytes)`);

const html = bytes.toString('utf8');
const lineOf = (offset) => html.slice(0, offset).split('\n').length;

const tags = [];
const TAG = /<([A-Za-z][A-Za-z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTRIBUTE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
for (const match of html.matchAll(TAG)) {
  const attributes = [];
  for (const attribute of match[2].matchAll(ATTRIBUTE)) {
    attributes.push({ name: attribute[1].toLowerCase(), value: attribute[2] ?? attribute[3] ?? attribute[4] ?? null });
  }
  tags.push({ element: match[1].toLowerCase(), attributes, line: lineOf(match.index) });
}

const styleText = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => ({ text: match[1], line: lineOf(match.index) }));
for (const tag of tags) {
  for (const attribute of tag.attributes) if (attribute.name === 'style' && attribute.value) styleText.push({ text: attribute.value, line: tag.line });
}

for (const tag of tags) {
  const where = `line ${tag.line}`;
  if (FORBIDDEN_ELEMENTS.includes(tag.element)) problems.push(`${where}: <${tag.element}> — draw pictures as inline <svg> and fetch nothing`);
  if (tag.element === 'meta' && tag.attributes.some((attribute) => attribute.name === 'http-equiv')) problems.push(`${where}: <meta http-equiv> — a draft sets no policy or refresh`);
  for (const attribute of tag.attributes) {
    if (/^on/.test(attribute.name)) problems.push(`${where}: the event-handler attribute ${attribute.name} — a draft runs nothing`);
    const value = (attribute.value || '').trim();
    if (/^xmlns(?::|$)/.test(attribute.name)) continue;
    if (/^\s*javascript:/i.test(value)) problems.push(`${where}: ${attribute.name}="javascript:…" — a draft runs nothing`);
    if (/(?:^|[\s"'(,])data:/i.test(value)) problems.push(`${where}: a data: URL in ${attribute.name} — the draft tab's policy blocks it`);
    if (URL_ATTRIBUTES.test(attribute.name) && value && !value.startsWith('#')) {
      problems.push(`${where}: ${attribute.name}="${value.slice(0, 60)}" — only a #fragment of the draft itself is allowed`);
    } else if (OUTSIDE_URL.test(value)) {
      problems.push(`${where}: an outside URL in ${attribute.name} — a draft fetches nothing`);
    }
  }
}

for (const { text, line } of styleText) {
  if (/@import\b/i.test(text)) problems.push(`line ${line}: @import — the CSS is inline, all of it`);
  if (/@font-face\b/i.test(text)) problems.push(`line ${line}: @font-face — text uses the platform's system font stack`);
  for (const url of text.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) {
    if (!url[2].trim().startsWith('#')) problems.push(`line ${line}: url(${url[2].slice(0, 60)}) — only a #fragment of the draft itself is allowed`);
  }
  if (/expression\s*\(/i.test(text)) problems.push(`line ${line}: a CSS expression() — a draft runs nothing`);
}

const textOutside = html.replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ' ');
for (const url of textOutside.matchAll(/(?:https?:)?\/\/[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/g)) {
  problems.push(`line ${lineOf(html.indexOf(url[0]))}: the text names an outside URL, ${url[0]} — write what it shows without one`);
}

const frames = tags.filter((tag) => tag.attributes.some((attribute) => attribute.name === 'data-frame' && attribute.value));
if (!frames.length) problems.push('no element carries data-frame="<screen>" — the full frame is one element, at the screen size');

if (specPath) {
  let spec;
  try {
    spec = fs.readFileSync(specPath, 'utf8');
  } catch (error) {
    process.stderr.write(`check-draft: cannot read ${specPath}: ${error.message}\n`);
    process.exit(2);
  }
  const tagged = new Set();
  for (const tag of tags) {
    for (const attribute of tag.attributes) if ((attribute.name === 'id' || attribute.name === 'data-testid') && attribute.value) tagged.add(attribute.value);
  }
  const missing = testIdsOf(spec).filter((id) => !tagged.has(id));
  if (missing.length) problems.push(`Test IDs of the widget spec on no element (as id or data-testid): ${missing.join(', ')}`);
}

function testIdsOf(spec) {
  const ids = [];
  let column = -1;
  for (const line of spec.split('\n')) {
    if (!/^\s*\|/.test(line)) {
      column = -1;
      continue;
    }
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    if (column < 0) {
      column = cells.findIndex((cell) => /^test id$/i.test(cell.replace(/[*_`]/g, '')));
      continue;
    }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    for (const code of (cells[column] || '').matchAll(/`([^`]+)`/g)) ids.push(code[1].trim());
  }
  return [...new Set(ids)];
}

if (problems.length) {
  process.stdout.write(`check-draft: ${problems.length} problem(s) in ${draftPath}\n${problems.map((problem) => `  - ${problem}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`check-draft: ${draftPath} is clean — ${bytes.length} bytes, ${frames.length} frame(s)\n`);
