#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { parsePlan, bulletText } = require('./check-coverage');

const REGISTER = 'docs/basics/20-tech-debt-register.md';
const OUTSIDE_FOOTPRINT = /^docs\/(basics|development)\//;
const ROW_ID = /^(TD-(?:[A-Za-z][A-Za-z0-9]*-)?\d+)\b/;
const ANY_ROW_ID = /\bTD-(?:[A-Za-z][A-Za-z0-9]*-)?\d+\b/g;
const KEPT = '`accepted — <why + revisit trigger>`';

const USAGE =
  'usage: debt-balance.js <repo-root> --diff <base> [--plan <plan-file> [--stage <n>]] [--exclude <path>...]\n' +
  '         a stage or a fix: the rows it registered and paid since <base>, and every open row naming\n' +
  '         a file it edits; --plan reads which stage\'s `Pays debt:` line claims a row\n' +
  '       debt-balance.js <repo-root> --files <path>...\n' +
  '         planning: the open rows naming any of these repo-relative files (a directory names the\n' +
  '         files under it, `.` the whole repository)\n' +
  '       debt-balance.js <repo-root> --feature <feature-dir> <platform>\n' +
  '         the whole feature: its footprint is every file changed by a commit touching the\n' +
  '         platform\'s plan or test plan; only rows open when its last such commit landed count\n' +
  'exit 0: nothing undecided · 1: an open row in the footprint, or one this change registered there\n' +
  '        with no decision · 2: usage or git error\n';

function gitIn(repoRoot, args, input) {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', '-C', repoRoot, ...args],
    { encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024 });
  const why = result.error ? result.error.message : (result.stderr || '').trim();
  return { ok: result.status === 0, stdout: result.stdout || '', why };
}

const linesOf = (text) => text.split('\n').filter(Boolean);
const withoutStruck = (text) => text.replace(/~~[^~]*~~/g, ' ');
const plainCell = (cell) => cell.replace(/~~/g, '').replace(/[*_`]/g, '').trim();

function splitCells(line) {
  const cells = line.trim().split(/(?<!\\)\|/).map((cell) => cell.trim());
  if (cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function statusClassOf(statusCell, struck) {
  const status = plainCell(withoutStruck(statusCell)).toLowerCase().replace(/^[^a-z]+/, '');
  if (struck || /^(paid|closed|withdrawn|superseded|resolved|fixed|done)\b/.test(status)) return 'closed';
  if (/^(accepted|groomed)\b/.test(status)) return 'decided';
  return 'open';
}

function parseRegister(text) {
  const rows = new Map();
  if (!text) return rows;
  let inRegisterTable = false;
  for (const line of text.split('\n')) {
    if (!/^\s*\|/.test(line)) { inRegisterTable = false; continue; }
    const cells = splitCells(line);
    if (cells.length < 3 || /^:?-{3,}/.test(cells[0])) continue;
    const firstCell = plainCell(cells[0]);
    if (/^id$/i.test(firstCell)) { inRegisterTable = /^status\b/i.test(plainCell(cells[cells.length - 1])); continue; }
    const id = firstCell.match(ROW_ID);
    if (!inRegisterTable || !id) continue;
    const statusCell = cells[cells.length - 1];
    rows.set(id[1], {
      id: id[1],
      status: plainCell(withoutStruck(statusCell)) || plainCell(statusCell),
      statusClass: statusClassOf(statusCell, /^~~/.test(cells[0].replace(/\*/g, ''))),
      named: cells.slice(1, -1).join(' | '),
    });
  }
  return rows;
}

function registerAt(repoRoot, revision) {
  if (revision === null) {
    try { return fs.readFileSync(path.join(repoRoot, REGISTER), 'utf8'); } catch { return null; }
  }
  const shown = gitIn(repoRoot, ['show', `${revision}:./${REGISTER}`]);
  return shown.ok ? shown.stdout : null;
}

function countBy(files, keyOf) {
  const counts = new Map();
  for (const file of files) counts.set(keyOf(file), (counts.get(keyOf(file)) || 0) + 1);
  return counts;
}

function groupBy(files, keyOf) {
  const groups = new Map();
  for (const file of files) {
    if (!groups.has(keyOf(file))) groups.set(keyOf(file), []);
    groups.get(keyOf(file)).push(file);
  }
  return groups;
}

const basenameOf = (file) => path.posix.basename(file);
const stemOf = (file) => basenameOf(file).replace(/\.[^.]+$/, '');

function footprintIndex(footprint, trackedFiles) {
  return {
    repoBasenames: countBy(trackedFiles, basenameOf),
    repoStems: countBy(trackedFiles, stemOf),
    byBasename: groupBy(footprint, basenameOf),
    byStem: groupBy(footprint, stemOf),
  };
}

function namedTokens(rowText) {
  const tokens = [];
  for (const match of rowText.matchAll(/`([^`]+)`/g)) {
    const token = match[1].trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/#L\d+(-L?\d+)?$/, '')
      .replace(/(:\d+)+(-\d+)?$/, '').replace(/\(\)$/, '');
    if (token && !/\s/.test(token)) tokens.push(token);
  }
  return tokens;
}

const NAMES_A_COMPONENT = (token) => /^[A-Za-z_][\w-]{3,}$/.test(token) && /[A-Z]/.test(token) && /[a-z]/.test(token);

function footprintFilesNamed(row, index) {
  const named = new Set();
  for (const token of namedTokens(row.named)) {
    const basename = basenameOf(token);
    const hasExtension = /\.[A-Za-z0-9]+$/.test(basename);
    if (token.includes('/')) {
      if (hasExtension) for (const file of index.byBasename.get(basename) || []) if (file === token || file.endsWith('/' + token)) named.add(file);
    } else if (hasExtension) {
      if (index.repoBasenames.get(token) === 1) for (const file of index.byBasename.get(token) || []) named.add(file);
    } else if (NAMES_A_COMPONENT(token) && index.repoStems.get(token) === 1) {
      for (const file of index.byStem.get(token) || []) named.add(file);
    }
  }
  return [...named];
}

function stageClaims(planFile) {
  const claims = new Map();
  let text;
  try { text = fs.readFileSync(planFile, 'utf8'); } catch { return claims; }
  for (const stage of parsePlan(text, new Map()).stages) {
    for (const match of bulletText(stage.block, 'Pays debt').matchAll(ANY_ROW_ID)) {
      if (!claims.has(match[0])) claims.set(match[0], stage.number);
    }
  }
  return claims;
}

function bornAndPaid(before, after) {
  const born = [...after.values()].filter((row) => !before.has(row.id) && row.statusClass !== 'closed');
  const paid = [...before.values()].filter((row) => row.statusClass !== 'closed'
    && (!after.has(row.id) || after.get(row.id).statusClass === 'closed'));
  return { born, paid };
}

function footprintOfDiff(repoRoot, base, excluded) {
  const pathspec = ['--', '.', ...excluded.map((entry) => `:(exclude)${entry}`)];
  const changed = gitIn(repoRoot, ['diff', '--name-only', '--no-renames', '--relative', base, ...pathspec]);
  if (!changed.ok) return { error: `git diff ${base} failed: ${changed.why}` };
  const untracked = gitIn(repoRoot, ['ls-files', '--others', '--exclude-standard', ...pathspec]);
  return { files: new Set([...linesOf(changed.stdout), ...linesOf(untracked.stdout)]) };
}

const realPathOf = (target) => { try { return fs.realpathSync(target); } catch { return path.resolve(target); } };

function repoRelative(repoRoot, target) {
  const direct = path.relative(path.resolve(repoRoot), path.resolve(repoRoot, target));
  const relative = direct.startsWith('..') ? path.relative(realPathOf(repoRoot), realPathOf(path.resolve(repoRoot, target))) : direct;
  return relative.replace(/\\/g, '/').replace(/\/$/, '');
}

function featureCommits(repoRoot, featureDirectory, platform) {
  const relative = repoRelative(repoRoot, featureDirectory);
  if (!gitIn(repoRoot, ['rev-parse', '--verify', '--quiet', 'HEAD']).ok) return { relative, commits: [] };
  const log = gitIn(repoRoot, ['log', '--format=%H', '--', `${relative}/plan-${platform}.md`, `${relative}/test-plan-${platform}.md`]);
  if (!log.ok) return { error: `git log over ${relative} failed: ${log.why}` };
  return { relative, commits: linesOf(log.stdout) };
}

function footprintOfCommits(repoRoot, commits) {
  if (!commits.length) return new Set();
  const tree = gitIn(repoRoot, ['diff-tree', '--stdin', '-r', '--root', '--name-only', '--no-commit-id', '--no-renames', '--relative'],
    commits.join('\n') + '\n');
  return new Set(linesOf(tree.stdout));
}

function bornAndPaidOverCommits(repoRoot, commits) {
  const touching = new Set(linesOf(gitIn(repoRoot, ['log', '--format=%H', '--', `./${REGISTER}`]).stdout));
  const born = new Map();
  const paid = new Map();
  for (const commit of commits.filter((candidate) => touching.has(candidate)).reverse()) {
    const step = bornAndPaid(parseRegister(registerAt(repoRoot, `${commit}^`)), parseRegister(registerAt(repoRoot, commit)));
    for (const row of step.born) born.set(row.id, row);
    for (const row of step.paid) { if (born.has(row.id)) born.delete(row.id); else paid.set(row.id, row); }
  }
  return { born: [...born.values()], paid: [...paid.values()] };
}

function expandFiles(repoRoot, givenPaths, trackedFiles) {
  const files = new Set();
  for (const given of givenPaths) {
    const relative = repoRelative(repoRoot, given);
    const under = relative === '' ? trackedFiles : trackedFiles.filter((file) => file.startsWith(relative + '/'));
    if (under.length) under.forEach((file) => files.add(file));
    else if (relative) files.add(relative);
  }
  return files;
}

function debtBalance(options) {
  const { repoRoot } = options;
  const currentText = registerAt(repoRoot, null);
  if (currentText === null) return { registerFound: false };
  const tracked = gitIn(repoRoot, ['ls-files', '--cached', '--others', '--exclude-standard']);
  if (!tracked.ok) return { registerFound: true, error: `git ls-files failed: ${tracked.why}` };
  const trackedFiles = linesOf(tracked.stdout);
  const current = parseRegister(currentText);

  let footprint;
  let born = [];
  let paid = [];
  let countsAsOpen = () => true;
  if (options.base) {
    const diff = footprintOfDiff(repoRoot, options.base, options.excluded || []);
    if (diff.error) return { registerFound: true, error: diff.error };
    footprint = diff.files;
    ({ born, paid } = bornAndPaid(parseRegister(registerAt(repoRoot, options.base)), current));
  } else if (options.featureDirectory) {
    const feature = featureCommits(repoRoot, path.resolve(options.featureDirectory), options.platform);
    if (feature.error) return { registerFound: true, error: feature.error };
    footprint = footprintOfCommits(repoRoot, feature.commits);
    ({ born, paid } = bornAndPaidOverCommits(repoRoot, feature.commits));
    born = born.filter((row) => current.has(row.id) && current.get(row.id).statusClass !== 'closed').map((row) => current.get(row.id));
    const atLastCommit = feature.commits.length ? parseRegister(registerAt(repoRoot, feature.commits[0])) : new Map();
    countsAsOpen = (row) => atLastCommit.has(row.id);
  } else {
    footprint = expandFiles(repoRoot, options.files || [], trackedFiles);
  }
  for (const file of footprint) if (OUTSIDE_FOOTPRINT.test(file)) footprint.delete(file);

  const index = footprintIndex(footprint, trackedFiles);
  const claims = options.planFile ? stageClaims(options.planFile) : new Map();
  const bornIds = new Set(born.map((row) => row.id));
  const inFootprint = [];
  for (const row of current.values()) {
    if (row.statusClass === 'closed') continue;
    const files = footprintFilesNamed(row, index);
    if (!files.length) continue;
    const claimedBy = claims.has(row.id) ? claims.get(row.id) : null;
    const claimedLater = claimedBy !== null && (options.stage === undefined || claimedBy > options.stage);
    const undecided = row.statusClass === 'open' && !claimedLater && countsAsOpen(row);
    inFootprint.push({ ...row, files, born: bornIds.has(row.id), claimedBy, undecided });
  }
  const footprintIds = new Set(inFootprint.map((row) => row.id));
  return {
    registerFound: true,
    footprintSize: footprint.size,
    born,
    paid,
    inFootprint,
    foundElsewhere: born.filter((row) => !footprintIds.has(row.id) && row.statusClass === 'open'),
    undecided: inFootprint.filter((row) => row.undecided),
  };
}

function reportLines(balance) {
  if (!balance.registerFound) return [`debt: no ${REGISTER} in this repository — nothing to measure`];
  if (balance.error) return [`debt: cannot measure — ${balance.error}`];
  const lines = [];
  const brief = (status) => (status.length > 60 ? status.slice(0, 57).trimEnd() + '…' : status);
  for (const row of balance.inFootprint) {
    const where = `names ${row.files.join(', ')}`;
    if (row.undecided && row.born) lines.push(`measured  ${row.id} · ${brief(row.status)} · ${where} — registered by this change in a file it edits, with no decision: pay it here, or the user keeps the cut at a gate (${KEPT})`);
    else if (row.undecided) lines.push(`measured  ${row.id} · ${brief(row.status)} · ${where} — open debt in a file this change edits: pay it here, behaviour-preserving with a characterization test first, or the user keeps it (${KEPT})`);
    else if (row.claimedBy !== null && row.statusClass === 'open') lines.push(`planned   ${row.id} · ${where} — claimed by Stage ${row.claimedBy}'s \`Pays debt:\` line`);
    else if (row.statusClass === 'open') lines.push(`later     ${row.id} · ${where} — registered after this feature's last commit`);
    else lines.push(`decided   ${row.id} · ${brief(row.status)} · ${where}`);
  }
  for (const row of balance.foundElsewhere) lines.push(`inferred  ${row.id} · registered outside the footprint — confirm it was already in the code, not created by this change`);
  for (const row of balance.paid) lines.push(`paid      ${row.id}`);
  const balanceCount = balance.born.length - balance.paid.length;
  lines.push(
    `debt: ${balance.born.length} born · ${balance.paid.length} paid · balance ${balanceCount > 0 ? '+' : ''}${balanceCount} · ` +
    `${balance.inFootprint.length} open in the footprint (${balance.footprintSize} files), ${balance.undecided.length} undecided`,
  );
  return lines;
}

module.exports = { debtBalance, reportLines, parseRegister, REGISTER };

if (require.main === module) {
  const [repoRoot, mode, ...rest] = process.argv.slice(2);
  const options = { repoRoot: repoRoot && path.resolve(repoRoot) };
  let valid = Boolean(repoRoot);
  if (mode === '--diff' && rest.length && !rest[0].startsWith('--')) {
    options.base = rest[0];
    options.excluded = [];
    for (let index = 1; index < rest.length; index++) {
      if (rest[index] === '--plan' && rest[index + 1] && !rest[index + 1].startsWith('--')) options.planFile = path.resolve(rest[++index]);
      else if (rest[index] === '--stage' && /^\d+$/.test(rest[index + 1] || '')) options.stage = Number(rest[++index]);
      else if (rest[index] === '--exclude' && rest[index + 1]) { while (rest[index + 1] && !rest[index + 1].startsWith('--')) options.excluded.push(rest[++index]); }
      else valid = false;
    }
  } else if (mode === '--files' && rest.length) options.files = rest;
  else if (mode === '--feature' && rest.length === 2) [options.featureDirectory, options.platform] = rest;
  else valid = false;
  if (!valid) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  const balance = debtBalance(options);
  for (const line of reportLines(balance)) process.stdout.write(line + '\n');
  if (balance.error) process.exit(2);
  process.exit(balance.registerFound && balance.undecided.length ? 1 : 0);
}
