#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const USAGE =
  'usage: check-coverage.js <feature-dir> <platform> [--stage <n> --tests <file>... [--base <rev>]] [--table]\n' +
  '  reads <feature-dir>/TRD-<platform>.md (§8 acceptance criteria, §9 work slices) and\n' +
  '  <feature-dir>/plan-<platform>.md (each stage heading and its Covers / Moved in lines)\n';

function fail(message) {
  process.stderr.write(message + '\n' + USAGE);
  process.exit(2);
}

const argv = process.argv.slice(2);
const positional = [];
const options = { stage: null, tests: [], table: false, base: 'HEAD' };
for (let index = 0; index < argv.length; index++) {
  const argument = argv[index];
  if (argument === '--stage') options.stage = Number(argv[++index]);
  else if (argument === '--table') options.table = true;
  else if (argument === '--base') options.base = argv[++index];
  else if (argument === '--tests') {
    while (argv[index + 1] && !argv[index + 1].startsWith('--')) options.tests.push(argv[++index]);
  } else positional.push(argument);
}
if (positional.length !== 2) fail('expected a feature directory and a platform');

const [featureDirectory, platform] = positional;
const spokePath = path.join(featureDirectory, `TRD-${platform}.md`);
const planPath = path.join(featureDirectory, `plan-${platform}.md`);

function read(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { fail(`cannot read ${filePath}`); }
}

const AC_ID = /AC-(\d+)/g;
const AC_RANGE = /AC-(\d+)`?\s*(?:…|\.\.\.?|–|—|to)\s*`?AC-(\d+)/g;
function acIdsIn(text) {
  const ids = [...String(text).matchAll(AC_ID)].map((match) => Number(match[1]));
  for (const range of String(text).matchAll(AC_RANGE)) {
    for (let id = Number(range[1]) + 1; id < Number(range[2]); id++) ids.push(id);
  }
  return ids;
}

function sectionOf(markdown, number) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${number}\\.`).test(line));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s+\d+\./.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

const spoke = read(spokePath);
const register = new Set();
const retired = new Set();
for (const line of sectionOf(spoke, 8)) {
  const row = line.match(/^\|\s*(~~)?\s*\**\s*AC-(\d+)\b/);
  if (!row) continue;
  const id = Number(row[2]);
  (row[1] || /^\|\s*~~/.test(line) ? retired : register).add(id);
}
if (!register.size && !retired.size) fail(`no acceptance criteria found in §8 of ${spokePath}`);

const SLICE_ROW = /^\|\s*\**\s*`?([A-Z]{1,3}\d+)`?\s*\**\s*\|/;
const SLICE_ITEM = /^\s*[-*]\s+(?:\[.\]\s+)?\**\s*`?([A-Z]{1,3}\d+)`?\s*\**/;
const slices = new Map();
const sliceLines = sectionOf(spoke, 9);
for (let index = 0; index < sliceLines.length; index++) {
  const row = sliceLines[index].match(SLICE_ROW);
  if (row) {
    slices.set(row[1], new Set(acIdsIn(sliceLines[index])));
    continue;
  }
  const item = sliceLines[index].match(SLICE_ITEM);
  if (!item) continue;
  let text = sliceLines[index];
  for (let next = index + 1; next < sliceLines.length && /^\s{2,}\S/.test(sliceLines[next]); next++) {
    text += ' ' + sliceLines[next];
  }
  slices.set(item[1], new Set(acIdsIn(text)));
}

const sliceOfToken = (token) => {
  if (slices.has(token)) return token;
  const parent = token.replace(/[a-z]+$/, '');
  return slices.has(parent) ? parent : null;
};

const plan = read(planPath);
const planLines = plan.split('\n');
const stages = [];
for (let index = 0; index < planLines.length; index++) {
  const heading = planLines[index].match(/^#{2,4}\s+Stage\s+(\d+)\b(.*)$/);
  if (!heading) continue;
  const tokens = [...heading[2].matchAll(/`([A-Z]{1,3}\d+[a-z]*)`/g)].map((match) => match[1]);
  const stageSlices = [...new Set(tokens.map(sliceOfToken).filter(Boolean))];
  const block = [];
  for (let next = index + 1; next < planLines.length && !/^#{2,4}\s/.test(planLines[next]); next++) {
    block.push(planLines[next]);
  }
  stages.push({ number: Number(heading[1]), slices: stageSlices, block, heading: planLines[index] });
}
if (!stages.length) fail(`no "### Stage N" headings found in ${planPath}`);

function bulletText(block, label) {
  const start = block.findIndex((line) => new RegExp(`^\\s*[-*]\\s+\\*\\*${label}:?\\*\\*`).test(line));
  if (start === -1) return '';
  const parts = [block[start]];
  for (let next = start + 1; next < block.length; next++) {
    if (/^\s*[-*]\s+\*\*/.test(block[next]) || !block[next].trim()) break;
    parts.push(block[next]);
  }
  return parts.join(' ');
}

const movedInto = new Map();
const recordMove = (id, stageNumber) => {
  if (!movedInto.has(stageNumber)) movedInto.set(stageNumber, new Set());
  movedInto.get(stageNumber).add(id);
};

for (const stage of stages) {
  const coversText = bulletText(stage.block, 'Covers');
  const [claimedPart, ...amendmentParts] = coversText.split('⚠️');
  stage.covers = new Set(acIdsIn(claimedPart.replace(/^.*?\*\*Covers:?\*\*/, '')));
  const amendment = amendmentParts.join(' ');
  for (const match of amendment.matchAll(/AC-(\d+)[^.;]*?\bmoves? to Stage (\d+)/g)) {
    recordMove(Number(match[1]), Number(match[2]));
  }
  for (const id of acIdsIn(bulletText(stage.block, 'Moved in'))) recordMove(id, stage.number);
}
for (const match of plan.matchAll(/`AC-(\d+)`\s*`[A-Z]{1,3}\d+[a-z]*`\s*→\s*Stage\s+(\d+)/g)) {
  recordMove(Number(match[1]), Number(match[2]));
}

const problems = [];
const claimedBy = new Map();
for (const stage of stages) {
  if (!stage.covers.size) problems.push(`Stage ${stage.number} claims no acceptance criterion`);
  for (const id of stage.covers) {
    if (!claimedBy.has(id)) claimedBy.set(id, []);
    claimedBy.get(id).push(stage.number);
    if (!register.has(id) && !retired.has(id)) {
      problems.push(`Stage ${stage.number} claims AC-${id}, which is not in §8 of ${path.basename(spokePath)}`);
      continue;
    }
    if (!stage.slices.length) continue;
    const inOwnSlice = stage.slices.some((slice) => slices.get(slice).has(id));
    const moved = movedInto.has(stage.number) && movedInto.get(stage.number).has(id);
    if (!inOwnSlice && !moved) {
      const owners = [...slices].filter(([, ids]) => ids.has(id)).map(([slice]) => slice);
      problems.push(
        `Stage ${stage.number} (${stage.slices.join(', ')}) claims AC-${id}, which §9 gives to ` +
          `${owners.join(', ') || 'no slice'}, with no "Moved in" record for this stage`,
      );
    }
  }
}
for (const id of [...register].sort((a, b) => a - b)) {
  if (!claimedBy.has(id)) problems.push(`AC-${id} is claimed by no stage`);
}

const builtWith = new Map();
for (const stage of stages) {
  const partners = [...bulletText(stage.block, 'Built with').matchAll(/Stages?\s+(\d+)/g)].map((match) => Number(match[1]));
  builtWith.set(stage.number, new Set(partners.filter((number) => number !== stage.number)));
  const status = bulletText(stage.block, 'Status');
  const verdict = bulletText(stage.block, 'Checkpoint verdict').replace(/^.*?\*\*Checkpoint verdict:?\*\*/, '');
  if (/\bdone\b/i.test(status) && (!verdict.trim() || /pending|</i.test(verdict))) {
    problems.push(`Stage ${stage.number} is done but carries no checkpoint verdict of its own`);
  }
}
for (const [number, partners] of builtWith) {
  for (const partner of partners) {
    if (!builtWith.has(partner)) problems.push(`Stage ${number} says it was built with Stage ${partner}, which does not exist`);
    else if (!builtWith.get(partner).has(number)) {
      problems.push(`Stage ${number} says it was built with Stage ${partner}, but Stage ${partner} does not say so back`);
    }
  }
}

if (options.stage !== null) {
  const stage = stages.find((candidate) => candidate.number === options.stage);
  if (!stage) fail(`no Stage ${options.stage} in ${planPath}`);
  const TITLE = /\b(?:it|test|describe)(?:\.\w+)?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  const addedText = (testFile) => {
    const directory = path.dirname(path.resolve(testFile));
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', path.resolve(testFile)], { cwd: directory });
    if (tracked.status !== 0) return read(testFile);
    const diff = spawnSync('git', ['diff', '-U0', options.base, '--', path.resolve(testFile)], { cwd: directory, encoding: 'utf8' });
    if (diff.status !== 0) return read(testFile);
    return diff.stdout.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).join('\n');
  };
  for (const testFile of options.tests) {
    const source = addedText(testFile);
    for (const match of source.matchAll(TITLE)) {
      for (const id of acIdsIn(match[2])) {
        if (!stage.covers.has(id)) {
          problems.push(
            `${testFile}: the test titled "${match[2].slice(0, 80)}" names AC-${id}, ` +
              `which Stage ${stage.number} does not cover`,
          );
        }
      }
    }
  }
}

if (options.table) {
  const lines = [...claimedBy.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, numbers]) => `AC-${id}\tStage ${numbers.join(', ')}`);
  process.stdout.write(lines.join('\n') + '\n\n');
}

const summary =
  `${register.size} acceptance criteria (${retired.size} retired) · ${slices.size} work slices · ` +
  `${stages.length} stages`;
if (problems.length) {
  process.stdout.write(`coverage: ${problems.length} problem(s) — ${summary}\n`);
  for (const problem of problems) process.stdout.write(`  - ${problem}\n`);
  process.exit(1);
}
process.stdout.write(`coverage: clean — ${summary}\n`);
process.exit(0);
