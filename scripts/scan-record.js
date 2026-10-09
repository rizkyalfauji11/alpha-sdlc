#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const USAGE =
  'usage: scan-record.js --hash <repo>\n' +
  '       scan-record.js --check <record.md> <repo> [--json]\n' +
  '  --hash   prints {"commit","tree"}: HEAD, and a hash of the working tree outside docs/basics/ and\n' +
  '           .alpha-sdlc/ (index entries, the content of every tracked file changed in the working tree,\n' +
  '           and every untracked file that is not ignored)\n' +
  '  --check  reads the record\'s commit and tree lines and prints "fresh" (exit 0), or "stale" with the\n' +
  '           changed paths grouped by top-level area (exit 1); exit 2 when the record or the repository\n' +
  '           cannot be read\n';

const EXCLUDED_PATHS = [':(exclude,glob)**/docs/basics/**', ':(exclude,glob)**/.alpha-sdlc/**'];
const PATHS_SHOWN_PER_AREA = 50;
const DIRECTORIES_SHOWN_PER_AREA = 40;

function stopUnreadable(message) {
  process.stdout.write(`unreadable — ${message}\n`);
  process.exit(2);
}

function stopWithUsage(message) {
  process.stderr.write(message + '\n' + USAGE);
  process.exit(2);
}

function git(repository, args) {
  const result = spawnSync('git', ['-c', 'core.quotepath=off', ...args], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
  });
  return { ok: result.status === 0, stdout: result.stdout || '', stderr: (result.stderr || '').trim() };
}

function nulSeparated(text) {
  return text.split('\0').filter(Boolean);
}

function openRepository(repositoryArgument) {
  const repository = path.resolve(repositoryArgument);
  if (!fs.existsSync(repository)) stopUnreadable(`${repository} does not exist`);
  const inside = git(repository, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.stdout.trim() !== 'true') stopUnreadable(`${repository} is not inside a git working tree`);
  return repository;
}

function headCommit(repository) {
  const head = git(repository, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  return head.ok ? head.stdout.trim() : null;
}

function blobIdOf(content) {
  return crypto.createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}

function blobIdsByGit(repository, relativePaths) {
  const hashable = relativePaths.filter((file) => !/[\n\r]/.test(file));
  if (!hashable.length) return new Map();
  const result = spawnSync('git', ['hash-object', '--stdin-paths'], {
    cwd: repository,
    input: hashable.join('\n') + '\n',
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const ids = (result.stdout || '').split('\n').filter(Boolean);
  if (result.status !== 0 || ids.length !== hashable.length) return new Map();
  return new Map(hashable.map((file, index) => [file, ids[index]]));
}

function workingCopyStates(repository, relativePaths) {
  const states = new Map();
  const regularFiles = [];
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(repository, relativePath);
    let stats;
    try { stats = fs.lstatSync(absolutePath); } catch { states.set(relativePath, 'deleted'); continue; }
    if (stats.isSymbolicLink()) {
      let target = '';
      try { target = fs.readlinkSync(absolutePath); } catch {}
      states.set(relativePath, `120000 ${blobIdOf(Buffer.from(target))}`);
    } else if (stats.isDirectory()) {
      const nested = git(absolutePath, ['rev-parse', '--verify', '--quiet', 'HEAD']);
      states.set(relativePath, `160000 ${nested.ok ? nested.stdout.trim() : 'unknown'}`);
    } else if (stats.isFile()) {
      regularFiles.push({ relativePath, mode: (stats.mode & 0o111) !== 0 ? '100755' : '100644' });
    } else {
      states.set(relativePath, 'special');
    }
  }
  const ids = blobIdsByGit(repository, regularFiles.map((file) => file.relativePath));
  for (const { relativePath, mode } of regularFiles) {
    let id = ids.get(relativePath);
    if (!id) {
      try { id = blobIdOf(fs.readFileSync(path.join(repository, relativePath))); } catch { id = 'unreadable'; }
    }
    states.set(relativePath, `${mode} ${id}`);
  }
  return states;
}

function workingTreeHash(repository) {
  const indexEntries = git(repository, ['ls-files', '-s', '-z', '--', '.', ...EXCLUDED_PATHS]);
  if (!indexEntries.ok) stopUnreadable(`git ls-files failed: ${indexEntries.stderr}`);
  const unstaged = git(repository, ['diff', '--name-only', '-z', '--relative', '--no-renames', '--', '.', ...EXCLUDED_PATHS]);
  if (!unstaged.ok) stopUnreadable(`git diff failed: ${unstaged.stderr}`);
  const untracked = git(repository, ['ls-files', '--others', '--exclude-standard', '-z', '--', '.', ...EXCLUDED_PATHS]);
  if (!untracked.ok) stopUnreadable(`git ls-files --others failed: ${untracked.stderr}`);

  const changedInWorkingCopy = nulSeparated(unstaged.stdout);
  const untrackedFiles = nulSeparated(untracked.stdout);
  const states = workingCopyStates(repository, [...changedInWorkingCopy, ...untrackedFiles]);
  const lines = [];
  for (const entry of nulSeparated(indexEntries.stdout)) {
    const tab = entry.indexOf('\t');
    const [mode, blob, stage] = entry.slice(0, tab).split(' ');
    const relativePath = entry.slice(tab + 1);
    lines.push(`${relativePath}\t${stage}\t${states.get(relativePath) || `${mode} ${blob}`}`);
  }
  for (const relativePath of untrackedFiles) {
    lines.push(`${relativePath}\t0\t${states.get(relativePath)}`);
  }
  lines.sort();
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

function recordedValue(text, label) {
  const asJson = new RegExp(`"${label}"\\s*:\\s*"([0-9a-f]{7,64})"`, 'i').exec(text);
  if (asJson) return asJson[1].toLowerCase();
  const asLine = new RegExp(
    `^[\\s>*|-]*\\**\\s*${label}\\b[^\\n:|]{0,40}?[:|]\\s*\\**\\s*\`?([0-9a-f]{7,64})\\b`,
    'im',
  ).exec(text);
  return asLine ? asLine[1].toLowerCase() : null;
}

function commitExists(repository, commit) {
  return git(repository, ['cat-file', '-e', `${commit}^{commit}`]).ok;
}

function changedPathsSince(repository, recordedCommit, currentCommit) {
  const committed = new Set();
  const uncommitted = new Set();
  const notes = [];
  if (recordedCommit && currentCommit && !currentCommit.startsWith(recordedCommit)) {
    if (commitExists(repository, recordedCommit)) {
      const sinceRecord = git(repository, [
        'diff', '--name-only', '-z', '--relative', '--no-renames', recordedCommit, currentCommit, '--', '.', ...EXCLUDED_PATHS,
      ]);
      if (sinceRecord.ok) nulSeparated(sinceRecord.stdout).forEach((file) => committed.add(file));
      else notes.push(`could not diff ${shortCommit(recordedCommit)}..HEAD: ${sinceRecord.stderr}`);
    } else {
      notes.push(`the recorded commit ${shortCommit(recordedCommit)} is not in this repository's history — re-scan every area`);
    }
  }
  const againstHead = currentCommit
    ? git(repository, ['diff', '--name-only', '-z', '--relative', '--no-renames', 'HEAD', '--', '.', ...EXCLUDED_PATHS])
    : git(repository, ['ls-files', '-z', '--', '.', ...EXCLUDED_PATHS]);
  if (againstHead.ok) nulSeparated(againstHead.stdout).forEach((file) => uncommitted.add(file));
  const untracked = git(repository, ['ls-files', '--others', '--exclude-standard', '-z', '--', '.', ...EXCLUDED_PATHS]);
  if (untracked.ok) nulSeparated(untracked.stdout).forEach((file) => uncommitted.add(file));
  const onlyUncommitted = [...uncommitted].filter((file) => !committed.has(file));
  if (onlyUncommitted.length) {
    notes.push('* uncommitted now — changed since the record, or already uncommitted when it was written');
  }
  return {
    paths: [...new Set([...committed, ...uncommitted])].sort(),
    uncommitted: onlyUncommitted.sort(),
    notes,
  };
}

function areaOf(relativePath) {
  const separator = relativePath.indexOf('/');
  return separator === -1 ? '(root)' : relativePath.slice(0, separator + 1);
}

function directoriesHolding(paths) {
  const directories = (depth) => [...new Set(paths.map((file) => {
    const parts = file.split('/').slice(0, -1);
    return parts.length ? parts.slice(0, depth).join('/') + '/' : '(root)';
  }))].sort();
  const deepest = Math.max(1, ...paths.map((file) => file.split('/').length - 1));
  for (let depth = deepest; depth > 1; depth--) {
    const listed = directories(depth);
    if (listed.length <= DIRECTORIES_SHOWN_PER_AREA) return listed;
  }
  return directories(1);
}

function groupByArea(paths) {
  const areas = new Map();
  for (const file of paths) {
    const area = areaOf(file);
    if (!areas.has(area)) areas.set(area, []);
    areas.get(area).push(file);
  }
  return Object.fromEntries([...areas.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function shortCommit(commit) {
  return commit ? commit.slice(0, 12) : 'none';
}

function printHash(repositoryArgument) {
  const repository = openRepository(repositoryArgument);
  const result = { commit: headCommit(repository), tree: workingTreeHash(repository) };
  process.stdout.write(JSON.stringify(result) + '\n');
}

function checkRecord(recordArgument, repositoryArgument, asJson) {
  const recordPath = path.resolve(recordArgument);
  let recordText;
  try { recordText = fs.readFileSync(recordPath, 'utf8'); } catch { stopUnreadable(`cannot read the scan record ${recordPath}`); }
  const recordedTree = recordedValue(recordText, 'tree');
  if (!recordedTree) stopUnreadable(`${recordPath} has no "tree" line (expected the --hash output: commit and tree)`);
  const recordedCommit = recordedValue(recordText, 'commit');
  const repository = openRepository(repositoryArgument);
  const currentCommit = headCommit(repository);
  const currentTree = workingTreeHash(repository);

  const fresh = currentTree === recordedTree;
  const changes = fresh
    ? { paths: [], uncommitted: [], notes: [] }
    : changedPathsSince(repository, recordedCommit, currentCommit);
  const areas = groupByArea(changes.paths);
  const notes = [...changes.notes];
  if (fresh && recordedCommit && currentCommit && !currentCommit.startsWith(recordedCommit)) {
    notes.push('HEAD moved since the record, but only inside docs/basics/ or .alpha-sdlc/');
  }
  if (!fresh && !changes.paths.length && !changes.notes.length) {
    notes.push('the working tree differs from the recorded one, yet no path differs from HEAD now — re-scan every area');
  }

  process.exitCode = fresh ? 0 : 1;
  if (asJson) {
    process.stdout.write(JSON.stringify({
      status: fresh ? 'fresh' : 'stale',
      record: recordPath,
      commit: { recorded: recordedCommit, current: currentCommit },
      tree: { recorded: recordedTree, current: currentTree },
      areas,
      uncommitted: changes.uncommitted,
      notes,
    }, null, 2) + '\n');
    return;
  }

  const report = [];
  if (fresh) {
    report.push(`fresh — commit ${shortCommit(currentCommit)}, the working tree matches the record`);
  } else {
    const commitMove = recordedCommit && currentCommit && !currentCommit.startsWith(recordedCommit)
      ? `commit ${shortCommit(recordedCommit)} → ${shortCommit(currentCommit)}`
      : `commit ${shortCommit(currentCommit)}, working tree changed`;
    report.push(`stale — ${changes.paths.length} changed path(s) since the record (${commitMove})`);
    const uncommittedOnly = new Set(changes.uncommitted);
    for (const [area, files] of Object.entries(areas)) {
      const shown = files
        .slice(0, PATHS_SHOWN_PER_AREA)
        .map((file) => (uncommittedOnly.has(file) ? `${file} *` : file))
        .join(', ');
      const hiddenFiles = files.slice(PATHS_SHOWN_PER_AREA);
      const hidden = hiddenFiles.length
        ? `, … and ${hiddenFiles.length} more, under ${directoriesHolding(hiddenFiles).join(', ')}`
        : '';
      report.push(`  ${area} (${files.length}): ${shown}${hidden}`);
    }
  }
  for (const note of notes) report.push(`  note: ${note}`);
  process.stdout.write(report.join('\n') + '\n');
}

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const positional = argv.filter((argument) => argument !== '--json');
if (positional[0] === '--hash') {
  if (positional.length !== 2) stopWithUsage('--hash takes exactly one repository path');
  printHash(positional[1]);
} else if (positional[0] === '--check') {
  if (positional.length !== 3) stopWithUsage('--check takes a record path and a repository path');
  checkRecord(positional[1], positional[2], asJson);
} else {
  stopWithUsage(positional.length ? `unknown mode ${positional[0]}` : 'no mode given');
}
