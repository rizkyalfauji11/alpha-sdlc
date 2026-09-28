#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const MOBILE_MCP_PACKAGE = '@mobilenext/mobile-mcp@1.0.5';
const OVERRIDE_VARIABLE = 'ALPHA_SDLC_MOBILE';
const SCAN_DEPTH = 3;
const SKIPPED_DIRECTORIES = new Set([
  'node_modules', '.git', 'build', 'Build', 'Pods', 'DerivedData',
  '.dart_tool', '.gradle', '.idea', 'vendor', 'dist', 'target', '.venv',
]);

function directoryEntries(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function declaresFlutter(pubspecPath) {
  try {
    return /^\s*flutter\s*:/m.test(fs.readFileSync(pubspecPath, 'utf8'));
  } catch {
    return false;
  }
}

function namesAMobilePlatform(entry, directory) {
  if (entry.isDirectory()) {
    return entry.name.endsWith('.xcodeproj') || entry.name.endsWith('.xcworkspace');
  }
  if (entry.name === 'AndroidManifest.xml') return true;
  if (entry.name === 'Podfile') return true;
  if (entry.name === 'pubspec.yaml') return declaresFlutter(path.join(directory, entry.name));
  return false;
}

function holdsAMobileProject(directory, depthRemaining) {
  const entries = directoryEntries(directory);
  for (const entry of entries) {
    if (namesAMobilePlatform(entry, directory)) return true;
  }
  if (depthRemaining === 0) return false;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    if (holdsAMobileProject(path.join(directory, entry.name), depthRemaining - 1)) return true;
  }
  return false;
}

function mobileToolsBelongHere(projectDirectory) {
  const override = process.env[OVERRIDE_VARIABLE];
  if (override === '1') return true;
  if (override === '0') return false;
  if (!projectDirectory) return false;
  return holdsAMobileProject(projectDirectory, SCAN_DEPTH);
}

function handOverToMobileMcp() {
  const child = spawn('npx', ['-y', MOBILE_MCP_PACKAGE], { stdio: 'inherit' });
  child.on('error', () => process.exit(1));
  child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function resultFor(request) {
  switch (request.method) {
    case 'initialize':
      return {
        protocolVersion: request.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'mobile-mcp (dormant — no mobile project here)', version: '1.0.0' },
      };
    case 'tools/list':
      return { tools: [] };
    case 'resources/list':
      return { resources: [] };
    case 'prompts/list':
      return { prompts: [] };
    case 'ping':
      return {};
    default:
      return undefined;
  }
}

function answer(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  if (request.id === undefined || request.id === null) return;
  const result = resultFor(request);
  if (result === undefined) {
    send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: `Method not found: ${request.method}` } });
    return;
  }
  send({ jsonrpc: '2.0', id: request.id, result });
}

function stayDormant() {
  let pending = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    pending += chunk;
    let breakAt = pending.indexOf('\n');
    while (breakAt !== -1) {
      const line = pending.slice(0, breakAt).trim();
      pending = pending.slice(breakAt + 1);
      if (line) answer(line);
      breakAt = pending.indexOf('\n');
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

if (mobileToolsBelongHere(process.argv[2])) handOverToMobileMcp();
else stayDormant();
