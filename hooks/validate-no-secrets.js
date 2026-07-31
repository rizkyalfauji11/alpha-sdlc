#!/usr/bin/env node

const fs = require('fs');

let payload;
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

const toolName = payload.tool_name || '';
const toolInput = payload.tool_input || {};
const filePath = toolInput.file_path || '';

const PLUGIN_DOC_ARTIFACT = /(^|\/)docs\/.*\.md$/;
if (!PLUGIN_DOC_ARTIFACT.test(filePath)) process.exit(0);

const writtenContent =
  toolName === 'Write' ? (toolInput.content || '')
  : toolName === 'Edit' ? (toolInput.new_string || '')
  : '';
if (!writtenContent) process.exit(0);

const HIGH_CONFIDENCE_SECRET_VALUES = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, 'private key block'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/\bASIA[0-9A-Z]{16}\b/, 'AWS temporary access key id'],
  [/\bgh[pousr]_[0-9A-Za-z]{36,}\b/, 'GitHub token'],
  [/\bxox[baprs]-[0-9A-Za-z-]{10,}\b/, 'Slack token'],
  [/\bAIza[0-9A-Za-z_\-]{35}\b/, 'Google API key'],
  [/\bsk-[A-Za-z0-9]{32,}\b/, 'secret key (sk-…)'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, 'JWT'],
  [/-----BEGIN CERTIFICATE-----/, 'certificate block'],
];

for (const [secretPattern, secretLabel] of HIGH_CONFIDENCE_SECRET_VALUES) {
  if (secretPattern.test(writtenContent)) {
    process.stderr.write(
      `Secret detected in a docs artifact (${secretLabel}) — per principles.md, never write secret values ` +
      `into docs. Record the name/location only (env-var name, config file, secret-manager key), ` +
      `never the value. Remove it and reference where it lives instead.\n`
    );
    process.exit(2);
  }
}
process.exit(0);
