const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', '..');
const hooksDirectory = path.join(pluginRoot, 'hooks');
const scriptsDirectory = path.join(pluginRoot, 'scripts');

function environmentWith(overrides) {
  const environment = { ...process.env };
  for (const [key, value] of Object.entries(overrides || {})) {
    if (value === null || value === undefined) delete environment[key];
    else environment[key] = String(value);
  }
  return environment;
}

function createSuite(label) {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `alpha-sdlc-${label}-`));
  let total = 0;
  let failed = 0;

  function report(subject, name, ok, details) {
    total++;
    if (ok) {
      process.stdout.write(`  ok   ${subject}  ${name}\n`);
      return;
    }
    failed++;
    process.stdout.write(`  FAIL ${subject}  ${name}\n`);
    for (const line of [].concat(details || [])) {
      if (line) process.stdout.write(`       ${String(line).replace(/\n/g, '\n       ')}\n`);
    }
  }

  function fixture(name, content) {
    const filePath = path.join(fixtureDirectory, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  function projectFixture(name, files) {
    const projectRoot = path.join(fixtureDirectory, name);
    fs.mkdirSync(projectRoot, { recursive: true });
    for (const [relativePath, content] of Object.entries(files || {})) {
      if (content === undefined) continue;
      const target = path.join(projectRoot, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    return projectRoot;
  }

  function sdlcProject(name, files) {
    const projectRoot = projectFixture(name, files);
    fs.mkdirSync(path.join(projectRoot, 'docs', 'basics'), { recursive: true });
    return projectRoot;
  }

  function run(file, args, options = {}) {
    const result = spawnSync(process.execPath, [file, ...(args || [])], {
      input: options.input,
      encoding: 'utf8',
      cwd: options.cwd,
      env: environmentWith({ CLAUDE_PROJECT_DIR: null, ...options.env }),
      timeout: options.timeout || 60000,
    });
    return { exitCode: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
  }

  function runHook(hookFile, payload, options = {}) {
    return run(path.join(hooksDirectory, hookFile), [], { ...options, input: JSON.stringify(payload) });
  }

  function runScript(scriptFile, args, options = {}) {
    return run(path.join(scriptsDirectory, scriptFile), args, options);
  }

  function finish() {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
    process.stdout.write(`\n${total - failed}/${total} passed\n`);
    process.exit(failed ? 1 : 0);
  }

  return { fixtureDirectory, fixture, projectFixture, sdlcProject, run, runHook, runScript, report, finish };
}

const writePayload = (filePath, content) => ({ tool_name: 'Write', tool_input: { file_path: filePath, content } });

const editPayload = (filePath, oldString, newString) => ({
  tool_name: 'Edit',
  tool_input: { file_path: filePath, old_string: oldString, new_string: newString },
});

const testPlan = ({
  bug = '**fixed** 2026-09-24',
  covered = '**3 of 3** covered and passing',
  smoke = '**pass** — all three journeys',
} = {}) =>
  '# Test plan\n\n## Bugs found\n\n| # | Bug | Status |\n|---|---|---|\n| B1 | a bug | ' + bug + ' |\n\n' +
  '## Coverage summary\n\n- **AC covered:** ' + covered + '\n' +
  (smoke === null ? '' : '- **Boot & Smoke (integrated):** ' + smoke + '\n');

module.exports = {
  pluginRoot,
  hooksDirectory,
  scriptsDirectory,
  environmentWith,
  createSuite,
  writePayload,
  editPayload,
  testPlan,
};
