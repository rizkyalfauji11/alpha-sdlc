#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createSuite, pluginRoot } = require('../lib/harness');

const suite = createSuite('gemini-support');
const { report, finish, sdlcProject } = suite;

const testProject = sdlcProject('gemini-test-project');

const GEMINI_EXTENSION = path.join(pluginRoot, 'gemini-extension.json');
const ROOT_PLUGIN_JSON = path.join(pluginRoot, 'plugin.json');
const GEMINI_PLUGIN_JSON = path.join(pluginRoot, '.gemini-plugin', 'plugin.json');
const ROOT_MCP_CONFIG = path.join(pluginRoot, 'mcp_config.json');
const ROOT_HOOKS_JSON = path.join(pluginRoot, 'hooks.json');
const GEMINI_MD = path.join(pluginRoot, 'GEMINI.md');

let extConfig = null;
try { extConfig = JSON.parse(fs.readFileSync(GEMINI_EXTENSION, 'utf8')); } catch {}
report('gemini-extension.json', 'exists and parses as JSON', Boolean(extConfig));
report('gemini-extension.json', 'names the plugin and version', Boolean(extConfig && extConfig.name === 'alpha-sdlc' && extConfig.version));
report('gemini-extension.json', 'points contextFileName to GEMINI.md', Boolean(extConfig && extConfig.contextFileName === 'GEMINI.md'));
report('gemini-extension.json', 'declares mcpServers', Boolean(extConfig && extConfig.mcpServers && extConfig.mcpServers['alpha-sdlc-mobile-mcp']));

let rootPlugin = null;
try { rootPlugin = JSON.parse(fs.readFileSync(ROOT_PLUGIN_JSON, 'utf8')); } catch {}
report('plugin.json', 'exists at root and parses as JSON', Boolean(rootPlugin));
report('plugin.json', 'matches Antigravity plugin manifest structure', Boolean(rootPlugin && rootPlugin.name === 'alpha-sdlc' && Array.isArray(rootPlugin.suggestedPrompts)));

let dotGeminiPlugin = null;
try { dotGeminiPlugin = JSON.parse(fs.readFileSync(GEMINI_PLUGIN_JSON, 'utf8')); } catch {}
report('.gemini-plugin/plugin.json', 'exists and mirrors root plugin.json', Boolean(dotGeminiPlugin && dotGeminiPlugin.name === 'alpha-sdlc'));

let mcpConfig = null;
try { mcpConfig = JSON.parse(fs.readFileSync(ROOT_MCP_CONFIG, 'utf8')); } catch {}
report('mcp_config.json', 'exists and declares mobile MCP server', Boolean(mcpConfig && mcpConfig.mcpServers && mcpConfig.mcpServers['alpha-sdlc-mobile-mcp']));

let rootHooks = null;
try { rootHooks = JSON.parse(fs.readFileSync(ROOT_HOOKS_JSON, 'utf8')); } catch {}
const alphaHooks = rootHooks && rootHooks['alpha-sdlc'];
report('hooks.json', 'exists at root with alpha-sdlc entry', Boolean(alphaHooks && alphaHooks.enabled));
report('hooks.json', 'declares SessionStart, PreToolUse, and Stop', Boolean(alphaHooks && alphaHooks.SessionStart && alphaHooks.PreToolUse && alphaHooks.Stop));

const preToolGroups = (alphaHooks && alphaHooks.PreToolUse) || [];
const writeGroup = preToolGroups.find((group) => group.matcher && group.matcher.includes('write_file'));
const commandGroup = preToolGroups.find((group) => group.matcher && group.matcher.includes('run_command'));
report('hooks.json', 'matcher handles write_file and run_command tools', Boolean(writeGroup && commandGroup));

report('GEMINI.md', 'exists and stays within the 24KB rule budget', fs.existsSync(GEMINI_MD) && fs.statSync(GEMINI_MD).size < 24000);

function runHookInput(hookScript, payload) {
  const result = spawnSync(process.execPath, [path.join(pluginRoot, 'hooks', hookScript)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  let parsed = null;
  try { parsed = JSON.parse(result.stdout); } catch {}
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}

const secretCall = runHookInput('validate-no-secrets.js', {
  toolCall: {
    name: 'write_file',
    args: { Path: 'docs/architecture.md', Content: 'AKIA1234567890ABCDEF' },
  },
});
report('validate-no-secrets.js', 'denies secret writes via Antigravity toolCall payload',
  secretCall.status === 0 && secretCall.parsed && secretCall.parsed.decision === 'deny');

const cleanCall = runHookInput('validate-no-secrets.js', {
  toolCall: {
    name: 'write_file',
    args: { Path: 'docs/architecture.md', Content: 'Plain documentation content.' },
  },
});
report('validate-no-secrets.js', 'allows clean writes via Antigravity toolCall payload',
  cleanCall.status === 0 && cleanCall.parsed && cleanCall.parsed.decision === 'allow');

const bashWriteCall = runHookInput('validate-bash-doc-writes.js', {
  toolCall: {
    name: 'run_command',
    args: { CommandLine: 'cat <<EOF > docs/basics/overview.md\n# Title\nEOF' },
  },
  workspacePaths: [testProject],
});
report('validate-bash-doc-writes.js', 'denies bash doc writes via Antigravity toolCall payload',
  bashWriteCall.status === 0 && bashWriteCall.parsed && bashWriteCall.parsed.decision === 'deny');

const principlesStart = runHookInput('inject-principles.js', {
  conversationId: 'test-session',
  workspacePaths: [testProject],
  source: 'startup',
});
report('inject-principles.js', 'outputs injectSteps for Antigravity SessionStart',
  principlesStart.status === 0 && principlesStart.parsed && Array.isArray(principlesStart.parsed.injectSteps));

finish();
