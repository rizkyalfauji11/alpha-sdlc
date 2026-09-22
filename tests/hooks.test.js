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

let failed = 0;
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

process.stdout.write(`\n${cases.length - failed}/${cases.length} passed\n`);
process.exit(failed ? 1 : 0);
