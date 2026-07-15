#!/usr/bin/env node
// SessionStart hook: inject the plugin's shared principles into every session so
// they're always in context whenever a plugin skill runs — the hard guarantee that
// the AI applies them consistently. Emits principles.md as additionalContext.

const fs = require('fs');
const path = require('path');

const root = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');

try {
  const principles = fs.readFileSync(path.join(root, 'principles.md'), 'utf8');
  const out = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        'alpha-sdlc plugin — apply these shared principles whenever any alpha-sdlc skill runs:\n\n' +
        principles,
    },
  };
  process.stdout.write(JSON.stringify(out));
} catch {
  // best-effort: if principles.md can't be read, stay silent (don't break the session)
}
process.exit(0);
