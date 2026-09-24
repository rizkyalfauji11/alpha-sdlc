#!/usr/bin/env node

const fs = require('fs');

let payload;
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

if ((payload.tool_name || '') !== 'Bash') process.exit(0);
const command = String((payload.tool_input || {}).command || '');
if (!command.trim()) process.exit(0);

const PATH_CHARS = `[^\\s'"()<>|;&]`;
const insideDocsDirectory =
  /(^|\/)docs(\/|$)/.test(String(payload.cwd || '')) ||
  new RegExp(`(?:^|[;&|\\n]\\s*)cd\\s+['"]?${PATH_CHARS}*\\bdocs(?:/${PATH_CHARS}*)?['"]?(?:\\s|$|;|&)`).test(command);
const docTarget = insideDocsDirectory ? `${PATH_CHARS}*\\.md` : `${PATH_CHARS}*docs/${PATH_CHARS}*\\.md`;
const DOC_PATH = new RegExp(`(?:^|[\\s'"=(>/])${docTarget}\\b`);
if (!DOC_PATH.test(command)) process.exit(0);

const segments = command.split(/&&|\|\||;|\n|\|/).map((segment) => segment.trim()).filter(Boolean);
if (segments.every((segment) => /^(?:cd\s+\S+|git\s)/.test(segment))) process.exit(0);

function copiesIntoDoc(segment) {
  const copy = segment.match(/^(?:cp|mv|install)\s+(.*)$/);
  if (!copy) return false;
  const operands = copy[1].split(/\s+/).filter((operand) => operand && !operand.startsWith('-'));
  const destination = (operands[operands.length - 1] || '').replace(/^['"]|['"]$/g, '');
  return new RegExp(`^${docTarget}$`).test(destination);
}

const WRITE_SIGNS = [
  { test: () => new RegExp(`>>?\\s*['"]?${docTarget}`).test(command), name: 'a shell redirect into the doc' },
  { test: () => /\bsed\s+(?:-[a-zA-Z]+\s+)*-i\b|\bsed\s+-i/.test(command), name: 'sed -i' },
  { test: () => /\bperl\s+-[a-zA-Z]*i/.test(command), name: 'perl -i' },
  { test: () => /\btee\b/.test(command), name: 'tee' },
  { test: () => /\btruncate\s/.test(command), name: 'truncate' },
  { test: () => segments.some(copiesIntoDoc), name: 'a copy or move onto the doc' },
  { test: () => /write_text\(|write_bytes\(|\.write\(|writelines\(/.test(command), name: 'a Python write' },
  { test: () => /open\([^)]*,\s*['"][wax+][^'"]*['"]/.test(command), name: 'a Python open for writing' },
  { test: () => /writeFileSync|appendFileSync|createWriteStream|fs\.writeFile|fs\.appendFile/.test(command), name: 'a Node write' },
];

const found = WRITE_SIGNS.find((sign) => sign.test());
if (!found) process.exit(0);

process.stderr.write(
  'alpha-sdlc: this Bash command writes a markdown doc under docs/ (' + found.name + '). ' +
  'Write it with the Edit or Write tool instead — the doc hooks (table shape, ladder rung, secrets) ' +
  'run only on those tools, so a doc written through Bash is never checked. ' +
  'Reading or copying a doc out through Bash is fine; git commands on docs are fine.\n',
);
process.exit(2);
