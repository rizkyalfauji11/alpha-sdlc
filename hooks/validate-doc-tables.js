#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { sdlcRootOf } = require('./lib/sdlc-context');

const MARKDOWN_FILE = /\.md$/i;
const CURLY_SINGLE_QUOTES = /[‘’]/g;
const CURLY_DOUBLE_QUOTES = /[“”]/g;

function straightenQuotes(text) {
  return text.replace(CURLY_SINGLE_QUOTES, "'").replace(CURLY_DOUBLE_QUOTES, '"');
}

function readTextOrNull(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

function postEditDocument(toolName, toolInput, filePath) {
  if (toolName === 'Write') {
    const text = typeof toolInput.content === 'string' ? toolInput.content : '';
    return { text, spans: [[0, text.length]] };
  }
  if (toolName !== 'Edit') return null;
  const oldString = typeof toolInput.old_string === 'string' ? toolInput.old_string : '';
  const newString = typeof toolInput.new_string === 'string' ? toolInput.new_string : '';
  const originalText = readTextOrNull(filePath);
  if (!oldString) return originalText ? null : { text: newString, spans: [[0, newString.length]] };
  if (originalText === null) return null;
  const replaceAll = toolInput.replace_all === true;
  const replaced = replacedDocument(originalText, oldString, newString, replaceAll);
  if (replaced || !originalText.includes('\r\n')) return replaced;
  return replacedDocument(withLineFeeds(originalText), withLineFeeds(oldString), withLineFeeds(newString), replaceAll);
}

function withLineFeeds(text) {
  return text.replace(/\r\n/g, '\n');
}

function replacedDocument(originalText, oldString, newString, replaceAll) {
  const exactMatch = originalText.includes(oldString);
  const searchableText = exactMatch ? originalText : straightenQuotes(originalText);
  const searchedString = exactMatch ? oldString : straightenQuotes(oldString);
  let occurrence = searchableText.indexOf(searchedString);
  if (occurrence === -1) return null;
  let text = '';
  let cursor = 0;
  const spans = [];
  while (occurrence !== -1) {
    text += originalText.slice(cursor, occurrence);
    spans.push([text.length, text.length + newString.length]);
    text += newString;
    cursor = occurrence + searchedString.length;
    if (!replaceAll) break;
    occurrence = searchableText.indexOf(searchedString, cursor);
  }
  return { text: text + originalText.slice(cursor), spans };
}

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

const PROFILE_DOC = /[\\/]docs[\\/]basics[\\/][^\\/]+\.md$/i;
const DEBT_REGISTER = /[\\/]20-tech-debt-register\.md$/i;
const ISO_DATE = /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g;
const STRUCK_TEXT = /~~[^~\n]+~~/;
const TITLE_LINE = /^#\s/;
const SECTION_HEADING = /^#{2,6}\s/;
const STAMP_LINE_MAX_CHARS = 200;
const TABLE_CONSEQUENCE =
  'A table that does not parse takes its content with it — AC rows, status cells and manifest entries stop ' +
  'being readable by the next phase.';
const PROFILE_CONSEQUENCE =
  'Every phase grounds in this doc, so each update line it keeps is read again, for nothing, by every later ' +
  'session; a reader needs what is true now (principles → A document states the current truth).';

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
          heading: 'Broken table',
          consequence: TABLE_CONSEQUENCE,
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
            heading: 'Broken table',
            consequence: TABLE_CONSEQUENCE,
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
        heading: 'Broken table',
        consequence: TABLE_CONSEQUENCE,
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
      heading: 'Broken table',
      consequence: TABLE_CONSEQUENCE,
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

function headRangeOf(lines) {
  const titleIndex = lines.findIndex((line) => TITLE_LINE.test(line));
  const first = titleIndex === -1 ? 0 : titleIndex + 1;
  let end = first;
  while (end < lines.length && !SECTION_HEADING.test(lines[end]) && !PIPE_LEADING_LINE.test(lines[end]) && !fenceAt(lines[end])) end++;
  return [first, end];
}

function profileDocFindings(text, isDebtRegister) {
  const lines = text.split(/\r?\n/);
  const findings = [];
  const [headStart, headEnd] = headRangeOf(lines);
  const headLines = [];
  let dateCount = 0;
  let struckLine = null;
  let longDatedLine = null;
  for (let index = headStart; index < headEnd; index++) {
    headLines.push(index + 1);
    const dates = lines[index].match(ISO_DATE) || [];
    dateCount += dates.length;
    if (dates.length && lines[index].length > STAMP_LINE_MAX_CHARS && longDatedLine === null) longDatedLine = index + 1;
    if (STRUCK_TEXT.test(lines[index]) && struckLine === null) struckLine = index + 1;
  }
  const problems = [];
  if (dateCount > 1) problems.push(`${dateCount} dates`);
  if (longDatedLine !== null) {
    problems.push(`a ${lines[longDatedLine - 1].length}-character dated line at line ${longDatedLine} (a stamp fits in ${STAMP_LINE_MAX_CHARS})`);
  }
  if (struckLine !== null) problems.push(`struck-through text at line ${struckLine}`);
  if (problems.length) {
    findings.push({
      heading: 'Profile doc keeps history',
      consequence: PROFILE_CONSEQUENCE,
      lines: headLines,
      message:
        `its head (the lines above its first section) carries ${problems.join(', ')} — a profile doc's head is ` +
        'its title, ONE stamp line and its description, never a list of the updates it went through',
      remedy:
        'Rewrite the head: the title, ONE stamp line as the doc\'s template writes it — ' +
        '`_Generated by `do-project-setup` · commit `<hash>` · approved <YYYY-MM-DD>_`, with the commit rewritten and ' +
        'the approval kept (re-dated only when the user approves the doc again; a doc written before the code exists ' +
        'keeps `prescriptive (pre-code) · approved <date>` in place of the commit) — and the description. ' +
        'A fact the history holds that the body lacks moves into its section; the rest — what changed, when, by ' +
        'which feature or stage, reconcile and verify notes, retired or struck items — is deleted: the commit ' +
        'message and the step summary say what changed, and git keeps it.',
    });
  }
  if (isDebtRegister) return findings;
  let openFence = null;
  for (let index = headEnd; index < lines.length; index++) {
    const fence = fenceAt(lines[index]);
    if (openFence) {
      if (fence && fence.marker === openFence.marker && fence.length >= openFence.length && fence.rest.trim() === '') openFence = null;
      continue;
    }
    if (fence) { openFence = fence; continue; }
    if (INDENTED_CODE_LINE.test(lines[index]) || !STRUCK_TEXT.test(lines[index])) continue;
    findings.push({
      heading: 'Profile doc keeps history',
      consequence: PROFILE_CONSEQUENCE,
      exactLines: true,
      lines: [index + 1],
      message: `line ${index + 1} strikes text through — a profile doc keeps no struck-out old value or retired item`,
      remedy:
        'Delete what is no longer true and keep only the current fact; the commit message says what changed. ' +
        'Only the tech-debt register keeps paid rows struck through.',
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

function main() {
  let payload;
  try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return 0; }

  const toolInput = payload.tool_input || {};
  const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
  if (!MARKDOWN_FILE.test(filePath)) return 0;
  const absolutePath = path.resolve(payload.cwd || process.cwd(), filePath);
  if (!sdlcRootOf(absolutePath)) return 0;

  const document = postEditDocument(payload.tool_name || '', toolInput, absolutePath);
  if (!document || !document.text.trim()) return 0;
  const documentText = document.text;

  const exactLineRanges = document.spans.map(([spanStart, spanEnd]) => [
    lineAtOffset(documentText, spanStart),
    lineAtOffset(documentText, Math.max(spanStart, spanEnd - 1)),
  ]);
  const touchedLineRanges = exactLineRanges.map(([first, last]) => [Math.max(1, first - 1), last + 1]);

  const findings = tableFindings(documentText);
  if (PROFILE_DOC.test(absolutePath)) findings.push(...profileDocFindings(documentText, DEBT_REGISTER.test(absolutePath)));
  if (!findings.length) return 0;

  const editedFindings = findings.filter((finding) => {
    if (finding.always) return true;
    const ranges = finding.exactLines ? exactLineRanges : touchedLineRanges;
    return finding.lines.some((line) => ranges.some(([first, last]) => line >= first && line <= last));
  });
  const untouchedFindings = findings.filter((finding) => !editedFindings.includes(finding));

  const moreInEdit = editedFindings.length > 1 ? ` (+${editedFindings.length - 1} more in this change)` : '';
  const elsewhere = untouchedFindings.length
    ? ` ${untouchedFindings.length} further finding(s) already in this file, outside your edit, are not blocking: ` +
      `line(s) ${untouchedFindings.map((finding) => finding.lines[0]).join(', ')}.`
    : '';

  if (!editedFindings.length) {
    process.stdout.write(
      `Note — finding(s) in ${filePath} outside the region this edit touches, not blocking: ` +
      `${untouchedFindings[0].heading.toLowerCase()}: ${untouchedFindings[0].message}` +
      (untouchedFindings.length > 1 ? ` (+${untouchedFindings.length - 1} more)` : '') + '.\n'
    );
    return 0;
  }

  const [first] = editedFindings;
  process.stderr.write(
    `${first.heading} in ${filePath} — ${first.message}${moreInEdit}. ${first.remedy} ${first.consequence}${elsewhere}\n`
  );
  return 2;
}

if (require.main === module) process.exitCode = main();

module.exports = { postEditDocument };
