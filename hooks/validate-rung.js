#!/usr/bin/env node
// PreToolUse validator: block writes to this plugin's TRD/plan artifacts when a
// ladder-rung decision is missing or left as a placeholder. Exit 2 = block (stderr
// shown to Claude); exit 0 = allow. The forcing function for principles.md's ladder.

const fs = require('fs');

let data;
try {
  data = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // no parseable input → don't block
}

const tool = data.tool_name || '';
const ti = data.tool_input || {};
const path = ti.file_path || '';

// Never validate the skill's own template files (they legitimately hold placeholders).
if (/(^|\/)skills\//.test(path) || /-template\.md$/.test(path)) process.exit(0);

// Only guard this plugin's artifacts.
const isTRD = /docs\/development\/.*TRD[^/]*\.md$/.test(path);
const isPlan = /(^|\/)plan-[^/]*\.md$/.test(path);
if (!isTRD && !isPlan) process.exit(0);

const content = tool === 'Write' ? (ti.content || '')
              : tool === 'Edit' ? (ti.new_string || '')
              : '';
if (!content.trim()) process.exit(0);

const problems = [];

// 1. Any "Approach" / "(ladder rung)" field present must be filled (not empty, not a <placeholder>).
const approachRe = /^\s*[*_]*\s*Approach[^:\n]*:[*_]*\s*(.*)$/gim;
let m;
while ((m = approachRe.exec(content)) !== null) {
  const val = (m[1] || '').replace(/[*_`]/g, '').trim();
  if (val === '' || /^<.*>$/.test(val)) {
    problems.push('an "Approach (ladder rung)" field is empty or still a `<placeholder>`');
    break;
  }
}

// 2. Every plan Stage must carry an Approach line naming its rung.
if (isPlan) {
  const stages = content.split(/^###\s+Stage\b/im).slice(1);
  if (stages.some(s => !/[*_]*\s*Approach[^:\n]*:/i.test(s))) {
    problems.push('a plan Stage has no **Approach** line naming its ladder rung');
  }
}

if (problems.length) {
  process.stderr.write(
    'Ladder rung missing — ' + problems.join('; ') + '. ' +
    'Per principles.md the rung is mandatory: name the rung you stopped at ' +
    '(1=skip/YAGNI, 2=reuse, 3=stdlib, 4=native, 5=installed dep, 6=one line, 7=build new) ' +
    'before writing this artifact. A proposal without a named rung is incomplete.\n'
  );
  process.exit(2);
}
process.exit(0);
