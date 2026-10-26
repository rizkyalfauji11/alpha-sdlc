#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createSuite, scriptsDirectory, environmentWith } = require('../lib/harness');

const suite = createSuite('review-on-platform');
const { fixtureDirectory, report, finish } = suite;

const REACH = path.join(scriptsDirectory, 'run-reach.js');
const FEATURE = 'platform-grooming';
const REVIEWERS = ['alpha-sdlc:sdlc-reviewer', 'alpha-sdlc:sdlc-reviewer-deep', 'alpha-sdlc:sdlc-reviewer-critic'];
const GROOMING_BASH = ['Bash(git add:*)', 'Bash(git commit:*)', 'Bash(git push:*)', 'Bash(git status:*)', 'Bash(date -u +%Y-%m-%dT%H:%M:%SZ)'];
const SCHEMA = JSON.stringify({ type: 'object', properties: { pluginVersion: { type: 'string' }, documents: { type: 'array' } } });

function git(directory, args) {
  const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${directory}: ${result.stderr}`);
  return result.stdout.trim();
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function clone(workspace, name, { origin, branch = `feat/${FEATURE}`, files = {} }) {
  const directory = path.join(workspace, name);
  fs.mkdirSync(directory, { recursive: true });
  git(directory, ['init', '-q', '-b', branch]);
  git(directory, ['remote', 'add', 'origin', origin]);
  for (const [relative, content] of Object.entries(files)) write(path.join(directory, relative), content);
  return directory;
}

const README = (rows) =>
  '# Platform grooming\n\n| | |\n|---|---|\n| **Feature** | platform-grooming |\n| **Hub repository** | github:amarbank/adp-backend |\n' +
  '| **Epic** | — |\n\n## Platforms\n\n| Platform | Repository | Subtree | TRD | Hub |\n|---|---|---|---|---|\n' +
  rows.map((row) => `| ${row.join(' | ')} |`).join('\n') + '\n\n## Requirements\n\n| Source | File | Version |\n|---|---|---|\n| file | requirements/prd.md | — |\n';

const PLATFORM_ROWS = [
  ['backend', 'github:amarbank/adp-backend', '—', 'TRD-backend.md', 'yes'],
  ['bridge', 'github:amarbank/adp-bridge', '—', 'TRD-bridge.md', '—'],
  ['web', 'github:amarbank/adp-web', 'apps/web', 'TRD-web.md', '—'],
];

let workspaceCount = 0;
function workspaceWith({ rows = PLATFORM_ROWS, bridge = {}, web = {}, skip = [] } = {}) {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(fixtureDirectory, `ws${++workspaceCount}-`)));
  const folder = `docs/development/${FEATURE}`;
  const hub = clone(workspace, 'adp-backend', {
    origin: 'git@github.com:amarbank/adp-backend.git',
    files: { [`${folder}/README.md`]: README(rows), [`${folder}/TRD.md`]: '# TRD (Hub)\n', [`${folder}/TRD-backend.md`]: '# TRD (Backend)\n' },
  });
  const clones = { hub };
  if (!skip.includes('bridge')) {
    clones.bridge = clone(workspace, 'adp-bridge', {
      origin: 'https://github.com/amarbank/adp-bridge.git',
      ...bridge,
      files: bridge.files || { [`${folder}/README.md`]: '# x\n', [`${folder}/TRD-bridge.md`]: '# TRD (Bridge)\n', 'cmd/main.go': 'package main\n' },
    });
  }
  if (!skip.includes('web')) {
    clones.web = clone(workspace, 'adp-web', {
      origin: 'ssh://git@github.com/amarbank/adp-web',
      ...web,
      files: web.files || { [`apps/web/${folder}/README.md`]: '# x\n', [`apps/web/${folder}/TRD-web.md`]: '# TRD (Web)\n', 'apps/web/src/a.ts': 'x\n' },
    });
  }
  clone(workspace, 'adp-other', { origin: 'git@github.com:amarbank/adp-other.git' });
  const plugins = path.join(workspace, '.claude-home', 'plugins');
  fs.mkdirSync(plugins, { recursive: true });
  return { workspace, plugins, clones, hubFolder: path.join(hub, folder) };
}

const denialOfTree = (directory) => `Edit(//${directory.replace(/^\//, '')}/**)`;
const spokeFolders = (setup) => [
  ...(setup.clones.bridge ? [[setup.clones.bridge, path.join(setup.clones.bridge, 'docs', 'development', FEATURE)]] : []),
  ...(setup.clones.web ? [[setup.clones.web, path.join(setup.clones.web, 'apps', 'web', 'docs', 'development', FEATURE)]] : []),
];

function guardSettings(guarded) {
  return JSON.stringify({
    hooks: {
      PreToolUse: [{
        matcher: 'Edit|Write|MultiEdit|NotebookEdit',
        hooks: guarded.map(([cloneDirectory, folders]) => ({
          type: 'command',
          command: `sh -c '"$0" guard-edit --clone "$1"${folders.map((_, index) => ` --allow "$${index + 2}"`).join('')} || exit 2' ` +
            `'/opt/adp/adp-bridge' '${cloneDirectory}' ${folders.map((folder) => `'${folder}'`).join(' ')}`,
        })),
      }],
    },
  });
}

function newBridgeArguments(setup, { allowed = [...GROOMING_BASH, ...REVIEWERS.map((name) => `Agent(${name})`)], guard = null } = {}) {
  const named = spokeFolders(setup);
  const denied = [
    denialOfTree(setup.plugins),
    denialOfTree(path.join(setup.workspace, 'adp-other')),
    ...(setup.clones.bridge ? [denialOfTree(path.join(setup.clones.bridge, 'cmd')), `Edit(//${path.join(setup.clones.bridge, 'docs', 'development').slice(1)}/README.md)`] : []),
    ...(setup.clones.web ? [denialOfTree(path.join(setup.clones.web, 'apps', 'web', 'src'))] : []),
  ];
  return [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk',
    '--allowedTools', allowed.join(','), '--disallowedTools', denied.join(','),
    '--add-dir', setup.plugins, '--add-dir', setup.workspace,
    '--json-schema', SCHEMA,
    '--settings', guardSettings(guard || named.map(([cloneDirectory, folder]) => [cloneDirectory, [folder]])),
  ];
}

function oldBridgeArguments(setup) {
  const neighbours = ['adp-bridge', 'adp-web', 'adp-other'].filter((name) => fs.existsSync(path.join(setup.workspace, name)))
    .map((name) => denialOfTree(path.join(setup.workspace, name)));
  return [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk',
    '--allowedTools', GROOMING_BASH.join(','), '--disallowedTools', [denialOfTree(setup.plugins), ...neighbours].join(','),
    '--add-dir', setup.plugins, '--add-dir', setup.workspace, '--json-schema', SCHEMA,
  ];
}

const FAKE_CLAUDE = path.join(fixtureDirectory, 'claude-run.js');
fs.writeFileSync(FAKE_CLAUDE,
  "const { spawnSync } = require('child_process');\n" +
  "const call = JSON.parse(process.env.REACH_CALL);\n" +
  "const result = spawnSync(process.execPath, call, { encoding: 'utf8' });\n" +
  "process.stdout.write(result.stdout || '');\n" +
  "process.stderr.write(result.stderr || '');\n" +
  'process.exit(result.status === null ? 3 : result.status);\n');

function underRun(claudeArguments, setup, reachArguments) {
  const result = spawnSync(process.execPath, [FAKE_CLAUDE, ...claudeArguments], {
    cwd: setup.clones.hub,
    encoding: 'utf8',
    env: environmentWith({ CLAUDE_PROJECT_DIR: null, REACH_CALL: JSON.stringify([REACH, setup.hubFolder, ...reachArguments]) }),
    timeout: 60000,
  });
  return { exitCode: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function expect(name, outcome, { exit, has = [], hasNot = [] }) {
  const problems = [];
  if (outcome.exitCode !== exit) problems.push(`exit ${outcome.exitCode}, expected ${exit}`);
  for (const pattern of has) if (!pattern.test(outcome.stdout)) problems.push(`stdout lacks ${pattern}`);
  for (const pattern of hasNot) if (pattern.test(outcome.stdout)) problems.push(`stdout has ${pattern}`);
  report('run-reach.js', name, problems.length === 0, [...problems, outcome.stdout, outcome.stderr]);
}

{
  const setup = workspaceWith();
  const direct = spawnSync(process.execPath, [REACH, setup.hubFolder, '--for', 'review'], {
    cwd: setup.clones.hub, encoding: 'utf8', env: environmentWith({ CLAUDE_PROJECT_DIR: null }),
  });
  expect('a terminal session is not a platform run, and nothing changes for it',
    { exitCode: direct.status, stdout: direct.stdout || '', stderr: direct.stderr || '' },
    { exit: 0, has: [/^reach: terminal — /m], hasNot: [/^cannot:/m] });

  expect('a hub run on a bridge with featureFolders and the reviewer rules reviews in the run',
    underRun(newBridgeArguments(setup), setup, ['--for', 'review']),
    { exit: 0, has: [/^reach: this run — the grooming review/m, /^spoke bridge: .*adp-bridge · docs\/development\/platform-grooming · writable · feat\/platform-grooming$/m,
      /^spoke web: .*adp-web · apps\/web\/docs\/development\/platform-grooming · writable · feat\/platform-grooming$/m,
      /^spoke backend: .*adp-backend · docs\/development\/platform-grooming · writable/m,
      /^reviewers: alpha-sdlc:sdlc-reviewer, alpha-sdlc:sdlc-reviewer-deep, alpha-sdlc:sdlc-reviewer-critic allowed$/m],
    hasNot: [/^cannot:/m, /^ask:/m] });

  expect('the same run re-walks the spokes of an Add a platform in the run',
    underRun(newBridgeArguments(setup), setup, ['--for', 'rewalk']),
    { exit: 0, has: [/^reach: this run — the spokes' re-walk/m], hasNot: [/^cannot:/m, /^reviewers:/m] });

  expect('a bridge without featureFolders falls back to a terminal, naming each spoke it cannot write',
    underRun(oldBridgeArguments(setup), setup, ['--for', 'review']),
    { exit: 1, has: [/^reach: a terminal — nothing is written in this run$/m,
      /^cannot: spoke bridge — .*adp-bridge\/docs\/development\/platform-grooming is not writable in this run \(denied by Edit\(\/\/.*adp-bridge\/\*\*\)\)$/m,
      /^cannot: spoke web — .* is not writable in this run/m] });

  expect('the same old bridge falls back for the re-walk too',
    underRun(oldBridgeArguments(setup), setup, ['--for', 'rewalk']), { exit: 1, has: [/^cannot: spoke bridge — /m] });

  const noAgents = newBridgeArguments(setup, { allowed: [...GROOMING_BASH, 'Agent(alpha-sdlc:sdlc-reviewer)'] });
  expect('a run without every reviewer rule falls back for the review, naming the missing rules',
    underRun(noAgents, setup, ['--for', 'review']),
    { exit: 1, has: [/^cannot: --allowedTools has no Agent\(alpha-sdlc:sdlc-reviewer-deep\) rule$/m,
      /^cannot: --allowedTools has no Agent\(alpha-sdlc:sdlc-reviewer-critic\) rule$/m],
    hasNot: [/no Agent\(alpha-sdlc:sdlc-reviewer\) rule/] });
  expect('a run without the reviewer rules still re-walks the spokes, which needs no reviewer',
    underRun(noAgents, setup, ['--for', 'rewalk']), { exit: 0, hasNot: [/^cannot:/m] });

  const deniedAgent = newBridgeArguments(setup);
  deniedAgent[deniedAgent.indexOf('--disallowedTools') + 1] += ',Agent(alpha-sdlc:sdlc-reviewer-critic)';
  expect('a reviewer the run denies falls back for the review',
    underRun(deniedAgent, setup, ['--for', 'review']), { exit: 1, has: [/^cannot: --disallowedTools denies Agent\(alpha-sdlc:sdlc-reviewer-critic\)$/m] });

  const flagLikeRule = newBridgeArguments(setup, { allowed: ['Bash(git show -p --verbose --add-dir HEAD)', ...GROOMING_BASH, ...REVIEWERS.map((name) => `Agent(${name})`)] });
  expect('a rule whose words look like the CLI\'s flags stays one rule',
    underRun(flagLikeRule, setup, ['--for', 'review']), { exit: 0, hasNot: [/^cannot:/m] });

  const bareAgent = newBridgeArguments(setup, { allowed: [...GROOMING_BASH, 'Agent'] });
  expect('a bare Agent rule allows every reviewer', underRun(bareAgent, setup, ['--for', 'review']), { exit: 0, hasNot: [/^cannot:/m] });

  const half = spokeFolders(setup).slice(0, 1).map(([cloneDirectory, folder]) => [cloneDirectory, [folder]]);
  const webGuardWithoutFolder = [...half, [setup.clones.web, [path.join(setup.clones.web, 'apps', 'web', 'docs', 'basics')]]];
  expect('a clone whose edit guard does not open its feature folder falls back',
    underRun(newBridgeArguments(setup, { guard: webGuardWithoutFolder }), setup, ['--for', 'review']),
    { exit: 1, has: [/^cannot: spoke web — .* is not writable in this run \(the edit guard of .*adp-web opens other folders\)$/m] });
}

{
  const setup = workspaceWith({ skip: ['web'] });
  expect('a spoke with no clone in the run\'s directories falls back, naming its repository',
    underRun(newBridgeArguments(setup), setup, ['--for', 'review']),
    { exit: 1, has: [/^cannot: spoke web — no clone of github:amarbank\/adp-web is in this run's directories$/m] });
}

{
  const setup = workspaceWith({ bridge: { branch: 'main' } });
  expect('a spoke clone on another branch is asked before anything is written, not a fallback',
    underRun(newBridgeArguments(setup), setup, ['--for', 'review']),
    { exit: 0, has: [/^ask: spoke bridge — .*adp-bridge is on main, not feat\/platform-grooming; nothing is written there before the member answers$/m],
      hasNot: [/^cannot:/m] });
}

{
  const setup = workspaceWith({ web: { files: { 'apps/web/src/a.ts': 'x\n' } } });
  expect('a spoke not groomed yet blocks the review, which reviews every spoke',
    underRun(newBridgeArguments(setup), setup, ['--for', 'review']),
    { exit: 1, has: [/^cannot: spoke web — TRD-web\.md is not in .*apps\/web\/docs\/development\/platform-grooming$/m] });
  expect('a spoke not groomed yet has nothing to re-walk and is skipped',
    underRun(newBridgeArguments(setup), setup, ['--for', 'rewalk']),
    { exit: 0, has: [/^spoke web: .* · no TRD-web\.md yet — nothing to re-walk$/m], hasNot: [/^cannot:/m] });
}

{
  const setup = workspaceWith();
  fs.rmSync(path.join(setup.hubFolder, 'README.md'));
  expect('a feature folder without the platform README is an input error',
    underRun(newBridgeArguments(setup), setup, ['--for', 'review']), { exit: 2 });
}

{
  const { pluginRoot } = require('../lib/harness');
  const read = (relative) => fs.readFileSync(path.join(pluginRoot, relative), 'utf8');
  const flat = (text) => text.replace(/\s+/g, ' ');
  const guide = flat(read('skills/do-grooming/grooming-run-schema.md'));
  const inRun = flat(read('skills/do-grooming/grooming-run-review.md'));
  const terminalFiles = ['skills/do-grooming/SKILL.md', 'skills/do-grooming/grooming-review.md', 'skills/do-grooming/hub.md', 'principles.md'];
  const check = (name, ok, detail) => report('guides', name, ok, detail);

  check('the terminal flow names no platform mechanism: SKILL.md, grooming-review.md, hub.md and principles.md never mention it',
    terminalFiles.every((file) => !/run-reach|grooming-run-review|featureFolders/.test(read(file))),
    terminalFiles.filter((file) => /run-reach|grooming-run-review|featureFolders/.test(read(file))).join(', '));
  check('only the grooming-run guide, read under a schema, points a session at the in-run review',
    /The grooming review of Step 5\*\* — once every spoke is self-reviewed, its close, a spoke's first review — writes every spoke's repository, so it runs in the hub's run only when `run-reach\.js` says that run reaches every spoke, by `grooming-run-review\.md`/.test(guide));
  check('the guide no longer says the grooming review runs in no platform run', !/runs in no platform run/.test(guide));
  check('a platform TRD run keeps no subagents and 30 minutes',
    /It has no subagents — save the hub's run/.test(guide) && /A platform TRD's run edits its own clone and the hub's feature folder and lasts 30 minutes/.test(guide) &&
    /A platform TRD's run never runs it/.test(guide) && /A platform TRD's run never does this work: it has no subagents, edits only its own clone and the hub's feature folder, and lasts 30 minutes/.test(inRun));
  check('the hub run names featureFolders and the two-hour cap',
    /a run on the hub's `TRD\.md` may also edit each spoke clone's feature folder \(the platform's `featureFolders`\) and lasts two hours/.test(guide) &&
    /may last two hours \(the platform's `maxDurationMs`, 7,200,000\)/.test(inRun));
  check('the in-run review checks its reach before anything is written, from the run\'s command line',
    /Before the packet, before `review ran`, before any spoke is opened for the re-walk, run `node <plugin root>\/scripts\/run-reach\.js/.test(inRun) &&
    /never an assumption/.test(inRun));
  check('the fallback writes nothing and says where the work runs',
    /Nothing of the work is written in the run, so nothing is left half-written/.test(inRun) && /a note \*Runs from a terminal\*/.test(inRun) &&
    /a note \*Spokes re-walk from a terminal\*/.test(inRun) && /step 5 pushes the hub's clone only/.test(inRun));
  check('the reviewers are the three plugin agents, launched read-only, their reports written by the run',
    ['alpha-sdlc:sdlc-reviewer`', 'alpha-sdlc:sdlc-reviewer-deep`', 'alpha-sdlc:sdlc-reviewer-critic`'].every((agent) => inRun.includes(agent)) &&
    /write nothing, return the report/.test(inRun) && /The run writes each returned report to the path the packet names/.test(inRun));
  check('the close stamps and commits per clone by explicit path, then asks before pushing each clone',
    /`git -C <clone> add` with each path, then `git -C <clone> commit` — never `-A` or `\.`/.test(inRun) &&
    /\*Push now\* pushes `feat\/<feature>` of the hub's clone, then of each spoke's clone/.test(inRun));
  check('the Add a platform re-walk restamps with amended in the run',
    /a ✅ stamp becomes `reviewed <its date> · hub rev <the hub commit> · amended <date>`/.test(inRun) &&
    /re-walked in this run when `run-reach\.js --for rewalk` says it reaches them, from a terminal when not/.test(guide));
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  check('the release that carries it is named in the guide, the manifest and the release notes',
    /need \*\*0\.44\.0\*\*/.test(guide) && version === '0.44.0' && read('README.md').includes('From 0.44.0'), version);
}

finish();
