#!/usr/bin/env node

const fs = require('fs');

const USAGE = 'usage: compare-geometry.js <design-boxes.json> <app-boxes.json> [--tolerance <px>] [--tokens <css>...]\n' +
  '  Both files come from collect-boxes.mjs (or anything writing { boxes: { id: [x, y, w, h] } }).\n' +
  '  Compares every shared id: position, size, the gap to its nearest neighbour, the inset inside its\n' +
  '  container, and the column count of each container. Exit 1 when anything exceeds the tolerance.\n';

const argv = process.argv.slice(2);
const files = [];
let tolerance = 2;
const tokenFiles = [];
for (let index = 0; index < argv.length; index++) {
  if (argv[index] === '--tolerance') tolerance = Number(argv[++index]);
  else if (argv[index] === '--tokens') { while (argv[index + 1] && !argv[index + 1].startsWith('--')) tokenFiles.push(argv[++index]); }
  else files.push(argv[index]);
}
if (files.length !== 2) { process.stderr.write(USAGE); process.exit(2); }

const read = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { process.stderr.write(`cannot read ${file}\n`); process.exit(2); } };
const design = read(files[0]).boxes || {};
const app = read(files[1]).boxes || {};

const pxTokens = new Map();
for (const file of tokenFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/(--[a-z0-9-]+)\s*:\s*(\d+(?:\.\d+)?)px\b/g)) {
    const value = Number(match[2]);
    if (!pxTokens.has(value)) pxTokens.set(value, match[1]);
  }
}
const tokenFor = (value) => (pxTokens.size ? ` (${pxTokens.get(Math.round(value)) || 'no px token'})` : '');

const contains = (outer, inner) => outer !== inner &&
  inner[0] >= outer[0] - 1 && inner[1] >= outer[1] - 1 &&
  inner[0] + inner[2] <= outer[0] + outer[2] + 1 && inner[1] + inner[3] <= outer[1] + outer[3] + 1;

function parentOf(id, boxes) {
  let best = null;
  for (const [candidate, box] of Object.entries(boxes)) {
    if (candidate === id || !contains(box, boxes[id])) continue;
    if (!best || box[2] * box[3] < boxes[best][2] * boxes[best][3]) best = candidate;
  }
  return best;
}

const shared = Object.keys(design).filter((id) => app[id]);
const missing = Object.keys(design).filter((id) => !app[id]);
const findings = [];
const over = (a, b) => Math.abs(a - b) > tolerance;

for (const id of missing) findings.push(`${id}: in the design, not rendered by the app`);

for (const id of shared) {
  const [dx, dy, dw, dh] = design[id];
  const [ax, ay, aw, ah] = app[id];
  const deltas = [];
  if (over(dx, ax)) deltas.push(`x ${ax} vs ${dx} (Δ${ax - dx})`);
  if (over(dy, ay)) deltas.push(`y ${ay} vs ${dy} (Δ${ay - dy})`);
  if (over(dw, aw)) deltas.push(`width ${aw} vs ${dw} (Δ${aw - dw})`);
  if (over(dh, ah)) deltas.push(`height ${ah} vs ${dh} (Δ${ah - dh})`);
  if (deltas.length) findings.push(`${id}: ${deltas.join(' · ')}`);
}

const designInShared = Object.fromEntries(shared.map((id) => [id, design[id]]));
const appInShared = Object.fromEntries(shared.map((id) => [id, app[id]]));
for (const id of shared) {
  const parent = parentOf(id, designInShared);
  if (!parent || parentOf(id, appInShared) !== parent) continue;
  const inset = (box, outer) => [box[0] - outer[0], box[1] - outer[1], outer[0] + outer[2] - (box[0] + box[2]), outer[1] + outer[3] - (box[1] + box[3])];
  const d = inset(design[id], design[parent]);
  const a = inset(app[id], app[parent]);
  const sides = ['left', 'top', 'right', 'bottom'];
  const off = sides.filter((_, index) => over(d[index], a[index]))
    .map((side, index) => `${side} ${a[sides.indexOf(side)]}${tokenFor(a[sides.indexOf(side)])} vs ${d[sides.indexOf(side)]}${tokenFor(d[sides.indexOf(side)])}`);
  if (off.length) findings.push(`${id} inside ${parent}: inset ${off.join(' · ')}`);
}

function nearestBelow(id, boxes) {
  const box = boxes[id];
  let best = null;
  for (const [other, candidate] of Object.entries(boxes)) {
    if (other === id || contains(box, candidate) || contains(candidate, box)) continue;
    const overlap = Math.min(box[0] + box[2], candidate[0] + candidate[2]) - Math.max(box[0], candidate[0]);
    if (overlap <= 0 || candidate[1] < box[1] + box[3] - 1) continue;
    if (!best || candidate[1] < boxes[best][1]) best = other;
  }
  return best;
}
function nearestRight(id, boxes) {
  const box = boxes[id];
  let best = null;
  for (const [other, candidate] of Object.entries(boxes)) {
    if (other === id || contains(box, candidate) || contains(candidate, box)) continue;
    const overlap = Math.min(box[1] + box[3], candidate[1] + candidate[3]) - Math.max(box[1], candidate[1]);
    if (overlap <= 0 || candidate[0] < box[0] + box[2] - 1) continue;
    if (!best || candidate[0] < boxes[best][0]) best = other;
  }
  return best;
}
for (const id of shared) {
  for (const [label, nearest, gap] of [
    ['gap below', nearestBelow, (a, b) => b[1] - (a[1] + a[3])],
    ['gap right', nearestRight, (a, b) => b[0] - (a[0] + a[2])],
  ]) {
    const neighbour = nearest(id, designInShared);
    if (!neighbour) continue;
    if (nearest(id, appInShared) !== neighbour) {
      findings.push(`${id}: its ${label.replace('gap ', '')} neighbour is ${neighbour} in the design but ${nearest(id, appInShared) || 'nothing'} in the app`);
      continue;
    }
    const d = gap(design[id], design[neighbour]);
    const a = gap(app[id], app[neighbour]);
    if (over(d, a)) findings.push(`${id} → ${neighbour}: ${label} ${a}${tokenFor(a)} vs ${d}${tokenFor(d)} (Δ${a - d})`);
  }
}

function columns(parent, boxes) {
  const children = Object.keys(boxes).filter((id) => parentOf(id, boxes) === parent);
  const starts = [];
  for (const id of children) if (!starts.some((x) => Math.abs(x - boxes[id][0]) <= tolerance)) starts.push(boxes[id][0]);
  return starts.length;
}
for (const parent of new Set(shared.map((id) => parentOf(id, designInShared)).filter(Boolean))) {
  const d = columns(parent, designInShared);
  const a = columns(parent, appInShared);
  if (d !== a) findings.push(`${parent}: ${a} column(s) of children in the app vs ${d} in the design`);
}

process.stdout.write(`geometry: ${shared.length} shared ids · ${missing.length} not rendered · tolerance ±${tolerance}px\n`);
for (const finding of findings) process.stdout.write(`  - ${finding}\n`);
process.stdout.write(findings.length ? `geometry: ${findings.length} finding(s)\n` : 'geometry: clean\n');
process.exit(findings.length ? 1 : 0);
