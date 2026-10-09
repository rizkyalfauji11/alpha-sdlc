#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const USAGE =
  'usage: review-gaps.js --packet <packet.md> --reports <report.md>...\n' +
  '  a report is <id>=<file>, or a file whose name ends in -<id>.md (a dimension id from the packet,\n' +
  '  "single" for one reviewer holding every dimension, or "critic")\n' +
  '  prints changed files missing from the map or from their owner\'s report, findings without proof:\n' +
  '  or needs-eyes:, items marked not checked, checklist items no report mentions, clean items\n' +
  '  without evidence, and reports with neither a findings: nor a checked clean: section — exit 1 when\n' +
  '  there is any gap, 0 when none, 2 when an input cannot be read\n';

class GapsInputError extends Error {}

function inputError(message) {
  throw new GapsInputError(message);
}

function parseArguments(argv) {
  const options = { packet: null, reports: [] };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--packet') options.packet = argv[++index];
    else if (argument === '--reports') {
      while (argv[index + 1] && !argv[index + 1].startsWith('--')) options.reports.push(argv[++index]);
    } else inputError(`unexpected argument ${argument}`);
  }
  if (!options.packet || !options.reports.length) inputError('expected --packet <file> and --reports <files...>');
  return options;
}

function read(filePath, what) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return inputError(`cannot read ${what} ${filePath}`); }
}

function sectionLines(markdown, title) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

function parsePacket(text, packetPath) {
  const reviewers = sectionLines(text, 'Reviewers');
  const map = sectionLines(text, 'File → dimension map');
  if (!reviewers || !map) inputError(`${packetPath} is not a review packet: it has no "## Reviewers" or "## File → dimension map" section`);
  const dimensions = [];
  for (const line of reviewers) {
    const match = line.match(/^- ([\w+-]+) · (.+?) · items ([\d,\s]+)/);
    if (!match || match[1] === 'single') continue;
    dimensions.push({ id: match[1], name: match[2], items: match[3].split(',').map((item) => Number(item.trim())).filter(Number.isInteger) });
  }
  if (!dimensions.length) inputError(`${packetPath} lists no dimension under "## Reviewers"`);
  const files = [];
  for (const line of map) {
    const match = line.match(/^- `(.+)` → (.+?)(?: · .*)?$/);
    if (!match) continue;
    const owners = match[2].trim() === 'UNOWNED' ? [] : match[2].split(',').map((owner) => owner.trim()).filter(Boolean);
    files.push({ path: match[1], owners });
  }
  return { dimensions, files };
}

function reportIdOf(argument, knownIds) {
  const explicit = argument.match(/^([\w+-]+)=(.+)$/);
  if (explicit && !fs.existsSync(argument)) return { id: explicit[1], file: explicit[2] };
  const suffix = path.basename(argument).match(/-([\w+]+)\.md$/);
  if (suffix && (knownIds.includes(suffix[1]) || ['single', 'critic'].includes(suffix[1]))) return { id: suffix[1], file: argument };
  return inputError(`cannot tell which dimension ${argument} reports — pass it as <id>=${argument} (ids: ${[...knownIds, 'single', 'critic'].join(', ')})`);
}

const LABELS = [
  ['findings', /^findings\b/i],
  ['clean', /^checked clean\b/i],
  ['notChecked', /^not checked\b/i],
  ['counts', /^counts?\b/i],
  ['next', /^next(?:[ -]step)?\b/i],
];
const NONE = /^(?:none|nothing|—|-|n\/a)\.?$/i;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/;
const LABEL_WRAPPING = /^[*_`\s]+/;
const NUMBERED = /^\d+[.)]\s*/;

function labelOf(line) {
  const unheaded = line.replace(/^\s*#*\s*/, '');
  const bulleted = BULLET.test(unheaded);
  const numbered = NUMBERED.test(unheaded);
  const normal = unheaded.replace(BULLET, '').replace(LABEL_WRAPPING, '').replace(NUMBERED, '').replace(LABEL_WRAPPING, '');
  for (const [label, pattern] of LABELS) {
    if (!pattern.test(normal)) continue;
    const after = normal.replace(pattern, '');
    const colon = /^[*_`\s]*:/.test(after);
    const alone = /^[*_`\s]*$/.test(after);
    if (bulleted && !colon && !(alone && (numbered || /[*_`]/.test(unheaded)))) return null;
    const rest = after.replace(/^[*_`\s]*:?[*_`\s]*/, '').trim();
    return { label, rest };
  }
  return null;
}

function parseReport(text) {
  const sections = { findings: [], clean: [], notChecked: [], counts: [], next: [], labels: new Set() };
  let current = null;
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const label = labelOf(line);
    if (label) {
      current = label.label;
      sections.labels.add(current);
      if (label.rest && !NONE.test(label.rest)) sections[current].push({ text: label.rest, line: index + 1 });
      return;
    }
    if (!current || !line.trim()) return;
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, '').trim();
      if (!NONE.test(item)) sections[current].push({ text: item, line: index + 1 });
      return;
    }
    if (NONE.test(line.trim())) return;
    const last = sections[current][sections[current].length - 1];
    if (last && /^\s+\S/.test(line)) last.text += ' ' + line.trim();
    else if (!last || current === 'counts' || current === 'next') sections[current].push({ text: line.trim(), line: index + 1 });
  });
  return sections;
}

function itemsMentioned(text) {
  const items = new Set();
  for (const match of text.matchAll(/\b(?:items?|points?)\s+((?:\d+\s*(?:(?:,|&|and|to|–|-)\s*)?)+)/gi)) {
    const spec = match[1];
    for (const range of spec.matchAll(/(\d+)\s*(?:–|-|to)\s*(\d+)/g)) {
      for (let item = Number(range[1]); item <= Number(range[2]); item++) items.add(item);
    }
    for (const single of spec.matchAll(/\d+/g)) items.add(Number(single[0]));
  }
  return items;
}

function escaped(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentions(text, filePath, basenameIsUnique) {
  if (text.includes(filePath)) return true;
  if (!basenameIsUnique) return false;
  return new RegExp(`(^|[^\\w.-])${escaped(path.posix.basename(filePath))}($|[^\\w-])`).test(text);
}

const HAS_PROOF = /\bproof\s*:\s*\S/i;
const HAS_NEEDS_EYES = /\bneeds-eyes\s*[:—–-]\s*\S/i;
const HAS_EVIDENCE = /\bevidence\s*:\s*\S|[\w./-]+\.\w+:\d+|`[^`]+`/;

function findGaps(packet, reports) {
  const gaps = [];
  const byId = new Map();
  for (const report of reports) {
    if (!byId.has(report.id)) byId.set(report.id, []);
    byId.get(report.id).push(report);
  }
  const single = byId.get('single') || [];
  const dimensionReports = reports.filter((report) => report.id !== 'critic');

  if (!single.length) {
    for (const dimension of packet.dimensions) {
      if (!byId.has(dimension.id)) gaps.push({ kind: 'missing report', text: `dimension ${dimension.id} (${dimension.name}) has no report` });
    }
  }

  const basenames = new Map();
  for (const file of packet.files) {
    const base = path.posix.basename(file.path);
    basenames.set(base, (basenames.get(base) || 0) + 1);
  }
  for (const file of packet.files) {
    if (!file.owners.length) {
      gaps.push({ kind: 'unowned file', text: `${file.path} — the map gives it to no dimension` });
      continue;
    }
    const ownerReports = [...single, ...file.owners.flatMap((owner) => byId.get(owner) || [])];
    if (!ownerReports.length) {
      gaps.push({ kind: 'file without its owner\'s report', text: `${file.path} — no report from ${file.owners.join(', ')}` });
      continue;
    }
    const unique = basenames.get(path.posix.basename(file.path)) === 1;
    if (!ownerReports.some((report) => mentions(report.text, file.path, unique))) {
      gaps.push({ kind: 'file missing from its owner\'s report', text: `${file.path} — owner ${file.owners.join(', ')}; no line of ${ownerReports.map((report) => report.label).join(', ')} names it` });
    }
  }

  for (const report of reports) {
    const labels = report.sections.labels || new Set();
    if (!labels.has('findings') && !labels.has('clean')) {
      gaps.push({ kind: 'report outside the schema', text: `${report.label} has neither a "findings:" nor a "checked clean:" section, so none of its lines could be checked` });
    }
    for (const finding of report.sections.findings) {
      if (!HAS_PROOF.test(finding.text) && !HAS_NEEDS_EYES.test(finding.text)) {
        gaps.push({ kind: 'finding with neither a proof nor a needs-eyes label', text: `${report.label}:${finding.line} "${finding.text.slice(0, 140)}"` });
      }
    }
    for (const item of report.sections.notChecked) {
      gaps.push({ kind: 'not checked', text: `${report.label}:${item.line} "${item.text.slice(0, 140)}"` });
    }
    for (const item of report.sections.clean) {
      if (!HAS_EVIDENCE.test(item.text)) gaps.push({ kind: 'clean item without evidence', text: `${report.label}:${item.line} "${item.text.slice(0, 140)}"` });
    }
  }

  const mentioned = new Set();
  for (const report of dimensionReports) for (const item of itemsMentioned(report.text)) mentioned.add(item);
  for (const dimension of packet.dimensions) {
    for (const item of dimension.items) {
      if (!mentioned.has(item)) gaps.push({ kind: 'checklist item in no report', text: `item ${item} (dimension ${dimension.id} — ${dimension.name})` });
    }
  }
  return gaps;
}

function main(argv) {
  let options;
  let packet;
  let reports;
  try {
    options = parseArguments(argv);
    packet = parsePacket(read(options.packet, 'the packet'), options.packet);
    const knownIds = packet.dimensions.map((dimension) => dimension.id);
    reports = options.reports.map((argument) => {
      const { id, file } = reportIdOf(argument, knownIds);
      const text = read(file, 'the report');
      return { id, file, label: id === 'single' ? 'the single report' : `report ${id}`, text, sections: parseReport(text) };
    });
  } catch (error) {
    if (!(error instanceof GapsInputError)) throw error;
    process.stderr.write(`review-gaps: ${error.message}\n${USAGE}`);
    process.exit(2);
  }
  const gaps = findGaps(packet, reports);
  const heading = `packet ${path.basename(options.packet)} · reports ${reports.map((report) => report.id).join(', ')}`;
  if (!gaps.length) {
    process.stdout.write(`review-gaps: clean — ${heading}: every changed file is in its owner's report, every finding ` +
      'carries proof: or needs-eyes:, nothing is marked not checked, every checklist item is reported, every clean item has evidence\n');
    process.exitCode = 0;
    return;
  }
  process.stdout.write(`review-gaps: ${gaps.length} gap(s) — ${heading}\n`);
  for (const gap of gaps) process.stdout.write(`  - ${gap.kind}: ${gap.text}\n`);
  process.exitCode = 1;
}

module.exports = { parsePacket, parseReport, itemsMentioned, findGaps };

if (require.main === module) main(process.argv.slice(2));
