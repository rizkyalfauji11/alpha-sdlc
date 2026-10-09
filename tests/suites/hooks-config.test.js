#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createSuite, pluginRoot, hooksDirectory } = require('../lib/harness');

const suite = createSuite('hooks-config');
const { report, finish } = suite;

const HOOKS_JSON = path.join(hooksDirectory, 'hooks.json');
const COMMAND_SHAPE = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([\w.-]+\.js)"$/;
const MODEL_HOOK_TYPES = new Set(['prompt', 'agent']);
const JUDGE_SPAWN_TIMEOUT_SECONDS = 60;
const JUDGE_HOOK_MARGIN_SECONDS = 10;

let config = null;
let parseProblem = '';
try {
  config = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
} catch (error) {
  parseProblem = String(error && error.message ? error.message : error);
}
report('hooks.json', 'parses as JSON with a hooks object', Boolean(config && config.hooks && typeof config.hooks === 'object'), parseProblem);

const entries = [];
for (const [event, groups] of Object.entries((config && config.hooks) || {})) {
  (Array.isArray(groups) ? groups : []).forEach((group, groupIndex) => {
    const where = `${event}[${groupIndex}]${group && group.matcher ? ` (${group.matcher})` : ''}`;
    for (const hook of group && Array.isArray(group.hooks) ? group.hooks : []) entries.push({ event, where, hook });
  });
}

const modelHooks = entries.filter(({ hook }) => MODEL_HOOK_TYPES.has(hook && hook.type));
report('hooks.json', 'has no hook of type prompt or agent — they forward the conversation to a model on every firing',
  modelHooks.length === 0, modelHooks.map(({ where, hook }) => `${where}: type ${hook.type}${hook.model ? `, model ${hook.model}` : ''}`));

const otherTypes = entries.filter(({ hook }) => !hook || hook.type !== 'command');
report('hooks.json', 'every hook is a command hook', entries.length > 0 && otherTypes.length === 0,
  otherTypes.map(({ where, hook }) => `${where}: type ${hook && hook.type}`));

const filesByName = new Map();
for (const { where, hook } of entries.filter((entry) => entry.hook && entry.hook.type === 'command')) {
  const shape = COMMAND_SHAPE.exec(String(hook.command || ''));
  if (!shape) {
    report('hooks.json', `${where} runs node "\${CLAUDE_PLUGIN_ROOT}/hooks/<file>.js"`, false, String(hook.command));
    continue;
  }
  if (!filesByName.has(shape[1])) filesByName.set(shape[1], []);
  filesByName.get(shape[1]).push(where);
}

for (const [fileName, places] of filesByName) {
  const filePath = path.join(hooksDirectory, fileName);
  const exists = fs.existsSync(filePath);
  report('hooks.json', `${fileName} exists (${places.join(', ')})`, exists, filePath);
  if (!exists) continue;
  const check = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
  report('hooks.json', `${fileName} parses as JavaScript`, check.status === 0, (check.stderr || '').trim().split('\n').slice(0, 4));
}

const judgeEntry = entries.find(({ event, hook }) => event === 'Stop' && hook && /\/hooks\/stop-judge\.js"$/.test(String(hook.command || '')));
const judgeTimeout = judgeEntry && Number(judgeEntry.hook.timeout);
report('hooks.json', 'the Stop judge is a command hook whose timeout outlasts its nested call',
  Boolean(judgeEntry) && judgeTimeout >= JUDGE_SPAWN_TIMEOUT_SECONDS + JUDGE_HOOK_MARGIN_SECONDS,
  judgeEntry ? `timeout ${judgeEntry.hook.timeout}` : 'no Stop hook runs hooks/stop-judge.js');
report('hooks.json', 'the judge rules file the Stop judge reads is present', fs.existsSync(path.join(pluginRoot, 'hooks', 'stop-judge-rules.md')));

finish();
