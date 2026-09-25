#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const USAGE =
  'usage: find-orphans.js <repo-root> --diff <base>   exports the change left without a production caller,\n' +
  '                                                   and profile rows still naming what the change removed\n' +
  '       find-orphans.js <repo-root> --registry      19-code-inventory / 18-design-tokens rows naming\n' +
  '                                                   something the source no longer has\n';

const [repoRoot, mode, base] = process.argv.slice(2);
if (!repoRoot || !['--diff', '--registry'].includes(mode) || (mode === '--diff' && !base)) {
  process.stderr.write(USAGE);
  process.exit(2);
}

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|go|css)$/;
const TEST = /(\.test\.|\.spec\.|_test\.go$|\/__tests__\/|\/test\/)/;
const GENERATED = /\.generated\.|\.d\.ts$|\/dist\/|\/build\//;

function git(...args) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) {
    process.stderr.write(`git ${args.join(' ')} failed: ${result.stderr}`);
    process.exit(2);
  }
  return result.stdout;
}

const tracked = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean);
const sources = new Map();
for (const file of tracked) {
  if (!SOURCE.test(file) || GENERATED.test(file)) continue;
  try { sources.set(file, fs.readFileSync(path.join(repoRoot, file), 'utf8')); } catch {}
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function exportedRuntimeSymbols(file, text) {
  if (file.endsWith('.go')) {
    const names = [];
    for (const match of text.matchAll(/^func\s+([A-Z]\w*)\s*\(/gm)) names.push(match[1]);
    for (const match of text.matchAll(/^(?:const|var)\s+([A-Z]\w*)\b/gm)) names.push(match[1]);
    return names;
  }
  return [...text.matchAll(/^export\s+(?:async\s+)?(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((match) => match[1]);
}

function referencesOutside(name, definingFile) {
  const pattern = new RegExp(`\\b${escape(name)}\\b`);
  const users = { production: [], tests: [] };
  for (const [file, text] of sources) {
    if (file === definingFile || !pattern.test(text)) continue;
    (TEST.test(file) ? users.tests : users.production).push(file);
  }
  return users;
}

const profileDocs = tracked.filter((file) => /(^|\/)docs\/basics\/\d\d-[^/]+\.md$/.test(file));
function profileRowsNaming(name) {
  const rows = [];
  for (const doc of profileDocs) {
    const lines = fs.readFileSync(path.join(repoRoot, doc), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (/^\|/.test(line) && new RegExp('`' + escape(name) + '`').test(line)) rows.push(`${doc}:${index + 1}`);
    });
  }
  return rows;
}

const measured = [];
const inferred = [];

if (mode === '--diff') {
  const changed = new Set(git('diff', '--name-only', base).split('\n').filter(Boolean));
  for (const file of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) changed.add(file);

  for (const file of changed) {
    if (!sources.has(file) || TEST.test(file) || file.endsWith('.css')) continue;
    for (const name of exportedRuntimeSymbols(file, sources.get(file))) {
      const users = referencesOutside(name, file);
      if (users.production.length) continue;
      const ownUses = (sources.get(file).match(new RegExp(`\\b${escape(name)}\\b`, 'g')) || []).length - 1;
      if (users.tests.length) inferred.push(`${file}: \`${name}\` is exported but only tests use it${ownUses ? ' (and its own file)' : ''}`);
      else if (ownUses) inferred.push(`${file}: \`${name}\` is exported but only its own file uses it — the export may be unneeded`);
      else inferred.push(`${file}: \`${name}\` has no caller anywhere — dead unless something outside this repository calls it`);
    }
  }

  const removed = new Set();
  for (const line of git('diff', '-U0', base).split('\n')) {
    const ts = line.match(/^-export\s+(?:async\s+)?(?:const|let|function|class|type|interface)\s+([A-Za-z_$][\w$]*)/);
    const go = line.match(/^-(?:func\s+([A-Z]\w*)\s*\(|(?:const|var|type)\s+([A-Z]\w*)\b)/);
    const name = ts ? ts[1] : go ? go[1] || go[2] : null;
    if (name) removed.add(name);
  }
  const DEFINES = (name) => new RegExp(
    `^export\\s+(?:async\\s+)?(?:const|let|function|class|type|interface|enum)\\s+${escape(name)}\\b|` +
    `^(?:func\\s+${escape(name)}\\s*\\(|(?:const|var|type)\\s+${escape(name)}\\b)`, 'm');
  for (const name of removed) {
    const stillDefined = [...sources].some(([file, text]) => !TEST.test(file) && DEFINES(name).test(text));
    if (stillDefined) continue;
    for (const row of profileRowsNaming(name)) {
      measured.push(`${row} still names \`${name}\`, which this change removed — deregister it`);
    }
  }
}

if (mode === '--registry') {
  const inventory = profileDocs.find((doc) => /19-code-inventory\.md$/.test(doc));
  if (inventory) {
    const lines = fs.readFileSync(path.join(repoRoot, inventory), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!/^\|/.test(line) || /^\|\s*-{3}/.test(line)) return;
      const firstCell = line.split('|')[1] || '';
      for (const match of firstCell.matchAll(/`([A-Za-z_$][\w$]*)`/g)) {
        const name = match[1];
        const found = [...sources].some(([file, text]) => !file.endsWith('.css') && new RegExp(`\\b${escape(name)}\\b`).test(text));
        if (!found) measured.push(`${inventory}:${index + 1} registers \`${name}\`, which no source file contains any more`);
      }
    });
  }
  const tokensDoc = profileDocs.find((doc) => /18-design-tokens\.md$/.test(doc));
  if (tokensDoc) {
    const defined = new Set();
    for (const [, text] of sources) for (const match of text.matchAll(/(--[a-z0-9][a-z0-9-]*)\s*:/g)) defined.add(match[1]);
    if (defined.size) {
      const lines = fs.readFileSync(path.join(repoRoot, tokensDoc), 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (!/^\|/.test(line)) return;
        for (const match of line.matchAll(/`(--[a-z0-9][a-z0-9-]*[a-z0-9])`/g)) {
          const after = line.slice(match.index + match[0].length - 1, match.index + match[0].length + 1);
          if (/[/*]/.test(after)) continue;
          if (!defined.has(match[1])) measured.push(`${tokensDoc}:${index + 1} lists \`${match[1]}\`, which no stylesheet defines`);
        }
      });
    }
  }
}

for (const line of measured) process.stdout.write(`measured  ${line}\n`);
for (const line of inferred) process.stdout.write(`inferred  ${line}\n`);
process.stdout.write(
  `orphans: ${measured.length} measured (a profile row that names what is gone) · ${inferred.length} inferred ` +
  '(candidates for a human to judge — a public API, a framework entry point or a test fixture can look unused)\n',
);
process.exit(measured.length ? 1 : 0);
