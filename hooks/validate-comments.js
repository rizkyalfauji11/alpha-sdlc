#!/usr/bin/env node
// PreToolUse validator: block writes to SOURCE code whose comments carry
// work-item / tracker provenance (issue keys, tracker names, planning-doc
// acronyms, "added for X"). Per principles.md, that history lives in git/PR/
// the tracker, never in the source. Exit 2 = block; exit 0 = allow.
//
// Precision-biased, high-confidence patterns only (like validate-no-secrets):
// it catches obvious provenance and deliberately misses ambiguous domain words
// (a "task" queue, a pipeline "stage") to avoid false positives on real code.
// The "prefer no comments / self-documenting code" judgment is left to the
// per-skill self-check — a script can't decide if a comment is unnecessary.

const fs = require('fs');

let data;
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

const tool = data.tool_name || '';
const ti = data.tool_input || {};
const path = ti.file_path || '';

// Source-code files only (the inverse of the doc-scoped validators).
const SRC = /\.(js|jsx|mjs|cjs|ts|tsx|kt|kts|java|swift|py|rb|go|rs|php|c|cc|cpp|cxx|h|hpp|hh|cs|scala|dart|m|mm|vue|svelte|sql|sh|bash|zsh|gradle|groovy)$/i;
if (!SRC.test(path)) process.exit(0);
// Skip generated / vendored / build output — not hand-authored.
if (/(^|\/)(node_modules|dist|build|out|target|vendor|\.next|\.nuxt|coverage)\//.test(path)) process.exit(0);
if (/\.(min|generated|g\.dart|pb)\./i.test(path)) process.exit(0);

const content = tool === 'Write' ? (ti.content || '')
              : tool === 'Edit' ? (ti.new_string || '')
              : '';
if (!content.trim()) process.exit(0);

// --- Extract comment regions only (patterns never see code or strings). ---
const ext = (path.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
const HASH_LANGS = ['py', 'rb', 'sh', 'bash', 'zsh', 'gradle', 'groovy'];
const chunks = [];

for (const m of content.matchAll(/\/\*[\s\S]*?\*\//g)) chunks.push(m[0]);   // /* block */
for (const m of content.matchAll(/<!--[\s\S]*?-->/g)) chunks.push(m[0]);     // <!-- html -->
if (ext === 'py') for (const m of content.matchAll(/("""|''')[\s\S]*?\1/g)) chunks.push(m[0]); // docstrings

for (const line of content.split(/\r?\n/)) {
  const dslash = line.match(/(?:^|[^:])\/\/(.*)$/);          // // line (":" guards URLs)
  if (dslash) chunks.push(dslash[1]);
  if (HASH_LANGS.includes(ext)) {
    const hash = line.match(/(?:^|\s)#(?!!)(.*)$/);           // # line (skip shebang)
    if (hash) chunks.push(hash[1]);
  }
}
if (!chunks.length) process.exit(0);

// --- High-confidence provenance patterns (per comment chunk). ---
const KEY = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/;                     // ABC-123 issue key
const KEY_VERB = /\b(see|refs?|closes?|fixe?s?|fixed|resolves?|resolved)\b/i;
const KEY_NOUN = /\b(ticket|issue|jira|epic|backlog)\b/i;

const PATTERNS = [
  [/\bjira\b/i, 'a Jira reference'],
  [/\bconfluence\b/i, 'a Confluence reference'],
  [/\b(prd|brd|trd)\b/i, 'a planning-doc reference (PRD/BRD/TRD)'],
  [/\bstory\s+points?\b/i, 'a story-points reference'],
  [/\buser\s+stor(?:y|ies)\b/i, 'a user-story reference'],
  [/\bacceptance\s+criteri(?:a|on)\b/i, 'an acceptance-criteria reference'],
  [/\badded\s+(?:for|as part of|to satisfy|per)\s+(?:the\s+)?(?:ticket|jira|epic|sprint|backlog|requirement|change\s+request|feature\s+request)\b/i, 'a "added for the <work-item>" note'],
  [/\b(?:as|per)\s+(?:the\s+)?(?:ticket|jira|epic|sprint|plan|trd|prd|brd|backlog|requirement|acceptance\s+criteri)\b/i, 'a "per the <work-item/plan>" note'],
  [/\bimplement(?:s|ed)?\s+(?:the\s+)?(?:acceptance\s+criteri|requirement|user\s+story|ticket|jira)\b/i, 'an "implements the <requirement>" note'],
  [/\bfor\s+this\s+(?:ticket|jira|epic|sprint)\b/i, 'a "for this <work-item>" note'],
  [/\b(?:TODO|FIXME|HACK|XXX)\b[^\n]*\b[A-Z][A-Z0-9]{1,9}-\d+\b/, 'a TODO/FIXME tied to an issue key'],
];

for (const chunk of chunks) {
  for (const [re, label] of PATTERNS) {
    if (re.test(chunk)) fail(label, chunk);
  }
  if (KEY.test(chunk) && (KEY_VERB.test(chunk) || KEY_NOUN.test(chunk))) {
    fail('an issue key with tracker context', chunk);
  }
}

// Banner / ASCII-divider comments (principles.md: "no banner dividers").
const BANNERS = [
  /^\s*(?:\/\/|#|\*)\s*[=\-*_~#+/]{8,}\s*$/,   // // =====  ·  # -----  ·  * ~~~~~
  /^\s*\/\*+[=*\-~#_+]{6,}\*+\/\s*$/,           // /*========*/
  /^\s*\/{10,}\s*$/,                            // //////////
];
for (const line of content.split(/\r?\n/)) {
  if (BANNERS.some((re) => re.test(line))) {
    process.stderr.write(
      `Banner / ASCII-divider comment: "${line.trim().slice(0, 60)}". ` +
      `Per principles.md, no banner dividers — delete it; structure and clear names ` +
      `separate code, not decorative rules.\n`
    );
    process.exit(2);
  }
}
process.exit(0);

function fail(label, chunk) {
  const snippet = chunk.trim().replace(/\s+/g, ' ').slice(0, 80);
  process.stderr.write(
    `Task/tracker provenance in a code comment (${label}): "${snippet}". ` +
    `Per principles.md, provenance belongs in git/PR/the tracker, never in the source. ` +
    `Remove the reference — and if the comment only explains this change, delete it and let ` +
    `the code (clear names/structure) describe its own purpose; keep a comment only for a ` +
    `non-obvious why / gotcha / constraint the code can't express.\n`
  );
  process.exit(2);
}
