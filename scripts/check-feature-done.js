#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { debtBalance, reportLines } = require('./debt-balance');

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

  const debt = featureDebt(featureDirectory, platform);
  if (debt && debt.gated && debt.balance.error) reasons.push(`the debt balance cannot be measured: ${debt.balance.error}`);
  else if (debt && debt.gated) {
    for (const row of debt.balance.undecided) {
      reasons.push(`debt left open in a file this feature changed: ${row.id} names ${row.files.join(', ')} — ` +
        'pay it (characterization test first, row deleted), or the user keeps it (`accepted — <why + revisit trigger>`; auto-run: `accepted — auto ★ <date>`, ratified after)');
    }
  }
  const debtSummary = debt
    ? reportLines(debt.balance).pop() + (debt.gated ? '' : ' — not gated: the plan has no *Debt in the footprint* section (planned before the debt rule)')
    : null;
  return { done: reasons.length === 0, readable: true, reasons, debtSummary, debtGated: Boolean(debt && debt.gated) };
}

function profileRootOf(featureDirectory) {
  const resolved = path.resolve(featureDirectory);
  const underDevelopment = resolved.match(/^(.*?)[\\/]docs[\\/]development[\\/][^\\/]+[\\/]?$/);
  if (underDevelopment) return underDevelopment[1];
  const toplevel = spawnSync('git', ['-C', resolved, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return toplevel.status === 0 ? toplevel.stdout.trim() : null;
}

function featureDebt(featureDirectory, platform) {
  const root = profileRootOf(featureDirectory);
  if (!root) return null;
  const inside = spawnSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if (inside.status !== 0) return null;
  const balance = debtBalance({ repoRoot: root, featureDirectory, platform });
  if (!balance.registerFound) return null;
  let plan = '';
  try { plan = fs.readFileSync(path.join(featureDirectory, `plan-${platform}.md`), 'utf8'); } catch {}
  return { balance, gated: /^##\s+Debt in the footprint\b/m.test(plan) };
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
  const debtLine = status.debtSummary ? `  ${status.debtSummary}\n` : '';
  if (status.done) {
    const debtClause = status.debtGated ? ', no open debt in its footprint' : '';
    process.stdout.write(`feature: done — Boot & Smoke passed, every AC covered and passing, no open bug${debtClause}\n` + debtLine);
    process.exit(0);
  }
  process.stdout.write(`feature: NOT done — ${status.reasons.length} reason(s)\n`);
  for (const reason of status.reasons) process.stdout.write(`  - ${reason}\n`);
  process.stdout.write(debtLine);
  process.exit(1);
}
