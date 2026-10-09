#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createSuite, pluginRoot, writePayload } = require('../lib/harness');

const suite = createSuite('self-check');
const { sdlcProject, runHook, report, finish } = suite;

const SOURCE_DIRECTORIES = ['hooks', 'scripts', 'tests'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'judge-cases', 'coverage-ledger']);

function sourceFilesUnder(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFilesUnder(entryPath));
    else if (entry.name.endsWith('.js')) files.push(entryPath);
  }
  return files;
}

const pluginCopy = sdlcProject('plugin-copy');
const sourceFiles = SOURCE_DIRECTORIES.flatMap((name) => sourceFilesUnder(path.join(pluginRoot, name))).sort();

report('self-check', 'the plugin has source files to check', sourceFiles.length > 20, `found ${sourceFiles.length}`);

for (const sourcePath of sourceFiles) {
  const relativePath = path.relative(pluginRoot, sourcePath);
  const payload = writePayload(path.join(pluginCopy, relativePath), fs.readFileSync(sourcePath, 'utf8'));
  const { exitCode, stderr } = runHook('validate-comments.js', payload);
  report('validate-comments.js', `${relativePath} carries no comments`, exitCode === 0, stderr.trim().split('\n').slice(0, 6));
}

const DOC_DIRECTORIES = ['skills', 'rules', 'agents', 'plain-language', 'hooks', path.join('tests', 'coverage-ledger')];
const DOC_FILES = ['principles.md', 'README.md', path.join('tests', 'judge-cases', 'README.md')];

function markdownFilesUnder(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...markdownFilesUnder(entryPath));
    else if (entry.name.endsWith('.md')) files.push(entryPath);
  }
  return files;
}

const docFiles = [
  ...DOC_DIRECTORIES.flatMap((name) => markdownFilesUnder(path.join(pluginRoot, name))),
  ...DOC_FILES.map((name) => path.join(pluginRoot, name)),
].sort();

report('self-check', 'the plugin has markdown files to check', docFiles.length > 40, `found ${docFiles.length}`);

for (const docPath of docFiles) {
  const relativePath = path.relative(pluginRoot, docPath);
  const payload = writePayload(path.join(pluginCopy, relativePath), fs.readFileSync(docPath, 'utf8'));
  const { exitCode, stderr } = runHook('validate-doc-tables.js', payload);
  report('validate-doc-tables.js', `${relativePath} has well-formed tables`, exitCode === 0, stderr.trim().split('\n').slice(0, 4));
}

finish();
