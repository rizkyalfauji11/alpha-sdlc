#!/usr/bin/env node
// PreToolUse validator: block writes to this plugin's docs that contain secret
// VALUES (the "never write secrets" principle). Scoped to docs/ markdown so it
// doesn't false-positive on real code. Exit 2 = block; exit 0 = allow.
// High-confidence patterns only — names/placeholders are fine, real credentials are not.

const fs = require('fs');

let data;
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

const tool = data.tool_name || '';
const ti = data.tool_input || {};
const path = ti.file_path || '';

// Only guard the plugin's doc artifacts (profile + feature docs).
if (!/(^|\/)docs\/.*\.md$/.test(path)) process.exit(0);

const content = tool === 'Write' ? (ti.content || '')
              : tool === 'Edit' ? (ti.new_string || '')
              : '';
if (!content) process.exit(0);

// High-confidence secret patterns (real values, not names/placeholders).
const PATTERNS = [
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

for (const [re, label] of PATTERNS) {
  if (re.test(content)) {
    process.stderr.write(
      `Secret detected in a docs artifact (${label}) — per principles.md, never write secret values ` +
      `into docs. Record the name/location only (env-var name, config file, secret-manager key), ` +
      `never the value. Remove it and reference where it lives instead.\n`
    );
    process.exit(2);
  }
}
process.exit(0);
