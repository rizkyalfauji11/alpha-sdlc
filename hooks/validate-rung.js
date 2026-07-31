#!/usr/bin/env node

const fs = require('fs');

let payload;
try {
  payload = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const toolName = payload.tool_name || '';
const toolInput = payload.tool_input || {};
const filePath = toolInput.file_path || '';

const SKILL_OWNED_TEMPLATE = /(^|\/)skills\//;
const TEMPLATE_FILENAME = /-template\.md$/;
if (SKILL_OWNED_TEMPLATE.test(filePath) || TEMPLATE_FILENAME.test(filePath)) process.exit(0);

const isTrdArtifact = /docs\/development\/.*TRD[^/]*\.md$/.test(filePath);
const isPlanArtifact = /(^|\/)plan-[^/]*\.md$/.test(filePath);
if (!isTrdArtifact && !isPlanArtifact) process.exit(0);

const writtenContent =
  toolName === 'Write' ? (toolInput.content || '')
  : toolName === 'Edit' ? (toolInput.new_string || '')
  : '';
if (!writtenContent.trim()) process.exit(0);

const UNMISTAKABLE_LEFTOVER_PLACEHOLDER = /<(?:YYYY-MM-DD|hash|feature name|engineer|placeholder)>/i;
const leftoverPlaceholder = writtenContent.match(UNMISTAKABLE_LEFTOVER_PLACEHOLDER);
if (leftoverPlaceholder) {
  process.stderr.write(
    `Unfilled template placeholder in the artifact ("${leftoverPlaceholder[0]}") — this doc still carries ` +
    `template scaffolding. Fill every placeholder (dates, names, hashes) before writing; a TRD/plan ` +
    `with leftover <...> tokens is an incomplete section, not a finished one.\n`
  );
  process.exit(2);
}

const problems = [];

const APPROACH_FIELD = /^\s*[*_]*\s*Approach[^:\n]*:[*_]*\s*(.*)$/gim;
let approachMatch;
while ((approachMatch = APPROACH_FIELD.exec(writtenContent)) !== null) {
  const approachValue = (approachMatch[1] || '').replace(/[*_`]/g, '').trim();
  if (approachValue === '' || /^<.*>$/.test(approachValue)) {
    problems.push('an "Approach (ladder rung)" field is empty or still a `<placeholder>`');
    break;
  }
}

if (isPlanArtifact) {
  const stageSections = writtenContent.split(/^###\s+Stage\b/im).slice(1);
  const stageMissingApproach = stageSections.some(
    (stageSection) => !/[*_]*\s*Approach[^:\n]*:/i.test(stageSection)
  );
  if (stageMissingApproach) {
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
