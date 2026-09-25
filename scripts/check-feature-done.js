#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const CLOSED_BUG = /\b(fixed|deferred|won'?t fix|closed|withdrawn|rejected|duplicate)\b/i;
const STILL_OPEN = /\bnot re-?verified\b|\bre-?opened?\b|\bpending\b|\bin progress\b|\bopen\b/i;
const NOT_PASSING = /\b(blocked|failed|failing|fail|not run|manual|pending)\b|^\s*</i;

const withoutStrikethrough = (text) => text.replace(/~~[^~]*~~/g, '');
const leadClause = (text) => text.replace(/\*/g, '').trim().split(/\s—\s|\.\s/)[0];

function summaryLine(lines, label) {
  const line = lines.find((candidate) => new RegExp(`^\\s*[-*]\\s+\\*\\*${label}[^*]*:\\*\\*`).test(candidate));
  return line === undefined ? null : withoutStrikethrough(line.replace(/^.*?:\*\*/, ''));
}

function fractionShort(text) {
  const match = text.match(/(\d+)\s+of\s+(\d+)/);
  return match ? Number(match[1]) < Number(match[2]) : false;
}

function openBugs(lines) {
  const start = lines.findIndex((line) => /^##\s+Bugs found/i.test(line));
  if (start === -1) return [];
  const open = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    if (!/^\|/.test(line) || /^\|\s*-{3}/.test(line) || /^\|\s*#\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (!cells.length || /^none\b/i.test(cells.join(' '))) continue;
    const status = withoutStrikethrough(cells[cells.length - 1]);
    const lead = leadClause(status);
    if (!CLOSED_BUG.test(lead) || STILL_OPEN.test(lead)) {
      open.push(`${cells[0].replace(/\*/g, '')} — ${status.replace(/\*/g, '').slice(0, 90)}`);
    }
  }
  return open;
}

function featureStatus(featureDirectory, platform) {
  const testPlanPath = path.join(featureDirectory, `test-plan-${platform}.md`);
  let text;
  try { text = fs.readFileSync(testPlanPath, 'utf8'); } catch { return { done: false, readable: false, reasons: [`no test plan at ${testPlanPath}`] }; }
  const lines = text.split('\n');
  const reasons = [];

  const smoke = summaryLine(lines, 'Boot & Smoke');
  if (smoke === null) reasons.push('the test plan has no "Boot & Smoke (integrated):" summary line');
  else if (NOT_PASSING.test(leadClause(smoke)) || fractionShort(leadClause(smoke)) || !/\bpass(es|ed)?\b/i.test(leadClause(smoke))) {
    reasons.push(`Boot & Smoke has not passed: ${smoke.replace(/\*/g, '').trim().slice(0, 140)}`);
  }

  const covered = summaryLine(lines, 'AC covered');
  if (covered === null) reasons.push('the test plan has no "AC covered:" summary line');
  else if (fractionShort(leadClause(covered)) || /\bfail(ing|ed)?\b|^\s*</i.test(leadClause(covered))) {
    reasons.push(`not every acceptance criterion is covered and passing: ${covered.replace(/\*/g, '').trim().slice(0, 140)}`);
  }

  for (const bug of openBugs(lines)) reasons.push(`bug still open: ${bug}`);
  return { done: reasons.length === 0, readable: true, reasons };
}

module.exports = { featureStatus };

if (require.main === module) {
  const [featureDirectory, platform] = process.argv.slice(2);
  if (!featureDirectory || !platform) {
    process.stderr.write('usage: check-feature-done.js <feature-dir> <platform>\n');
    process.exit(2);
  }
  const status = featureStatus(featureDirectory, platform);
  if (!status.readable) {
    process.stdout.write(`feature: unreadable — ${status.reasons[0]}\n`);
    process.exit(2);
  }
  if (status.done) {
    process.stdout.write('feature: done — Boot & Smoke passed, every AC covered and passing, no open bug\n');
    process.exit(0);
  }
  process.stdout.write(`feature: NOT done — ${status.reasons.length} reason(s)\n`);
  for (const reason of status.reasons) process.stdout.write(`  - ${reason}\n`);
  process.exit(1);
}
