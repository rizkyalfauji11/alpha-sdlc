#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ancestorsOf, sdlcRootOf } = require('./lib/sdlc-context');
const { postEditDocument } = require('./validate-doc-tables');

const JAVASCRIPT_FAMILY = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'vue', 'svelte']);
const SLASH_COMMENT_LANGUAGES = new Set([
  ...JAVASCRIPT_FAMILY,
  'kt', 'kts', 'java', 'swift', 'go', 'rs', 'php', 'c', 'cc', 'cpp', 'cxx', 'h', 'hpp', 'hh', 'cs', 'scala', 'dart',
  'm', 'mm', 'gradle', 'groovy',
]);
const SHELL_LANGUAGES = new Set(['sh', 'bash', 'zsh']);
const HASH_COMMENT_LANGUAGES = new Set(['py', 'rb', ...SHELL_LANGUAGES]);
const SQL_LANGUAGES = new Set(['sql']);
const MARKUP_COMMENT_LANGUAGES = new Set(['vue', 'svelte']);
const TRIPLE_QUOTE_LANGUAGES = new Set(['py', 'kt', 'kts', 'java', 'swift', 'scala', 'groovy', 'gradle', 'dart']);
const NESTED_BLOCK_COMMENT_LANGUAGES = new Set(['kt', 'kts', 'swift', 'scala', 'rs', 'dart']);
const MULTILINE_QUOTE_LANGUAGES = new Set([...SHELL_LANGUAGES, 'rb', 'php', 'sql']);
const HEREDOC_OPENERS = {
  sh: /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/y,
  bash: /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/y,
  zsh: /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/y,
  rb: /<<[~-]?(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/y,
  php: /<<<[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/y,
};

const GENERATED_DIRECTORY = /(^|\/)(node_modules|dist|build|out|target|vendor|\.next|\.nuxt|coverage)\//;
const GENERATED_FILENAME = /\.(min|generated|gen|freezed|g|pb|pb2)\.[a-z]+$/i;
const GENERATED_MARKER = /(?:generated code|code generated|do not edit|do not modify|@generated\b|auto-?generated\b)/i;
const LICENSE_TEXT = /copyright|license|licence|spdx-license-identifier|all rights reserved/i;
const LICENSE_HEADER_LAST_LINE = 15;
const LISTED_FINDINGS = 20;
const EXCERPT_LENGTH = 60;

const MACHINE_DIRECTIVE = new RegExp(
  '^\\s*(?:' +
    '@?ts-(?:ignore|expect-error|nocheck|check)|' +
    'eslint(?:-disable|-enable|-env)?[\\w-]*\\b|globals\\s|jshint\\s|jslint\\s|tslint:|' +
    'prettier-ignore|biome-ignore|@formatter:(?:on|off)|' +
    '(?:istanbul|c8|v8|coverage)\\s+ignore|noinspection|deno-lint-ignore|' +
    'swiftlint:|ktlint-disable|detekt:|' +
    'noqa|type:\\s*ignore|pylint:|mypy:|ruff:|flake8:|pragma:|fmt:\\s*(?:on|off)|nosec|bandit\\b|' +
    'pyright:|isort:|-\\*-.*coding[:=]|(?:en)?coding[:=]\\s*[-\\w.]+|' +
    'go:[a-z]+|\\+build\\b|nolint|' +
    'shellcheck\\s|rubocop:|frozen_string_literal:|' +
    'phpcs:|phpstan-|psalm-|codingStandardsIgnore|' +
    'ignore:\\s|ignore_for_file:|' +
    'clang-format\\s+(?:on|off)|webpack[A-Z]\\w*:|[#@]__(?:PURE|NO_SIDE_EFFECTS)__|' +
    '@flow\\b|@jsx(?:ImportSource|Runtime|Frag)?\\b|@(?:jest|vitest)-environment\\b|' +
    'sourceMappingURL|sourceURL' +
  ')',
  'i'
);
const COMMENT_OPENER = /^\s*(?:\/\/+!?|\/\*+|#+|--|<!--|\*+)/;
const COMMENT_CLOSER = /(?:\*\/|-->)\s*$/;
const REGEX_LITERAL_CAN_START_AFTER = /[=(,:[!&|?{};+\-*%~^<>]/;
const PYTHON_STATEMENT_PREFIX = /^[ \t]*[rubfRUBF]{0,2}$/;
const GO_EXPORTED_TOP_LEVEL = /^(?:func\s+(?:\([^)]*\)\s*)?|type\s+|var\s+|const\s+)([A-Z]\w*)/;
const GO_PACKAGE_CLAUSE = /^package\s+\w/;
const GO_EXPORTED_MEMBER = /^\*?([A-Z]\w*)/;
const GO_TEST_FILE = /_test\.go$/;
const GO_GROUP_KEYWORD = /^(?:const|var|type)$/;
const GO_TYPE_BODY = /\b(?:struct|interface)\s*$/;

function extensionOf(filePath) {
  return (filePath.match(/\.([^./]+)$/) || [, ''])[1].toLowerCase();
}

function syntaxFor(extension) {
  const lineComment = SLASH_COMMENT_LANGUAGES.has(extension) ? '//'
    : HASH_COMMENT_LANGUAGES.has(extension) ? '#'
    : SQL_LANGUAGES.has(extension) ? '--'
    : null;
  if (!lineComment) return null;
  return {
    lineComment,
    blockComment: SLASH_COMMENT_LANGUAGES.has(extension) || SQL_LANGUAGES.has(extension),
    nestedBlockComments: NESTED_BLOCK_COMMENT_LANGUAGES.has(extension),
    markupComment: MARKUP_COMMENT_LANGUAGES.has(extension),
    regexLiterals: JAVASCRIPT_FAMILY.has(extension),
    tripleQuotes: TRIPLE_QUOTE_LANGUAGES.has(extension),
    multilineQuotes: MULTILINE_QUOTE_LANGUAGES.has(extension),
    shell: SHELL_LANGUAGES.has(extension),
    heredocOpener: HEREDOC_OPENERS[extension] || null,
    heredocTerminatorMayTrail: extension === 'php',
    python: extension === 'py',
    go: extension === 'go',
  };
}

function lexSource(source, syntax) {
  const comments = [];
  const code = [];
  const pendingHeredocs = [];
  const length = source.length;
  let index = 0;
  let lineNumber = 1;
  let lineStart = 0;
  let lastSignificant = '';
  let bracketDepth = 0;

  function passOver(end, asCode) {
    for (let position = index; position < end; position++) {
      const character = source[position];
      code.push(character === '\n' ? '\n' : asCode ? character : ' ');
      if (character === '\n') {
        lineNumber++;
        lineStart = position + 1;
      }
    }
    index = end;
  }

  function endOfLine(from) {
    const newline = source.indexOf('\n', from);
    return newline === -1 ? length : newline;
  }

  function record(start, end, isDoc) {
    const text = source.slice(start, end);
    comments.push({
      offset: start,
      line: lineNumber,
      lastLine: lineNumber + (text.match(/\n/g) || []).length,
      text,
      wholeLine: source.slice(lineStart, start).trim() === '',
      isDoc,
    });
  }

  function closingQuoteEnd(from, delimiter, allowEscapes, crossesLines) {
    let position = from;
    while (position < length) {
      const character = source[position];
      if (allowEscapes && character === '\\') { position += 2; continue; }
      if (!crossesLines && character === '\n') return position;
      if (source.startsWith(delimiter, position)) return position + delimiter.length;
      position++;
    }
    return length;
  }

  function blockCommentEnd(from) {
    let depth = 1;
    let position = from;
    while (position < length) {
      if (source.startsWith('*/', position)) {
        depth--;
        position += 2;
        if (depth === 0 || !syntax.nestedBlockComments) return position;
        continue;
      }
      if (syntax.nestedBlockComments && source.startsWith('/*', position)) {
        depth++;
        position += 2;
        continue;
      }
      position++;
    }
    return length;
  }

  function closingBraceEnd(from) {
    let depth = 1;
    let position = from;
    while (position < length && depth > 0) {
      const character = source[position];
      if (character === '\\') { position += 2; continue; }
      if (character === '{') depth++;
      else if (character === '}') depth--;
      else if (character === '\n') return position;
      position++;
    }
    return position;
  }

  function regexLiteralEnd(from) {
    let insideCharacterClass = false;
    const lineEnd = endOfLine(from);
    for (let position = from + 1; position < lineEnd; position++) {
      const character = source[position];
      if (character === '\\') { position++; continue; }
      if (character === '[') insideCharacterClass = true;
      else if (character === ']') insideCharacterClass = false;
      else if (character === '/' && !insideCharacterClass) return position + 1;
    }
    return -1;
  }

  function startsLineComment() {
    if (!source.startsWith(syntax.lineComment, index)) return false;
    if (syntax.lineComment === '#') {
      if (index === 0 && source.startsWith('#!')) return false;
      return !syntax.shell || index === lineStart || /[\s;&|(]/.test(source[index - 1]);
    }
    if (syntax.lineComment === '--') {
      return (index === lineStart || /\s/.test(source[index - 1])) && source[index + 2] !== '-';
    }
    return true;
  }

  function continuesPreviousLine() {
    let position = lineStart - 2;
    if (source[position] === '\r') position--;
    return position >= 0 && source[position] === '\\';
  }

  function skipHeredocBodies() {
    while (pendingHeredocs.length && index < length) {
      const terminator = pendingHeredocs.shift();
      let cursor = index;
      while (cursor < length) {
        const lineEnd = endOfLine(cursor);
        const trimmed = source.slice(cursor, lineEnd).trim();
        const ends = trimmed === terminator ||
          (syntax.heredocTerminatorMayTrail && trimmed.startsWith(terminator) && !/\w/.test(trimmed[terminator.length] || ''));
        if (ends) {
          passOver(cursor, false);
          passOver(lineEnd, true);
          break;
        }
        cursor = lineEnd < length ? lineEnd + 1 : length;
      }
      if (cursor >= length) passOver(length, false);
    }
  }

  while (index < length) {
    const character = source[index];

    if (character === '\n') {
      passOver(index + 1, true);
      if (pendingHeredocs.length) skipHeredocBodies();
      continue;
    }

    if (startsLineComment()) {
      const end = endOfLine(index);
      record(index, end, syntax.lineComment === '//' && /^\/\/[/!]/.test(source.slice(index, index + 3)));
      passOver(end, false);
      continue;
    }

    if (syntax.blockComment && source.startsWith('/*', index)) {
      const end = blockCommentEnd(index + 2);
      record(index, end, source.startsWith('/**', index) && !source.startsWith('/**/', index));
      passOver(end, false);
      continue;
    }

    if (syntax.markupComment && source.startsWith('<!--', index)) {
      const close = source.indexOf('-->', index + 4);
      const end = close === -1 ? length : close + 3;
      record(index, end, false);
      passOver(end, false);
      continue;
    }

    if (syntax.tripleQuotes && (source.startsWith('"""', index) || source.startsWith("'''", index))) {
      const delimiter = source.slice(index, index + 3);
      const end = closingQuoteEnd(index + 3, delimiter, true, true);
      const isStatement = syntax.python && bracketDepth === 0 &&
        PYTHON_STATEMENT_PREFIX.test(source.slice(lineStart, index)) && !continuesPreviousLine();
      if (isStatement) record(index, end, true);
      passOver(end, false);
      lastSignificant = '"';
      continue;
    }

    if (syntax.shell && character === '$' && source[index + 1] === '{') {
      passOver(closingBraceEnd(index + 2), true);
      lastSignificant = '}';
      continue;
    }

    if (syntax.shell && character === '$' && source[index + 1] === "'") {
      passOver(index + 1, true);
      passOver(closingQuoteEnd(index + 1, "'", true, true), false);
      lastSignificant = "'";
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      const allowEscapes = !(syntax.shell && character === "'");
      const crossesLines = character === '`' || syntax.multilineQuotes;
      passOver(closingQuoteEnd(index + 1, character, allowEscapes, crossesLines), false);
      lastSignificant = character;
      continue;
    }

    if (syntax.heredocOpener && character === '<' && source[index - 1] !== '<') {
      syntax.heredocOpener.lastIndex = index;
      const opener = syntax.heredocOpener.exec(source);
      if (opener) {
        pendingHeredocs.push(opener[2]);
        passOver(index + opener[0].length, true);
        lastSignificant = opener[0][opener[0].length - 1];
        continue;
      }
    }

    if (syntax.regexLiterals && character === '/' &&
        (lastSignificant === '' || REGEX_LITERAL_CAN_START_AFTER.test(lastSignificant))) {
      const end = regexLiteralEnd(index);
      if (end !== -1) {
        passOver(end, true);
        lastSignificant = '/';
        continue;
      }
    }

    if (character === '\\') {
      passOver(Math.min(index + 2, length), true);
      continue;
    }

    if ('([{'.includes(character)) bracketDepth++;
    else if (')]}'.includes(character)) bracketDepth = Math.max(0, bracketDepth - 1);
    if (!/\s/.test(character)) lastSignificant = character;
    passOver(index + 1, true);
  }

  return { comments, code: code.join('') };
}

function goExportedDeclarationNames(codeText) {
  const exported = new Map();
  const openers = [];
  codeText.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    const context = openers.length ? openers[openers.length - 1] : 'top';
    const topLevel = context === 'top' ? GO_EXPORTED_TOP_LEVEL.exec(trimmed) : null;
    const member = context === 'group' || context === 'type' ? GO_EXPORTED_MEMBER.exec(trimmed) : null;
    if (topLevel || member) exported.set(index + 1, (topLevel || member)[1]);
    if (context === 'top' && GO_PACKAGE_CLAUSE.test(trimmed)) exported.set(index + 1, 'Package');
    for (let position = 0; position < line.length; position++) {
      const character = line[position];
      const current = openers.length ? openers[openers.length - 1] : 'top';
      if (character === '(') {
        openers.push(current === 'top' && GO_GROUP_KEYWORD.test(line.slice(0, position).trim()) ? 'group' : 'other');
      } else if (character === '{') {
        openers.push(GO_TYPE_BODY.test(line.slice(0, position)) ? 'type' : 'other');
      } else if ((character === ')' || character === '}') && openers.length) {
        openers.pop();
      }
    }
  });
  return exported;
}

function commentGroups(comments) {
  const groups = [];
  for (const comment of comments) {
    const previous = groups.length ? groups[groups.length - 1] : null;
    const previousComment = previous ? previous[previous.length - 1] : null;
    const joinsPrevious = previousComment && previousComment.wholeLine && comment.wholeLine &&
      comment.line === previousComment.lastLine + 1;
    if (joinsPrevious) previous.push(comment);
    else groups.push([comment]);
  }
  return groups;
}

function startsWithDeclaredName(commentText, name) {
  const words = commentText.replace(/^\/\/+\s*/, '').split(/\s+/);
  const named = /^(?:A|An|The)$/.test(words[0]) ? words[1] : words[0];
  return (named || '').replace(/[^\w]+$/, '') === name;
}

function markGoDocComments(comments, codeText) {
  const exportedNames = goExportedDeclarationNames(codeText);
  for (const group of commentGroups(comments)) {
    const last = group[group.length - 1];
    const declaredName = exportedNames.get(last.lastLine + 1);
    const isLineCommentBlock = group.every((comment) => comment.wholeLine && comment.text.startsWith('//'));
    if (isLineCommentBlock && declaredName && startsWithDeclaredName(group[0].text, declaredName)) {
      group.forEach((comment) => { comment.isDoc = true; });
    }
  }
}

function licenseHeaderComments(comments) {
  const allowed = new Set();
  for (const group of commentGroups(comments)) {
    const groupText = group.map((comment) => comment.text).join('\n');
    if (group[0].line <= LICENSE_HEADER_LAST_LINE && LICENSE_TEXT.test(groupText)) {
      group.forEach((comment) => allowed.add(comment));
    }
  }
  return allowed;
}

function isMachineDirective(comment) {
  const body = comment.text.replace(COMMENT_OPENER, '').replace(COMMENT_CLOSER, '');
  return MACHINE_DIRECTIVE.test(body);
}

function isDirectory(candidate) {
  try { return fs.statSync(candidate).isDirectory(); } catch { return false; }
}

function commentAllowlistFor(filePath) {
  const profileRoot = ancestorsOf(path.dirname(filePath)).find((directory) => isDirectory(path.join(directory, 'docs', 'basics')));
  if (!profileRoot) return {};
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(profileRoot, 'docs', 'basics', '.alpha-sdlc.json'), 'utf8'));
    return settings && typeof settings === 'object' ? settings : {};
  } catch {
    return {};
  }
}

function excerptOf(text) {
  const flattened = text.trim().replace(/\s+/g, ' ');
  return flattened.length > EXCERPT_LENGTH ? flattened.slice(0, EXCERPT_LENGTH - 1) + '…' : flattened;
}

function blockMessage(filePath, findings) {
  const listed = findings.slice(0, LISTED_FINDINGS).map((finding) => `  line ${finding.line}: ${excerptOf(finding.text)}`);
  const overflow = findings.length > LISTED_FINDINGS ? [`  (+${findings.length - LISTED_FINDINGS} more)`] : [];
  return [
    `Comment in source code — ${findings.length} to delete in ${filePath}:`,
    ...listed,
    ...overflow,
    'Code carries zero comments (principles.md → *Comments: none*): delete each one and let names carry its ' +
    'meaning — rename the variable, extract and name the function, name the constant — and put a why that no ' +
    'name can hold in the commit message. Only machine directives stay (eslint-disable, @ts-expect-error, ' +
    '# noqa, # type: ignore, # pragma: no cover, //go:build, swiftlint:disable, shebangs), plus license headers ' +
    'or public-API doc comments when the Org comment allowlist in docs/basics/.alpha-sdlc.json permits them.',
  ].join('\n') + '\n';
}

function main() {
  let payload;
  try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return 0; }

  const toolName = payload.tool_name || '';
  const toolInput = payload.tool_input || {};
  const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
  const syntax = syntaxFor(extensionOf(filePath));
  if (!syntax) return 0;
  if (GENERATED_DIRECTORY.test(filePath) || GENERATED_FILENAME.test(filePath)) return 0;
  const absolutePath = path.resolve(payload.cwd || process.cwd(), filePath);
  if (!sdlcRootOf(absolutePath)) return 0;

  const writtenContent =
    toolName === 'Write' ? (toolInput.content || '')
    : toolName === 'Edit' ? (toolInput.new_string || '')
    : '';
  if (!writtenContent.trim()) return 0;

  const document = postEditDocument(toolName, toolInput, absolutePath) ||
    { text: writtenContent, spans: [[0, writtenContent.length]] };
  if (GENERATED_MARKER.test(document.text.split(/\r?\n/).slice(0, 5).join('\n'))) return 0;

  const { comments, code } = lexSource(document.text, syntax);
  if (syntax.go && !GO_TEST_FILE.test(filePath)) markGoDocComments(comments, code);

  const allowlist = commentAllowlistFor(absolutePath);
  const licenseHeader = allowlist.allowLicenseHeader === true ? licenseHeaderComments(comments) : new Set();
  const writtenByThisChange = (comment) =>
    document.spans.some(([spanStart, spanEnd]) => comment.offset >= spanStart && comment.offset < spanEnd);

  const findings = comments.filter((comment) =>
    writtenByThisChange(comment) &&
    !isMachineDirective(comment) &&
    !licenseHeader.has(comment) &&
    !(allowlist.allowPublicApiDocstrings === true && comment.isDoc)
  );
  if (!findings.length) return 0;

  process.stderr.write(blockMessage(filePath, findings));
  return 2;
}

process.exitCode = main();
