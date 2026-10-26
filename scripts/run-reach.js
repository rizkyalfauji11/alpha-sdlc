#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const USAGE =
  'usage: run-reach.js <hub feature dir> [--for review|rewalk]\n' +
  '  says whether this session can do the hub\'s cross-repository work itself: the grooming review\n' +
  '  (--for review, the default) or an Add a platform\'s spoke re-walk (--for rewalk). It reads the\n' +
  '  command line of the claude process running it: no --json-schema there is a terminal session\n' +
  '  (exit 0, nothing changes); a platform run reaches the work when every spoke in the feature\n' +
  '  README\'s ## Platforms has a clone in the run\'s directories whose feature folder the run may\n' +
  '  edit, and, for the review, --allowedTools allows each reviewer agent (exit 0); otherwise it\n' +
  '  names each reason and the work falls back to a terminal (exit 1); 2 when an input cannot be read\n';

const REVIEWERS = ['alpha-sdlc:sdlc-reviewer', 'alpha-sdlc:sdlc-reviewer-deep', 'alpha-sdlc:sdlc-reviewer-critic'];
const PROVIDER_HOSTS = { github: 'github.com', gitlab: 'gitlab.com', bitbucket: 'bitbucket.org' };
const EDITING_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
const CLI_FLAGS = [
  '-p', '--print', '--input-format', '--output-format', '--verbose', '--include-partial-messages', '--permission-mode',
  '--permission-prompts', '--allowedTools', '--allowed-tools', '--disallowedTools', '--disallowed-tools', '--add-dir',
  '--json-schema', '--resume', '--continue', '--model', '--fallback-model', '--settings', '--plugin-dir', '--mcp-config',
  '--strict-mcp-config', '--append-system-prompt', '--system-prompt', '--max-turns', '--session-id', '--debug',
  '--dangerously-skip-permissions', '--setting-sources', '--agents',
];
const ANCESTORS_WALKED = 32;

class ReachInputError extends Error {}

function inputError(message) {
  throw new ReachInputError(message);
}

function parseArguments(argv) {
  const options = { featureDirectory: null, work: 'review' };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--for') options.work = argv[++index];
    else if (!options.featureDirectory) options.featureDirectory = argv[index];
    else inputError(`unexpected argument ${argv[index]}`);
  }
  if (!options.featureDirectory) inputError('expected the hub\'s feature directory');
  if (!['review', 'rewalk'].includes(options.work)) inputError('--for takes review or rewalk');
  return options;
}

function processArgumentsOf(pid) {
  try {
    const argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    const parent = Number(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\)\s+\S+\s+/, '').split(/\s+/)[0]);
    return { parent, argv, text: null };
  } catch {}
  const shown = spawnSync('ps', ['-ww', '-o', 'ppid=', '-o', 'args=', '-p', String(pid)], { encoding: 'utf8' });
  const match = /^\s*(\d+)\s+([\s\S]*?)\s*$/.exec(shown.stdout || '');
  return match ? { parent: Number(match[1]), argv: null, text: match[2] } : null;
}

const isFlag = (token) => CLI_FLAGS.includes(token);

function flagEntriesOf({ argv, text }) {
  const entries = [];
  if (argv) {
    for (const token of argv) {
      if (isFlag(token) || /^--[a-z][\w-]*$/i.test(token)) entries.push({ flag: token, values: [] });
      else if (entries.length) entries[entries.length - 1].values.push(token);
    }
    return entries.map((entry) => ({ flag: entry.flag, value: entry.values.join(' ') }));
  }
  const boundary = new RegExp(`(?:^|\\s)(${CLI_FLAGS.map((flag) => flag.replace(/[-]/g, '\\-')).join('|')})(?=\\s|$)`, 'g');
  const depthAt = (end) => {
    let depth = 0;
    for (const character of text.slice(0, end)) {
      if (character === '(') depth++;
      else if (character === ')') depth = Math.max(0, depth - 1);
    }
    return depth;
  };
  const marks = [...text.matchAll(boundary)].filter((match) => depthAt(match.index) === 0)
    .map((match) => ({ flag: match[1], start: match.index, end: match.index + match[0].length }));
  return marks.map((mark, index) => ({ flag: mark.flag, value: text.slice(mark.end, index + 1 < marks.length ? marks[index + 1].start : text.length).trim() }));
}

function platformRunCommand() {
  let pid = process.ppid;
  for (let step = 0; step < ANCESTORS_WALKED && pid > 1; step++) {
    const shown = processArgumentsOf(pid);
    if (!shown) return null;
    const entries = flagEntriesOf(shown);
    if (entries.some((entry) => entry.flag === '--json-schema')) return entries;
    pid = shown.parent;
  }
  return null;
}

function rulesIn(value) {
  const rules = [];
  let depth = 0;
  let current = '';
  for (const character of String(value || '')) {
    if (character === '(') depth++;
    if (character === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (character === ',' || /\s/.test(character))) {
      if (current) rules.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (current) rules.push(current);
  return rules;
}

function settingsOf(value) {
  if (!value) return null;
  const text = value.trim().startsWith('{') ? value : (() => { try { return fs.readFileSync(value, 'utf8'); } catch { return null; } })();
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

function runOf(entries) {
  const valuesOf = (...flags) => entries.filter((entry) => flags.includes(entry.flag)).map((entry) => entry.value);
  const settings = settingsOf(valuesOf('--settings').pop());
  const hookCommands = [];
  for (const matcher of (((settings || {}).hooks || {}).PreToolUse || [])) {
    for (const hook of matcher.hooks || []) if (typeof hook.command === 'string') hookCommands.push(hook.command);
  }
  return {
    allowed: valuesOf('--allowedTools', '--allowed-tools').flatMap(rulesIn),
    denied: valuesOf('--disallowedTools', '--disallowed-tools').flatMap(rulesIn),
    directories: [process.cwd(), ...valuesOf('--add-dir')].map(realOrSame),
    hookCommands,
  };
}

function realOrSame(target) {
  try { return fs.realpathSync(target); } catch { return path.resolve(target); }
}

const isWithin = (parent, child) => child === parent || child.startsWith(parent.endsWith('/') ? parent : parent + '/');

function globToRegExp(pattern) {
  let source = '';
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      source += '.*';
      index++;
    } else if (character === '*') source += '[^/]*';
    else if (character === '?') source += '[^/]';
    else source += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

function pathOfRule(pattern) {
  if (pattern.startsWith('//')) return pattern.slice(1);
  if (pattern.startsWith('~/')) return path.join(os.homedir(), pattern.slice(2));
  return path.resolve(process.cwd(), pattern.replace(/^\//, ''));
}

function editDenialOf(denied, files) {
  for (const rule of denied) {
    const match = /^([A-Za-z]+)(?:\((.*)\))?$/.exec(rule);
    if (!match || !EDITING_TOOLS.includes(match[1])) continue;
    if (match[2] === undefined || match[2] === '' || match[2] === '*' || match[2] === '**') return rule;
    const pattern = globToRegExp(pathOfRule(match[2]));
    if (files.some((file) => pattern.test(file))) return rule;
  }
  return null;
}

function unwritableWhy(run, cloneDirectory, folder, trd) {
  const forms = [...new Set([folder, realOrSame(folder)])];
  if (!forms.some((form) => run.directories.some((directory) => isWithin(directory, form)))) return 'outside every directory the run may reach';
  const probes = forms.flatMap((form) => [path.join(form, trd), path.join(form, 'README.md')]);
  const denial = editDenialOf(run.denied, probes);
  if (denial) return `denied by ${denial}`;
  const cloneForms = new Set([cloneDirectory, realOrSame(cloneDirectory)]);
  for (const command of run.hookCommands) {
    const words = command.split(/\s+/).map((word) => word.replace(/^['"]+|['"]+$/g, ''));
    if (words.some((word) => cloneForms.has(word)) && !words.some((word) => forms.includes(word))) {
      return `the edit guard of ${cloneDirectory} opens other folders`;
    }
  }
  return null;
}

function agentReasons(run) {
  const reasons = [];
  for (const agent of REVIEWERS) {
    const forms = [`Agent(${agent})`, `Task(${agent})`, 'Agent', 'Task'];
    const denial = run.denied.find((rule) => forms.includes(rule));
    if (denial) reasons.push(`--disallowedTools denies ${denial}`);
    else if (!run.allowed.some((rule) => forms.includes(rule))) reasons.push(`--allowedTools has no Agent(${agent}) rule`);
  }
  return reasons;
}

function cellsOf(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function readmeOf(featureDirectory) {
  const readmePath = path.join(featureDirectory, 'README.md');
  let text;
  try { text = fs.readFileSync(readmePath, 'utf8'); } catch { return inputError(`cannot read ${readmePath}`); }
  const lines = text.split('\n');
  const field = (name) => {
    const row = lines.find((line) => new RegExp(`^\\|\\s*\\**${name}\\**\\s*\\|`, 'i').test(line));
    return row ? cellsOf(row)[1].replace(/[*`]/g, '').trim() : null;
  };
  const start = lines.findIndex((line) => /^##\s+Platforms\s*$/i.test(line));
  if (start === -1) inputError(`no ## Platforms table in ${readmePath}`);
  const table = [];
  for (let index = start + 1; index < lines.length && !/^##\s/.test(lines[index]); index++) {
    if (/^\|/.test(lines[index])) table.push(cellsOf(lines[index]));
  }
  const [header, , ...rows] = table;
  if (!header) inputError(`no ## Platforms table in ${readmePath}`);
  const column = (name) => header.findIndex((cell) => cell.toLowerCase() === name);
  const at = { platform: column('platform'), repository: column('repository'), subtree: column('subtree'), trd: column('trd'), hub: column('hub') };
  if (Object.values(at).some((index) => index === -1)) inputError(`the ## Platforms table of ${readmePath} lacks a column of Platform, Repository, Subtree, TRD, Hub`);
  const feature = field('Feature');
  if (!feature) inputError(`no Feature row in ${readmePath}`);
  return {
    feature,
    platforms: rows.map((cells) => ({
      platform: cells[at.platform],
      repository: cells[at.repository],
      subtree: /^(?:—|-|)$/.test(cells[at.subtree]) ? '' : cells[at.subtree].replace(/^\/+|\/+$/g, ''),
      trd: cells[at.trd],
      hub: /^yes$/i.test(cells[at.hub]),
    })),
  };
}

function originKey(url) {
  const text = String(url || '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const match = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)[:/](.+)$/i.exec(text);
  return match ? `${match[1].toLowerCase()}/${match[2].toLowerCase()}` : null;
}

function repositoryKey(repository) {
  const match = /^([a-z]+):(.+)$/i.exec(repository || '');
  if (!match) return null;
  return `${(PROVIDER_HOSTS[match[1].toLowerCase()] || match[1]).toLowerCase()}/${match[2].replace(/\.git$/, '').toLowerCase()}`;
}

function gitIn(directory, args) {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function clonesByOrigin(directories) {
  const candidates = new Set();
  for (const directory of directories) {
    candidates.add(directory);
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch {}
    for (const entry of entries) if (entry.isDirectory()) candidates.add(path.join(directory, entry.name));
  }
  const byOrigin = new Map();
  for (const candidate of candidates) {
    if (!fs.existsSync(path.join(candidate, '.git'))) continue;
    const key = originKey(gitIn(candidate, ['remote', 'get-url', 'origin']));
    if (key && !byOrigin.has(key)) byOrigin.set(key, candidate);
  }
  return byOrigin;
}

function reach(options, run) {
  const featureDirectory = realOrSame(options.featureDirectory);
  const { feature, platforms } = readmeOf(featureDirectory);
  const hubClone = gitIn(featureDirectory, ['rev-parse', '--show-toplevel']);
  if (!hubClone) inputError(`${featureDirectory} is not in a git clone`);
  const branch = `feat/${feature}`;
  const clones = clonesByOrigin([realOrSame(hubClone), ...run.directories]);
  const reasons = [];
  const asks = [];
  const lines = [];
  for (const row of platforms) {
    const name = `spoke ${row.platform}`;
    const cloneDirectory = clones.get(repositoryKey(row.repository));
    if (!cloneDirectory) {
      reasons.push(`${name} — no clone of ${row.repository} is in this run's directories`);
      continue;
    }
    const relativeFolder = path.posix.join(row.subtree, 'docs', 'development', feature);
    const folder = path.join(cloneDirectory, relativeFolder);
    if (!fs.existsSync(path.join(folder, row.trd))) {
      if (options.work === 'review') reasons.push(`${name} — ${row.trd} is not in ${folder}`);
      else lines.push(`${name}: ${cloneDirectory} · no ${row.trd} yet — nothing to re-walk`);
      continue;
    }
    const why = unwritableWhy(run, cloneDirectory, folder, row.trd);
    if (why) {
      reasons.push(`${name} — ${folder} is not writable in this run (${why})`);
      continue;
    }
    const onBranch = gitIn(cloneDirectory, ['rev-parse', '--abbrev-ref', 'HEAD']) || gitIn(cloneDirectory, ['symbolic-ref', '--short', 'HEAD']);
    if (onBranch !== branch) {
      asks.push(`${name} — ${cloneDirectory} is on ${onBranch || 'no branch'}, not ${branch}; nothing is written there before the member answers`);
    }
    lines.push(`${name}: ${cloneDirectory} · ${relativeFolder} · writable · ${onBranch || 'no branch'}`);
  }
  if (options.work === 'review') reasons.push(...agentReasons(run));
  return { reasons, asks, lines };
}

function main(argv) {
  try {
    const options = parseArguments(argv);
    const entries = platformRunCommand();
    if (!entries) {
      process.stdout.write('reach: terminal — not a run on the platform; the skill runs as written\n');
      return process.exit(0);
    }
    const work = options.work === 'review' ? 'the grooming review' : 'the spokes\' re-walk';
    const { reasons, asks, lines } = reach(options, runOf(entries));
    if (reasons.length) {
      process.stdout.write('reach: a terminal — nothing is written in this run\n');
      for (const reason of reasons) process.stdout.write(`cannot: ${reason}\n`);
      for (const line of lines) process.stdout.write(`${line}\n`);
      return process.exit(1);
    }
    process.stdout.write(`reach: this run — ${work}\n`);
    for (const line of lines) process.stdout.write(`${line}\n`);
    for (const ask of asks) process.stdout.write(`ask: ${ask}\n`);
    if (options.work === 'review') process.stdout.write(`reviewers: ${REVIEWERS.join(', ')} allowed\n`);
    return process.exit(0);
  } catch (error) {
    if (!(error instanceof ReachInputError)) throw error;
    process.stderr.write(error.message + '\n' + USAGE);
    return process.exit(2);
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { rulesIn, flagEntriesOf, originKey, repositoryKey, globToRegExp };
