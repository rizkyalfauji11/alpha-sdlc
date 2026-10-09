#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { sdlcRootOf, stateDirectoryFor } = require('../hooks/lib/sdlc-context');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');

const USAGE =
  'usage: next-step.js <feature-dir> [platform] [--phase grooming|planning|development|testing|fixing] [--json]\n' +
  '  prints where a feature stands, read from its files only: the next unit, any STOP that applies (in the\n' +
  '  skills\' own words) and a bounded list of files to re-read. Without --phase the phase is detected\n' +
  '  from the files that exist; without a platform the hub is read.\n' +
  '  exit 0: the next unit is known · 1: a STOP applies · 2: usage error, or a format it cannot read\n' +
  '  (it then names the files to read instead of guessing)\n';

const PHASES = ['grooming', 'planning', 'development', 'testing', 'fixing'];
const CLIENT_PLATFORM = /\b(web|android|ios)\b/i;
const DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const UNCOMMITTED_STAMP = /\b\d{4}-\d{2}-\d{2}\s*·\s*uncommitted\b/i;
const MAX_REREAD = 8;
const SHOWN_LINES = 400;

const STOPS = {
  noProfileGrooming:
    'There is no `docs/basics/` (project not set up yet): STOP and ask the user to run `do-project-setup` first — ' +
    'grooming grounds in that profile. Wait for their answer; proceed without it only if the user explicitly ' +
    'chooses to, and then note that decisions are ungrounded.',
  noProfilePlanning:
    'There is no `docs/basics/` (project not set up yet): STOP and ask the user to run `do-project-setup` first — ' +
    'planning the package/architecture layout on an ungrounded view is how stages land in the wrong place. ' +
    'Proceed without it only if the user explicitly chooses to.',
  hubFirst:
    'If no hub exists, or its API-contract section isn\'t approved yet, STOP and groom the hub (through at least ' +
    'its approved API contract) before the spoke — the spoke can\'t be groomed against a missing/unapproved contract.',
  foundationHubFirst:
    'There is no foundation hub yet: STOP and groom the hub first — the hub\'s shared decisions are all approved before ' +
    'any spoke is groomed, and hub gates ①–⑥ are approved and the `Hub review` row is ✅ before any spoke section.',
  hubReviewFirst:
    'The hub review hasn\'t passed: STOP and finish the hub and its review first. Never start a spoke on a missing, ' +
    'unapproved or unreviewed hub.',
  rounds: (label, trend) =>
    `${label} rounds ${trend}: flat or rising across three rounds is a STOP — escalate to the user with the trend ` +
    'instead of launching another round.',
  screensFirst: (screens) =>
    `${screens}: any screen missing either doc, or with its Coverage checklist unchecked → STOP, back to Step 3 — ` +
    'do not run the review, do not call the spoke complete.',
  alignment: (why) =>
    `The spoke's \`Hub alignment\` stamp is ${why} → STOP and send it back to \`do-grooming\` for the ` +
    'hub-alignment review. Planning a spoke that disagrees with the hub bakes the disagreement into stages.',
  unfinishedSpoke: (screens) =>
    `${screens}: a screen this feature grooms (it has a widget spec in this feature's directory) with no ` +
    '`section-slicing/<screen>.md` is an UNFINISHED SPOKE — STOP and send it back to `do-grooming` Step 3.',
  noPlan: 'There is no plan: point the user to `do-planning` first — this skill executes a plan, it doesn\'t invent one.',
  stageStamp: (stage, why) =>
    `Stage ${stage}'s \`Approved (plan gate)\` stamp is ${why} → STOP. Send it back to \`do-planning\` — the plan ` +
    'was never approved, or was edited after approval (an explicit *proceed anyway* still overrides, with the gap ' +
    'recorded, per `principles.md`).',
  unclaimed: (ids) =>
    `${ids}: an AC in the TRD's numbered AC register that no stage's \`Covers:\` claims → STOP back to ` +
    '`do-planning` — that\'s decided scope nobody planned to build.',
  noRunRecipe:
    '`docs/basics/09-environment.md` has no *Full-stack run recipe*: that is the first blocker to resolve — send it ' +
    'to `do-project-setup`. Boot & Smoke cannot run without it, and it is never marked manual.',
  noTestReport: 'There is no `Bugs found` report: run `do-testing` first.',
  triage: (ids) =>
    `${ids}: \`Fix? (user)\` is not filled — ask triage. Work only the bugs the user triaged to fix; leave the rest.`,
  noTriageColumn:
    'The `Bugs found` table records no triage (no `Fix? (user)` column): ask the user which bugs to fix — work ' +
    'only the bugs the user triaged to fix.',
  threeStrikes: (id, attempts) =>
    `${id} has failed re-verification ${attempts} times — a fix that does not hold three times is the wrong fix: ` +
    'STOP, present the architectural question as an Open Decision, and do not attempt a fourth.',
};

const GATES = {
  outline: 'Stop and ask the user to approve or edit the outline. Do not draft any content yet.',
  auditScope:
    'Present the audit summary and get the user to confirm the scope before designing the fix — STOP until they do; ' +
    'record the confirmation in §1\'s Gate-0 notes (date, severity, systemic or per-site, sites in scope).',
  section:
    'Ask first, propose the decisions, then approve — one section at a time, never a batch; on approval write it ' +
    'and stamp it `_Approved: <date> · <commit>_` under its heading.',
  review: 'Present the verdict and STOP.',
  screen:
    'One gate per screen for the widget spec, one gate per section for the slicing; then set both docs\' Approved ' +
    'fields and run the Coverage checklist in full.',
  scope: 'Present the summary, then STOP and wait for confirmation before the architecture layout.',
  layout: 'Present the layout, then STOP — end your turn and wait for approval. Do not start the stage breakdown in the same turn.',
  breakdown: 'Present it, then STOP and wait for approval. Do not detail any stage until the user approves the shape.',
  stageDraft:
    'Draft the stage detail, present it and STOP (approve / edit / re-split — end your turn, wait for the verdict; ' +
    'do not draft the next stage or write the file yet); on approval write it with its `Approved: <commit · date>`.',
  stage:
    'Implement the stage, verify it, present it in the step-summary format and STOP — approve / request changes / ' +
    'stop here; do not touch the next stage until they respond.',
  testPlan:
    'Summarize the test plan for the user to confirm; name any environment/tooling the levels will need — ask ' +
    'before standing it up.',
  test:
    'Present the test for approval; only after the user approves, record its `Approved: <date>` in its procedure ' +
    'block and run it — one test at a time, never "approve & run the rest".',
  bugReport:
    'Present the consolidated Bugs found report — every bug with severity · level · repro · AC — and let the user ' +
    'triage. Fix nothing here; confirmed fixes hand off to `do-fixing`.',
  bug: 'Present the fix and STOP — approve / change / stop. Do not touch the next bug until they respond.',
};

function readText(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

function exists(filePath) {
  try { fs.accessSync(filePath); return true; } catch { return false; }
}

function isDirectory(directory) {
  try { return fs.statSync(directory).isDirectory(); } catch { return false; }
}

const plain = (text) => String(text === null || text === undefined ? '' : text).replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
const excerpt = (text, length = 160) => {
  const flat = plain(text);
  return flat.length > length ? flat.slice(0, length - 1) + '…' : flat;
};
const firstDate = (text) => {
  const match = DATE.exec(String(text || ''));
  return match ? match[0] : null;
};
const isTemplateValue = (text) => {
  const value = String(text || '').trim().replace(/^[*_`\s]+/, '');
  return !value || value.startsWith('<') || /\bY{4}-M{2}-D{2}\b/.test(value);
};

function commitIn(text) {
  const source = String(text || '');
  const labelled = /\b(?:commit|rev)\b\s*`?([0-9a-f]{7,40})\b/i.exec(source);
  if (labelled) return labelled[1];
  const ticked = /`([0-9a-f]{7,40})`/.exec(source);
  return ticked ? ticked[1] : null;
}

function stampCommit(text) {
  const named = commitIn(text);
  if (named) return named;
  const flat = plain(text);
  const afterSeparator = /·\s*([0-9a-f]{7,40})\b/.exec(flat);
  if (afterSeparator && /\d/.test(afterSeparator[1])) return afterSeparator[1];
  const stampPosition = /\b\d{4}-\d{2}-\d{2}\s*·\s*([0-9a-f]{7,40})(?![\w-])/.exec(flat);
  return stampPosition ? stampPosition[1] : null;
}

function relativeLabel(filePath) {
  return path.basename(filePath);
}

function git(cwd, args, timeout = 30000) {
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.quotepath=off', '-c', 'color.ui=never', ...args], {
    cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: 256 * 1024 * 1024,
  });
  return { ok: result.status === 0, status: result.status, stdout: result.stdout || '', stderr: (result.stderr || '').trim() };
}

function linesOf(text) {
  return String(text).split('\n');
}

function outlineOf(lines) {
  const headings = [];
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const fenceMark = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[index]);
    if (fenceMark) {
      const kind = fenceMark[1][0];
      if (fence === null) fence = kind;
      else if (fence === kind) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^(#{1,6})\s+(.*?)\s*$/.exec(lines[index]);
    if (heading) headings.push({ level: heading[1].length, text: heading[2], index });
  }
  return headings;
}

function endOfSection(headings, heading, lineCount) {
  const next = headings.find((candidate) => candidate.index > heading.index && candidate.level <= heading.level);
  return next ? next.index : lineCount;
}

function cellsOf(line) {
  const trimmed = String(line).trim();
  if (!trimmed.startsWith('|')) return null;
  const cells = [];
  let current = '';
  for (let index = 1; index < trimmed.length; index++) {
    const character = trimmed[index];
    if (character === '\\' && trimmed[index + 1] === '|') {
      current += '|';
      index++;
      continue;
    }
    if (character === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim()) cells.push(current.trim());
  return cells;
}

const isDividerRow = (cells) => cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.replace(/\s/g, '')));

function tableIn(lines, start, end) {
  let index = start;
  while (index < end && cellsOf(lines[index]) === null) index++;
  if (index >= end) return null;
  const header = cellsOf(lines[index]);
  const rows = [];
  for (index++; index < end; index++) {
    const cells = cellsOf(lines[index]);
    if (cells === null) break;
    if (isDividerRow(cells)) continue;
    rows.push({ cells, index });
  }
  return { header, rows, end: index };
}

const columnOf = (header, pattern) => header.findIndex((cell) => pattern.test(plain(cell)));

function splitBoldLabel(boldText, rest) {
  const label = plain(boldText);
  const colon = label.indexOf(':');
  if (colon === -1 || colon === label.length - 1) return { label: label.replace(/:$/, '').trim(), value: rest };
  return { label: label.slice(0, colon).trim(), value: [label.slice(colon + 1).trim(), rest].filter(Boolean).join(' ') };
}

function fieldValue(lines, labelPattern, start = 0, end = lines.length) {
  for (let index = start; index < end; index++) {
    const line = lines[index];
    const cells = cellsOf(line);
    if (cells && cells.length >= 2) {
      if (labelPattern.test(plain(cells[0]))) return { value: cells.slice(1).join(' | '), index };
      continue;
    }
    const bold = /^\s*(?:[-*]\s+)?\*\*([^*]+?)\*\*\s*:?\s*(.*)$/.exec(line);
    if (bold) {
      const field = splitBoldLabel(bold[1], bold[2]);
      if (labelPattern.test(field.label)) return { value: field.value, index };
    }
    const bare = /^\s*(?:[-*]\s+)?([A-Za-z][\w ?()/-]{2,40}):\s+(.*)$/.exec(line);
    if (bare && labelPattern.test(plain(bare[1]))) return { value: bare[2], index };
  }
  return null;
}

function bulletField(body, labelPattern) {
  for (let index = 0; index < body.length; index++) {
    const match = /^\s*[-*]\s+\*\*([^*]+?)\*\*\s*:?\s*(.*)$/.exec(body[index]);
    if (!match) continue;
    const field = splitBoldLabel(match[1], match[2]);
    if (!labelPattern.test(field.label)) continue;
    const parts = [field.value];
    for (let next = index + 1; next < body.length; next++) {
      if (!/^\s{2,}\S/.test(body[next]) || /^\s*[-*]\s+\*\*/.test(body[next])) break;
      parts.push(body[next].trim());
    }
    return { text: parts.join(' ').trim(), index };
  }
  return null;
}

function inlineField(lines, pattern) {
  for (let index = 0; index < lines.length; index++) {
    const match = pattern.exec(lines[index]);
    if (match) return { text: match[1].trim(), index };
  }
  return null;
}

const AC_ID = /AC-(\d+)/g;
const AC_RANGE = /AC-(\d+)`?\s*(?:…|\.\.\.?|–|—|to)\s*`?AC-(\d+)/g;
function acIdsIn(text) {
  const ids = [...String(text).matchAll(AC_ID)].map((match) => Number(match[1]));
  for (const range of String(text).matchAll(AC_RANGE)) {
    for (let id = Number(range[1]) + 1; id < Number(range[2]); id++) ids.push(id);
  }
  return [...new Set(ids)];
}

function numberedSection(lines, number) {
  const headings = outlineOf(lines);
  const heading = headings.find((candidate) => new RegExp(`^${number}\\.\\s`).test(plain(candidate.text)));
  if (!heading) return null;
  return { heading, start: heading.index + 1, end: endOfSection(headings, heading, lines.length) };
}

function registerRowsIn(lines, section) {
  const register = new Map();
  if (!section) return register;
  for (let index = section.start; index < section.end; index++) {
    const cells = cellsOf(lines[index]);
    if (!cells || cells.length < 2) continue;
    const id = /^(?:~~)?\s*AC-(\d+)\b/.exec(plain(cells[0]).replace(/^~~/, ''));
    if (id) register.set(Number(id[1]), { criterion: cells[1], retired: /~~/.test(cells[0]) });
  }
  return register;
}

function acRegisterOf(spokeText) {
  if (!spokeText) return new Map();
  const lines = linesOf(spokeText);
  const register = registerRowsIn(lines, numberedSection(lines, 8));
  if (register.size) return register;
  const headings = outlineOf(lines);
  const heading = headings.find((candidate) => candidate.level >= 2 && /acceptance criteria/i.test(plain(candidate.text)));
  return heading ? registerRowsIn(lines, { start: heading.index + 1, end: endOfSection(headings, heading, lines.length) }) : register;
}

function registerTextOf(context) {
  if (context.spoke.text) return context.spoke.text;
  const kind = context.hub.text ? documentKind(context.hub.text, 'TRD.md') : null;
  return kind === 'issue' || kind === 'tech-debt' ? context.hub.text : null;
}

function projectRootOf(featureDirectory) {
  const match = /^(.*?)[\\/]docs[\\/]development[\\/]/.exec(featureDirectory + path.sep);
  if (match) return match[1] || path.sep;
  return sdlcRootOf(featureDirectory);
}

function newResult(context, phase, phaseSource) {
  return {
    feature: context.feature,
    platform: context.platform,
    featureDir: context.featureDirectory,
    phase,
    phaseSource,
    skill: null,
    next: null,
    gate: null,
    stops: [],
    facts: [],
    notes: [],
    reread: [],
    block: null,
    unknown: null,
    complete: false,
  };
}

function at(filePath, lineIndex) {
  return `${relativeLabel(filePath)}:${lineIndex + 1}`;
}

function setNext(result, unit, step, location) {
  result.next = location ? { unit, step, location } : { unit, step };
}

function reread(result, filePath, why) {
  if (!filePath || !exists(filePath)) return;
  if (result.reread.some((entry) => entry.path === filePath)) return;
  result.reread.push({ path: filePath, why });
}

function markUnknown(result, reason, files) {
  result.unknown = { reason, files: [...new Set(files.filter(Boolean))] };
}

function trimmedBlock(lines, start, end) {
  const slice = lines.slice(start, end);
  while (slice.length && !slice[slice.length - 1].trim()) slice.pop();
  return slice;
}

function stampState(value) {
  if (value === null || value === undefined) return 'missing';
  const text = String(value);
  if (isTemplateValue(text) || /^pending\b/i.test(plain(text))) return 'placeholder';
  if (/\bstale\b/i.test(text)) return 'marked-stale';
  if (DATE.test(text) || commitIn(text)) return 'stamped';
  return 'unreadable';
}

function reviewState(value) {
  if (value === null || value === undefined) return 'missing';
  const text = String(value).trim();
  if (isTemplateValue(text)) return 'placeholder';
  const lead = plain(text).slice(0, 160);
  const firstClause = lead.split(/\s[—–]\s|\.\s/)[0];
  if (/\bnot\s+(?:reviewed|stamped)\b/i.test(firstClause)) return 'not-reviewed';
  const mark = /✅|⚠️|⚠|⏸|❌|⛔/.exec(lead);
  if (mark) {
    if (mark[0] === '✅') return 'reviewed';
    if (mark[0] === '❌' || mark[0] === '⛔') return 'not-reviewed';
    return 'not-clean';
  }
  if (/\bstale\b|\bre-?staled\b/i.test(firstClause)) return 'not-clean';
  if (/\breviewed\b/i.test(firstClause) && DATE.test(firstClause)) return 'reviewed';
  return 'unknown';
}

function roundsOf(text, afterWord) {
  let source = plain(text);
  if (afterWord) {
    const position = source.search(new RegExp(`\\b${afterWord}\\b`, 'i'));
    if (position === -1) return [];
    source = source.slice(position);
  }
  const sequence = /(\d+(?:\s*(?:·|→|->)\s*\d+)+)/.exec(source);
  if (sequence) return sequence[1].split(/\s*(?:·|→|->)\s*/).map(Number);
  const single = afterWord ? new RegExp(`\\b${afterWord}\\b\\s*:?\\s*(\\d+)\\b`, 'i').exec(source) : /^\s*(\d+)\s*$/.exec(source);
  return single ? [Number(single[1])] : [];
}

function risingTrend(rounds) {
  if (rounds.length < 3) return null;
  const [first, second, third] = rounds.slice(-3);
  return first <= second && second <= third && third > 0 ? `${first} · ${second} · ${third}` : null;
}

function documentKind(text, fileName) {
  const title = plain((linesOf(text).find((line) => /^#\s/.test(line)) || '').replace(/^#\s+/, '')).toLowerCase();
  if (/^foundation trd\b/.test(title)) return 'foundation';
  if (/^issue trd\b/.test(title)) return 'issue';
  if (/^tech-?debt trd\b/.test(title)) return 'tech-debt';
  return fileName === 'TRD.md' ? 'hub' : 'spoke';
}

const GROOMING_SKILL = {
  hub: 'do-grooming',
  spoke: 'do-grooming',
  foundation: 'do-foundation-grooming',
  issue: 'do-issue-grooming',
  'tech-debt': 'do-tech-debt-grooming',
};
const TEMPLATE_OF_KIND = {
  hub: ['do-grooming', 'TRD-hub-template.md'],
  spoke: ['do-grooming', 'TRD-spoke-template.md'],
  foundation: ['do-foundation-grooming', 'foundation-TRD-template.md'],
  issue: ['do-issue-grooming', 'issue-TRD-template.md'],
  'tech-debt': ['do-tech-debt-grooming', 'tech-debt-TRD-template.md'],
};
const templatePathOf = (kind) => path.join(pluginRoot, 'skills', ...TEMPLATE_OF_KIND[kind]);

function sectionMarker(lines, heading, nextIndex) {
  const headingLine = lines[heading.index];
  if (/_Pending(?![A-Za-z])[^_]*_/i.test(headingLine)) return { state: 'pending', stamp: null };
  const inline = /_Approved:\s*([^_]*)_?/i.exec(headingLine);
  if (inline) return approvalMarker(inline[1]);
  for (let index = heading.index + 1; index < Math.min(nextIndex, heading.index + 4); index++) {
    const line = lines[index].trim();
    if (!line) continue;
    if (/^_Pending(?![A-Za-z])/i.test(line)) return { state: 'pending', stamp: null };
    const approved = /^_Approved:\s*([^_]*)/i.exec(line);
    return approved ? approvalMarker(approved[1]) : null;
  }
  return null;
}

function approvalMarker(value) {
  if (isTemplateValue(value)) return { state: 'pending', stamp: null, placeholder: true };
  return { state: 'approved', stamp: plain(value) };
}

function gatedSectionsOf(text) {
  const lines = linesOf(text);
  const headings = outlineOf(lines);
  const sections = [];
  headings.forEach((heading, position) => {
    if (heading.level < 2) return;
    const nextIndex = position + 1 < headings.length ? headings[position + 1].index : lines.length;
    const marker = sectionMarker(lines, heading, nextIndex);
    const title = plain(heading.text.replace(/_Pending(?![A-Za-z])[^_]*_/i, '').replace(/_Approved:[^_]*_?/i, ''));
    const numbered = /^\d+\.\s/.test(title);
    if (!marker && !numbered) return;
    sections.push({
      title,
      level: heading.level,
      number: numbered ? Number(/^(\d+)\./.exec(title)[1]) : null,
      line: heading.index,
      state: marker ? marker.state : 'unmarked',
      stamp: marker ? marker.stamp : null,
    });
  });
  return sections;
}

function effectiveSections(text) {
  const sections = gatedSectionsOf(text);
  const outlineOnDisk = sections.some((section) => section.state === 'pending');
  const unstamped = outlineOnDisk ? [] : sections.filter((section) => section.state === 'unmarked');
  for (const section of unstamped) section.state = 'approved';
  return { sections, outlineOnDisk, unstamped };
}

const normalizedTitle = (title) => plain(title).toLowerCase().replace(/^\d+\.\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();

function missingTemplateSections(sections, kind, foundationPart) {
  const template = readText(templatePathOf(kind));
  if (!template) return [];
  const written = new Set(sections.map((section) => (section.number !== null ? `#${section.number}` : normalizedTitle(section.title))));
  return gatedSectionsOf(template)
    .filter((section) => !foundationPart || (foundationPart === 'hub' ? section.level === 2 : section.level > 2))
    .filter((section) => !written.has(section.number !== null ? `#${section.number}` : normalizedTitle(section.title)))
    .map((section) => section.title);
}

const HUB_BOOKKEEPING = [
  /^\|\s*\**\s*(status|hub review|spokes|date|author|hub alignment|alignment rounds)\s*\**\s*\|/i,
  /^_Approved:/i,
  /^_Pending(?![A-Za-z])/i,
  /^\|.*\]\([^)]*TRD-[\w.-]+\.md\)/,
  /^\|.*`[^`]*TRD-[\w.-]+\.md`/,
];

const WORK_ITEM_CHECKBOX = /^(\s*[-*+]\s+)\[[ xX]\]\s+/;
const TRACKER_KEYS_SUFFIX = /\s+[—–-]+\s+(?:\[?(?:[A-Z][A-Z0-9]+-\d+|#\d+)\]?(?:\([^)\s]*\))?[,\s]*)+$/;

function withoutTrackerBookkeeping(text) {
  return text.replace(WORK_ITEM_CHECKBOX, '$1').replace(TRACKER_KEYS_SUFFIX, '').trim();
}

function withoutTrackerWriteBacks(hunk) {
  const removed = hunk.filter((entry) => entry.sign === '-');
  const added = hunk.filter((entry) => entry.sign === '+');
  const cancelled = new Set();
  for (const addition of added.filter((entry) => WORK_ITEM_CHECKBOX.test(entry.text))) {
    const pair = removed.find((removal) => !cancelled.has(removal) && removal.text !== addition.text &&
      WORK_ITEM_CHECKBOX.test(removal.text) &&
      withoutTrackerBookkeeping(removal.text) === withoutTrackerBookkeeping(addition.text));
    if (!pair) continue;
    cancelled.add(pair);
    cancelled.add(addition);
  }
  return hunk.filter((entry) => !cancelled.has(entry));
}

function substantiveChanges(diffText) {
  const hunks = [[]];
  for (const line of linesOf(diffText)) {
    if (line.startsWith('@@')) { hunks.push([]); continue; }
    if (!/^[+-]/.test(line) || /^(\+\+\+|---)\s/.test(line)) continue;
    const text = line.slice(1);
    if (!text.trim() || HUB_BOOKKEEPING.some((pattern) => pattern.test(text.trim()))) continue;
    hunks[hunks.length - 1].push({ sign: line[0], text });
  }
  return hunks.flatMap(withoutTrackerWriteBacks).map((entry) => `${entry.sign} ${excerpt(entry.text, 100)}`);
}

function hubMovedSince(hubPath, revisionText) {
  const directory = path.dirname(hubPath);
  const file = path.basename(hubPath);
  const commit = commitIn(revisionText);
  if (commit) {
    if (!git(directory, ['cat-file', '-e', `${commit}^{commit}`]).ok) {
      return { state: 'unverified', why: `hub rev ${commit} is not in the hub's repository history` };
    }
    if (!git(directory, ['cat-file', '-e', `${commit}:./${file}`]).ok) {
      return { state: 'unverified', why: `the hub was not committed at rev ${commit} — its edits since the stamp cannot be read from git` };
    }
    const diff = git(directory, ['diff', '--no-ext-diff', '-U0', commit, '--', file]);
    if (!diff.ok) return { state: 'unverified', why: `hub rev ${commit} is not in the hub's repository history` };
    const changes = substantiveChanges(diff.stdout);
    return changes.length ? { state: 'moved', why: `the hub changed since rev ${commit}`, changes } : { state: 'unchanged' };
  }
  const date = firstDate(revisionText);
  if (!date) return { state: 'unverified', why: 'the stamp names no hub rev' };
  if (!git(directory, ['ls-files', '--error-unmatch', '--', file]).ok) {
    return { state: 'unverified', why: 'the hub is not committed — its edits since the stamp cannot be read from git' };
  }
  const log = git(directory, ['log', `--since=${date}T23:59:59`, '--format=%H %cs', '--', file]);
  if (!log.ok) return { state: 'unverified', why: 'the hub has no git history here' };
  for (const entry of linesOf(log.stdout).filter(Boolean).reverse()) {
    const [commitHash, commitDate] = entry.split(' ');
    const shown = git(directory, ['show', '--no-ext-diff', '--format=', '-U0', commitHash, '--', file]);
    const changes = shown.ok ? substantiveChanges(shown.stdout) : [];
    if (changes.length) {
      return { state: 'moved', why: `the hub changed on ${commitDate} (${commitHash.slice(0, 7)}), after hub rev ${date}`, changes };
    }
  }
  const uncommitted = git(directory, ['diff', '--no-ext-diff', '-U0', 'HEAD', '--', file]);
  const changes = uncommitted.ok ? substantiveChanges(uncommitted.stdout) : [];
  if (changes.length) return { state: 'moved', why: `the hub has uncommitted edits after hub rev ${date}`, changes };
  return { state: 'unchanged', note: `hub rev ${date} is a date: an edit made later that same day cannot be told apart` };
}

function hubRevisionOf(stampText) {
  const match = /hub rev\b\s*(.+)$/i.exec(String(stampText || '').replace(/\*/g, ''));
  return match ? `rev ${match[1].trim()}` : null;
}

function locateHub(context) {
  if (exists(context.paths.hub)) return context.paths.hub;
  if (!context.spoke.text) return context.paths.hub;
  const row = fieldValue(context.spoke.lines, /^hub$/i, 0, Math.min(40, context.spoke.lines.length));
  const link = row && (/\]\(([^)]+)\)/.exec(row.value) || /`([^`]+\.md)`/.exec(row.value));
  if (!link) return context.paths.hub;
  const target = link[1].replace(/^[\w.-]+:\s*/, '');
  const bases = [context.featureDirectory];
  if (context.projectRoot) {
    bases.push(context.projectRoot);
    let ancestor = context.projectRoot;
    for (let depth = 0; depth < 3; depth++) {
      ancestor = path.dirname(ancestor);
      bases.push(ancestor);
    }
  }
  const found = bases.map((base) => path.resolve(base, target)).find(exists);
  return found || context.paths.hub;
}

function spokesOf(hubLines, featureDirectory) {
  const headings = outlineOf(hubLines);
  const heading = headings.find((candidate) => candidate.level === 2 && /^spokes\b/i.test(plain(candidate.text)));
  if (!heading) return null;
  const table = tableIn(hubLines, heading.index + 1, endOfSection(headings, heading, hubLines.length));
  if (!table) return [];
  const nameColumn = Math.max(0, columnOf(table.header, /^spoke$/i));
  const linkColumn = columnOf(table.header, /^link$/i);
  const alignmentColumn = columnOf(table.header, /alignment/i);
  return table.rows
    .filter((row) => !isTemplateValue(row.cells[nameColumn]))
    .map((row) => {
      const linkCell = linkColumn === -1 ? '' : row.cells[linkColumn] || '';
      const target = /\]\(([^)]+)\)/.exec(linkCell) || /`([^`]+\.md)`/.exec(linkCell) || /([\w./-]+\.md)/.exec(linkCell);
      const spokePath = target ? path.resolve(featureDirectory, target[1]) : null;
      const alignment = alignmentColumn === -1 ? '' : row.cells[alignmentColumn] || '';
      return { name: plain(row.cells[nameColumn]), path: spokePath, alignment, state: reviewState(alignment) };
    });
}

function uncheckedChecklistLines(lines) {
  const headings = outlineOf(lines);
  const heading = headings.find((candidate) => /^coverage checklist/i.test(plain(candidate.text)));
  if (!heading) return 0;
  return lines.slice(heading.index + 1, endOfSection(headings, heading, lines.length)).filter((line) => /^\s*[-*]\s+\[ \]/.test(line)).length;
}

function screenArtifacts(featureDirectory) {
  const names = new Set();
  const list = (directory) => {
    try { return fs.readdirSync(directory).filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -3)); } catch { return []; }
  };
  const widgetDirectory = path.join(featureDirectory, 'widget-spec');
  const slicingDirectory = path.join(featureDirectory, 'section-slicing');
  list(widgetDirectory).forEach((name) => names.add(name));
  list(slicingDirectory).forEach((name) => names.add(name));
  return [...names].sort().map((name) => {
    const widgetText = readText(path.join(widgetDirectory, name + '.md'));
    const slicingText = readText(path.join(slicingDirectory, name + '.md'));
    const widgetApproval = widgetText ? fieldValue(linesOf(widgetText), /^approved$/i, 0, 40) : null;
    const slicingApproval = slicingText ? fieldValue(linesOf(slicingText), /^approved \(screen\)$|^approved$/i, 0, 40) : null;
    const unchecked = slicingText ? uncheckedChecklistLines(linesOf(slicingText)) : 0;
    const gaps = [];
    if (!widgetText) gaps.push('no widget spec');
    else if (stampState(widgetApproval && widgetApproval.value) !== 'stamped') gaps.push('widget spec not approved');
    if (!slicingText) gaps.push('no section-slicing doc');
    else if (stampState(slicingApproval && slicingApproval.value) !== 'stamped') gaps.push('section slicing not approved');
    if (unchecked) gaps.push(`${unchecked} Coverage checklist line(s) unchecked`);
    return { name, hasWidgetSpec: Boolean(widgetText), hasSlicing: Boolean(slicingText), gaps };
  });
}

function carryForwardAnswers(lines) {
  const headings = outlineOf(lines);
  const heading = headings.find((candidate) => /carry-?forward answers/i.test(plain(candidate.text)));
  let start;
  let end;
  if (heading) {
    start = heading.index + 1;
    end = endOfSection(headings, heading, lines.length);
  } else {
    const label = lines.findIndex((line) => /^\s*\*\*carry-?forward answers\b/i.test(line));
    if (label === -1) return [];
    start = label + 1;
    end = lines.length;
  }
  const answers = [];
  for (let index = start; index < end; index++) {
    if (/^\s*[-*]\s+\S/.test(lines[index])) answers.push(excerpt(lines[index].replace(/^\s*[-*]\s+/, ''), 180));
    else if (answers.length && !lines[index].trim()) break;
  }
  return answers;
}

function gateZeroRecords(lines) {
  const section = numberedSection(lines, 1);
  const body = section ? lines.slice(section.start, section.end) : lines;
  const notesAt = body.findIndex((line) => /\bgate-0 notes\b/i.test(plain(line)));
  const bullets = (notesAt === -1 ? body : body.slice(notesAt + 1))
    .filter((line) => /^\s*[-*]\s+\S/.test(line))
    .map((line) => plain(line.replace(/^\s*[-*]\s+/, '')));
  const recorded = (label) => bullets.some((text) => {
    const match = label.exec(text);
    if (!match) return false;
    const value = text.slice(match[0].length).replace(/^\s*:?\s*/, '');
    return !value || (!isTemplateValue(value) && !/^pending\b/i.test(value));
  });
  return { scopeConfirmed: recorded(/^scope confirmed\b/i), outlineApproved: recorded(/^outline approved\b/i) };
}

function issueGateZeroOpen(result, lines, targetPath, sections) {
  const records = gateZeroRecords(lines);
  if (records.scopeConfirmed && records.outlineApproved) return false;
  const capture = sections.find((section) => section.number === 1);
  const location = capture ? at(targetPath, capture.line) : null;
  result.facts.push(`Gate 0 is open: §1's Gate-0 notes record ${records.scopeConfirmed ? 'no approved outline' : 'no confirmed scope'}`);
  if (!records.scopeConfirmed) {
    setNext(result, 'Gate 0',
      'step 3 — assess severity and confirm the audit scope (the audit is on disk as the pending §1–§2: never re-run it)', location);
    result.gate = GATES.auditScope;
    return true;
  }
  setNext(result, 'Gate 0',
    'step 4 — propose the section outline; on approval complete the skeleton and record `Outline approved` in the Gate-0 notes', location);
  result.gate = GATES.outline;
  return true;
}

function sessionFiles(context) {
  const key = `${context.feature}--${context.platform || 'hub'}`;
  const directories = [...new Set([
    stateDirectoryFor(process.cwd()),
    context.projectRoot ? path.join(context.projectRoot, '.alpha-sdlc') : null,
  ].filter(Boolean).filter(isDirectory).map(realPath))];
  const found = { nextFile: null, handoff: null, marker: null };
  for (const directory of directories) {
    const nextPath = path.join(directory, 'next', key + '.json');
    if (!found.nextFile && exists(nextPath)) {
      let data = null;
      try { data = JSON.parse(readText(nextPath)); } catch {}
      found.nextFile = { path: nextPath, data };
    }
    const handoffPath = path.join(directory, 'handoff', key + '.md');
    if (!found.handoff && exists(handoffPath)) found.handoff = handoffPath;
    const markerPath = path.join(directory, 'auto-run.json');
    if (!found.marker && exists(markerPath)) {
      try { found.marker = { path: markerPath, data: JSON.parse(readText(markerPath)) }; } catch {}
    }
  }
  return found;
}

function markerIsThisFeature(context) {
  const marker = context.session.marker && context.session.marker.data;
  if (!marker) return false;
  if (marker.platform && context.platform && marker.platform !== context.platform) return false;
  if (marker.featureDir) {
    const markerRoot = path.dirname(path.dirname(context.session.marker.path));
    return realPath(path.resolve(markerRoot, marker.featureDir)) === context.featureDirectory;
  }
  return !marker.feature || marker.feature === context.feature;
}

function autoRunCovers(context) {
  const marker = context.session.marker && context.session.marker.data;
  return Boolean(marker && marker.status === 'running' && markerIsThisFeature(context));
}

function describeSession(context, result) {
  const { nextFile, handoff, marker } = context.session;
  if (nextFile) {
    const data = nextFile.data || {};
    const parts = [
      data.status || 'unreadable',
      data.unit ? `unit ${data.unit}` : null,
      data.skill ? `skill ${data.skill}` : null,
      data.at ? `written ${data.at}` : null,
    ];
    result.facts.push(`next-file ${nextFile.path}: ${parts.filter(Boolean).join(' · ')}` +
      (data.status === 'ready' ? ' — this session takes it: set its status to consumed' : ''));
  }
  if (handoff) result.facts.push(`handoff ${handoff}: session-only facts (stack PIDs/ports, tooling consents) — read it first`);
  if (marker && marker.data) {
    const data = marker.data;
    const parts = [data.status, data.scope ? `scope ${data.scope}` : null, data.feature, data.platform, data.until ? `until ${data.until}` : null,
      Array.isArray(data.decisions) ? `${data.decisions.length} decision(s) taken for you` : null];
    result.facts.push(`auto-run marker ${marker.path}: ${parts.filter(Boolean).join(' · ')}` +
      (markerIsThisFeature(context) ? '' : ' — another feature\'s chain'));
  }
}

function profileExists(context) {
  return Boolean(context.projectRoot) && isDirectory(path.join(context.projectRoot, 'docs', 'basics'));
}

function isClient(context) {
  if (CLIENT_PLATFORM.test(context.platform || '')) return true;
  if (!context.plan.text) return false;
  const row = fieldValue(context.plan.lines, /^platform$/i, 0, Math.min(30, context.plan.lines.length));
  return Boolean(row && !isTemplateValue(row.value) && CLIENT_PLATFORM.test(row.value));
}

function rereadSectionTemplate(context, result, targetKind, hubKind) {
  reread(result, templatePathOf(targetKind), 'the template the next section follows');
  if (targetKind === 'hub') {
    reread(result, path.join(pluginRoot, 'skills', 'do-grooming', 'hub.md'),
      'the branch file — what only the hub decides: evolution, dependencies, entities, the contract');
  } else if (targetKind === 'spoke' && hubKind === 'hub' && isClient(context)) {
    reread(result, path.join(pluginRoot, 'skills', 'do-grooming', 'client-spoke.md'),
      'the branch file — design capture, widget specs and section slicing');
  }
}

function pendingHubChangeRows(hubLines) {
  const headings = outlineOf(hubLines);
  const heading = headings.find((candidate) => /^open decisions\b/i.test(plain(candidate.text)));
  if (!heading) return [];
  const table = tableIn(hubLines, heading.index + 1, endOfSection(headings, heading, hubLines.length));
  if (!table) return [];
  const statusColumn = columnOf(table.header, /^status\b/i);
  return table.rows.filter((row) => {
    const status = statusColumn === -1 ? row.cells.join(' ') : row.cells[statusColumn] || '';
    return /pending hub change/i.test(plain(status));
  });
}

function omissionsRegisterOf(hubLines) {
  const heading = outlineOf(hubLines).find((candidate) => /^deliberate omissions\b/i.test(plain(candidate.text)));
  if (!heading) return { state: 'missing' };
  const next = hubLines.slice(heading.index, heading.index + 4).join('\n');
  const stamp = /_Approved:\s*([^_]*)/i.exec(next);
  return {
    state: /_Pending(?![A-Za-z])/i.test(next) ? 'pending' : 'written',
    line: heading.index,
    date: stamp ? firstDate(stamp[1]) : null,
  };
}

function spokeRounds(context, hubText, hubKind) {
  if (hubKind === 'foundation') {
    const alignment = spokeAlignment(context, hubText, hubKind);
    const fromHub = alignment.value ? roundsOf(alignment.value, 'rounds') : [];
    if (fromHub.length) return fromHub;
  }
  return alignmentRounds(context);
}

function groomingPosition(context, result) {
  const hubPath = locateHub(context);
  const hubText = hubPath === context.paths.hub ? context.hub.text : readText(hubPath);
  const hubKind = hubText ? documentKind(hubText, 'TRD.md') : path.basename(context.featureDirectory) === 'foundation' ? 'foundation' : 'hub';
  result.skill = GROOMING_SKILL[hubKind];
  const groomingSpoke = Boolean(context.platform);
  const targetPath = groomingSpoke ? context.paths.spoke : hubPath;
  const targetText = groomingSpoke ? context.spoke.text : hubText;
  const targetKind = groomingSpoke ? (hubKind === 'foundation' ? 'foundation' : 'spoke') : hubKind;
  const foundationPart = hubKind === 'foundation' ? (groomingSpoke ? 'spoke' : 'hub') : null;
  const directoryExists = exists(context.featureDirectory);
  if (!directoryExists) result.facts.push(`no feature directory at ${context.featureDirectory} — nothing is groomed under that name yet`);

  if (!profileExists(context)) {
    if (!targetText) result.stops.push(STOPS.noProfileGrooming);
    else result.notes.push('no docs/basics/ — the user chose to groom without a profile, so decisions are ungrounded');
  }

  const hubLines = hubText ? linesOf(hubText) : [];
  const hubSections = hubText ? effectiveSections(hubText).sections : [];
  const hubReview = hubText ? fieldValue(hubLines, /^hub review$/i, 0, Math.min(40, hubLines.length)) : null;
  const hubReviewState = hubReview ? reviewState(hubReview.value) : 'missing';

  if (groomingSpoke) {
    reread(result, hubPath, 'the approved hub — primary context for the spoke');
    if (!hubText) {
      result.stops.push(hubKind === 'foundation' ? STOPS.foundationHubFirst : STOPS.hubFirst);
      setNext(result, 'the hub', `groom ${relativeLabel(hubPath)} first (Gate 0)`);
      return;
    }
    if (hubKind === 'hub') {
      const contract = hubSections.find((section) => /api contract/i.test(section.title));
      if (!contract || contract.state !== 'approved') {
        result.stops.push(STOPS.hubFirst);
        setNext(result, 'the hub', `hub §${contract ? contract.title : 'API contracts'} is not approved`);
        return;
      }
    }
    if (hubReview && hubReviewState !== 'reviewed') {
      result.stops.push(STOPS.hubReviewFirst);
      result.facts.push(`hub review: ${excerpt(hubReview.value)}`);
      setNext(result, 'the hub', hubKind === 'hub' ? 'Step 2a — hub review' : 'the hub review (`do-grooming` → Step 2a)');
      return;
    }
  }

  reread(result, targetPath, groomingSpoke ? 'the spoke being groomed — the state' : 'the hub being groomed — the state');

  if (!targetText) {
    rereadSectionTemplate(context, result, targetKind, hubKind);
    setNext(result, directoryExists ? `${groomingSpoke ? 'spoke' : 'hub'} ${relativeLabel(targetPath)}` : 'nothing groomed yet',
      'Gate 0 — read inputs, confirm the understanding, propose the outline');
    result.gate = GATES.outline;
    return;
  }

  const targetLines = linesOf(targetText);
  const { sections, outlineOnDisk, unstamped } = effectiveSections(targetText);
  if (!sections.length) {
    rereadSectionTemplate(context, result, targetKind, hubKind);
    markUnknown(result, `no heading in ${relativeLabel(targetPath)} carries an \`_Approved\` stamp or a \`_Pending_\` marker, and none is numbered`,
      [targetPath, templatePathOf(targetKind)]);
    return;
  }
  if (unstamped.length) {
    result.notes.push(`written without a stamp: ${unstamped.map((section) => `§ ${section.title}`).join(', ')} — this TRD predates the ` +
      '_Pending_ outline, when a section was written only after its approval; stamp it if it was gated, re-gate it if it was not');
  }
  const approved = sections.filter((section) => section.state === 'approved');
  if (targetKind === 'issue' && !approved.length && issueGateZeroOpen(result, targetLines, targetPath, sections)) {
    rereadSectionTemplate(context, result, targetKind, hubKind);
    return;
  }
  result.facts.push(`sections approved: ${approved.length} of ${sections.length}` +
    (outlineOnDisk ? ' (the outline is on disk as _Pending_ headings)' : ''));
  const answers = carryForwardAnswers(targetLines);
  if (answers.length) result.facts.push(`carry-forward answers waiting to be folded in: ${answers.join(' | ')}`);
  const pendingHubChange = pendingHubChangeRows(hubLines);
  if (pendingHubChange.length) {
    result.facts.push(`hub-wrong findings gathered as "pending hub change": ${pendingHubChange.length} — ` +
      'fix the hub once, on a yes to the hub change itself');
  }

  if (foundationPart === 'spoke') {
    const criteria = sections.find((section) => /acceptance criteria/i.test(section.title));
    const register = omissionsRegisterOf(hubLines);
    const criteriaDate = criteria ? firstDate(criteria.stamp) : null;
    const registerBehind = register.state === 'written' && register.date && criteriaDate && register.date < criteriaDate;
    if (criteria && criteria.state === 'approved' && (register.state !== 'written' || registerBehind)) {
      result.facts.push(`omissions register (hub): ${register.state === 'written' ? `stamped ${register.date}, before this spoke's AC (${criteriaDate})` : register.state}`);
      rereadSectionTemplate(context, result, targetKind, hubKind);
      setNext(result, 'the omissions register (hub)',
        'step 5 — the omissions gate: write the hub\'s *Deliberate omissions & deferrals* for this spoke, then the spoke\'s next section',
        register.line === undefined ? null : at(hubPath, register.line));
      result.gate = GATES.section;
      return;
    }
  }

  const open = sections.find((section) => section.state !== 'approved');
  if (open) {
    rereadSectionTemplate(context, result, targetKind, hubKind);
    setNext(result, `§ ${open.title}`, 'Step 1 — per-section loop', at(targetPath, open.line));
    result.gate = GATES.section;
    return;
  }

  const REVIEW_RAN = ['reviewed', 'not-clean'];
  const hubAlignmentLine = fieldValue(hubLines, /^hub alignment$/i, 0, Math.min(40, hubLines.length));
  const reviewDone = groomingSpoke
    ? REVIEW_RAN.includes(spokeAlignment(context, hubText, hubKind).state) || spokeRounds(context, hubText, hubKind).length > 0
    : REVIEW_RAN.includes(hubReviewState) ||
      REVIEW_RAN.includes(reviewState(hubAlignmentLine && hubAlignmentLine.value)) ||
      (spokesOf(hubLines, context.featureDirectory) || []).some((spoke) => REVIEW_RAN.includes(spoke.state));
  const writtenFromSkeleton = approved.length > 0 &&
    approved.every((section) => stampCommit(section.stamp) || UNCOMMITTED_STAMP.test(plain(section.stamp)));
  const missing = missingTemplateSections(sections, targetKind, foundationPart);
  if (missing.length && !writtenFromSkeleton && !reviewDone) {
    rereadSectionTemplate(context, result, targetKind, hubKind);
    markUnknown(result,
      'every written section is approved and no `_Pending_` heading records the rest of the approved outline, so the next ' +
      `section is not on disk — the template's sections not written yet: ${missing.join(' · ')} (the Gate-0 outline may have dropped some)`,
      [targetPath, templatePathOf(targetKind)]);
    return;
  }

  if (groomingSpoke) {
    spokeCompletion(context, result, { hubPath, hubText, hubKind });
  } else {
    hubCompletion(context, result, { hubPath, hubLines, hubReview, hubReviewState, hubKind });
  }
}

function alignmentRowOf(context) {
  const lines = context.spoke.lines || [];
  const row = fieldValue(lines, /^hub alignment$/i, 0, Math.min(40, lines.length));
  return row || { value: null };
}

function alignmentRounds(context) {
  const lines = context.spoke.lines || [];
  const row = fieldValue(lines, /^alignment rounds$/i, 0, Math.min(40, lines.length));
  return row && !isTemplateValue(row.value) ? roundsOf(row.value) : [];
}

function spokeAlignment(context, hubText, hubKind) {
  if (hubKind === 'foundation' && hubText) {
    const hubLines = linesOf(hubText);
    const row = fieldValue(hubLines, /^spokes$/i, 0, Math.min(40, hubLines.length));
    const fromRow = row ? foundationSpokeEntry(row.value, context.platform) : null;
    const fallback = fromRow ? null : fieldValue(hubLines, /^hub alignment$/i, 0, Math.min(40, hubLines.length)) || alignmentRowOf(context);
    const value = fromRow || (fallback && fallback.value) || null;
    return { value, state: value ? reviewState(value) : 'missing', source: fromRow ? 'the foundation hub\'s Spokes row' : 'the foundation hub' };
  }
  const { value } = alignmentRowOf(context);
  return { value, state: value ? reviewState(value) : 'missing', source: 'the spoke header' };
}

function hubCompletion(context, result, { hubPath, hubLines, hubReview, hubReviewState, hubKind }) {
  if (hubReview) {
    const rounds = roundsOf(hubReview.value, 'rounds');
    result.facts.push(`hub review: ${excerpt(hubReview.value)}`);
    if (hubReviewState !== 'reviewed') {
      const trend = risingTrend(rounds);
      if (trend) result.stops.push(STOPS.rounds('Hub review', trend));
      setNext(result, 'the hub', 'Step 2a — hub review (two dimensions, then the completeness critic)');
      result.gate = GATES.review;
      reread(result, path.join(pluginRoot, 'skills', 'do-grooming', 'grooming-review.md'), 'the review dimensions, rounds and stamps');
      return;
    }
  }
  const spokes = spokesOf(hubLines, context.featureDirectory);
  if (!hubReview && hubKind === 'hub') {
    const groomedSpokes = (spokes || []).filter((spoke) => spoke.path && exists(spoke.path));
    if (!groomedSpokes.length) {
      setNext(result, 'the hub', 'Step 2a — hub review');
      result.gate = GATES.review;
      result.notes.push('the hub has no `Hub review` row — add it from the template when the review stamps');
      return;
    }
    result.notes.push('the hub has no `Hub review` row — it predates the row, and its spokes were groomed on it');
  }
  if (spokes === null) {
    const row = fieldValue(hubLines, /^spokes$/i, 0, Math.min(40, hubLines.length));
    if (row) result.facts.push(`spokes: ${excerpt(row.value, 240)}`);
    setNext(result, 'the spokes',
      'every hub section is approved — groom or align each spoke (`next-step.js <feature-dir> <platform>`)');
    const register = hubKind === 'foundation' ? omissionsRegisterOf(hubLines) : null;
    if (register && register.state !== 'written') {
      result.notes.push(`the omissions register (*Deliberate omissions & deferrals*) is ${register.state} — a spoke's ` +
        'step-5 omissions gate writes it after that spoke\'s AC; the foundation is not complete without it');
      return;
    }
    result.complete = true;
    return;
  }
  for (const spoke of spokes) {
    const spokeText = spoke.path ? readText(spoke.path) : null;
    const where = spokeText === null ? ' (file not in this repository)' : '';
    const roundsRow = spokeText === null ? null : fieldValue(linesOf(spokeText), /^alignment rounds$/i, 0, 40);
    const rounds = roundsRow && !isTemplateValue(roundsRow.value) ? roundsOf(roundsRow.value) : [];
    result.facts.push(`spoke ${spoke.name}${where}: ${spoke.state} — ${excerpt(spoke.alignment, 120)}` +
      (rounds.length ? ` · alignment rounds ${rounds.join(' · ')}` : ''));
  }
  const waiting = spokes.find((spoke) => spoke.state !== 'reviewed');
  if (waiting) {
    const groomed = waiting.path && exists(waiting.path);
    setNext(result, `spoke ${waiting.name}`, groomed ? 'Step 4 — hub-alignment review' : 'groom the spoke (Gate 0)');
    result.gate = groomed ? GATES.review : GATES.outline;
    return;
  }
  setNext(result, 'grooming',
    'the hub is reviewed and every spoke is aligned — hand off to `do-planning`, one plan per platform');
  result.complete = true;
}

function spokeCompletion(context, result, { hubPath, hubText, hubKind }) {
  if (hubKind === 'hub' && isClient(context)) {
    const screens = screenArtifacts(context.featureDirectory);
    if (!screens.length) {
      result.notes.push('no widget-spec/ or section-slicing/ docs — if this spoke has screens, Step 3 writes one widget spec ' +
        'and one slicing doc per screen');
    }
    const unfinished = screens.filter((screen) => screen.gaps.length);
    for (const screen of screens) {
      result.facts.push(`screen ${screen.name}: ${screen.gaps.length ? screen.gaps.join(', ') : 'widget spec + slicing approved, checklist complete'}`);
    }
    if (unfinished.length) {
      const [first] = unfinished;
      const alignmentState = spokeAlignment(context, hubText, hubKind).state;
      const alignmentStarted = spokeRounds(context, hubText, hubKind).length > 0 || !['missing', 'placeholder', 'not-reviewed'].includes(alignmentState);
      if (alignmentStarted) result.stops.push(STOPS.screensFirst(unfinished.map((screen) => screen.name).join(', ')));
      setNext(result, `screen ${first.name}`, `Step 3 — per-screen artifacts (${first.gaps.join(', ')})`);
      result.gate = GATES.screen;
      result.notes.push('screens are listed in file-name order; the spoke\'s §2 names any screen that has no doc yet');
      return;
    }
  }

  const alignment = spokeAlignment(context, hubText, hubKind);
  const alignmentState = alignment.state;
  const rounds = spokeRounds(context, hubText, hubKind);
  result.facts.push(`hub alignment (${alignment.source}): ${alignment.value ? excerpt(alignment.value) : 'not recorded'}`);
  if (rounds.length) result.facts.push(`alignment rounds: ${rounds.join(' · ')}`);
  reread(result, path.join(pluginRoot, 'skills', 'do-grooming', 'grooming-review.md'),
    'the 11-point alignment checklist, its dimensions and stamps');

  if (alignmentState === 'reviewed') {
    const revision = hubRevisionOf(alignment.value);
    const moved = revision && hubText ? hubMovedSince(hubPath, revision) : { state: 'unverified', why: 'the stamp names no hub rev' };
    if (moved.state === 'moved') {
      result.facts.push(`stale: ${moved.why} — ${moved.changes.slice(0, 3).join(' · ')}`);
      setNext(result, `spoke ${context.platform}`, 'Step 4 — re-run the hub-alignment review, scoped to the hub sections that moved');
      result.gate = GATES.review;
      return;
    }
    if (moved.state === 'unverified') result.notes.push(`alignment freshness not verified: ${moved.why}`);
    if (moved.note) result.notes.push(moved.note);
    result.next = { unit: `spoke ${context.platform}`, step: 'aligned with the current hub — hand off to `do-planning`' };
    result.complete = true;
    return;
  }
  const trend = risingTrend(rounds);
  if (trend) result.stops.push(STOPS.rounds('Alignment', trend));
  result.next = { unit: `spoke ${context.platform}`, step: 'Step 4 — hub-alignment review (the completion gate)' };
  result.gate = GATES.review;
}

function stageFields(headingLine, body) {
  const head = [headingLine, ...body.slice(0, 6)];
  const approvedBullet = bulletField(body, /^approved\b/i);
  const approvedInline = approvedBullet ? null : inlineField(head, /_Approved:\s*([^_]*)_?/i);
  const statusBullet = bulletField(body, /^status$/i);
  const statusInline = statusBullet ? null : inlineField(head, /\*\*Status:\s*([^*]+?)\*\*/i);
  const verdictBullet = bulletField(body, /^checkpoint verdict$/i);
  const verdictInline = verdictBullet ? null : inlineField(head, /Checkpoint verdict:\s*\**\s*([^*·]+)/i);
  const carry = [];
  body.forEach((line, index) => {
    if (/^\s*[-*]\s+\*\*carry-?forward\b/i.test(line)) {
      const field = bulletField(body.slice(index), /^carry-?forward$/i);
      if (field) carry.push(field.text);
    }
  });
  return {
    approved: approvedBullet ? approvedBullet.text : approvedInline ? approvedInline.text : null,
    status: statusBullet ? statusBullet.text : statusInline ? statusInline.text : null,
    verdict: verdictBullet ? verdictBullet.text : verdictInline ? verdictInline.text : null,
    covers: (bulletField(body, /^covers$/i) || { text: '' }).text,
    files: (bulletField(body, /^files\b/i) || { text: '' }).text,
    conformance: (bulletField(body, /^conformance review\b/i) || { text: '' }).text,
    carryForward: carry,
  };
}

function stagesOf(text) {
  const lines = linesOf(text);
  const headings = outlineOf(lines);
  const stages = [];
  for (const heading of headings) {
    const match = /^Stage\s+(\d+)(?=$|\s|[—–:·(.,-])/.exec(heading.text);
    if (!match || heading.level < 2 || heading.level > 4) continue;
    const end = endOfSection(headings, heading, lines.length);
    const body = lines.slice(heading.index + 1, end);
    stages.push({
      number: Number(match[1]),
      title: plain(heading.text),
      line: heading.index,
      end,
      lines,
      ...stageFields(lines[heading.index], body),
    });
  }
  return stages;
}

const HEADING_DONE = [
  /(?:✅|☑️|✔️?)\s*\**\s*(?:done|built|complete|completed)\b/i,
  /\b(?:DONE|BUILT)\b/,
  /[—–]\s*\**\s*(?:done|built)\s+\(?\d{4}-\d{2}-\d{2}/i,
];

function statusClass(text) {
  if (text === null || text === undefined) return null;
  if (isTemplateValue(text)) return 'pending';
  const lead = plain(text).toLowerCase().replace(/^[^a-z0-9]+/, '');
  if (/^(done|complete|completed|finished|shipped|built)\b/.test(lead)) return 'done';
  if (/^(pending|not done|not started|todo|to do|in progress|wip|blocked|started|open)\b/.test(lead)) return 'pending';
  return 'unknown';
}

function stageProgress(stage) {
  const status = statusClass(stage.status);
  const verdictDated = Boolean(stage.verdict) && DATE.test(stage.verdict) && !isTemplateValue(stage.verdict) &&
    !/^pending\b/i.test(plain(stage.verdict));
  const headingText = stage.lines[stage.line].replace(/_Approved:[^_]*_?/i, '');
  const headingDone = HEADING_DONE.some((pattern) => pattern.test(headingText));
  if (status === 'done') return 'done';
  if (status === 'pending') return verdictDated ? 'closing' : 'pending';
  if (status === 'unknown') return headingDone ? 'done' : 'unknown';
  if (headingDone || verdictDated) return 'done';
  return 'unmarked';
}

const DEVELOPMENT_OWNED = /^(status|checkpoint verdict|carry-?forward|built with)\b/i;
const isApprovalLine = (text) => /_Approved:/i.test(text) || /^\s*[-*]\s+\*\*approved\b/i.test(text);
const approvalValue = (text) => {
  const inline = /_Approved:\s*([^_]*)/i.exec(text);
  if (inline) return plain(inline[1]);
  const bullet = /^\s*[-*]\s+\*\*approved[^*]*\*\*\s*:?\s*(.*)$/i.exec(text);
  return bullet ? plain(bullet[1]) : null;
};

function labelledLines(lines) {
  let label = null;
  return lines.map((text) => {
    const bullet = /^\s*[-*]\s+\*\*([^*]+?)\*\*/.exec(text);
    if (bullet) label = plain(bullet[1]).replace(/:$/, '');
    else if (!text.trim() || !/^\s{2,}\S/.test(text)) label = null;
    return { text, label };
  });
}

function classifyChanges(changes) {
  const added = changes.filter((change) => change.sign === '+' && isApprovalLine(change.text)).map((change) => approvalValue(change.text));
  const removed = changes.filter((change) => change.sign === '-' && isApprovalLine(change.text)).map((change) => approvalValue(change.text));
  const approvalWritten = added.some((value) => value && !removed.includes(value));
  const contentEdits = changes.filter((change) => {
    if (!change.text.trim()) return false;
    if (isApprovalLine(change.text)) {
      const value = approvalValue(change.text);
      return !(added.includes(value) && removed.includes(value)) && !approvalWritten;
    }
    return !(change.label && DEVELOPMENT_OWNED.test(change.label));
  });
  return { approvalWritten, contentEdits };
}

function lineLogCommits(output) {
  const commits = [];
  for (const chunk of output.split('\u0000COMMIT ').slice(1)) {
    const chunkLines = chunk.split('\n');
    const [hash, date] = chunkLines[0].trim().split(' ');
    let label = null;
    const changes = [];
    for (const raw of chunkLines.slice(1)) {
      if (/^(diff --git|index |@@|\+\+\+ |--- |new file|deleted file|similarity|rename )/.test(raw)) continue;
      if (!/^[ +-]/.test(raw)) continue;
      const text = raw.slice(1);
      const bullet = /^\s*[-*]\s+\*\*([^*]+?)\*\*/.exec(text);
      if (bullet) label = plain(bullet[1]).replace(/:$/, '');
      else if (!text.trim() || !/^\s{2,}\S/.test(text)) label = null;
      if (raw[0] !== ' ') changes.push({ sign: raw[0], text, label });
    }
    commits.push({ hash, date, changes });
  }
  return commits;
}

function multisetChanges(oldLines, newLines) {
  const counts = new Map();
  for (const line of labelledLines(oldLines)) counts.set(line.text, [...(counts.get(line.text) || []), line]);
  const changes = [];
  for (const line of labelledLines(newLines)) {
    const pool = counts.get(line.text);
    if (pool && pool.length) pool.shift();
    else changes.push({ sign: '+', text: line.text, label: line.label });
  }
  for (const pool of counts.values()) for (const line of pool) changes.push({ sign: '-', text: line.text, label: line.label });
  return changes;
}

function stampFreshness(planPath, stage) {
  const directory = path.dirname(planPath);
  const file = path.basename(planPath);
  const headText = git(directory, ['show', `HEAD:./${file}`]);
  const currentBlock = trimmedBlock(stage.lines, stage.line, stage.end);
  if (!headText.ok) return { state: 'fresh', note: `${file} is not committed yet — the stamp has no history to be stale against` };
  const committedStage = stagesOf(headText.stdout).find((candidate) => candidate.number === stage.number);
  if (!committedStage) return { state: 'fresh', note: `Stage ${stage.number} is not committed yet` };
  const committedBlock = trimmedBlock(committedStage.lines, committedStage.line, committedStage.end);

  const working = classifyChanges(multisetChanges(committedBlock, currentBlock));
  if (working.approvalWritten) return { state: 'fresh', note: `Stage ${stage.number}'s stamp was rewritten in the working tree (not committed yet)` };

  const range = `-L${committedStage.line + 1},${committedStage.line + committedBlock.length}:${file}`;
  const log = git(directory, ['log', range, '--format=%x00COMMIT %H %cs'], 60000);
  if (!log.ok) return { state: 'unverified', why: `git log -L failed: ${log.stderr.split('\n')[0]}` };
  let approvalCommit = null;
  let editAfter = null;
  for (const commit of lineLogCommits(log.stdout).reverse()) {
    const { approvalWritten, contentEdits } = classifyChanges(commit.changes);
    if (approvalWritten) {
      approvalCommit = commit;
      editAfter = null;
    } else if (approvalCommit && contentEdits.length && !editAfter) {
      editAfter = { ...commit, sample: contentEdits[0] };
    }
  }
  if (editAfter) {
    return {
      state: 'stale',
      why: `recorded before this stage's own last edit: ${editAfter.hash.slice(0, 7)} (${editAfter.date}) changed ` +
        `"${excerpt(editAfter.sample.text, 90)}" after the stamp was written in ${approvalCommit.hash.slice(0, 7)} (${approvalCommit.date})`,
    };
  }
  if (approvalCommit && working.contentEdits.length) {
    return {
      state: 'stale',
      why: `recorded before this stage's own last edit: the working tree changes "${excerpt(working.contentEdits[0].text, 90)}" ` +
        `after the stamp was written in ${approvalCommit.hash.slice(0, 7)} (${approvalCommit.date})`,
    };
  }
  if (!approvalCommit) return { state: 'unverified', why: 'no commit in the block\'s history wrote its approval stamp' };
  return { state: 'fresh', note: `stamp written in ${approvalCommit.hash.slice(0, 7)} (${approvalCommit.date}); no edit to the block since` };
}

function coverageReport(featureDirectory, platform) {
  const script = path.join(pluginRoot, 'scripts', 'check-coverage.js');
  if (!exists(script)) return { ran: false, error: 'scripts/check-coverage.js not found' };
  const run = spawnSync(process.execPath, [script, featureDirectory, platform], { encoding: 'utf8', timeout: 60000 });
  const output = run.stdout || '';
  if (run.status !== 0 && run.status !== 1) return { ran: false, error: ((run.stderr || output).split('\n')[0] || 'no output').trim() };
  const problems = linesOf(output).filter((line) => /^\s+-\s/.test(line)).map((line) => line.replace(/^\s+-\s/, ''));
  const unclaimed = problems.map((problem) => /^AC-(\d+) is claimed by no stage/.exec(problem)).filter(Boolean).map((match) => Number(match[1]));
  return { ran: true, summary: (linesOf(output).find((line) => /^coverage:/.test(line)) || '').trim(), problems, unclaimed };
}

function charterState(context) {
  const charterPath = path.join(context.featureDirectory, 'review-charter.md');
  const text = readText(charterPath);
  if (text === null) return { state: 'missing', path: charterPath };
  const line = linesOf(text).find((candidate) => /profile commit/i.test(candidate));
  const recorded = line ? commitIn(line.replace(/^.*?profile commit/i, '')) : null;
  if (!recorded) return { state: 'unverified', path: charterPath, why: 'it records no profile commit' };
  if (!context.projectRoot) return { state: 'unverified', path: charterPath, why: 'the project root is unknown', recorded };
  const latest = git(context.projectRoot, ['log', '-1', '--format=%H', '--', 'docs/basics']);
  const latestHash = latest.ok ? latest.stdout.trim() : '';
  if (!latestHash) return { state: 'unverified', path: charterPath, why: 'docs/basics has no commit to compare with', recorded };
  if (latestHash.startsWith(recorded)) return { state: 'fresh', path: charterPath, recorded };
  const changed = git(context.projectRoot, ['diff', '--name-only', recorded, 'HEAD', '--', 'docs/basics']);
  if (!changed.ok) return { state: 'unverified', path: charterPath, why: `its profile commit ${recorded} is not in this repository`, recorded };
  const files = linesOf(changed.stdout).filter(Boolean).map((file) => path.basename(file));
  if (!files.length) return { state: 'fresh', path: charterPath, recorded };
  return { state: 'stale', path: charterPath, recorded, latest: latestHash.slice(0, 7), files };
}

function describeCharter(context, result, charter) {
  if (charter.state === 'fresh') {
    result.facts.push(`review charter: fresh (profile commit ${charter.recorded})`);
    return;
  }
  if (charter.state === 'missing') {
    result.facts.push('review charter: missing — reviewers get the docs/basics docs the diff touches instead');
    return;
  }
  if (charter.state === 'stale') {
    result.facts.push(`review charter: stale — built from profile commit ${charter.recorded}, docs/basics moved to ${charter.latest} ` +
      `(${charter.files.slice(0, 6).join(', ')}): rebuild it, or hand reviewers the docs/basics docs the diff touches`);
    return;
  }
  result.facts.push(`review charter: freshness not verified — ${charter.why}`);
}

function stagePaths(filesText) {
  return [...String(filesText).matchAll(/`([^`\s]+)`/g)]
    .map((match) => match[1].replace(/:\d+(?:[-–]\d+)?$/, ''))
    .filter((candidate) => candidate.includes('/') || /\.[A-Za-z0-9]{1,8}$/.test(candidate))
    .filter((candidate) => !/^AC-|^https?:/.test(candidate));
}

function dirtyPaths(projectRoot) {
  const top = git(projectRoot, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return null;
  const status = git(projectRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (!status.ok) return null;
  const entries = status.stdout.split('\0');
  const dirty = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry) continue;
    if (entry[0] === 'R' || entry[0] === 'C') index++;
    dirty.push(path.join(top.stdout.trim(), entry.slice(3)));
  }
  return dirty;
}

function stageDirtyState(context, stage) {
  if (!context.projectRoot) return null;
  const dirty = dirtyPaths(context.projectRoot);
  if (dirty === null) return null;
  const relevant = dirty.filter((file) => !file.includes(`${path.sep}docs${path.sep}`) && !file.includes(`${path.sep}.alpha-sdlc${path.sep}`));
  const owned = stagePaths(stage.files).map((candidate) => path.resolve(context.projectRoot, candidate).replace(/[\\/]+$/, ''));
  const inStage = relevant.filter((file) => owned.some((own) => file === own || file.startsWith(own + path.sep)));
  return { inStage, others: relevant.filter((file) => !inStage.includes(file)) };
}

function referencedDocs(context, stage) {
  const block = trimmedBlock(stage.lines, stage.line, stage.end).join('\n');
  const found = new Set();
  for (const match of block.matchAll(/((?:section-slicing|widget-spec)\/[\w.-]+?\.md)/g)) found.add(path.join(context.featureDirectory, match[1]));
  return [...found].filter(exists);
}

function profileDocsNamed(context, text) {
  if (!context.projectRoot) return [];
  const basics = path.join(context.projectRoot, 'docs', 'basics');
  let names = [];
  try { names = fs.readdirSync(basics); } catch { return []; }
  const wanted = new Set([...String(text).matchAll(/\b(\d{2})-[a-z-]+/g)].map((match) => match[1]));
  return names.filter((name) => wanted.has(name.slice(0, 2)) && name.endsWith('.md')).map((name) => path.join(basics, name));
}

function planningPosition(context, result) {
  result.skill = 'do-planning';
  const hubPath = locateHub(context);
  const hubText = hubPath === context.paths.hub ? context.hub.text : readText(hubPath);
  const hubKind = hubText ? documentKind(hubText, 'TRD.md') : null;
  const planExists = Boolean(context.plan.text);

  if (!profileExists(context)) {
    if (!planExists) result.stops.push(STOPS.noProfilePlanning);
    else result.notes.push('no docs/basics/ — the layout is ungrounded (the user chose to plan without a profile)');
  }
  if (!context.spoke.text && !hubText) {
    result.stops.push('There is no TRD for this feature: groom it first (`do-grooming`) — the plan implements what the TRD decided.');
    setNext(result, 'grooming', 'no TRD.md or spoke');
    return;
  }

  reread(result, context.paths.spoke, 'the spoke: §8 AC register and §9 work slices are the source of work');
  reread(result, hubPath, 'the hub: dependencies, contract and change manifest');
  reread(result, context.paths.plan, 'the plan — the state');

  if (context.spoke.text || hubKind === 'foundation') {
    const alignment = spokeAlignment(context, hubText, hubKind);
    const where = alignment.source === 'the spoke header' ? '' : ` in ${alignment.source}`;
    if (alignment.state === 'missing' || alignment.state === 'placeholder') {
      result.stops.push(STOPS.alignment(`missing${where}${alignment.state === 'placeholder' ? ' (still the template placeholder)' : ''}`));
    } else if (alignment.state === 'not-reviewed') {
      result.stops.push(STOPS.alignment(`\`NOT REVIEWED\`${where}`));
    } else if (alignment.state !== 'reviewed') {
      result.stops.push(STOPS.alignment(`not a clean pass${where} (${excerpt(alignment.value, 100)})`));
    } else if (hubText && hubKind !== 'foundation') {
      const revision = hubRevisionOf(alignment.value);
      const moved = revision ? hubMovedSince(hubPath, revision) : { state: 'unverified', why: 'the stamp names no hub rev' };
      if (moved.state === 'moved') result.stops.push(STOPS.alignment(`older than the hub's last change — ${moved.why}`));
      else if (moved.state === 'unverified') result.notes.push(`hub alignment freshness not verified: ${moved.why}`);
      else if (moved.note) result.notes.push(moved.note);
    }
    result.facts.push(`hub alignment (${alignment.source}): ${alignment.value ? excerpt(alignment.value, 120) : 'not recorded'}`);
  }

  if (isClient(context)) {
    const unfinished = screenArtifacts(context.featureDirectory).filter((screen) => screen.hasWidgetSpec && !screen.hasSlicing);
    if (unfinished.length) result.stops.push(STOPS.unfinishedSpoke(unfinished.map((screen) => screen.name).join(', ')));
  }

  if (!planExists) {
    setNext(result, 'Step 1', 'summarize the implementation scope for the user to confirm');
    result.gate = GATES.scope;
    reread(result, path.join(pluginRoot, 'skills', 'do-planning', 'plan-template.md'), 'the plan template');
    return;
  }

  const lines = context.plan.lines;
  const headings = outlineOf(lines);
  const stages = stagesOf(context.plan.text);
  const scope = fieldValue(lines, /^scope confirmed$/i, 0, Math.min(40, lines.length));
  const layoutHeading = headings.find((heading) => /^architecture\s*&\s*package layout/i.test(plain(heading.text)));
  const layoutStamp = layoutHeading
    ? inlineField(lines.slice(layoutHeading.index, endOfSection(headings, layoutHeading, lines.length)), /^\s*_Approved:\s*([^_]*)/i)
    : null;
  const layoutState = stampState(layoutStamp && layoutStamp.text);
  const breakdownLine = lines.findIndex((line) => /^(?:#{2,4}\s+|\s*(?:[-*]\s+)?\*\*)\s*stage breakdown\b.*\bapproved\b/i.test(line));
  const breakdownState = breakdownLine === -1 ? 'missing' : stampState(lines[breakdownLine].replace(/^.*?\bapproved\b/i, ''));
  const anyStageApproved = stages.some((stage) => stampState(stage.approved) === 'stamped' || stageProgress(stage) === 'done');

  const scopeConfirmed = scope && !isTemplateValue(scope.value) && DATE.test(scope.value);
  result.facts.push(`scope confirmed: ${scopeConfirmed ? excerpt(scope.value, 60) : scope ? 'not yet' : 'no "Scope confirmed" row'}`);
  result.facts.push(`layout gate: ${layoutState === 'stamped' ? `approved ${excerpt(layoutStamp.text, 60)}` : 'not approved'}`);
  const breakdownFact = breakdownState === 'stamped'
    ? `approved (${excerpt(lines[breakdownLine], 80)})`
    : breakdownLine === -1 ? 'no approved breakdown table' : 'not approved';
  result.facts.push(`stage breakdown: ${breakdownFact}`);
  const answers = carryForwardAnswers(lines);
  if (answers.length) result.facts.push(`carry-forward answers waiting for a stage: ${answers.join(' | ')}`);

  if (!scopeConfirmed && layoutState !== 'stamped' && !anyStageApproved) {
    setNext(result, 'Step 1', 'summarize the implementation scope for the user to confirm');
    result.gate = GATES.scope;
    return;
  }
  if (!scopeConfirmed) {
    result.notes.push('no confirmed "Scope confirmed" row — this plan predates it; its later gates imply the scope was confirmed');
  }
  if (layoutState !== 'stamped' && !anyStageApproved) {
    setNext(result, 'Step 2',
      'write the Architecture & package layout',
      layoutHeading ? at(context.paths.plan, layoutHeading.index) : null);
    result.gate = GATES.layout;
    reread(result, path.join(pluginRoot, 'skills', 'do-planning', 'plan-template.md'), 'the plan template');
    return;
  }
  if (layoutState !== 'stamped') {
    result.notes.push('no layout stamp — this plan predates it; its approved or built stages imply the layout gate passed');
  }

  const breakdown = breakdownLine === -1 ? null : breakdownStages(lines, breakdownLine);
  if (breakdownState !== 'stamped' && !stages.length) {
    setNext(result, 'Step 3', 'propose the stage breakdown (titles + one-line goals + order, each with its layer tag)');
    result.gate = GATES.breakdown;
    return;
  }
  if (breakdownState !== 'stamped' && breakdownLine !== -1 && !anyStageApproved) {
    setNext(result, 'Step 3', 'the stage breakdown is written but not approved', at(context.paths.plan, breakdownLine));
    result.gate = GATES.breakdown;
    return;
  }
  if (breakdownLine === -1) {
    result.notes.push('no "Stage breakdown — approved" table — this plan predates it; the stage list is the written stages');
  }

  const planned = breakdown && breakdown.length ? breakdown : stages.map((stage) => ({ number: stage.number, title: stage.title }));
  if (!planned.length) {
    markUnknown(result, 'the stage breakdown is approved, but neither its table nor any "Stage N" heading lists a stage that can be read',
      [context.paths.plan]);
    return;
  }
  const written = new Map(stages.map((stage) => [stage.number, stage]));
  const approvedCount = stages.filter((stage) => stampState(stage.approved) === 'stamped').length;
  const builtCount = stages.filter((stage) => stageProgress(stage) === 'done').length;
  result.facts.push(`stages: ${approvedCount} of ${planned.length} approved${builtCount ? `, ${builtCount} built` : ''}`);
  stagePlanningNext(context, result, planned, written);
  if (result.next) return;

  const sequencing = headings.find((heading) => /^sequencing\s*&\s*stop points/i.test(plain(heading.text)));
  const uncovered = sequencing ? fieldValue(lines, /^uncovered tasks/i, sequencing.index, endOfSection(headings, sequencing, lines.length)) : null;
  if (!sequencing || !uncovered || isTemplateValue(uncovered.value)) {
    setNext(result, 'Step 5',
      'write the sequencing summary — paste `check-coverage.js` output into *Uncovered tasks / AC*',
      sequencing ? at(context.paths.plan, sequencing.index) : null);
    return;
  }
  if (!exists(path.join(context.featureDirectory, 'review-charter.md'))) {
    setNext(result, 'review charter',
      'write `review-charter.md` beside the plan, once — with the profile commit it was built from');
    return;
  }
  setNext(result, 'planning', 'every stage is approved and the charter exists — hand off to `do-development`');
  result.complete = true;
}

function foundationSpokeEntry(cell, platform) {
  const source = String(cell);
  const start = source.toLowerCase().indexOf(`trd-${platform}.md`);
  if (start === -1) return null;
  const rest = source.slice(start + `trd-${platform}.md`.length);
  const next = rest.search(/TRD-[\w-]+\.md/i);
  return (next === -1 ? rest : rest.slice(0, next)).replace(/^[`\])\s:—–-]+/, '').trim() || null;
}

function breakdownStages(lines, breakdownLine) {
  const table = tableIn(lines, breakdownLine + 1, Math.min(lines.length, breakdownLine + 400));
  if (!table) return null;
  const stageColumn = Math.max(0, columnOf(table.header, /^(stage|#)$/i));
  const detailColumn = columnOf(table.header, /^detail/i);
  const goalColumn = columnOf(table.header, /goal|title/i);
  return table.rows
    .map((row) => {
      const number = /(\d+)/.exec(plain(row.cells[stageColumn]));
      if (!number) return null;
      return {
        number: Number(number[1]),
        title: goalColumn === -1 ? `Stage ${number[1]}` : `Stage ${number[1]} — ${plain(row.cells[goalColumn])}`,
        detail: detailColumn === -1 ? null : plain(row.cells[detailColumn]).toLowerCase(),
      };
    })
    .filter(Boolean);
}

const STAMP_WORDS = { missing: 'missing', 'marked-stale': 'marked stale', unreadable: 'unreadable' };

function stagePlanningNext(context, result, planned, written) {
  for (const entry of planned) {
    const stage = written.get(entry.number);
    if (stage && stageProgress(stage) === 'done') continue;
    if (!stage) {
      setNext(result, entry.title, 'Step 4 — draft this stage\'s detail (it is in the approved breakdown, not written yet)');
      result.gate = GATES.stageDraft;
      reread(result, path.join(pluginRoot, 'skills', 'do-planning', 'stage-rules.md'), 'what makes a good stage');
      reread(result, path.join(pluginRoot, 'skills', 'do-planning', 'plan-template.md'), 'the stage block shape');
      return;
    }
    const state = stampState(stage.approved);
    if (state !== 'stamped') {
      result.next = {
        unit: stage.title,
        step: `Step 4 — the stage is written but its Approved stamp is ${STAMP_WORDS[state] || 'a placeholder'}: present it for approval`,
        location: at(context.paths.plan, stage.line),
      };
      result.gate = GATES.stageDraft;
      return;
    }
  }
}

function developmentPosition(context, result) {
  result.skill = 'do-development';
  if (!context.plan.text) {
    result.stops.push(STOPS.noPlan);
    setNext(result, 'planning', `no ${relativeLabel(context.paths.plan)}`);
    return;
  }
  const stages = stagesOf(context.plan.text);
  if (!stages.length) {
    markUnknown(result, `${relativeLabel(context.paths.plan)} has no "Stage N" headings`, [context.paths.plan]);
    return;
  }
  const progress = stages.map((stage) => ({ stage, state: stageProgress(stage) }));
  const marked = progress.filter((entry) => entry.state !== 'unmarked');
  const done = progress.filter((entry) => entry.state === 'done');
  const doneNumbers = done.map((entry) => entry.stage.number).join(', ');
  result.facts.push(`stages done: ${done.length} of ${stages.length}${done.length ? ` (${doneNumbers})` : ''}`);
  if (!marked.length) {
    markUnknown(result,
      'no stage carries a Status line, a done mark in its heading or a checkpoint verdict, so which stages are built cannot be read from the plan',
      [context.paths.plan]);
    return;
  }

  const client = isClient(context);
  result.facts.push(`platform: ${context.platform} — ` + (client
    ? 'client (read client-ui-rules.md and client-ui.md once per session, again after a compaction)'
    : 'backend: client-ui-rules.md and client-ui.md are not needed'));
  const coverage = coverageReport(context.featureDirectory, context.platform);
  if (coverage.ran) {
    result.facts.push(coverage.summary);
    if (coverage.unclaimed.length) result.stops.push(STOPS.unclaimed(coverage.unclaimed.map((id) => `AC-${id}`).join(', ')));
    const otherProblems = coverage.problems.filter((item) => !/is claimed by no stage/.test(item));
    for (const problem of otherProblems.slice(0, 8)) result.notes.push(`coverage: ${problem}`);
  } else {
    result.notes.push(`coverage check did not run: ${coverage.error}`);
  }
  const charter = charterState(context);
  describeCharter(context, result, charter);

  const nextEntry = progress.find((entry) => entry.state !== 'done');
  if (!nextEntry) {
    setNext(result, 'after the last stage',
      'confirm every task/AC the plan covered is implemented and verified, report, then hand off to `do-testing`');
    result.complete = true;
    return;
  }
  const stage = nextEntry.stage;
  const location = at(context.paths.plan, stage.line);
  const blockLines = trimmedBlock(stage.lines, stage.line, stage.end);
  const hiddenLines = blockLines.length - SHOWN_LINES;
  result.block = {
    location,
    text: blockLines.slice(0, SHOWN_LINES).join('\n') + (hiddenLines > 0 ? `\n… ${hiddenLines} more line(s) in ${location}` : ''),
  };

  if (nextEntry.state === 'unknown') {
    markUnknown(result,
      `Stage ${stage.number}'s Status reads "${excerpt(stage.status, 80)}" — neither done nor pending; read the block to decide`,
      [context.paths.plan]);
    return;
  }
  const laterDone = progress.slice(progress.indexOf(nextEntry) + 1).find((entry) => entry.state === 'done');
  if (nextEntry.state === 'unmarked' && laterDone) {
    markUnknown(result,
      `Stage ${stage.number} carries no Status line, done mark or verdict, yet Stage ${laterDone.stage.number} after it is done — ` +
      'whether it was built (stages built together are often recorded on one of them) cannot be read from the plan',
      [context.paths.plan]);
    return;
  }
  if (nextEntry.state === 'closing') {
    setNext(result, stage.title,
      'step 9 is unfinished — its checkpoint verdict is recorded but Status is not done: set `Status: done <date>` and commit the stage',
      location);
    return;
  }

  setNext(result, stage.title, 'build it: frame → red → green → refactor → conformance review → verify', location);
  result.gate = GATES.stage;
  const register = acRegisterOf(registerTextOf(context));
  const covered = acIdsIn(String(stage.covers).split('⚠️')[0]);
  for (const id of covered) {
    result.facts.push(register.has(id)
      ? `covers: AC-${id} — ${plain(register.get(id).criterion)}`
      : `covers: AC-${id} (not in the AC register)`);
  }
  for (const carried of stage.carryForward) result.facts.push(`carry-forward: ${excerpt(carried, 200)}`);

  const stamp = stampState(stage.approved);
  if (stamp === 'missing') result.stops.push(STOPS.stageStamp(stage.number, 'missing'));
  else if (stamp === 'placeholder') result.stops.push(STOPS.stageStamp(stage.number, 'still the template placeholder'));
  else if (stamp === 'marked-stale') {
    result.stops.push(STOPS.stageStamp(stage.number, `marked stale in the plan (${excerpt(stage.approved, 100)})`));
  } else if (stamp === 'unreadable') {
    result.notes.push(`Stage ${stage.number}'s Approved field names no date or commit: "${excerpt(stage.approved, 80)}"`);
  } else {
    const freshness = stampFreshness(context.paths.plan, stage);
    if (freshness.state === 'stale') result.stops.push(STOPS.stageStamp(stage.number, freshness.why));
    else if (freshness.state === 'unverified') result.notes.push(`stamp freshness not verified: ${freshness.why}`);
    else result.facts.push(`approved (plan gate): ${excerpt(stage.approved, 80)} — ${freshness.note}`);
  }

  const dirty = stageDirtyState(context, stage);
  const firstFive = (files) => files.slice(0, 5).map((file) => path.relative(context.projectRoot, file)).join(', ');
  if (dirty && dirty.inStage.length) {
    result.notes.push(`uncommitted changes in this stage's files (${firstFive(dirty.inStage)}): in-progress work — run its tests and carry on from it; never discard it`);
  }
  if (dirty && dirty.others.length) {
    result.notes.push(`${dirty.others.length} other uncommitted path(s) (${firstFive(dirty.others)}${dirty.others.length > 5 ? ', …' : ''}) — ` +
      'another session\'s or an earlier stage\'s work; leave them as they are');
  }

  reread(result, path.join(pluginRoot, 'skills', 'do-development', 'stage-steps.md'),
    'every rule the stage\'s steps apply — once per session, again after a compaction');
  if (client) {
    reread(result, path.join(pluginRoot, 'skills', 'do-development', 'client-ui-rules.md'),
      'the UI rules — once per session, again after a compaction');
    reread(result, path.join(pluginRoot, 'skills', 'do-development', 'client-ui.md'),
      'the UI mechanics — once per session, again after a compaction');
    const unfinished = screenArtifacts(context.featureDirectory).filter((screen) => screen.hasWidgetSpec && !screen.hasSlicing);
    if (unfinished.length) {
      result.notes.push(`screen(s) with a widget spec but no section-slicing doc: ${unfinished.map((screen) => screen.name).join(', ')} — ` +
        'an unfinished spoke: STOP, back to `do-grooming`, before building it');
    }
  }
  if (charter.state === 'fresh') {
    reread(result, charter.path, 'the profile rules this stage\'s review checks against');
  } else {
    for (const doc of profileDocsNamed(context, stage.conformance)) {
      reread(result, doc, 'a profile doc this stage is reviewed against (the charter is not usable)');
    }
  }
  for (const doc of referencedDocs(context, stage)) reread(result, doc, 'a per-screen contract this stage builds');
  if (result.reread.length + (context.session.handoff ? 1 : 0) < MAX_REREAD) {
    reread(result, path.join(pluginRoot, 'skills', 'do-development', 'conformance-reviewer.md'),
      'the reviewers\' checklist — read it yourself only to run the review inline');
  }
}

const TEST_ID = /^[A-Z][A-Z0-9-]*\d+[a-z]?$/;

function testsInTable(table) {
  const idColumn = Math.max(0, columnOf(table.header, /^(id|#|tc|test id)$/i));
  const statusColumn = columnOf(table.header, /^status$/i);
  const tests = [];
  for (const row of table.rows) {
    const leading = /^([A-Z][A-Z0-9-]*\d+[a-z]?)(?![\w-])/.exec(plain(row.cells[idColumn]));
    if (!leading || !TEST_ID.test(leading[1]) || isTemplateValue(row.cells[1] || '')) continue;
    tests.push({ id: leading[1], status: statusColumn === -1 ? null : row.cells[statusColumn] || '', line: row.index });
  }
  return tests;
}

function coverageTestsOf(lines, headings) {
  const candidates = [
    ...headings.filter((heading) => /^AC\s*(?:→|->|to)\s*test|^AC coverage/i.test(plain(heading.text))),
    ...headings.filter((heading) => /^coverage\b(?!\s+summary)/i.test(plain(heading.text))),
  ];
  for (const heading of candidates) {
    const end = endOfSection(headings, heading, lines.length);
    for (let start = heading.index + 1; start < end;) {
      const table = tableIn(lines, start, end);
      if (!table) break;
      const tests = testsInTable(table);
      if (tests.length) return tests;
      start = table.end;
    }
  }
  return [];
}

function testPlanOf(text) {
  const lines = linesOf(text);
  const headings = outlineOf(lines);
  const tests = coverageTestsOf(lines, headings);
  const procedures = new Map();
  for (const heading of headings) {
    const match = /^`?([A-Z][A-Z0-9-]*\d+[a-z]?)`?(?:\s|$|[—–:])/.exec(heading.text.replace(/\*/g, ''));
    if (!match || heading.level < 3 || procedures.has(match[1])) continue;
    const body = lines.slice(heading.index + 1, endOfSection(headings, heading, lines.length));
    const approved = bulletField(body, /^approved$/i);
    procedures.set(match[1], { line: heading.index, approved: approved ? approved.text : null });
  }
  return {
    lines,
    headings,
    planApproved: fieldValue(lines, /^plan approved$/i, 0, Math.min(40, lines.length)),
    environment: fieldValue(lines, /^environment approved$/i),
    review: fieldValue(lines, /^test review$/i),
    tests,
    procedures,
    bugs: bugsOf(lines, headings),
  };
}

function testRecorded(status) {
  if (status === null) return null;
  if (isTemplateValue(status)) return false;
  const value = plain(status).toLowerCase();
  if (/^(?:✅|❌|✔|✗|⚠️|⛔)/.test(value)) return true;
  const words = value.replace(/^[^a-z0-9]+/, '');
  if (!words || /^(pending|not run|not yet|todo|to do)\b/.test(words) || /^pass \/ fail/.test(words)) return false;
  return true;
}

const CLOSED_BUG = /\b(fixed|deferred|won'?t fix|closed|withdrawn|rejected|duplicate)\b/i;
const STILL_OPEN = /\bnot re-?verified\b|\bre-?opened?\b|\bpending\b|\bin progress\b|\bopen\b/i;
const leadClause = (text) => text.replace(/~~[^~]*~~/g, '').replace(/\*/g, '').trim().split(/\s—\s|\.\s/)[0];

function bugsOf(lines, headings) {
  const heading = headings.find((candidate) => /^bugs found/i.test(plain(candidate.text)));
  if (!heading) return null;
  const table = tableIn(lines, heading.index + 1, endOfSection(headings, heading, lines.length));
  if (!table) return { rows: [], hasFixColumn: false, line: heading.index };
  const column = (pattern) => columnOf(table.header, pattern);
  const idColumn = Math.max(0, column(/^(#|id|bug id)$/i));
  const fixColumn = column(/^fix\?/i);
  const attemptsColumn = column(/^attempts$/i);
  const severityColumn = column(/^severity$/i);
  const statusColumn = column(/^status$/i) === -1 ? table.header.length - 1 : column(/^status$/i);
  const rows = [];
  table.rows.forEach((row, order) => {
    const joined = plain(row.cells.join(' '));
    if (/^none\b/i.test(joined) || row.cells.every((cell) => !plain(cell) || /^[—-]$/.test(plain(cell)))) return;
    if (row.cells.slice(1, 3).some((cell) => isTemplateValue(cell))) return;
    const status = row.cells[statusColumn] || '';
    const lead = leadClause(status);
    rows.push({
      id: plain(row.cells[idColumn]),
      order,
      line: row.index,
      text: row.cells.join(' | '),
      severity: severityColumn === -1 ? joined : row.cells[severityColumn] || '',
      fix: fixColumn === -1 ? null : row.cells[fixColumn] || '',
      attempts: attemptsColumn === -1 ? 0 : Number((/(\d+)/.exec(plain(row.cells[attemptsColumn] || '')) || [0, 0])[1]),
      open: !CLOSED_BUG.test(lead) || STILL_OPEN.test(lead),
      status: excerpt(status, 80),
    });
  });
  return { rows, hasFixColumn: fixColumn !== -1, line: heading.index };
}

function triageOf(cell) {
  if (cell === null) return 'no-column';
  const value = plain(cell).toLowerCase();
  if (!value || /^[—-]$/.test(value) || isTemplateValue(cell) || /^yes\s*\/\s*no/.test(value)) return 'blank';
  if (/^(yes|y|fix|auto)\b/.test(value) || /\byes\b/.test(value)) return 'yes';
  if (/^(no|n|won'?t|wont|skip)\b/.test(value)) return 'no';
  if (/^defer/.test(value)) return 'defer';
  return 'unclear';
}

function severityRank(text) {
  const value = plain(text).toLowerCase();
  if (/blocker|critical/.test(value)) return 0;
  if (/major|high/.test(value)) return 1;
  if (/minor|medium/.test(value)) return 2;
  if (/trivial|low/.test(value)) return 3;
  return 4;
}

function runRecipeExists(context) {
  if (!context.projectRoot) return null;
  const environment = readText(path.join(context.projectRoot, 'docs', 'basics', '09-environment.md'));
  if (environment === null) return false;
  return /full-stack run recipe/i.test(environment);
}

const TESTING_FINISHED_UNITS = /^(hand-off|done)$/;

function rereadPriority(context, entry) {
  if (entry.path.startsWith(path.join(pluginRoot, 'skills') + path.sep)) return 1;
  if (path.basename(entry.path) === 'review-charter.md') return 2;
  if (context.projectRoot && entry.path.startsWith(path.join(context.projectRoot, 'docs', 'basics') + path.sep)) return 3;
  return 0;
}

function testingPosition(context, result) {
  testingNext(context, result);
  if (!result.next || !TESTING_FINISHED_UNITS.test(result.next.unit)) {
    reread(result, path.join(pluginRoot, 'skills', 'do-testing', 'boot-smoke.md'), 'the full Boot & Smoke run');
    if (isClient(context)) reread(result, path.join(pluginRoot, 'skills', 'do-testing', 'ui-levels.md'), 'the UI levels (client platform)');
  }
  result.reread = result.reread
    .map((entry, order) => ({ entry, order, priority: rereadPriority(context, entry) }))
    .sort((first, second) => first.priority - second.priority || first.order - second.order)
    .map(({ entry }) => entry);
}

function testingNext(context, result) {
  result.skill = 'do-testing';
  const testPlanPath = context.paths.testPlan;
  reread(result, testPlanPath, 'the test plan — the state');
  reread(result, context.paths.spoke, 'the AC register the tests derive from');
  reread(result, locateHub(context), 'the hub: §3 critical journeys and §5 contract');
  if (context.projectRoot) {
    reread(result, path.join(context.projectRoot, 'docs', 'basics', '09-environment.md'), 'the Full-stack run recipe');
    reread(result, path.join(context.projectRoot, 'docs', 'basics', '13-auth.md'), 'test auth');
  }

  if (context.plan.text) {
    const stages = stagesOf(context.plan.text);
    const done = stages.filter((stage) => stageProgress(stage) === 'done').length;
    if (stages.length) result.facts.push(`development: ${done} of ${stages.length} stages done`);
    if (stages.length && done < stages.length) result.notes.push('development is not finished — testing runs on an implemented feature');
  }
  if (runRecipeExists(context) === false) result.stops.push(STOPS.noRunRecipe);

  if (!context.testPlan.text) {
    setNext(result, 'Step 1',
      'plan & confirm — the pyramid, the critical journeys for Boot & Smoke, the environment the levels need');
    result.gate = GATES.testPlan;
    reread(result, path.join(pluginRoot, 'skills', 'do-testing', 'test-plan-template.md'), 'the test plan template');
    return;
  }
  const plan = testPlanOf(context.testPlan.text);
  const anyTestRecorded = plan.tests.some((test) => testRecorded(test.status));
  const planApproved = plan.planApproved && !isTemplateValue(plan.planApproved.value) && DATE.test(plan.planApproved.value);
  const planApprovedFact = planApproved ? excerpt(plan.planApproved.value, 60) : plan.planApproved ? 'not yet' : 'no "Plan approved" row';
  result.facts.push(`plan approved: ${planApprovedFact}`);
  const environmentApproved = plan.environment && !isTemplateValue(plan.environment.value) && plain(plan.environment.value);
  result.facts.push(`environment approved: ${environmentApproved ? excerpt(plan.environment.value, 80) : 'not recorded'}`);
  if (!plan.planApproved && !plan.tests.length) {
    markUnknown(result, 'this test plan has no "Plan approved" row and no AC → test table with test IDs that can be read', [testPlanPath]);
    return;
  }
  if (!planApproved && (plan.planApproved || !anyTestRecorded)) {
    setNext(result, 'Step 1', 'the test plan is written but not approved — present it for confirmation');
    result.gate = GATES.testPlan;
    return;
  }
  if (!planApproved) result.notes.push('no "Plan approved" row — this plan predates it; tests have run, so its plan gate is behind it');
  if (!environmentApproved && !autoRunCovers(context)) {
    result.notes.push('no "Environment approved" line — name the environment/tooling the levels need and ask before standing anything up');
  }

  if (!plan.tests.length) {
    markUnknown(result, 'the AC → test table lists no test IDs (expected rows like `TC1`)', [testPlanPath]);
    return;
  }
  if (plan.tests.every((test) => test.status === null)) {
    markUnknown(result, 'the AC → test table has no Status column, so which tests ran cannot be read', [testPlanPath]);
    return;
  }
  const withProcedures = plan.tests.filter((test) => plan.procedures.has(test.id)).length;
  if (!withProcedures) result.notes.push('no test has a procedure block — this plan predates per-test approval, so only the Status column is read');
  const recorded = plan.tests.filter((test) => testRecorded(test.status));
  result.facts.push(`tests: ${recorded.length} of ${plan.tests.length} run and recorded`);
  const recordedUnstamped = recorded.filter((test) => {
    const procedure = plan.procedures.get(test.id);
    return !procedure || stampState(procedure.approved) !== 'stamped';
  });
  if (withProcedures && recordedUnstamped.length) {
    result.notes.push(`${recordedUnstamped.length} test(s) ran without a procedure block or an Approved stamp on record ` +
      `(${recordedUnstamped.slice(0, 6).map((test) => test.id).join(', ')}) — they are settled, not redone`);
  }

  for (const test of plan.tests) {
    if (testRecorded(test.status)) continue;
    const procedure = plan.procedures.get(test.id);
    if (withProcedures && !procedure) {
      setNext(result, test.id, 'Step 2 — write its procedure block, then present it for approval', at(testPlanPath, test.line));
      result.gate = GATES.test;
      return;
    }
    if (procedure && stampState(procedure.approved) !== 'stamped') {
      setNext(result, test.id, 'Step 2 — present the written test for approval', at(testPlanPath, procedure.line));
      result.gate = GATES.test;
      return;
    }
    setNext(result, test.id, 'Step 2 — run the approved test and record its status', at(testPlanPath, test.line));
    return;
  }

  const reviewed = plan.review && !isTemplateValue(plan.review.value) && DATE.test(plan.review.value);
  result.facts.push(`test review: ${reviewed ? excerpt(plan.review.value, 80) : 'not recorded'}`);
  if (!reviewed) {
    setNext(result, 'Step 3', 'test review (fresh eyes): `check-coverage.js --test-plan` first, then the reviewer dimensions');
    result.gate = GATES.review;
    if (!plan.review) {
      result.notes.push('no "Test review" line — test plans before it never recorded one; if the review already ran, ' +
        'record its line instead of running it again');
    }
    reread(result, charterState(context).path, 'the profile rules the tests are reviewed against');
    return;
  }

  const bugs = plan.bugs ? plan.bugs.rows.filter((bug) => bug.open) : [];
  if (bugs.length) {
    const untriaged = bugs.filter((bug) => ['blank', 'no-column', 'unclear'].includes(triageOf(bug.fix)));
    const listed = bugs.map((bug) => `${bug.id} (${plain(bug.severity).split(' ')[0] || '?'}, fix? ${triageOf(bug.fix)})`);
    result.facts.push(`open bugs: ${listed.join(', ')}`);
    if (untriaged.length && !autoRunCovers(context)) {
      setNext(result, 'Step 4',
        'present the consolidated Bugs found report and let the user triage',
        at(testPlanPath, plan.bugs.line));
      result.gate = GATES.bugReport;
      return;
    }
    setNext(result, 'hand-off', 'the triaged bugs go to `do-fixing` (blockers first) — never `do-issue-grooming` directly');
    return;
  }

  let featureStatus = null;
  try { ({ featureStatus } = require(path.join(pluginRoot, 'scripts', 'check-feature-done.js'))); } catch {}
  const verdict = featureStatus ? featureStatus(context.featureDirectory, context.platform) : null;
  if (verdict && verdict.done) {
    setNext(result, 'done', '`check-feature-done.js` passes — reconcile the profile: run `do-project-setup` in refresh mode');
    result.complete = true;
    return;
  }
  if (verdict) for (const reason of verdict.reasons) result.facts.push(`not done: ${reason}`);
  setNext(result, 'Step 4', 'coverage + Boot & Smoke + footprint debt: drive what is not passing, and take each open debt row to the user, until `check-feature-done.js` exits 0');
}

function fixingPosition(context, result) {
  result.skill = 'do-fixing';
  if (!context.testPlan.text && context.hub.text && documentKind(context.hub.text, 'TRD.md') === 'issue') {
    markUnknown(result,
      'the issue-TRD path (small-fix route) has no test plan: its bug list is §2\'s audit table — each affected site is a bug ' +
      'row, its status written back there — and §4 holds the AC; the next unit is the first site not fixed',
      [context.paths.hub]);
    return;
  }
  if (!context.testPlan.text) {
    result.stops.push(STOPS.noTestReport);
    setNext(result, 'testing', `no ${relativeLabel(context.paths.testPlan)}`);
    return;
  }
  reread(result, context.paths.testPlan, 'the Bugs found table — the state');
  reread(result, context.paths.spoke, 'the AC each bug violates');
  const plan = testPlanOf(context.testPlan.text);
  if (!plan.bugs) {
    result.stops.push(STOPS.noTestReport);
    setNext(result, 'testing', `${relativeLabel(context.paths.testPlan)} has no "Bugs found" section`);
    return;
  }
  const open = plan.bugs.rows.filter((bug) => bug.open);
  result.facts.push(`bugs: ${plan.bugs.rows.length} recorded, ${open.length} open`);
  const auto = autoRunCovers(context);
  if (auto) result.facts.push('auto-run is running for this feature: every open bug is fixed, in severity order');
  const UNTRIAGED = ['blank', 'no-column', 'unclear'];
  const triaged = open.map((bug) => ({ bug, triage: triageOf(bug.fix) }));
  const toFix = triaged.filter(({ triage }) => triage === 'yes' || (auto && UNTRIAGED.includes(triage)));
  const needsTriage = auto ? [] : triaged.filter(({ triage }) => UNTRIAGED.includes(triage));
  if (needsTriage.length) {
    result.stops.push(plan.bugs.hasFixColumn ? STOPS.triage(needsTriage.map(({ bug }) => bug.id).join(', ')) : STOPS.noTriageColumn);
  }
  for (const { bug, triage } of triaged) {
    const severity = plain(bug.severity).split(' ').slice(0, 2).join(' ') || '?';
    result.facts.push(`${bug.id}: ${severity} · fix? ${triage} · attempts ${bug.attempts} · ${bug.status}`);
  }

  const ordered = toFix.map(({ bug }) => bug).sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.order - b.order);
  if (!ordered.length) {
    result.next = needsTriage.length
      ? { unit: 'triage', step: 'no open bug is triaged to fix yet — ask the user which to fix' }
      : { unit: 'after the last bug', step: 'hand back to `do-testing` to re-run and confirm the fixes hold and nothing regressed' };
    return;
  }
  const bug = ordered[0];
  setNext(result, bug.id,
    'frame → red (a failing test that reproduces it) → root-cause fix → conformance review → re-verify',
    at(context.paths.testPlan, bug.line));
  result.gate = GATES.bug;
  result.block = { location: at(context.paths.testPlan, bug.line), text: context.testPlan.lines[bug.line] };
  if (bug.attempts >= 3) result.stops.push(STOPS.threeStrikes(bug.id, bug.attempts));
  const charter = charterState(context);
  describeCharter(context, result, charter);
  if (isClient(context)) {
    reread(result, path.join(pluginRoot, 'skills', 'do-fixing', 'ui-bugs.md'),
      'the UI-bug rules (client platform) — once per session, again after a compaction');
  }
  if (charter.state === 'fresh') reread(result, charter.path, 'the profile rules the fix is reviewed against');
  reread(result, path.join(pluginRoot, 'skills', 'do-fixing', 'fix-reviewer.md'),
    'the fix-review checklist — read it only to run the review inline');
}

const POSITION_OF_PHASE = {
  grooming: groomingPosition,
  planning: planningPosition,
  development: developmentPosition,
  testing: testingPosition,
  fixing: fixingPosition,
};

function detectPhase(context) {
  if (!context.platform) return { phase: 'grooming', why: 'no platform given — the hub' };
  if (context.testPlan.text) {
    const plan = testPlanOf(context.testPlan.text);
    const fixable = plan.bugs ? plan.bugs.rows.filter((bug) => bug.open && triageOf(bug.fix) === 'yes') : [];
    if (fixable.length) return { phase: 'fixing', why: `${fixable.length} open bug(s) triaged to fix in ${relativeLabel(context.paths.testPlan)}` };
    return { phase: 'testing', why: `${relativeLabel(context.paths.testPlan)} exists` };
  }
  if (context.plan.text) {
    const stages = stagesOf(context.plan.text);
    const done = stages.filter((stage) => stageProgress(stage) === 'done').length;
    if (stages.length && done === stages.length) {
      return { phase: 'testing', why: `every stage of ${relativeLabel(context.paths.plan)} is done and there is no test plan yet` };
    }
    if (done) return { phase: 'development', why: `${done} of ${stages.length} stages done` };
    const probe = newResult(context, 'planning', 'probe');
    planningPosition(context, probe);
    return probe.complete
      ? { phase: 'development', why: `${relativeLabel(context.paths.plan)} is fully approved and no stage is done yet` }
      : { phase: 'planning', why: `${relativeLabel(context.paths.plan)} is not fully approved yet` };
  }
  if (context.spoke.text) {
    const probe = newResult(context, 'grooming', 'probe');
    groomingPosition(context, probe);
    return probe.complete
      ? { phase: 'planning', why: `${relativeLabel(context.paths.spoke)} is aligned with the hub and there is no plan yet` }
      : { phase: 'grooming', why: `${relativeLabel(context.paths.spoke)} is not finished` };
  }
  return { phase: 'grooming', why: `no ${relativeLabel(context.paths.spoke)} yet` };
}

function documentOf(filePath) {
  const text = filePath ? readText(filePath) : null;
  return { text, lines: text === null ? [] : linesOf(text) };
}

function realPath(candidate) {
  try { return fs.realpathSync(candidate); } catch { return candidate; }
}

function contextFor(featureArgument, platformArgument) {
  const featureDirectory = realPath(path.resolve(featureArgument));
  const platform = platformArgument ? platformArgument.toLowerCase() : null;
  const paths = {
    hub: path.join(featureDirectory, 'TRD.md'),
    spoke: platform ? path.join(featureDirectory, `TRD-${platform}.md`) : null,
    plan: platform ? path.join(featureDirectory, `plan-${platform}.md`) : null,
    testPlan: platform ? path.join(featureDirectory, `test-plan-${platform}.md`) : null,
  };
  const context = {
    feature: path.basename(featureDirectory),
    platform,
    featureDirectory,
    projectRoot: projectRootOf(featureDirectory),
    paths,
    hub: documentOf(paths.hub),
    spoke: documentOf(paths.spoke),
    plan: documentOf(paths.plan),
    testPlan: documentOf(paths.testPlan),
  };
  context.session = sessionFiles(context);
  return context;
}

function platformsIn(featureDirectory) {
  let names = [];
  try { names = fs.readdirSync(featureDirectory); } catch { return []; }
  const platforms = new Set();
  for (const name of names) {
    const match = /^(?:TRD|plan|test-plan)-([a-z0-9-]+)\.md$/i.exec(name);
    if (match) platforms.add(match[1].toLowerCase());
  }
  return [...platforms].sort();
}

function render(result) {
  const out = [];
  const where = [result.feature, result.platform || 'hub', result.phase].join(' · ');
  out.push(`next-step · ${where} (${result.phaseSource})`);
  if (result.unknown) {
    out.push(`unknown format — ${result.unknown.reason}`);
    out.push('read these instead (nothing is guessed):');
    for (const file of result.unknown.files) out.push(`  - ${file}`);
  }
  if (result.next) out.push(`next: ${result.next.unit} — ${result.next.step}${result.next.location ? ` (${result.next.location})` : ''}`);
  for (const stop of result.stops) out.push(`STOP: ${stop}`);
  if (result.gate) out.push(`gate: ${result.gate}`);
  if (result.facts.length) {
    out.push('state:');
    for (const fact of result.facts) out.push(`  - ${fact}`);
  }
  if (result.notes.length) {
    out.push('notes:');
    for (const note of result.notes) out.push(`  - ${note}`);
  }
  if (result.reread.length) {
    out.push('re-read (bounded, in this order):');
    for (const entry of result.reread) out.push(`  - ${entry.path} — ${entry.why}`);
  }
  if (result.skill) out.push(`resume: /alpha-sdlc:${result.skill} ${result.feature}${result.platform ? ' ' + result.platform : ''}`);
  if (result.block) {
    out.push(`block (${result.block.location}):`);
    for (const line of result.block.text.split('\n')) out.push(`  ${line}`);
  }
  return out.join('\n') + '\n';
}

function fail(message) {
  process.stderr.write(message + '\n' + USAGE);
  process.exit(2);
}

function main(argv) {
  const positional = [];
  let phase = null;
  let asJson = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--json') asJson = true;
    else if (argument === '--phase') phase = argv[++index];
    else if (argument.startsWith('--phase=')) phase = argument.slice('--phase='.length);
    else if (argument === '--help' || argument === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (argument.startsWith('--')) fail(`unknown option ${argument}`);
    else positional.push(argument);
  }
  if (!positional.length || positional.length > 2) fail('expected a feature directory and an optional platform');
  if (phase !== null && !PHASES.includes(phase)) fail(`unknown phase "${phase}"`);
  const groomingFromNothing = phase === 'grooming' && !exists(positional[0]);
  if (!groomingFromNothing && !isDirectory(positional[0])) fail(`no feature directory at ${path.resolve(positional[0])}`);

  let platform = positional[1] || null;
  if (!platform && phase && phase !== 'grooming') {
    const platforms = platformsIn(positional[0]);
    if (platforms.length !== 1) fail(`--phase ${phase} needs a platform${platforms.length ? ` — this feature has: ${platforms.join(', ')}` : ''}`);
    platform = platforms[0];
  }
  const context = contextFor(positional[0], platform);
  const detected = phase ? { phase, why: 'from --phase' } : detectPhase(context);
  const result = newResult(context, detected.phase, phase ? '--phase' : `detected: ${detected.why}`);
  if (!positional[1] && platform) result.notes.push(`platform ${platform} — the only one with files in this feature`);
  POSITION_OF_PHASE[detected.phase](context, result);
  describeSession(context, result);
  if (context.session.handoff) result.reread.unshift({ path: context.session.handoff, why: 'session-only facts — read first' });
  if (result.reread.length > MAX_REREAD) {
    const dropped = result.reread.slice(MAX_REREAD);
    result.notes.push(`${dropped.length} more file(s) left off the re-read list to keep it bounded: ` +
      `${dropped.map((entry) => `${entry.path} (${entry.why})`).join('; ')} — read one when the step needs it`);
    result.reread = result.reread.slice(0, MAX_REREAD);
  }
  delete result.complete;

  if (asJson) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else process.stdout.write(render(result));
  process.exitCode = result.unknown ? 2 : result.stops.length ? 1 : 0;
}

module.exports = { contextFor, locateHub, spokesOf, documentKind };

if (require.main === module) main(process.argv.slice(2));
