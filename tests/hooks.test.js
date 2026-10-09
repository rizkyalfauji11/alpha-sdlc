#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const suitesDirectory = path.join(__dirname, 'suites');
const suites = fs.readdirSync(suitesDirectory).filter((name) => name.endsWith('.test.js')).sort();

let passed = 0;
let total = 0;
const failing = [];

for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.join(suitesDirectory, suite)], { encoding: 'utf8', timeout: 600000 });
  const stdout = result.stdout || '';
  process.stdout.write(`\n# ${suite}\n${stdout}`);
  if (result.stderr) process.stdout.write(result.stderr);
  const tally = /(\d+)\/(\d+) passed\s*$/.exec(stdout);
  if (tally) {
    passed += Number(tally[1]);
    total += Number(tally[2]);
  }
  if (result.status !== 0 || !tally) failing.push(suite);
}

const failingNote = failing.length ? ` — failing suites: ${failing.join(', ')}` : '';
process.stdout.write(`\n${passed}/${total} passed${failingNote}\n`);
process.exit(failing.length ? 1 : 0);
