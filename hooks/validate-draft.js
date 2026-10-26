#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { postEditDocument } = require('./validate-doc-tables');
const { parseToolPayload, blockTool, allowTool, isAntigravitySession } = require('./lib/payload');

const ONE_MIB = 1024 * 1024;
const PLAIN_DRAFT_NAME = /^[A-Za-z0-9._-]+\.html$/;
const FORBIDDEN_ELEMENTS = ['script', 'img', 'image', 'link', 'iframe', 'frame', 'object', 'embed', 'base', 'video', 'audio', 'source', 'track', 'picture', 'form', 'foreignobject'];
const URL_ATTRIBUTES = /^(?:src|srcset|href|xlink:href|action|formaction|poster|background|data|ping|cite|longdesc|manifest|codebase)$/i;
const OUTSIDE_URL = /(?:^|[\s"'(=,])(?:[a-z][a-z0-9+.-]*:)?\/\/[^\s"'<>)]/i;

let payload;
try {
  payload = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const isAntigravity = isAntigravitySession(payload);
const { toolName, filePath, writtenContent, toolInput, cwd } = parseToolPayload(payload);

if (toolName !== 'Write' && toolName !== 'Edit') {
  process.exit(allowTool(isAntigravity));
}

if (!filePath || !filePath.endsWith('.html')) {
  process.exit(allowTool(isAntigravity));
}

const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
const parentDir = path.basename(path.dirname(resolvedPath));
if (parentDir !== 'design') {
  process.exit(allowTool(isAntigravity));
}

const name = path.basename(resolvedPath);
const doc = postEditDocument(toolName, toolInput, resolvedPath);
const content = doc ? doc.text : writtenContent;
const bytes = Buffer.from(content, 'utf8');

const problems = [];
if (!PLAIN_DRAFT_NAME.test(name)) {
  problems.push(`the file name ${name} does not match ${PLAIN_DRAFT_NAME}`);
}
if (bytes.length >= ONE_MIB) {
  problems.push(`${bytes.length} bytes — a draft stays under 1 MiB (${ONE_MIB} bytes)`);
}

const lineOf = (offset) => content.slice(0, offset).split('\n').length;
const tags = [];
const TAG = /<([A-Za-z][A-Za-z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTRIBUTE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

for (const match of content.matchAll(TAG)) {
  const attributes = [];
  for (const attribute of match[2].matchAll(ATTRIBUTE)) {
    attributes.push({ name: attribute[1].toLowerCase(), value: attribute[2] ?? attribute[3] ?? attribute[4] ?? null });
  }
  tags.push({ element: match[1].toLowerCase(), attributes, line: lineOf(match.index) });
}

const styleText = [...content.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => ({ text: match[1], line: lineOf(match.index) }));
for (const tag of tags) {
  for (const attribute of tag.attributes) {
    if (attribute.name === 'style' && attribute.value) styleText.push({ text: attribute.value, line: tag.line });
  }
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

const textOutside = content.replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ' ');
for (const url of textOutside.matchAll(/(?:https?:)?\/\/[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/g)) {
  problems.push(`line ${lineOf(content.indexOf(url[0]))}: the text names an outside URL, ${url[0]} — write what it shows without one`);
}

const frames = tags.filter((tag) => tag.attributes.some((attribute) => attribute.name === 'data-frame' && attribute.value));
if (!frames.length) {
  problems.push('no element carries data-frame="<screen>" — the full frame is one element, at the screen size');
}

const featureDir = path.dirname(path.dirname(resolvedPath));
const screenName = path.basename(resolvedPath, '.html');
const specPath = path.join(featureDir, 'widget-spec', screenName + '.md');
if (fs.existsSync(specPath)) {
  let specText = '';
  try {
    specText = fs.readFileSync(specPath, 'utf8');
  } catch {}
  if (specText) {
    const tagged = new Set();
    for (const tag of tags) {
      for (const attribute of tag.attributes) {
        if ((attribute.name === 'id' || attribute.name === 'data-testid') && attribute.value) tagged.add(attribute.value);
      }
    }
    const missing = testIdsOf(specText).filter((id) => !tagged.has(id));
    if (missing.length) problems.push(`Test IDs of the widget spec on no element (as id or data-testid): ${missing.join(', ')}`);
  }
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
  const message = `Validation error — design draft violates platform rules (${filePath}):\n` +
    problems.map((problem) => `  - ${problem}`).join('\n') +
    '\nRun `node scripts/check-draft.js <draft-path> --spec <spec-path>` to verify.\n';
  process.exit(blockTool(message, isAntigravity));
}

process.exit(allowTool(isAntigravity));
