#!/usr/bin/env node

const fs = require('fs');

let payload;
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }

const toolName = payload.tool_name || '';
const toolInput = payload.tool_input || {};
const filePath = toolInput.file_path || '';

const MARKDOWN_FILE = /\.md$/i;
if (!MARKDOWN_FILE.test(filePath)) process.exit(0);

let documentText = '';
const touchedSpans = [];

if (toolName === 'Write') {
  documentText = toolInput.content || '';
  touchedSpans.push([0, documentText.length]);
} else if (toolName === 'Edit') {
  const oldString = typeof toolInput.old_string === 'string' ? toolInput.old_string : '';
  const newString = typeof toolInput.new_string === 'string' ? toolInput.new_string : '';
  if (!oldString) process.exit(0);
  let originalText;
  try { originalText = fs.readFileSync(filePath, 'utf8'); } catch { process.exit(0); }
  let occurrence = originalText.indexOf(oldString);
  if (occurrence === -1) process.exit(0);
  const replaceEveryOccurrence = toolInput.replace_all === true;
  let cursor = 0;
  while (occurrence !== -1) {
    documentText += originalText.slice(cursor, occurrence);
    const spanStart = documentText.length;
    documentText += newString;
    touchedSpans.push([spanStart, documentText.length]);
    cursor = occurrence + oldString.length;
    if (!replaceEveryOccurrence) break;
    occurrence = originalText.indexOf(oldString, cursor);
  }
  documentText += originalText.slice(cursor);
} else {
  process.exit(0);
}

if (!documentText.trim()) process.exit(0);

function isEscaped(text, index) {
  let backslashes = 0;
  for (let scan = index - 1; scan >= 0 && text[scan] === '\\'; scan--) backslashes++;
  return backslashes % 2 === 1;
}

function hasUnescapedPipe(text) {
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '|' && !isEscaped(text, index)) return true;
  }
  return false;
}

function tableCells(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !isEscaped(row, row.length - 1)) row = row.slice(0, -1);
  const cells = [];
  let cell = '';
  for (let index = 0; index < row.length; index++) {
    const character = row[index];
    if (character === '\\') { cell += character + (row[index + 1] || ''); index++; continue; }
    if (character === '|') { cells.push(cell); cell = ''; continue; }
    cell += character;
  }
  cells.push(cell);
  return cells;
}

const CELL_COUNTING_REMEDY =
  'Count CELLS, not pipes: strip one leading and one trailing `|`, then split on the unescaped `|` that ' +
  'remain — a row that omits its trailing pipe is not thereby correct, and an escaped `\\|` inside a cell is ' +
  'not a separator. Give every row exactly the header\'s cell count.';

const INDENTED_CODE_LINE = /^(?: {4,}|\t)/;
const PIPE_LEADING_LINE = /^ {0,3}\|/;
const DELIMITER_CELL = /^:?-+:?$/;

function isDelimiterRow(line) {
  if (INDENTED_CODE_LINE.test(line) || !hasUnescapedPipe(line)) return false;
  const cells = tableCells(line);
  return cells.every((cell) => DELIMITER_CELL.test(cell.trim()));
}

function fenceAt(line) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  return match ? { marker: match[1][0], length: match[1].length, rest: match[2] } : null;
}

function tableFindings(text) {
  const lines = text.split(/\r?\n/);
  const findings = [];
  let openFence = null;
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    const fence = fenceAt(line);

    if (openFence) {
      if (fence && fence.marker === openFence.marker && fence.length >= openFence.length && fence.rest.trim() === '') {
        openFence = null;
      }
      lineIndex++;
      continue;
    }
    if (fence) {
      openFence = { marker: fence.marker, length: fence.length, line: lineIndex + 1 };
      lineIndex++;
      continue;
    }

    const startsTable =
      line.trim() !== '' &&
      !INDENTED_CODE_LINE.test(line) &&
      hasUnescapedPipe(line) &&
      lineIndex + 1 < lines.length &&
      isDelimiterRow(lines[lineIndex + 1]);

    if (startsTable) {
      const headerLine = lineIndex + 1;
      const delimiterLine = lineIndex + 2;
      const headerCellCount = tableCells(line).length;
      const delimiterCellCount = tableCells(lines[lineIndex + 1]).length;
      const bodyRows = [];
      let bodyIndex = lineIndex + 2;
      while (bodyIndex < lines.length) {
        const bodyLine = lines[bodyIndex];
        if (bodyLine.trim() === '' || INDENTED_CODE_LINE.test(bodyLine) || fenceAt(bodyLine) || !hasUnescapedPipe(bodyLine)) break;
        bodyRows.push({ line: bodyIndex + 1, cellCount: tableCells(bodyLine).length });
        bodyIndex++;
      }

      if (headerCellCount !== delimiterCellCount) {
        findings.push({
          lines: [headerLine, delimiterLine],
          message:
            `the header at line ${headerLine} has ${headerCellCount} cells but its \`---\` row has ` +
            `${delimiterCellCount} — GFM then treats the whole block as literal pipe text, not a table`,
          remedy: CELL_COUNTING_REMEDY,
        });
      } else {
        for (const row of bodyRows) {
          if (row.cellCount === headerCellCount) continue;
          findings.push({
            lines: [row.line, headerLine],
            message:
              `the row at line ${row.line} has ${row.cellCount} cells, its header (line ${headerLine}) has ` +
              `${headerCellCount} — GFM ` +
              (row.cellCount > headerCellCount
                ? 'silently DROPS the cells past the header count'
                : 'leaves the missing columns EMPTY, which is how a decided item renders as an open one'),
            remedy: CELL_COUNTING_REMEDY,
          });
        }
      }

      lineIndex = bodyIndex;
      continue;
    }

    if (!INDENTED_CODE_LINE.test(line) && PIPE_LEADING_LINE.test(line)) {
      findings.push({
        lines: [lineIndex + 1],
        message:
          `the row at line ${lineIndex + 1} belongs to no table — its \`---\` row is missing, or a blank line ` +
          `or prose cuts it off from its header, so it renders as literal text`,
        remedy:
          'Re-attach the row to its table — delete the blank line or prose that cut it off — or give the block ' +
          'its own header and `---` row.',
      });
    }
    lineIndex++;
  }

  if (openFence) {
    findings.push({
      always: true,
      lines: [openFence.line],
      message:
        `the code fence opened at line ${openFence.line} is never closed — every line below it reads as ` +
        `fenced code, so no table after it could be checked`,
      remedy: 'Close that fence, or delete the stray one — the tables below it are unchecked until you do.',
    });
  }

  return findings;
}

function lineAtOffset(text, offset) {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index++) {
    if (text[index] === '\n') line++;
  }
  return line;
}

const touchedLineRanges = touchedSpans.map(([spanStart, spanEnd]) => [
  Math.max(1, lineAtOffset(documentText, spanStart) - 1),
  lineAtOffset(documentText, Math.max(spanStart, spanEnd - 1)) + 1,
]);

const findings = tableFindings(documentText);
if (!findings.length) process.exit(0);

const editedFindings = findings.filter((finding) =>
  finding.always || finding.lines.some((line) => touchedLineRanges.some(([first, last]) => line >= first && line <= last))
);
const untouchedFindings = findings.filter((finding) => !editedFindings.includes(finding));

const moreInEdit = editedFindings.length > 1 ? ` (+${editedFindings.length - 1} more in this change)` : '';
const elsewhere = untouchedFindings.length
  ? ` ${untouchedFindings.length} further table finding(s) already in this file, outside your edit, are not blocking: ` +
    `line(s) ${untouchedFindings.map((finding) => finding.lines[0]).join(', ')}.`
  : '';

if (!editedFindings.length) {
  process.stdout.write(
    `Note — table finding(s) in ${filePath} outside the region this edit touches, not blocking: ` +
    `${untouchedFindings[0].message}` +
    (untouchedFindings.length > 1 ? ` (+${untouchedFindings.length - 1} more)` : '') + '.\n'
  );
  process.exit(0);
}

process.stderr.write(
  `Broken table in ${filePath} — ${editedFindings[0].message}${moreInEdit}. ${editedFindings[0].remedy} ` +
  `A table that does not parse takes its content with it — AC rows, status cells and manifest entries stop ` +
  `being readable by the next phase.${elsewhere}\n`
);
process.exit(2);
