#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hooksDirectory = path.join(__dirname, '..', 'hooks');
const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-sdlc-hooks-'));

function runHook(hookFile, payload) {
  const result = spawnSync(process.execPath, [path.join(hooksDirectory, hookFile)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return { exitCode: result.status, stderr: result.stderr || '' };
}

function writePayload(filePath, content) {
  return { tool_name: 'Write', tool_input: { file_path: filePath, content } };
}

function editPayload(filePath, oldString, newString) {
  return { tool_name: 'Edit', tool_input: { file_path: filePath, old_string: oldString, new_string: newString } };
}

function fixture(name, content) {
  const filePath = path.join(fixtureDirectory, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

const cases = [];
const blocks = (hook, name, payload) => cases.push({ hook, name, payload, expected: 2 });
const passes = (hook, name, payload) => cases.push({ hook, name, payload, expected: 0 });

const COMMENTS = 'validate-comments.js';

blocks(COMMENTS, 'a plain line comment', writePayload('/tmp/a.ts', '// explain this\nconst x = 1;\n'));
blocks(COMMENTS, 'a block comment', writePayload('/tmp/a.ts', '/* explain this */\nconst x = 1;\n'));
blocks(COMMENTS, 'a doc comment', writePayload('/tmp/a.ts', '/** what it does */\nexport const x = 1;\n'));
blocks(COMMENTS, 'a hash comment in python', writePayload('/tmp/a.py', '# explain this\nx = 1\n'));
blocks(COMMENTS, 'a python docstring', writePayload('/tmp/a.py', 'def f():\n    """what it does"""\n    return 1\n'));
blocks(COMMENTS, 'a comment after real code', writePayload('/tmp/a.ts', 'const x = 1; // per item\n'));
blocks(
  COMMENTS,
  'a comment on a continuation line that opens with a division slash',
  writePayload('/tmp/a.ts', 'const r = a\n  / count; // per item\n'),
);

passes(COMMENTS, 'a url inside a double-quoted string', writePayload('/tmp/a.ts', 'const s = "https://x.com/a";\n'));
passes(COMMENTS, 'a regex literal containing slashes', writePayload('/tmp/a.ts', 'const re = /a\\/\\/b/;\n'));
passes(COMMENTS, 'a machine directive', writePayload('/tmp/a.ts', '// eslint-disable-next-line\nconst x = 1;\n'));
passes(COMMENTS, 'a shebang', writePayload('/tmp/a.sh', '#!/usr/bin/env bash\necho hi\n'));
passes(COMMENTS, 'a file with no comments at all', writePayload('/tmp/a.ts', 'const x = 1;\nexport default x;\n'));
passes(
  COMMENTS,
  'a bare url on a continuation line of a template literal',
  writePayload('/tmp/a.ts', 'const s = `\n  see https://x.com/a\n`;\n'),
);
passes(
  COMMENTS,
  'comment-shaped text on a continuation line of a template literal',
  writePayload('/tmp/a.ts', 'const s = `\n  // sample line for the docs\n`;\n'),
);
passes(
  COMMENTS,
  'hash-shaped data inside a shell heredoc',
  writePayload('/tmp/a.sh', 'cat <<EOF\n# server config data\nEOF\n'),
);
passes(
  COMMENTS,
  'a template literal spanning lines then real code after it',
  writePayload('/tmp/a.ts', 'const s = `\n  plain text\n`;\nconst y = 2;\n'),
);

const RUNG = 'validate-rung.js';

blocks(
  RUNG,
  'a TRD whose Approach field is still a placeholder',
  writePayload('/repo/docs/development/f/TRD-web.md', '## 1\n\n**Approach (ladder rung):** <rung>\n'),
);
blocks(
  RUNG,
  'a plan stage with no Approach field',
  writePayload('/repo/docs/development/f/plan-web.md', '### Stage 1 — [domain] do the thing\n\n- **Goal:** x\n'),
);
passes(
  RUNG,
  'a TRD whose Approach names a rung',
  writePayload('/repo/docs/development/f/TRD-web.md', '## 1\n\n**Approach (ladder rung):** rung 2 (reuse) — existing client\n'),
);
passes(RUNG, 'a plugin template is exempt', writePayload('/repo/skills/do-grooming/TRD-spoke-template.md', '**Approach:** <rung>\n'));
passes(RUNG, 'an unrelated markdown file', writePayload('/repo/notes.md', '**Approach:** <rung>\n'));

const SECRETS = 'validate-no-secrets.js';

blocks(
  SECRETS,
  'an aws key in a profile doc',
  writePayload('/repo/docs/basics/09-environment.md', 'key: AKIAIOSFODNN7EXAMPLE\n'),
);
passes(
  SECRETS,
  'a named env var with no value',
  writePayload('/repo/docs/basics/09-environment.md', '| `AWS_ACCESS_KEY_ID` | from the vault |\n'),
);
passes(SECRETS, 'a source file is out of scope', writePayload('/repo/src/a.ts', 'const k = "AKIAIOSFODNN7EXAMPLE";\n'));

const TABLES = 'validate-doc-tables.js';
const goodTable = '# T\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n';

blocks(
  TABLES,
  'a body row with more cells than its header',
  writePayload('/repo/docs/x.md', '# T\n\n| A | B |\n|---|---|\n| 1 | 2 | 3 |\n'),
);
blocks(
  TABLES,
  'a body row with fewer cells than its header',
  writePayload('/repo/docs/x.md', '# T\n\n| A | B | C |\n|---|---|---|\n| 1 | 2 |\n'),
);
blocks(
  TABLES,
  'a header whose cell count differs from its delimiter row',
  writePayload('/repo/docs/x.md', '# T\n\n| A | B | C |\n|---|---|\n| 1 | 2 | 3 |\n'),
);
blocks(
  TABLES,
  'a row orphaned from its table by prose',
  writePayload('/repo/docs/x.md', '# T\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nprose\n\n| 3 | 4 |\n'),
);
blocks(
  TABLES,
  'a row omitting its trailing pipe while carrying a surplus cell',
  writePayload('/repo/docs/x.md', '# T\n\n| A | B |\n|---|---|\n| 1 | 2 | 3\n'),
);
blocks(
  TABLES,
  'an unclosed code fence',
  writePayload('/repo/docs/x.md', '# T\n\n```js\nconst x = 1;\n'),
);
passes(TABLES, 'a correct table', writePayload('/repo/docs/x.md', goodTable));
passes(
  TABLES,
  'a pipe table inside a fenced code block',
  writePayload('/repo/docs/x.md', '# T\n\n```\n| A | B |\n| 1 |\n```\n'),
);
passes(
  TABLES,
  'a table indented two spaces',
  writePayload('/repo/docs/x.md', '# T\n\n  | A | B |\n  |---|---|\n  | 1 | 2 |\n'),
);
passes(
  TABLES,
  'an escaped pipe inside a cell',
  writePayload('/repo/docs/x.md', '# T\n\n| A | B |\n|---|---|\n| a \\| b | 2 |\n'),
);

const tableFixture = fixture('docs/edit.md', goodTable);
blocks(
  TABLES,
  'an Edit whose new row breaks the on-disk header',
  editPayload(tableFixture, '| 3 | 4 |', '| 3 | 4 | 5 |'),
);
blocks(
  TABLES,
  'an Edit that deletes the delimiter row',
  editPayload(tableFixture, '|---|---|\n', ''),
);
blocks(
  TABLES,
  'an Edit that replaces the delimiter row with prose',
  editPayload(tableFixture, '|---|---|', 'TODO fill in'),
);

const debtFixture = fixture('docs/debt.md', '# T\n\n| A | B |\n|---|---|\n| 1 | 2 | 3 |\n\nprose\n\n| C | D |\n|---|---|\n| 9 | 8 |\n');
passes(
  TABLES,
  'a correct Edit landing in a file with a pre-existing break elsewhere',
  editPayload(debtFixture, '| 9 | 8 |', '| 9 | 7 |'),
);

const fenceFixture = fixture('docs/fence.md', '# T\n\n```js\nconst x = 1;\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');
blocks(
  TABLES,
  'an Edit that deletes a closing fence outside the edited region',
  editPayload(fenceFixture, 'const x = 1;\n```\n', 'const x = 1;\n'),
);

const BASH_DOCS = 'validate-bash-doc-writes.js';
const bashPayload = (command, cwd) => ({ tool_name: 'Bash', cwd: cwd || '/repo', tool_input: { command } });

blocks(BASH_DOCS, 'a heredoc redirect into a TRD', bashPayload("cat > docs/development/x/TRD.md <<'EOF'\nhi\nEOF"));
blocks(BASH_DOCS, 'an append redirect into an absolute docs path', bashPayload('echo x >> /abs/repo/docs/development/f/TRD.md'));
blocks(BASH_DOCS, 'sed -i on a profile doc', bashPayload("sed -i '' 's/a/b/' docs/basics/07-database.md"));
blocks(BASH_DOCS, 'perl -pi on a profile doc', bashPayload("perl -pi -e 's/a/b/' docs/basics/16-feature-map.md"));
blocks(BASH_DOCS, 'tee into a doc', bashPayload('printf x | tee docs/basics/a.md'));
blocks(BASH_DOCS, 'a python heredoc that writes the hub', bashPayload("python3 - <<'PY'\nfrom pathlib import Path\nPath('docs/development/run-terminal/TRD.md').write_text('x')\nPY"));
blocks(BASH_DOCS, 'a copy from scratch onto a profile doc', bashPayload('cp "/tmp/scratch/02-architecture.md" docs/basics/02-architecture.md'));
blocks(BASH_DOCS, 'a relative write after cd into a docs directory', bashPayload("cd /repo/docs/development/feature && cat >> TRD.md <<'EOF'\n## 2\nEOF"));
blocks(BASH_DOCS, 'a relative write when the session cwd is inside docs', bashPayload('echo x >> TRD-web.md', '/repo/docs/development/feature'));

passes(BASH_DOCS, 'reading a doc with cat', bashPayload('cat docs/development/x/TRD.md'));
passes(BASH_DOCS, 'grepping profile docs', bashPayload('grep -n foo docs/basics/*.md'));
passes(BASH_DOCS, 'copying a doc out to scratch', bashPayload('cp docs/basics/07-database.md /tmp/scratch/before.md'));
passes(BASH_DOCS, 'git checkout of a doc', bashPayload('git checkout -- docs/development/x/TRD.md'));
passes(BASH_DOCS, 'git add and commit of a doc', bashPayload('git add docs/development/x/TRD.md && git commit -m "docs: x"'));
passes(BASH_DOCS, 'a python read of a doc', bashPayload(`python3 -c "print(open('docs/a.md').read())"`));
passes(BASH_DOCS, 'a write outside docs', bashPayload('echo hi > /tmp/out.txt'));
passes(BASH_DOCS, 'a write to scratch that only reads docs', bashPayload("cat docs/basics/01-overview.md > /tmp/scratch/copy.md"));

const AUTO_RUN = 'continue-auto-run.js';
function autoRunPayload(name, marker, transcript) {
  const files = {};
  if (marker !== undefined) files['.alpha-sdlc/auto-run.json'] = typeof marker === 'string' ? marker : JSON.stringify(marker);
  if (transcript !== undefined) files['transcript.jsonl'] = transcript;
  const projectRoot = projectFixture('auto-run-' + name, files);
  return { hook_event_name: 'Stop', cwd: projectRoot, transcript_path: path.join(projectRoot, 'transcript.jsonl') };
}
const TOOL_LINE = '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Edit"}]}}\n';
const TEXT_LINE = '{"type":"assistant","message":{"content":[{"type":"text","text":"Stage 4 done."}]}}\n';

passes(AUTO_RUN, 'no marker lets the session stop', autoRunPayload('none'));
blocks(AUTO_RUN, 'a running chain blocks its first stop', autoRunPayload('first', { feature: 'f', platform: 'web', status: 'running' }, TEXT_LINE));
passes(AUTO_RUN, 'a halted chain lets the session stop', autoRunPayload('halted', { status: 'halted', reason: 'no design' }, TEXT_LINE));
blocks(AUTO_RUN, 'a halted chain with no reason recorded is sent back once for one',
  autoRunPayload('halted-silent', { status: 'halted' }, TEXT_LINE + TOOL_LINE));
passes(AUTO_RUN, 'a halted chain whose reason sits under another reason key is accepted',
  autoRunPayload('halted-other-key', { status: 'halted', haltedReason: 'daemon not installed' }, TEXT_LINE));
passes(AUTO_RUN, 'a finished chain lets the session stop', autoRunPayload('done', { status: 'done' }, TEXT_LINE));
passes(AUTO_RUN, 'an unreadable marker fails open', autoRunPayload('broken', '{not json', TEXT_LINE));
blocks(AUTO_RUN, 'a running chain that used a tool since the last push blocks again',
  autoRunPayload('progress', { status: 'running', lastBlock: { transcriptSize: TEXT_LINE.length } }, TEXT_LINE + TOOL_LINE + TEXT_LINE));
passes(AUTO_RUN, 'a running chain with no tool since the last push is let go',
  autoRunPayload('stalled', { status: 'running', lastBlock: { transcriptSize: TOOL_LINE.length } }, TOOL_LINE + TEXT_LINE));

function autoRunPayloadWith(name, marker, files) {
  const projectRoot = projectFixture('auto-run-' + name, {
    '.alpha-sdlc/auto-run.json': JSON.stringify(marker),
    'transcript.jsonl': TEXT_LINE + TOOL_LINE,
    ...files,
  });
  return { hook_event_name: 'Stop', cwd: projectRoot, transcript_path: path.join(projectRoot, 'transcript.jsonl') };
}

const testPlan = ({ bug = '**fixed** 2026-09-24', covered = '**3 of 3** covered and passing', smoke = '**pass** — all three journeys' } = {}) =>
  '# Test plan\n\n## Bugs found\n\n| # | Bug | Status |\n|---|---|---|\n| B1 | a bug | ' + bug + ' |\n\n' +
  '## Coverage summary\n\n- **AC covered:** ' + covered + '\n' + (smoke === null ? '' : '- **Boot & Smoke (integrated):** ' + smoke + '\n');

blocks(AUTO_RUN, 'a done chain whose test plan still has Boot & Smoke blocked is refused',
  autoRunPayloadWith('done-blocked', { status: 'done', feature: 'f', platform: 'web', featureDir: 'feature' },
    { 'feature/test-plan-web.md': testPlan({ smoke: '**2 of 3 critical journeys pass; journey 3 is BLOCKED** — mandatory' }) }));
passes(AUTO_RUN, 'a done chain whose test plan passed is let stop',
  autoRunPayloadWith('done-green', { status: 'done', feature: 'f', platform: 'web', featureDir: 'feature' },
    { 'feature/test-plan-web.md': testPlan() }));
passes(AUTO_RUN, 'a done chain that names no feature directory is let stop',
  autoRunPayloadWith('done-unnamed', { status: 'done' }, {}));

const INJECT = 'inject-principles.js';
const GUIDE_MARKER = 'Panduan bahasa sederhana';

function projectFixture(name, files) {
  const projectRoot = path.join(fixtureDirectory, name);
  for (const [relativePath, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(projectRoot, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, relativePath), content);
  }
  fs.mkdirSync(projectRoot, { recursive: true });
  return projectRoot;
}

function injectedContext(projectRoot) {
  const result = spawnSync(process.execPath, [path.join(hooksDirectory, INJECT)], {
    input: JSON.stringify({ cwd: projectRoot }),
    encoding: 'utf8',
  });
  try { return JSON.parse(result.stdout).hookSpecificOutput.additionalContext; } catch { return ''; }
}

const overviewRow = (value) => `| **Plain-language layer** | ${value} |\n`;
const contextCases = [
  { name: 'injects the Indonesian guide when the machine mirror says id', expectGuide: true,
    projectRoot: projectFixture('id-json', { 'docs/basics/.alpha-sdlc.json': '{"plainLanguage":"id"}' }) },
  { name: 'injects the Indonesian guide from the overview row when the mirror has no key', expectGuide: true,
    projectRoot: projectFixture('id-overview', { 'docs/basics/01-overview.md': overviewRow('Bahasa Indonesia') }) },
  { name: 'injects no guide for an English plain layer', expectGuide: false,
    projectRoot: projectFixture('en-json', { 'docs/basics/.alpha-sdlc.json': '{"plainLanguage":"en"}' }) },
  { name: 'injects no guide for a project without a profile', expectGuide: false,
    projectRoot: projectFixture('no-profile', {}) },
  { name: 'ignores a plainLanguage value that is not a language code', expectGuide: false,
    projectRoot: projectFixture('traversal', { 'docs/basics/.alpha-sdlc.json': '{"plainLanguage":"../principles"}' }) },
];

const COVERAGE = path.join(__dirname, '..', 'scripts', 'check-coverage.js');
const spokeWith = (slices) =>
  '# Spoke\n\n## 8. Acceptance criteria\n\n| ID | AC | Source |\n|---|---|---|\n' +
  '| AC-1 | one | hub §2 |\n| AC-2 | two | hub §3 |\n| AC-3 | three | hub §5 |\n\n' +
  '## 9. Work slices\n\n' + slices + '\n';
const planWith = (stages) => '# Plan\n\n## Stages\n\n' + stages + '\n';
const TWO_SLICES = '| Slice | What | AC |\n|---|---|---|\n| **W1** | a | `AC-1` `AC-2` |\n| **W2** | b | `AC-3` |';

function coverageRun(name, spoke, plan, extraArguments, extraFiles) {
  const featureDirectory = projectFixture('coverage-' + name, {
    'TRD-web.md': spoke,
    'plan-web.md': plan,
    ...(extraFiles || {}),
  });
  const extras = (extraArguments || []).map((argument) => argument.replace('{dir}', featureDirectory));
  return spawnSync(process.execPath, [COVERAGE, featureDirectory, 'web', ...extras], { encoding: 'utf8' }).status;
}

const coverageCases = [
  { name: 'every criterion claimed inside its own slice is clean', expected: 0,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`') },
  { name: 'a criterion no stage claims is reported', expected: 1,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`') },
  { name: 'a stage claiming another slice\'s criterion without a Moved in record is reported', expected: 1,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2` · `AC-3`') },
  { name: 'the same claim with a Moved in record is clean', expected: 0,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2` · `AC-3`\n- **Moved in:** `AC-3` from `W2` — provable only here') },
  { name: 'a claim of a criterion missing from the register is reported', expected: 1,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3` · `AC-9`') },
  { name: 'a list-style slice with an AC range is read in full', expected: 0,
    spoke: spokeWith('- [ ] **`BE1`** — everything — **AC:** `AC-1` … `AC-3`'),
    plan: planWith('### Stage 1 — [api] `BE1` — all\n- **Covers:** `AC-1` · `AC-2` · `AC-3`') },
  { name: 'amendment prose after the warning mark is not read as a claim', expected: 0,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2` ⚠️ `AC-3` moves to Stage 2\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`') },
  { name: 'a new test titled with a criterion its stage does not cover is reported', expected: 1,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`'),
    extraArguments: ['--stage', '1', '--tests', '{dir}/a.test.ts'],
    extraFiles: { 'a.test.ts': "it('AC-3 shows the band', () => {});\n" } },
  { name: 'stages built together that record it on both sides are clean', expected: 0,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n- **Built with:** Stage 2\n- **Status:** done 2026-09-25\n- **Checkpoint verdict:** auto 2026-09-25\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`\n- **Built with:** Stage 1\n- **Status:** done 2026-09-25\n- **Checkpoint verdict:** auto 2026-09-25') },
  { name: 'a one-sided built-with record is reported', expected: 1,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n- **Built with:** Stage 2\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`') },
  { name: 'a done stage without its own checkpoint verdict is reported', expected: 1,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n- **Status:** done 2026-09-25\n- **Checkpoint verdict:** pending\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`') },
  { name: 'a new test titled with its own stage\'s criterion is clean', expected: 0,
    spoke: spokeWith(TWO_SLICES),
    plan: planWith('### Stage 1 — [data] `W1` — a\n- **Covers:** `AC-1` · `AC-2`\n\n### Stage 2 — [UI] `W2` — b\n- **Covers:** `AC-3`'),
    extraArguments: ['--stage', '1', '--tests', '{dir}/a.test.ts'],
    extraFiles: { 'a.test.ts': "it('AC-1 keeps the list', () => {});\n" } },
];

const FEATURE_DONE = path.join(__dirname, '..', 'scripts', 'check-feature-done.js');
function featureDoneRun(name, plan) {
  const featureDirectory = projectFixture('feature-done-' + name, plan === null ? {} : { 'test-plan-web.md': plan });
  return spawnSync(process.execPath, [FEATURE_DONE, featureDirectory, 'web'], { encoding: 'utf8' }).status;
}
const featureDoneCases = [
  { name: 'a green test plan is done', expected: 0, plan: testPlan() },
  { name: 'Boot & Smoke blocked is not done', expected: 1, plan: testPlan({ smoke: '**2 of 3 critical journeys pass; journey 3 is BLOCKED** — mandatory' }) },
  { name: 'a bug fixed but not re-verified is not done', expected: 1, plan: testPlan({ bug: '**fixed 2026-09-25, NOT re-verified at the level that found it** — both sites now address it' }) },
  { name: 'a struck-through old failure does not count against a green line', expected: 0, plan: testPlan({ covered: '~~**3 of 3 · 2 passing, 1 failing**~~ **3 of 3 covered and passing** — re-tested' }) },
  { name: 'a test plan without a Boot & Smoke summary is not done', expected: 1, plan: testPlan({ smoke: null }) },
  { name: 'a missing test plan is unreadable', expected: 2, plan: null },
];

const FIND_ORPHANS = path.join(__dirname, '..', 'scripts', 'find-orphans.js');
function gitRepoFixture(name, before, after) {
  const root = projectFixture('orphans-' + name, before);
  const run = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  run('init', '-q');
  run('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A');
  run('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'before');
  for (const [relativePath, content] of Object.entries(after || {})) {
    const target = path.join(root, relativePath);
    if (content === null) fs.rmSync(target, { force: true });
    else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
  }
  return root;
}
const inventoryNaming = (name) => '# Inventory\n\n| Unit | What | Where |\n|---|---|---|\n| `' + name + '` | a unit | `a.ts` |\n';
const orphanCases = [
  { name: 'a removed export still registered is reported', expected: 1, mode: ['--diff', 'HEAD'],
    before: { 'src/a.ts': 'export function oldPath() { return 1 }\n', 'docs/basics/19-code-inventory.md': inventoryNaming('oldPath') },
    after: { 'src/a.ts': 'export function newPath() { return 2 }\n' } },
  { name: 'a removed export already deregistered is clean', expected: 0, mode: ['--diff', 'HEAD'],
    before: { 'src/a.ts': 'export function oldPath() { return 1 }\n', 'docs/basics/19-code-inventory.md': inventoryNaming('oldPath') },
    after: { 'src/a.ts': 'export function newPath() { return 2 }\n', 'docs/basics/19-code-inventory.md': inventoryNaming('newPath') } },
  { name: 'a type moved to another file is not a removal', expected: 0, mode: ['--diff', 'HEAD'],
    before: { 'src/a.ts': 'export type Where = 1\n', 'docs/basics/19-code-inventory.md': inventoryNaming('Where') },
    after: { 'src/a.ts': 'export const nothing = 0\n', 'src/b.ts': 'export type Where = 1\n' } },
  { name: 'a registry row naming a unit that is gone is reported', expected: 1, mode: ['--registry'],
    before: { 'src/a.ts': 'export const present = 1\n', 'docs/basics/19-code-inventory.md': inventoryNaming('vanished') } },
  { name: 'a registry row naming a present unit is clean', expected: 0, mode: ['--registry'],
    before: { 'src/a.ts': 'export const present = 1\n', 'docs/basics/19-code-inventory.md': inventoryNaming('present') } },
  { name: 'a listed token no stylesheet defines is reported', expected: 1, mode: ['--registry'],
    before: { 'src/tokens.css': ':root { --space-1: 4px; }\n', 'docs/basics/18-design-tokens.md': '# Tokens\n\n| Token | Value |\n|---|---|\n| `--space-1` | 4 |\n| `--gone-token` | 8 |\n' } },
];

const PARITY_TRAIL = path.join(__dirname, '..', 'scripts', 'check-parity-trail.js');
const HOUR = 3600 * 1000;
function parityTrailRun(name, files, ages, extraArguments) {
  const featureDirectory = projectFixture('parity-' + name, files);
  for (const [relativePath, hoursAgo] of Object.entries(ages || {})) {
    const when = new Date(Date.now() - hoursAgo * HOUR);
    fs.utimesSync(path.join(featureDirectory, relativePath), when, when);
  }
  return spawnSync(process.execPath, [PARITY_TRAIL, featureDirectory, 'web', ...(extraArguments || [])], { encoding: 'utf8' }).status;
}
const TRAIL = 'design/compared-ui/';
const assemblyPlan = '# Plan\n\n### Stage 4 — [presentation] `run` assembly\n';
const completeTrail = {
  'design/run.png': 'png', 'design/sections/run/hdr.png': 'png', 'plan-web.md': assemblyPlan,
  [TRAIL + 'run-web-v2.png']: 'png', [TRAIL + 'run-web-v2-diff.png']: 'png',
  [TRAIL + 'run.hdr-web-v1.png']: 'png', [TRAIL + 'run.hdr-web-v1-diff.png']: 'png',
};
const olderReferences = { 'design/run.png': 5, 'design/sections/run/hdr.png': 5 };
const parityTrailCases = [
  { name: 'every capture with its diff and newer than its reference is clean', expected: 0,
    files: completeTrail, ages: olderReferences, extraArguments: ['--screen', 'run'] },
  { name: 'a capture without its diff overlay is reported', expected: 1,
    files: { ...completeTrail, [TRAIL + 'run.hdr-web-v2.png']: 'png' }, ages: olderReferences },
  { name: 'a design reference changed after the capture is reported as stale', expected: 1,
    files: completeTrail, ages: { [TRAIL + 'run-web-v2.png']: 5, 'design/sections/run/hdr.png': 5 } },
  { name: 'an assembly screen without a full-screen reference is reported', expected: 1,
    files: { ...completeTrail, 'plan-web.md': assemblyPlan + '\n### Stage 9 — [presentation] `gate` assembly\n' },
    ages: olderReferences },
  { name: 'a screen checked on its own needs a full-screen capture', expected: 1,
    files: { ...completeTrail, [TRAIL + 'run-web-v2.png']: undefined, [TRAIL + 'run-web-v2-diff.png']: undefined },
    ages: olderReferences, extraArguments: ['--screen', 'run'] },
  { name: 'a capture that does not name its screen is reported', expected: 1,
    files: { ...completeTrail, 'design/sections/run/hdr--C2.png': 'png', [TRAIL + 'hdr--C2-web-v1.png']: 'png', [TRAIL + 'hdr--C2-web-v1-diff.png']: 'png' },
    ages: { ...olderReferences, 'design/sections/run/hdr--C2.png': 5 } },
];
for (const parityCase of parityTrailCases) {
  for (const [relativePath, content] of Object.entries(parityCase.files)) if (content === undefined) delete parityCase.files[relativePath];
}

const COMPARE_GEOMETRY = path.join(__dirname, '..', 'scripts', 'compare-geometry.js');
function geometryRun(name, design, app, extraArguments) {
  const directory = projectFixture('geometry-' + name, {
    'design.json': JSON.stringify({ boxes: design }),
    'app.json': JSON.stringify({ boxes: app }),
    'tokens.css': ':root { --space-4: 16px; --space-6: 24px; --space-8: 32px; }\n',
  });
  const extras = (extraArguments || []).map((argument) => argument.replace('{dir}', directory));
  const result = spawnSync(process.execPath, [COMPARE_GEOMETRY, path.join(directory, 'design.json'), path.join(directory, 'app.json'), ...extras], { encoding: 'utf8' });
  return { exitCode: result.status, stdout: result.stdout };
}
const runScreen = {
  page: [0, 0, 1768, 1020], header: [32, 32, 1704, 64], list: [32, 120, 1100, 880],
  rowA: [48, 136, 1068, 88], rowB: [48, 232, 1068, 88], rail: [1156, 120, 580, 400],
};
const shifted = (boxes, id, change) => ({ ...boxes, [id]: boxes[id].map((value, index) => value + (change[index] || 0)) });
const geometryCases = [
  { name: 'the same layout is clean', expected: 0, design: runScreen, app: runScreen },
  { name: 'a one-pixel rendering difference stays inside the tolerance', expected: 0,
    design: runScreen, app: shifted(runScreen, 'header', [1, 0, -1, 0]) },
  { name: 'a header sitting 30px lower is reported with its inset and token', expected: 1,
    design: runScreen, app: shifted(runScreen, 'header', [0, 30, 0, 0]),
    extraArguments: ['--tokens', '{dir}/tokens.css'], output: /header inside page: inset top 62 \(no px token\) vs 32 \(--space-8\)/ },
  { name: 'a shorter row is reported as a height and gap difference', expected: 1,
    design: runScreen, app: shifted(runScreen, 'rowA', [0, 0, 0, -36]), output: /rowA: height 52 vs 88.*\n[\s\S]*rowA → rowB: gap below 44 vs 8/ },
  { name: 'a rail stacked under the list instead of beside it is reported as a column change', expected: 1,
    design: runScreen, app: { ...runScreen, rail: [32, 1010, 580, 400], page: [0, 0, 1768, 1500] },
    output: /page: 1 column\(s\) of children in the app vs 2 in the design/ },
  { name: 'an element the design has and the app does not render is reported', expected: 1,
    design: runScreen, app: Object.fromEntries(Object.entries(runScreen).filter(([id]) => id !== 'rail')),
    output: /rail: in the design, not rendered by the app/ },
];

let failed = 0;
for (const contextCase of contextCases) {
  const context = injectedContext(contextCase.projectRoot);
  const hasIndex = context.includes('INDEX of the shared principles');
  const hasGuide = context.includes(GUIDE_MARKER);
  if (hasIndex && hasGuide === contextCase.expectGuide) {
    process.stdout.write(`  ok   ${INJECT}  ${contextCase.name}\n`);
  } else {
    failed++;
    process.stdout.write(`  FAIL ${INJECT}  ${contextCase.name}\n`);
    process.stdout.write(`       index present: ${hasIndex}, guide present: ${hasGuide}\n`);
  }
}

for (const coverageCase of coverageCases) {
  const exitCode = coverageRun(coverageCase.name.replace(/\W+/g, '-'), coverageCase.spoke, coverageCase.plan,
    coverageCase.extraArguments, coverageCase.extraFiles);
  if (exitCode === coverageCase.expected) {
    process.stdout.write(`  ok   check-coverage.js  ${coverageCase.name}\n`);
  } else {
    failed++;
    process.stdout.write(`  FAIL check-coverage.js  ${coverageCase.name}\n`);
    process.stdout.write(`       expected exit ${coverageCase.expected}, got ${exitCode}\n`);
  }
}

for (const featureDoneCase of featureDoneCases) {
  const exitCode = featureDoneRun(featureDoneCase.name.replace(/\W+/g, '-'), featureDoneCase.plan);
  if (exitCode === featureDoneCase.expected) {
    process.stdout.write(`  ok   check-feature-done.js  ${featureDoneCase.name}\n`);
  } else {
    failed++;
    process.stdout.write(`  FAIL check-feature-done.js  ${featureDoneCase.name}\n`);
    process.stdout.write(`       expected exit ${featureDoneCase.expected}, got ${exitCode}\n`);
  }
}

for (const orphanCase of orphanCases) {
  const root = gitRepoFixture(orphanCase.name.replace(/\W+/g, '-'), orphanCase.before, orphanCase.after);
  const exitCode = spawnSync(process.execPath, [FIND_ORPHANS, root, ...orphanCase.mode], { encoding: 'utf8' }).status;
  if (exitCode === orphanCase.expected) {
    process.stdout.write(`  ok   find-orphans.js  ${orphanCase.name}\n`);
  } else {
    failed++;
    process.stdout.write(`  FAIL find-orphans.js  ${orphanCase.name}\n`);
    process.stdout.write(`       expected exit ${orphanCase.expected}, got ${exitCode}\n`);
  }
}

for (const parityCase of parityTrailCases) {
  const exitCode = parityTrailRun(parityCase.name.replace(/\W+/g, '-'), parityCase.files, parityCase.ages, parityCase.extraArguments);
  if (exitCode === parityCase.expected) {
    process.stdout.write(`  ok   check-parity-trail.js  ${parityCase.name}\n`);
  } else {
    failed++;
    process.stdout.write(`  FAIL check-parity-trail.js  ${parityCase.name}\n`);
    process.stdout.write(`       expected exit ${parityCase.expected}, got ${exitCode}\n`);
  }
}

for (const geometryCase of geometryCases) {
  const { exitCode, stdout } = geometryRun(geometryCase.name.replace(/\W+/g, '-'), geometryCase.design, geometryCase.app, geometryCase.extraArguments);
  if (exitCode === geometryCase.expected && (!geometryCase.output || geometryCase.output.test(stdout))) {
    process.stdout.write(`  ok   compare-geometry.js  ${geometryCase.name}\n`);
  } else {
    failed++;
    process.stdout.write(`  FAIL compare-geometry.js  ${geometryCase.name}\n`);
    process.stdout.write(`       expected exit ${geometryCase.expected}, got ${exitCode}\n${stdout.replace(/^/gm, '       ')}`);
  }
}

for (const testCase of cases) {
  const { exitCode, stderr } = runHook(testCase.hook, testCase.payload);
  const verb = testCase.expected === 2 ? 'must block' : 'must pass';
  if (exitCode === testCase.expected) {
    process.stdout.write(`  ok   ${testCase.hook}  ${verb}: ${testCase.name}\n`);
  } else {
    failed++;
    process.stdout.write(`  FAIL ${testCase.hook}  ${verb}: ${testCase.name}\n`);
    process.stdout.write(`       expected exit ${testCase.expected}, got ${exitCode}\n`);
    if (stderr.trim()) process.stdout.write(`       ${stderr.trim().split('\n')[0]}\n`);
  }
}

fs.rmSync(fixtureDirectory, { recursive: true, force: true });

const total = cases.length + contextCases.length + coverageCases.length + featureDoneCases.length +
  orphanCases.length + parityTrailCases.length + geometryCases.length;
process.stdout.write(`\n${total - failed}/${total} passed\n`);
process.exit(failed ? 1 : 0);
