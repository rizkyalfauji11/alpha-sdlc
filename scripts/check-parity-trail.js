#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const USAGE = 'usage: check-parity-trail.js <feature-dir> <platform> [--screen <screen>]\n' +
  '  Reads <feature-dir>/design (the references), design/compared-ui (the trail) and the assembly\n' +
  '  stages of <feature-dir>/plan-<platform>.md. Every latest capture needs its -diff.png and must be\n' +
  '  newer than its design reference; every assembly screen needs a full-screen reference. With\n' +
  '  --screen, only that screen is checked, and it must also have a full-screen capture.\n';

const argv = process.argv.slice(2);
const screenIndex = argv.indexOf('--screen');
const onlyScreen = screenIndex >= 0 ? argv[screenIndex + 1] : null;
const [featureDirectory, platform] = argv.filter((_, index) => screenIndex < 0 || (index !== screenIndex && index !== screenIndex + 1));
if (!featureDirectory || !platform || (screenIndex >= 0 && !onlyScreen)) {
  process.stderr.write(USAGE);
  process.exit(2);
}

const designDirectory = path.join(featureDirectory, 'design');
const sectionsDirectory = path.join(designDirectory, 'sections');
const trailDirectory = path.join(designDirectory, 'compared-ui');
const exists = (file) => { try { return fs.statSync(file).isFile(); } catch { return false; } };
const listing = (directory) => { try { return fs.readdirSync(directory); } catch { return []; } };
const screenFolders = listing(sectionsDirectory);
const relative = (file) => path.relative(featureDirectory, file);

function lastChanged(file) {
  const where = ['-C', path.dirname(path.resolve(file))];
  const log = spawnSync('git', [...where, 'log', '-1', '--format=%ct', '--', path.resolve(file)], { encoding: 'utf8' });
  const committed = log.status === 0 && log.stdout.trim() ? Number(log.stdout.trim()) * 1000 : null;
  const dirty = spawnSync('git', [...where, 'status', '--porcelain', '--', path.resolve(file)], { encoding: 'utf8' });
  if (committed && !(dirty.status === 0 && dirty.stdout.trim())) return committed;
  return fs.statSync(file).mtimeMs;
}

function referenceFor(name) {
  const [screen, ...rest] = name.split('.');
  if (rest.length && screenFolders.includes(screen)) {
    return { screen, reference: path.join(sectionsDirectory, screen, `${rest.join('.')}.png`) };
  }
  const fullScreen = path.join(designDirectory, `${name}.png`);
  const base = name.split('--')[0];
  if (!rest.length && (exists(fullScreen) || screenFolders.includes(base))) return { screen: base, reference: fullScreen };
  const matches = screenFolders.filter((folder) => exists(path.join(sectionsDirectory, folder, `${name}.png`)));
  return {
    screen: matches.length === 1 ? matches[0] : null,
    reference: matches.length === 1 ? path.join(sectionsDirectory, matches[0], `${name}.png`) : null,
    unnamed: true,
  };
}

const problems = [];
const captures = new Map();
const pattern = new RegExp(`^(.+)-${platform}-v(\\d+)\\.png$`);
for (const file of listing(trailDirectory)) {
  const match = !file.endsWith('-diff.png') && file.match(pattern);
  if (!match) continue;
  const [, name, version] = match;
  if (!captures.has(name) || captures.get(name).version < Number(version)) captures.set(name, { version: Number(version), file });
}

let checked = 0;
for (const [name, { version, file }] of [...captures].sort()) {
  const { screen, reference, unnamed } = referenceFor(name);
  if (onlyScreen && screen !== onlyScreen) continue;
  checked++;
  if (unnamed) {
    problems.push(`${name}: the capture does not name its screen — call it <screen>.<section-id>[--<case>]-${platform}-v<N>.png` +
      (reference ? ` (read as ${relative(reference)})` : ', and no crop of that name exists under design/sections/'));
  }
  const diff = path.join(trailDirectory, `${name}-${platform}-v${version}-diff.png`);
  if (!exists(diff)) problems.push(`${name} v${version}: no diff overlay ${path.basename(diff)} — a comparison is not verified without it`);
  if (!reference) continue;
  if (!exists(reference)) {
    problems.push(`${name}: no design reference at ${relative(reference)} — nothing to compare the capture against`);
    continue;
  }
  if (lastChanged(reference) > fs.statSync(path.join(trailDirectory, file)).mtimeMs) {
    problems.push(`${name} v${version}: the design reference ${relative(reference)} changed after this capture — parity is stale, re-run it`);
  }
}

const planPath = path.join(featureDirectory, `plan-${platform}.md`);
const assemblies = new Set();
if (exists(planPath)) {
  for (const line of fs.readFileSync(planPath, 'utf8').split('\n')) {
    if (!/^#{2,4}\s+Stage\s+\d+\b/.test(line) || !/\bassembly\b/i.test(line)) continue;
    for (const match of line.matchAll(/`([a-z][\w-]*)`/g)) assemblies.add(match[1]);
  }
}
if (onlyScreen) assemblies.add(onlyScreen);
for (const screen of assemblies) {
  if (onlyScreen && screen !== onlyScreen) continue;
  if (!exists(path.join(designDirectory, `${screen}.png`))) {
    problems.push(`${screen}: an assembly stage owns this screen, but design/${screen}.png does not exist — ` +
      'the full-screen reference is what the layout between sections is compared against');
  }
  if (onlyScreen && !captures.has(screen)) {
    problems.push(`${screen}: no full-screen capture ${screen}-${platform}-v<N>.png in the trail — the assembly compares the whole screen, not only its sections`);
  }
}

process.stdout.write(`parity trail: ${checked} compared name(s)${onlyScreen ? ` on ${onlyScreen}` : ''} · ${problems.length} problem(s)\n`);
for (const problem of problems) process.stdout.write(`  - ${problem}\n`);
process.exit(problems.length ? 1 : 0);
