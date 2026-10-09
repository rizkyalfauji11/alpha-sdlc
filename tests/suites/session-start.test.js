#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createSuite, pluginRoot, hooksDirectory } = require('../lib/harness');

const suite = createSuite('session-start');
const { fixtureDirectory, projectFixture, sdlcProject, run, runHook, report, finish } = suite;

const POINTER = 'inject-principles.js';
const GUIDE = 'inject-language-guide.js';
const COMPACT = 'inject-compact.js';
const SNAPSHOT = 'snapshot-stop.js';
const OUTPUT_LIMIT = 9000;
const POINTER_LIMIT = 600;
const NOTICE_LIMIT = 1500;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const GUIDE_TITLE = 'Panduan bahasa sederhana';
const GUIDE_TABLE = 'Jangan tulis';
const RESUME = 'Resume pending (';
const pluginData = path.join(fixtureDirectory, 'plugin-data');
const measuredOutputs = [];

function runSessionHook(hookFile, payload, environment) {
  const result = runHook(hookFile, payload, {
    env: { CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PLUGIN_DATA: pluginData, ...environment },
  });
  let context = '';
  if (result.stdout.trim()) {
    try {
      context = String(JSON.parse(result.stdout).hookSpecificOutput.additionalContext);
    } catch {
      context = 'UNPARSABLE OUTPUT: ' + result.stdout;
    }
    measuredOutputs.push({ hookFile, length: context.length, cwd: payload.cwd });
  }
  return { ...result, context };
}

function sessionStart(cwd, source, extra) {
  return { hook_event_name: 'SessionStart', source, cwd, session_id: 'session-now', ...extra };
}

const contextOf = (hookFile, cwd, source, extra, environment) =>
  runSessionHook(hookFile, sessionStart(cwd, source, extra), environment).context;

const jsonLine = (entry) => JSON.stringify(entry) + '\n';
const skillToolLine = (name) => jsonLine({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_skill', name: 'Skill', input: { skill: name, args: 'recipe-management web' } }] },
});
const commandLine = (name) => jsonLine({
  type: 'user',
  message: { role: 'user', content: `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>\n<command-args>recipe-management web</command-args>` },
});
const baseDirectoryLine = (directory) => jsonLine({
  type: 'user',
  isMeta: true,
  message: { role: 'user', content: [{ type: 'text', text: `Base directory for this skill: ${directory}\n\n# Skill body` }] },
});
const reattachmentLine = (directory) => jsonLine({
  type: 'attachment',
  attachment: { type: 'invoked_skills', skills: [{ name: 'alpha-sdlc:do-development', content: `Base directory for this skill: ${directory}\n\nbody` }] },
});
const textLine = (text) => jsonLine({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const decoyLines = () =>
  jsonLine({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_write', name: 'Write', input: {
      file_path: '/repo/notes.md',
      content: '{"skill":"alpha-sdlc:do-testing"}\n<command-name>/alpha-sdlc:do-testing</command-name>',
    } }] },
  }) +
  jsonLine({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_write',
      content: 'Base directory for this skill: /x/plugins/cache/alpha/alpha-sdlc/0.35.0/skills/do-testing' }] },
  }) +
  jsonLine({
    type: 'user',
    isCompactSummary: true,
    message: { role: 'user', content: 'This session continues an earlier one. The user ran <command-name>/alpha-sdlc:do-testing</command-name>.' },
  });

{
  const outsider = projectFixture('outside', {
    'src/app.js': 'module.exports = 1;\n',
    'transcript.jsonl': skillToolLine('alpha-sdlc:do-development'),
  });
  const transcriptPath = path.join(outsider, 'transcript.jsonl');
  for (const hookFile of [POINTER, GUIDE, COMPACT]) {
    const silent = ['startup', 'clear', 'resume', 'compact'].every((source) => {
      const { stdout, exitCode } = runSessionHook(hookFile, sessionStart(outsider, source, { transcript_path: transcriptPath }));
      return stdout === '' && exitCode === 0;
    });
    report(hookFile, 'prints nothing outside an SDLC project, on every source', silent);
  }
}

{
  const project = sdlcProject('pointer', {});
  const pointer = contextOf(POINTER, project, 'startup');
  report(POINTER, 'injects a pointer to the rule bundles inside an SDLC project',
    pointer.includes(path.join(pluginRoot, 'rules', '<bundle>.md')) && pointer.includes('principles.md'), pointer);
  report(POINTER, 'names what the hooks enforce',
    ['zero code comments', 'Approach/rung line', 'valid doc tables', 'Edit or Write'].every((phrase) => pointer.includes(phrase)), pointer);
  report(POINTER, 'keeps the pointer within 600 chars', pointer.length > 0 && pointer.length <= POINTER_LIMIT, `length ${pointer.length}`);
  report(POINTER, 'no longer injects the principles index',
    !pointer.includes('INDEX of the shared principles') && !pointer.includes('  · '), pointer);
  report(POINTER, 'injects the pointer after a compaction too', contextOf(POINTER, project, 'compact') === pointer);

  const stateOnly = projectFixture('state-only', { '.alpha-sdlc/auto-run.json': '{"status":"done"}' });
  report(POINTER, 'treats a directory holding only .alpha-sdlc as an SDLC project', contextOf(POINTER, stateOnly, 'startup') === pointer);

  const monorepo = sdlcProject('monorepo', { 'services/api/index.js': 'module.exports = 1;\n' });
  report(POINTER, 'injects the pointer from a subdirectory of an SDLC project',
    contextOf(POINTER, path.join(monorepo, 'services', 'api'), 'startup') === pointer);
}

{
  const idMirror = sdlcProject('id-mirror', { 'docs/basics/.alpha-sdlc.json': '{"plainLanguage":"id"}', 'src/index.js': '' });
  const idOverview = sdlcProject('id-overview', { 'docs/basics/01-overview.md': '| **Plain-language layer** | Bahasa Indonesia |\n' });
  const enMirror = sdlcProject('en-mirror', { 'docs/basics/.alpha-sdlc.json': '{"plainLanguage":"en"}' });
  const traversal = sdlcProject('traversal', { 'docs/basics/.alpha-sdlc.json': '{"plainLanguage":"../principles"}' });
  const noLanguage = sdlcProject('no-language', {});
  const workspace = projectFixture('workspace', {
    'adp-web/docs/basics/.alpha-sdlc.json': '{"plainLanguage":"id"}',
    'development-platform/docs/basics/.alpha-sdlc.json': '{"plainLanguage":"en"}',
    'notes/readme.md': 'workspace notes\n',
  });
  const conflicting = projectFixture('conflicting-workspace', {
    'adp-web/docs/basics/.alpha-sdlc.json': '{"plainLanguage":"id"}',
    'adp-ms/docs/basics/.alpha-sdlc.json': '{"plainLanguage":"ms"}',
  });
  const guidePath = path.join(pluginRoot, 'plain-language', 'id.md');
  const hasGuide = (context) => context.includes(GUIDE_TITLE) && context.includes(GUIDE_TABLE) && context.includes(guidePath);

  const fromMirror = contextOf(GUIDE, idMirror, 'startup');
  report(GUIDE, 'injects the Indonesian guide when the machine mirror says id',
    hasGuide(fromMirror) && fromMirror.includes('This project presents the plain layer'), fromMirror.slice(0, 400));
  report(GUIDE, 'injects the Indonesian guide from the overview row when the mirror has no key', hasGuide(contextOf(GUIDE, idOverview, 'startup')));
  report(GUIDE, 'injects the guide again after a compaction', hasGuide(contextOf(GUIDE, idMirror, 'compact')));
  report(GUIDE, 'injects the guide from a subdirectory of the project', hasGuide(contextOf(GUIDE, path.join(idMirror, 'src'), 'resume')));
  report(GUIDE, 'injects nothing for an English plain layer', contextOf(GUIDE, enMirror, 'startup') === '');
  report(GUIDE, 'injects nothing when the profile names no language', contextOf(GUIDE, noLanguage, 'startup') === '');
  report(GUIDE, 'ignores a plainLanguage value that is not a language code', contextOf(GUIDE, traversal, 'startup') === '');
  report(GUIDE, 'injects nothing when child repos name two different languages', contextOf(GUIDE, conflicting, 'startup') === '');

  const fromWorkspace = contextOf(GUIDE, workspace, 'startup');
  report(GUIDE, 'injects the guide in a workspace parent whose child repo sets id, naming that repo',
    hasGuide(fromWorkspace) && fromWorkspace.includes('In this workspace, adp-web presents') &&
      !fromWorkspace.includes('This project presents'),
    fromWorkspace.slice(0, 400));
  report(POINTER, 'injects the pointer in a workspace parent', contextOf(POINTER, workspace, 'startup').includes('rules'));
  report(POINTER, 'leaves the guide to the second hook',
    [idMirror, workspace].every((cwd) => !contextOf(POINTER, cwd, 'startup').includes(GUIDE_TITLE)));
}

function git(repository, ...args) {
  const result = spawnSync('git', [
    '-c', 'user.name=alpha-sdlc', '-c', 'user.email=alpha-sdlc@example.com', '-c', 'commit.gpgsign=false',
    '-c', 'init.defaultBranch=main', ...args,
  ], { cwd: repository, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

{
  const repository = projectFixture('resume-repository', { 'README.md': 'resume fixture\n' });
  git(repository, 'init', '-q');
  git(repository, 'commit', '-q', '--allow-empty', '--no-verify', '-m', 'base');
  const baseCommit = git(repository, 'rev-parse', 'HEAD');
  git(repository, 'checkout', '-q', '-b', 'side');
  git(repository, 'commit', '-q', '--allow-empty', '--no-verify', '-m', 'side');
  const sideCommit = git(repository, 'rev-parse', 'HEAD');
  git(repository, 'checkout', '-q', 'main');
  git(repository, 'commit', '-q', '--allow-empty', '--no-verify', '-m', 'second');
  const headCommit = git(repository, 'rev-parse', 'HEAD');
  const notARepository = projectFixture('not-a-repository', { 'README.md': 'plain\n' });

  const nextEntry = (overrides) => ({
    skill: 'alpha-sdlc:do-development',
    args: 'recipe-management web',
    unit: 'Stage 3',
    status: 'ready',
    at: new Date().toISOString(),
    head: headCommit,
    repo: repository,
    handoff: '.alpha-sdlc/handoff/recipe-management--web.md',
    ...overrides,
  });
  const resumeProject = (name, entries) => {
    const files = {};
    for (const [fileName, entry] of Object.entries(entries)) files[`.alpha-sdlc/next/${fileName}`] = JSON.stringify(entry);
    return sdlcProject('resume-' + name, files);
  };
  const noticeOf = (cwd, source, sessionId) =>
    contextOf(POINTER, cwd, source, sessionId ? { session_id: sessionId } : {});

  const fresh = resumeProject('fresh', { 'recipe-management--web.json': nextEntry() });
  const freshNotice = noticeOf(fresh, 'clear');
  report(POINTER, 'a fresh ready next-file at HEAD adds the resume notice on clear',
    freshNotice.includes(`${RESUME}recipe-management · web · Stage 3)`) &&
      freshNotice.includes("continues the work (e.g. 'lanjut'), invoke `alpha-sdlc:do-development` with `recipe-management web`") &&
      freshNotice.includes('read `.alpha-sdlc/handoff/recipe-management--web.md` first; otherwise do what the user asks.') &&
      !freshNotice.includes('unverified'),
    freshNotice);
  report(POINTER, 'the resume notice also appears on startup and on resume',
    noticeOf(fresh, 'startup').includes(RESUME) && noticeOf(fresh, 'resume').includes(RESUME));
  report(POINTER, 'a compaction gets the pointer without the resume notice', !noticeOf(fresh, 'compact').includes(RESUME));

  const ancestor = resumeProject('ancestor', { 'recipe-management--web.json': nextEntry({ head: baseCommit }) });
  const ancestorNotice = noticeOf(ancestor, 'clear');
  report(POINTER, 'a recorded commit that HEAD descends from still resumes',
    ancestorNotice.includes(RESUME) && !ancestorNotice.includes('unverified'), ancestorNotice);

  const diverged = resumeProject('diverged', { 'recipe-management--web.json': nextEntry({ head: sideCommit }) });
  report(POINTER, 'a recorded commit HEAD does not descend from is ignored', !noticeOf(diverged, 'clear').includes(RESUME));

  const stale = resumeProject('stale', { 'recipe-management--web.json': nextEntry({ at: new Date(Date.now() - 15 * DAY_MS).toISOString() }) });
  report(POINTER, 'a next-file older than 14 days is ignored', !noticeOf(stale, 'clear').includes(RESUME));

  const consumed = resumeProject('consumed', { 'recipe-management--web.json': nextEntry({ status: 'consumed' }) });
  report(POINTER, 'a consumed next-file is ignored', !noticeOf(consumed, 'clear').includes(RESUME));

  const unverified = resumeProject('unverified', { 'recipe-management--web.json': nextEntry({ repo: notARepository }) });
  const unverifiedNotice = noticeOf(unverified, 'clear');
  report(POINTER, 'when git cannot check the commit the notice still appears, marked unverified',
    unverifiedNotice.includes(RESUME) && unverifiedNotice.includes('unverified'), unverifiedNotice);

  const withoutHandoff = resumeProject('no-handoff', { 'recipe-management--android.json': nextEntry({ handoff: undefined, unit: 'B2' }) });
  const withoutHandoffNotice = noticeOf(withoutHandoff, 'clear');
  report(POINTER, 'a next-file without a handoff names the skill and arguments only',
    withoutHandoffNotice.includes(`${RESUME}recipe-management · android · B2)`) && !withoutHandoffNotice.includes('first;'),
    withoutHandoffNotice);

  const doubleDash = resumeProject('double-dash', { 'payments--v2--ios.json': nextEntry() });
  const doubleDashNotice = noticeOf(doubleDash, 'clear');
  report(POINTER, 'the platform is the part of the file name after the last double dash',
    doubleDashNotice.includes(`${RESUME}payments--v2 · ios · Stage 3)`), doubleDashNotice);

  const manyEntries = {};
  for (let index = 1; index <= 12; index++) {
    manyEntries[`feature-${index}--web.json`] = nextEntry({
      unit: `Stage ${index}`, at: new Date(Date.now() - index * HOUR_MS).toISOString(),
      args: `feature-${index} web --a-long-argument-list-that-fills-the-notice-budget-quickly`,
    });
  }
  const crowded = resumeProject('crowded', manyEntries);
  const crowdedContext = noticeOf(crowded, 'clear');
  const pointerOnly = noticeOf(crowded, 'compact');
  const beyondPointer = crowdedContext.length - pointerOnly.length;
  report(POINTER, 'many ready next-files stay within 1,500 chars beyond the pointer, newest first',
    beyondPointer <= NOTICE_LIMIT + 2 && crowdedContext.includes(`${RESUME}feature-1 · web · Stage 1)`) &&
      crowdedContext.includes('more ready next-files in'),
    `beyond the pointer: ${beyondPointer} chars`);

  const snapshotProject = sdlcProject('last-stop', {
    '.alpha-sdlc/handoff/last-stop/session-before.md': 'Stage 2 summary\n',
    '.alpha-sdlc/handoff/last-stop/session-older.md': 'Stage 1 summary\n',
    '.alpha-sdlc/handoff/last-stop/session-expired.md': 'Stage 0 summary\n',
    '.alpha-sdlc/handoff/last-stop/session-now.md': 'this session\n',
  });
  const lastStopDirectory = path.join(snapshotProject, '.alpha-sdlc', 'handoff', 'last-stop');
  const setAge = (name, ageMs) => {
    const when = new Date(Date.now() - ageMs);
    fs.utimesSync(path.join(lastStopDirectory, name), when, when);
  };
  setAge('session-before.md', 2 * HOUR_MS);
  setAge('session-older.md', 5 * HOUR_MS);
  setAge('session-expired.md', 25 * HOUR_MS);
  setAge('session-now.md', 60 * 1000);
  const lastStopNotice = noticeOf(snapshotProject, 'clear', 'session-now');
  report(POINTER, 'points to the newest last-stop summary of another session within 24 hours',
    lastStopNotice.includes(`The last step summary before the clear is saved at ${path.join(lastStopDirectory, 'session-before.md')}`) &&
      lastStopNotice.includes('read it if the user answers it') && !lastStopNotice.includes('session-now.md') &&
      !lastStopNotice.includes('session-older.md'),
    lastStopNotice);
  setAge('session-before.md', 30 * HOUR_MS);
  setAge('session-older.md', 26 * HOUR_MS);
  report(POINTER, 'ignores last-stop summaries older than 24 hours and its own session',
    !noticeOf(snapshotProject, 'clear', 'session-now').includes('last step summary'));
}

const GATES_DEVELOPMENT = '1. Stage start — STOP until the user approves the stage.\n2. Checkpoint — ⏸ wait for the verdict.';
const SKILL_DEVELOPMENT = [
  '---', 'name: do-development', 'description: build', '---', '',
  '# do-development', '',
  '**Read `../../rules/execute.md` in full now** (and `../../rules/ui.md` on a client platform).', '',
  '## Gates', '', GATES_DEVELOPMENT, '', '```text', '## a fenced line that is not a heading', '```', '',
  '## Flow', '', 'Flow body marker', '',
].join('\n');
const SKILL_PLANNING = '# do-planning\n\n## Gates\n\n- Breakdown approved — STOP for the user.\n\n## Flow\n\nPlanning flow marker\n';
const SKILL_TESTING = '# do-testing\n\n## Flow\n\nTesting flow marker\n';
const SKILL_FIXING = '# do-fixing\n\n## Gates\n\n' + '- Fix approved — STOP and wait for the user.\n'.repeat(300) + '\n## Flow\n';
const DIGEST = '- **Wait for the answer** — a question ends the turn · digest marker';
const APPLICABILITY = {
  bundles: {
    execute: { skills: ['do-development', 'do-testing', 'do-fixing'] },
    plan: { skills: ['do-planning'] },
    ui: { skills: [], readWhen: 'client platform: web, android, ios' },
  },
  rules: {},
};

{
  const fixturePlugin = projectFixture('plugin-root', {
    'rules/compact-digest.md': DIGEST + '\n',
    'rules/applicability.json': JSON.stringify(APPLICABILITY),
    'rules/execute.md': 'execute bundle\n',
    'rules/plan.md': 'plan bundle\n',
    'rules/ui.md': 'ui bundle\n',
    'skills/do-development/SKILL.md': SKILL_DEVELOPMENT,
    'skills/do-planning/SKILL.md': SKILL_PLANNING,
    'skills/do-testing/SKILL.md': SKILL_TESTING,
    'skills/do-fixing/SKILL.md': SKILL_FIXING,
  });
  const barePlugin = projectFixture('plugin-root-bare', { 'skills/do-development/SKILL.md': SKILL_DEVELOPMENT });
  const installedSkills = '/Users/someone/.claude/plugins/cache/alpha/alpha-sdlc/0.35.0/skills';
  let transcriptCount = 0;
  const compactRun = (transcript, options = {}) => {
    transcriptCount++;
    const project = options.project || sdlcProject(`compact-${transcriptCount}`, options.files || {});
    const transcriptPath = path.join(project, `transcript-${transcriptCount}.jsonl`);
    if (transcript !== null) fs.writeFileSync(transcriptPath, transcript);
    return runSessionHook(COMPACT, sessionStart(project, options.source || 'compact', { transcript_path: transcriptPath }),
      { CLAUDE_PLUGIN_ROOT: options.plugin || fixturePlugin }).context;
  };
  const rereadOf = (bundle) => 'Re-read `' + path.join(fixturePlugin, 'rules', bundle + '.md') + '`';

  const development = compactRun(textLine('hello') + skillToolLine('alpha-sdlc:do-development') + textLine('Stage 1 done.'));
  report(COMPACT, 'a Skill call in the transcript brings back the digest and that skill\'s gates',
    development.includes('the active skill is `alpha-sdlc:do-development`') && development.includes(DIGEST) &&
      development.includes(GATES_DEVELOPMENT) && development.includes('## a fenced line that is not a heading') &&
      !development.includes('Flow body marker'),
    development);
  report(COMPACT, 'ends with the bundle to re-read, with the UI bundle the skill names',
    development.includes(rereadOf('execute')) &&
      development.includes('(and `' + path.join(fixturePlugin, 'rules', 'ui.md') + '` when client platform: web, android, ios)') &&
      development.trimEnd().endsWith('and the reference file of your current step before the next gate.'),
    development);

  const planning = compactRun(commandLine('alpha-sdlc:do-planning') + textLine('Stage list drafted.'));
  report(COMPACT, 'a slash command invocation is found',
    planning.includes('`alpha-sdlc:do-planning`') && planning.includes('Breakdown approved — STOP for the user.') &&
      planning.includes(rereadOf('plan')) && !planning.includes('ui.md'),
    planning);

  const installed = compactRun(baseDirectoryLine(`${installedSkills}/do-development`) + textLine('working'));
  report(COMPACT, 'a skill base directory of an installed version is found', installed.includes('`alpha-sdlc:do-development`'), installed);

  const local = compactRun(baseDirectoryLine(path.join(fixturePlugin, 'skills', 'do-planning')) + textLine('working'));
  report(COMPACT, 'a skill base directory under the plugin root is found', local.includes('`alpha-sdlc:do-planning`'), local);

  const checkout = compactRun(baseDirectoryLine('/Users/someone/src/alpha-sdlc/skills/do-planning') + textLine('working'));
  report(COMPACT, 'a skill base directory of an unversioned checkout is found', checkout.includes('`alpha-sdlc:do-planning`'), checkout);

  const foreign = compactRun(baseDirectoryLine('/Users/someone/.claude/plugins/cache/tools/superpowers/5.0.0/skills/brainstorming'));
  report(COMPACT, 'a skill base directory of another plugin is not an alpha-sdlc invocation', foreign === '', foreign);

  const latest = compactRun(commandLine('alpha-sdlc:do-planning') + textLine('plan done') + skillToolLine('alpha-sdlc:do-development'));
  report(COMPACT, 'the latest invocation is the active skill', latest.includes('`alpha-sdlc:do-development`'), latest);

  const reattached = compactRun(commandLine('alpha-sdlc:do-planning') + reattachmentLine(`${installedSkills}/do-development`));
  report(COMPACT, 'a skill re-attached after an earlier compaction is not an invocation',
    reattached.includes('`alpha-sdlc:do-planning`'), reattached);

  const decoyed = compactRun(skillToolLine('alpha-sdlc:do-development') + decoyLines());
  report(COMPACT, 'skill names inside tool inputs and tool results are not invocations',
    decoyed.includes('`alpha-sdlc:do-development`'), decoyed);

  report(COMPACT, 'a transcript with no alpha-sdlc skill injects nothing',
    compactRun(skillToolLine('superpowers:brainstorming') + textLine('ideas')) === '');
  report(COMPACT, 'a source other than compact injects nothing',
    compactRun(skillToolLine('alpha-sdlc:do-development'), { source: 'startup' }) === '');
  report(COMPACT, 'a missing transcript injects nothing', compactRun(null) === '');

  const bare = compactRun(skillToolLine('alpha-sdlc:do-development'), { plugin: barePlugin });
  report(COMPACT, 'without a digest or applicability file it injects the gates and points at principles.md',
    bare.includes(GATES_DEVELOPMENT) && !bare.includes(DIGEST) &&
      bare.includes('Re-read `' + path.join(barePlugin, 'principles.md') + '`'),
    bare);

  const noGates = compactRun(skillToolLine('alpha-sdlc:do-testing'));
  report(COMPACT, 'a skill without a Gates section still gets the digest and the bundle to re-read',
    noGates.includes(DIGEST) && !noGates.includes('Gates of') && noGates.includes(rereadOf('execute')) &&
      !noGates.includes('Testing flow marker'),
    noGates);

  const oversized = compactRun(skillToolLine('alpha-sdlc:do-fixing'));
  report(COMPACT, 'an oversized gate card is cut to 9,000 chars and keeps the re-read line',
    oversized.length <= OUTPUT_LIMIT && oversized.includes('cut to fit the hook output limit') &&
      oversized.trimEnd().endsWith('before the next gate.'),
    `length ${oversized.length}`);

  const filler = textLine('Langkah berikutnya: ' + 'é✅ '.repeat(2000)).repeat(280);
  const deep = compactRun(skillToolLine('alpha-sdlc:do-development') + filler);
  report(COMPACT, 'an invocation several megabytes back is found across read chunks',
    Buffer.byteLength(filler) > 3 * 1024 * 1024 && deep.includes('`alpha-sdlc:do-development`'), `filler ${Buffer.byteLength(filler)} bytes`);

  const autoRun = compactRun(skillToolLine('alpha-sdlc:do-development'), {
    files: { '.alpha-sdlc/auto-run.json': JSON.stringify({ status: 'running', feature: 'recipe-management', platform: 'web', until: 're-test green' }) },
  });
  report(COMPACT, 'a running auto-run chain is named, with the rule that decides its stops',
    autoRun.includes('Auto-run is running for recipe-management · web (until: re-test green): continue the chain') &&
      autoRun.includes('stop only where the auto-run rule allows'),
    autoRun);

  const unitChain = compactRun(skillToolLine('alpha-sdlc:do-development'), {
    files: { '.alpha-sdlc/auto-run.json': JSON.stringify({ status: 'running', feature: 'recipe-management', platform: 'web', scope: 'unit' }) },
  });
  report(COMPACT, 'a unit-scope chain is named with its scope', unitChain.includes('Auto-run is running for recipe-management · web (scope: unit)'), unitChain);

  const handedOff = compactRun(skillToolLine('alpha-sdlc:do-development'), {
    files: { '.alpha-sdlc/auto-run.json': JSON.stringify({ status: 'handoff', scope: 'unit' }) },
  });
  report(COMPACT, 'a chain that is not running is not mentioned', handedOff.includes(DIGEST) && !handedOff.includes('Auto-run'), handedOff);

  const outsideProject = projectFixture('compact-outside', {});
  report(COMPACT, 'an alpha-sdlc invocation outside an SDLC project injects nothing',
    compactRun(skillToolLine('alpha-sdlc:do-development'), { project: outsideProject }) === '');
}

{
  const STEP_SUMMARY = '`recipe-management` · Development (web) · Stage 2 of 4 · ⏸\n\n' +
    '**Bottom line:** stage 2 is ready for your review.\n\n**Next:** I wait for your verdict.';
  const LABELS_ONLY = 'Ringkasan.\n\n**Intinya:** tahap 2 siap direview.\n\n**Selanjutnya:** saya menunggu jawaban Anda.';
  const HEADING_ONLY = 'Done.\n\n## Why it matters\n\nThe plan now matches the TRD.';
  const CHAT = 'Sure. The function returns the list sorted by date, newest first.';
  const stop = (cwd, message, sessionId) => runHook(SNAPSHOT, {
    hook_event_name: 'Stop', cwd, session_id: sessionId, last_assistant_message: message, stop_hook_active: false,
  });
  const snapshotPath = (cwd, sessionId) => path.join(cwd, '.alpha-sdlc', 'handoff', 'last-stop', `${sessionId}.md`);
  const readOrNull = (filePath) => { try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; } };

  const project = sdlcProject('snapshot', {});
  const saved = stop(project, STEP_SUMMARY, 'session-a');
  report(SNAPSHOT, 'saves a step summary to the last-stop file of its session, without blocking',
    readOrNull(snapshotPath(project, 'session-a')) === STEP_SUMMARY + '\n' && saved.exitCode === 0 && saved.stdout === '',
    `exit ${saved.exitCode}, stdout ${saved.stdout}`);
  report(SNAPSHOT, 'keeps the state directory out of git',
    readOrNull(path.join(project, '.alpha-sdlc', '.gitignore')) === '*\n');

  stop(project, LABELS_ONLY, 'session-b');
  report(SNAPSHOT, 'recognises a summary by its bold labels alone', readOrNull(snapshotPath(project, 'session-b')) === LABELS_ONLY + '\n');
  stop(project, HEADING_ONLY, 'session-c');
  report(SNAPSHOT, 'recognises a summary by a section heading', readOrNull(snapshotPath(project, 'session-c')) === HEADING_ONLY + '\n');
  const PLAIN_LABEL = 'Bottom line: stage 2 is ready for your review.\n\nNext: I wait for your verdict.';
  stop(project, PLAIN_LABEL, 'session-e');
  report(SNAPSHOT, 'uses the Stop judge\'s marker test, so an unbolded section label counts too',
    readOrNull(snapshotPath(project, 'session-e')) === PLAIN_LABEL + '\n');
  const chat = stop(project, CHAT, 'session-d');
  report(SNAPSHOT, 'ignores an ordinary chat message',
    readOrNull(snapshotPath(project, 'session-d')) === null && chat.exitCode === 0 && chat.stdout === '');
  stop(project, STEP_SUMMARY.replace('Stage 2', 'Stage 3'), 'session-a');
  report(SNAPSHOT, 'overwrites the session file with its latest summary',
    (readOrNull(snapshotPath(project, 'session-a')) || '').includes('Stage 3 of 4'));
  stop(project, STEP_SUMMARY, '../../escape');
  report(SNAPSHOT, 'keeps a hostile session id inside the last-stop directory',
    readOrNull(snapshotPath(project, 'escape')) === STEP_SUMMARY + '\n' && !fs.existsSync(path.join(project, 'escape.md')));

  const outsider = projectFixture('snapshot-outside', {});
  stop(outsider, STEP_SUMMARY, 'session-a');
  report(SNAPSHOT, 'writes nothing outside an SDLC project', !fs.existsSync(path.join(outsider, '.alpha-sdlc')));

  const pruning = sdlcProject('snapshot-prune', {
    '.alpha-sdlc/handoff/last-stop/expired.md': 'old\n',
    '.alpha-sdlc/handoff/last-stop/recent.md': 'recent\n',
  });
  const expiredAt = new Date(Date.now() - 15 * DAY_MS);
  const recentAt = new Date(Date.now() - 2 * DAY_MS);
  fs.utimesSync(path.join(pruning, '.alpha-sdlc/handoff/last-stop/expired.md'), expiredAt, expiredAt);
  fs.utimesSync(path.join(pruning, '.alpha-sdlc/handoff/last-stop/recent.md'), recentAt, recentAt);
  stop(pruning, STEP_SUMMARY, 'session-a');
  report(SNAPSHOT, 'prunes last-stop files older than 14 days',
    !fs.existsSync(path.join(pruning, '.alpha-sdlc/handoff/last-stop/expired.md')) &&
      fs.existsSync(path.join(pruning, '.alpha-sdlc/handoff/last-stop/recent.md')));

  const garbage = run(path.join(hooksDirectory, SNAPSHOT), [], { input: 'not json', cwd: outsider });
  report(SNAPSHOT, 'fails open on unreadable input', garbage.exitCode === 0 && garbage.stdout === '', garbage.stderr);

  const roundTrip = contextOf(POINTER, project, 'clear', { session_id: 'session-new' });
  report(POINTER, 'the next session after a clear is pointed to the saved summary',
    roundTrip.includes('The last step summary before the clear is saved at ' + path.join(project, '.alpha-sdlc', 'handoff', 'last-stop')),
    roundTrip);

  const drifted = sdlcProject('snapshot-drift', { 'docs/development/feat/TRD.md': '# TRD\n' });
  const featureDirectory = path.join(drifted, 'docs', 'development', 'feat');
  stop(featureDirectory, STEP_SUMMARY, 'session-drift');
  report(SNAPSHOT, 'a stop while the shell sits inside docs/ saves the summary at the project, never inside docs',
    readOrNull(snapshotPath(drifted, 'session-drift')) === STEP_SUMMARY + '\n' && !fs.existsSync(path.join(featureDirectory, '.alpha-sdlc')) &&
      !fs.existsSync(path.join(drifted, 'docs', '.alpha-sdlc')));

  const workspace = projectFixture('snapshot-workspace', {});
  const child = sdlcProject(path.join('snapshot-workspace', 'adp-web'), { 'docs/development/feat/TRD.md': '# TRD\n' });
  const launched = { CLAUDE_PROJECT_DIR: workspace };
  runHook(SNAPSHOT, {
    hook_event_name: 'Stop', cwd: path.join(child, 'docs', 'development', 'feat'), session_id: 'session-ws',
    last_assistant_message: STEP_SUMMARY, stop_hook_active: false,
  }, { env: launched });
  report(SNAPSHOT, 'a stop saves the summary in the directory the session started in, wherever the shell has moved',
    readOrNull(snapshotPath(workspace, 'session-ws')) === STEP_SUMMARY + '\n' && !fs.existsSync(path.join(child, '.alpha-sdlc')));
  const afterClear = contextOf(POINTER, child, 'clear', { session_id: 'session-after' }, launched);
  report(POINTER, 'a session whose shell moved into a child repo is still pointed to the summary saved at the start directory',
    afterClear.includes('The last step summary before the clear is saved at ' + snapshotPath(workspace, 'session-ws')), afterClear);

  const unlaunched = projectFixture('snapshot-unlaunched', {});
  const unlaunchedChild = sdlcProject(path.join('snapshot-unlaunched', 'adp-web'), {});
  stop(unlaunchedChild, STEP_SUMMARY, 'session-child');
  const fromParent = contextOf(POINTER, unlaunched, 'clear', { session_id: 'session-parent' });
  report(POINTER, 'a workspace-parent session finds a summary its child repo holds',
    fromParent.includes('The last step summary before the clear is saved at ' + snapshotPath(unlaunchedChild, 'session-child')), fromParent);

  const rewritten = sdlcProject('snapshot-rewrite', {});
  const original = STEP_SUMMARY + '\n\n**Details (for engineers):** `src/list.ts:42` drops the page cursor.';
  stop(rewritten, original, 'session-r');
  runHook(SNAPSHOT, {
    hook_event_name: 'Stop', cwd: rewritten, session_id: 'session-r', stop_hook_active: true,
    last_assistant_message: STEP_SUMMARY.replace('stage 2 is ready', 'stage 2 is ready to look at') + '\n\nThe engineer details above are unchanged.',
  });
  report(SNAPSHOT, 'a judge rewrite of the same step keeps the full summary saved before it',
    readOrNull(snapshotPath(rewritten, 'session-r')) === original + '\n');
  runHook(SNAPSHOT, {
    hook_event_name: 'Stop', cwd: rewritten, session_id: 'session-r', stop_hook_active: true,
    last_assistant_message: STEP_SUMMARY.replace('Stage 2 of 4', 'Stage 3 of 4'),
  });
  report(SNAPSHOT, 'a pushed stop that reports the next step still overwrites the saved summary',
    (readOrNull(snapshotPath(rewritten, 'session-r')) || '').includes('Stage 3 of 4'));
}

{
  const workspace = projectFixture('resume-workspace', {});
  const child = sdlcProject(path.join('resume-workspace', 'adp-web'), {});
  fs.mkdirSync(path.join(workspace, '.alpha-sdlc', 'next'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.alpha-sdlc', 'next', 'feat--web.json'), JSON.stringify({
    skill: 'alpha-sdlc:do-development', args: 'feat web', unit: 'Stage 3', status: 'ready', at: new Date().toISOString(), repo: 'adp-web',
  }));
  const notice = contextOf(POINTER, child, 'clear', { session_id: 'session-moved' }, { CLAUDE_PROJECT_DIR: workspace });
  report(POINTER, 'a next-file written at the start directory is found while the shell sits in a child repo',
    notice.includes(RESUME + 'feat · web · Stage 3') && notice.includes('invoke `alpha-sdlc:do-development` with `feat web`'), notice);
}

{
  const garbageOutputs = [POINTER, GUIDE, COMPACT].map((hookFile) =>
    run(path.join(hooksDirectory, hookFile), [], { input: '{not json', cwd: projectFixture('garbage-input', {}) }));
  report('session-start', 'every SessionStart hook fails open on unreadable input',
    garbageOutputs.every((result) => result.exitCode === 0 && result.stdout === ''),
    garbageOutputs.map((result) => `exit ${result.exitCode} ${result.stdout}`));
}

{
  const hooks = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const commandsOf = (event, matcher) => (hooks[event] || [])
    .filter((group) => (group.matcher || '') === matcher)
    .flatMap((group) => group.hooks.map((hook) => hook.command));
  const runs = (event, matcher, file) => commandsOf(event, matcher).includes(`node "\${CLAUDE_PLUGIN_ROOT}/hooks/${file}"`);
  report('hooks.json', 'SessionStart runs the pointer and the language guide on every source',
    runs('SessionStart', '', POINTER) && runs('SessionStart', '', GUIDE));
  report('hooks.json', 'SessionStart with matcher compact runs the compact digest', runs('SessionStart', 'compact', COMPACT));
  report('hooks.json', 'Stop runs the snapshot', runs('Stop', '', SNAPSHOT));
}

{
  const oversized = measuredOutputs.filter((output) => output.length > OUTPUT_LIMIT);
  const longest = Math.max(0, ...measuredOutputs.map((output) => output.length));
  report('session-start', `every SessionStart output stays within 9,000 chars (${measuredOutputs.length} measured, longest ${longest})`,
    measuredOutputs.length > 0 && oversized.length === 0,
    oversized.map((output) => `${output.hookFile} ${output.length} chars in ${output.cwd}`));
}

finish();
