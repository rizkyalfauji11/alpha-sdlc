#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');

function readPrinciplesOrStaySilent() {
  try {
    return fs.readFileSync(path.join(pluginRoot, 'principles.md'), 'utf8');
  } catch {
    return '';
  }
}

const principles = readPrinciplesOrStaySilent();
if (!principles) process.exit(0);

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext:
      'alpha-sdlc plugin — apply these shared principles whenever any alpha-sdlc skill runs:\n\n' +
      principles,
  },
}));
process.exit(0);
