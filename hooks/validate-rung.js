#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { sdlcRootOf } = require('./lib/sdlc-context');
const { postEditDocument } = require('./validate-doc-tables');

const SKILL_OWNED_TEMPLATE = /(^|\/)skills\//;
const TEMPLATE_FILENAME = /-template\.md$/;
const TRD_ARTIFACT = /docs\/development\/.*TRD[^/]*\.md$/;
const PLAN_ARTIFACT = /(^|\/)plan-[^/]*\.md$/;
const UNMISTAKABLE_LEFTOVER_PLACEHOLDER = /<(?:YYYY-MM-DD|hash|feature name|engineer|placeholder)>/i;
const COMMIT_PLACEHOLDER = /(?:^|[\s`(|])<commit>(?=$|[\s`_|).,;])/i;
const STAMP_CONTEXT = /·|\bapproved\b|\breviewed\b|\brev\b/i;

const APPROACH_LINE = /^(\s*)((?:[-*+]|\d+[.)])\s+)?[*_]*\s*Approach(.*)$/i;
const DASH_SEPARATED = /^(.*?)(?:\s[—–-]+\s|[—–])(.*)$/;
const APPROACH_MENTION = /Approach[^:\n]*:|Approach\s*[—–]/i;
const STAGE_HEADING = /^ {0,3}###\s+(Stage\s+[A-Za-z]*\d[\w.-]*)/i;
const SECTION_HEADING = /^ {0,3}#{1,2}\s/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;
const LIST_MARKER = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?/;
const NEW_BLOCK = /^\s*(?:#{1,6}\s|>|\||`{3,}|~{3,}|(?:[-*_]\s*){3,}$)/;
const HEADING = /^\s*#{1,6}\s/;
const THEMATIC_BREAK = /^\s*(?:[-*_]\s*){3,}$/;
const BOLD_LABEL = /^\s*[*_]{2}[^*_\n]*?(?::\s*[*_]{2}|[*_]{2}\s*:)/;
const RUNG_NAMED_IN_LABEL = /\brung\s*\d/i;
const WHOLE_VALUE_PLACEHOLDER = /^<[\s\S]*>$/;
const MEANINGFUL_CHARACTER = /[\p{L}\p{N}]/u;
const LISTED_PROBLEMS = 10;

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function fencedLineFlags(lines) {
  const fenced = [];
  let openFence = null;
  for (const line of lines) {
    const fence = FENCE.exec(line);
    if (openFence) {
      fenced.push(true);
      const closes = fence && fence[1][0] === openFence[0] && fence[1].length >= openFence.length &&
        line.trim() === fence[1];
      if (closes) openFence = null;
      continue;
    }
    fenced.push(Boolean(fence));
    if (fence) openFence = fence[1];
  }
  return fenced;
}

function approachFieldOn(line) {
  const match = APPROACH_LINE.exec(line);
  if (!match) return null;
  const rest = match[3];
  const colon = rest.indexOf(':');
  const dashed = colon === -1 ? DASH_SEPARATED.exec(rest) : null;
  if (colon === -1 && !dashed) return null;
  return {
    indent: match[1].length,
    isListItem: Boolean(match[2]),
    label: colon === -1 ? dashed[1] : rest.slice(0, colon),
    inlineValue: colon === -1 ? dashed[2] : rest.slice(colon + 1),
  };
}

function endsApproachValue(line, fieldIndent) {
  if (indentOf(line) > fieldIndent) return false;
  return LIST_ITEM.test(line) || NEW_BLOCK.test(line) || BOLD_LABEL.test(line) || Boolean(approachFieldOn(line));
}

function approachFields(lines, fenced) {
  const fields = [];
  lines.forEach((line, index) => {
    if (fenced[index]) return;
    const field = approachFieldOn(line);
    if (!field) return;
    const fieldIndent = field.indent;
    const isListItem = field.isListItem;
    const valueParts = [field.inlineValue];
    let lastIndex = index;
    let cursor = index + 1;
    while (cursor < lines.length && !fenced[cursor]) {
      const next = lines[cursor];
      if (next.trim() === '') {
        let ahead = cursor;
        while (ahead < lines.length && lines[ahead].trim() === '') ahead++;
        const listItemContinues = isListItem && ahead < lines.length && !fenced[ahead] && indentOf(lines[ahead]) > fieldIndent;
        if (!listItemContinues) break;
        cursor = ahead;
        continue;
      }
      if (endsApproachValue(next, fieldIndent)) break;
      valueParts.push(next.replace(LIST_MARKER, ''));
      lastIndex = cursor;
      cursor++;
    }
    let value = withoutEmphasisEdges(valueParts.join(' '));
    if (!value && !isListItem) {
      let ahead = index + 1;
      while (ahead < lines.length && lines[ahead].trim() === '') ahead++;
      if (ahead < lines.length && !fenced[ahead] && opensOwnedBlock(lines[ahead])) {
        const blockParts = [];
        while (ahead < lines.length && !fenced[ahead] && lines[ahead].trim() !== '') {
          blockParts.push(lines[ahead].replace(LIST_MARKER, ''));
          lastIndex = ahead;
          ahead++;
        }
        value = withoutEmphasisEdges(blockParts.join(' '));
      }
    }
    fields.push({ line: index + 1, lastLine: lastIndex + 1, label: field.label, value });
  });
  return fields;
}

function withoutEmphasisEdges(text) {
  return text.replace(/^[\s*_]+|[\s*_]+$/g, '');
}

function opensOwnedBlock(line) {
  return !HEADING.test(line) && !BOLD_LABEL.test(line) && !FENCE.test(line) && !THEMATIC_BREAK.test(line) &&
    !approachFieldOn(line);
}

function isFilled(field) {
  if (RUNG_NAMED_IN_LABEL.test(field.label)) return true;
  return MEANINGFUL_CHARACTER.test(field.value) && !WHOLE_VALUE_PLACEHOLDER.test(field.value);
}

function stageSections(lines, fenced) {
  const stages = [];
  let current = null;
  lines.forEach((line, index) => {
    if (fenced[index]) return;
    const stageHeading = STAGE_HEADING.exec(line);
    if (!stageHeading && !SECTION_HEADING.test(line)) return;
    if (current) {
      current.lastLine = index;
      stages.push(current);
      current = null;
    }
    if (stageHeading) current = { name: stageHeading[1].replace(/\s+/g, ' '), line: index + 1, lastLine: lines.length };
  });
  if (current) stages.push(current);
  return stages;
}

function lineNumberAt(text, offset) {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index++) {
    if (text[index] === '\n') line++;
  }
  return line;
}

function touchedLineRanges(document) {
  return document.spans.map(([spanStart, spanEnd]) => [
    lineNumberAt(document.text, spanStart) - (spanStart === spanEnd ? 1 : 0),
    lineNumberAt(document.text, Math.max(spanStart, spanEnd - 1)),
  ]);
}

function rungProblems(document, isPlan) {
  const lines = document.text.split(/\r?\n/);
  const fenced = fencedLineFlags(lines);
  const fields = approachFields(lines, fenced);
  const ranges = touchedLineRanges(document);
  const touches = (first, last) => ranges.some(([from, to]) => first <= to && last >= from);

  const problems = [];
  const fieldsInCheckedStages = new Set();
  for (const stage of isPlan ? stageSections(lines, fenced) : []) {
    if (!touches(stage.line, stage.lastLine)) continue;
    const stageFields = fields.filter((field) => field.line >= stage.line && field.line <= stage.lastLine);
    const stageLines = lines.slice(stage.line - 1, stage.lastLine);
    const mentionsApproach = stageLines.some((line, offset) => !fenced[stage.line - 1 + offset] && APPROACH_MENTION.test(line));
    if (!stageFields.length && !mentionsApproach) {
      problems.push(`${stage.name} (line ${stage.line}) has no **Approach** line naming its ladder rung`);
    }
    stageFields.forEach((field) => fieldsInCheckedStages.add(field));
  }
  for (const field of fields) {
    if (!fieldsInCheckedStages.has(field) && !touches(field.line, field.lastLine)) continue;
    if (!isFilled(field)) problems.push(`the **Approach** field at line ${field.line} is empty or still a \`<placeholder>\``);
  }
  return problems;
}

function stampCommitPlaceholder(text) {
  const line = text.split('\n').find((candidate) => COMMIT_PLACEHOLDER.test(candidate) && STAMP_CONTEXT.test(candidate));
  return line ? ['<commit>'] : null;
}

function main() {
  let payload;
  try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return 0; }

  const toolName = payload.tool_name || '';
  const toolInput = payload.tool_input || {};
  const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';

  if (SKILL_OWNED_TEMPLATE.test(filePath) || TEMPLATE_FILENAME.test(filePath)) return 0;
  const isPlan = PLAN_ARTIFACT.test(filePath);
  if (!isPlan && !TRD_ARTIFACT.test(filePath)) return 0;
  const absolutePath = path.resolve(payload.cwd || process.cwd(), filePath);
  if (!sdlcRootOf(absolutePath)) return 0;

  const writtenContent =
    toolName === 'Write' ? (toolInput.content || '')
    : toolName === 'Edit' ? (toolInput.new_string || '')
    : '';
  const leftoverPlaceholder = writtenContent.match(UNMISTAKABLE_LEFTOVER_PLACEHOLDER) || stampCommitPlaceholder(writtenContent);
  if (leftoverPlaceholder) {
    process.stderr.write(
      `Unfilled template placeholder in the artifact ("${leftoverPlaceholder[0]}") — this doc still carries ` +
      `template scaffolding. Fill every placeholder (dates, names, hashes) before writing; a TRD/plan ` +
      `with leftover <...> tokens is an incomplete section, not a finished one.\n`
    );
    return 2;
  }

  const document = postEditDocument(toolName, toolInput, absolutePath) ||
    (toolName === 'Edit' && writtenContent ? { text: writtenContent, spans: [[0, writtenContent.length]] } : null);
  if (!document || !document.text.trim()) return 0;

  const problems = rungProblems(document, isPlan);
  if (!problems.length) return 0;

  const listed = problems.slice(0, LISTED_PROBLEMS).join('; ');
  const overflow = problems.length > LISTED_PROBLEMS ? ` (+${problems.length - LISTED_PROBLEMS} more)` : '';
  process.stderr.write(
    `Ladder rung missing in ${filePath} — ${listed}${overflow}. ` +
    'Per principles.md the rung is mandatory: name the rung you stopped at ' +
    '(1=skip/YAGNI, 2=reuse, 3=stdlib, 4=native, 5=installed dep, 6=one line, 7=build new) ' +
    'and name the world-wide standard beside it (agrees, or the surfaced conflict per the tiered rule) ' +
    'before writing this artifact. A proposal without a named rung is incomplete.\n'
  );
  return 2;
}

process.exitCode = main();
