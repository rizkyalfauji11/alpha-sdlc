#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ancestorsOf, sdlcRootOf } = require('./lib/sdlc-context');

const MARKDOWN_MENTION = /\.md\b/i;
const MARKDOWN_PATH = /\.md$/i;
const OTHER_EXTENSION = /\.(?!md$)[A-Za-z0-9]{1,8}$/i;
const CANDIDATE_BOUNDARY = /[\s'"`<>|;&()=,]/;
const STRING_JOIN = /(['"])[ \t]*([+,/])[ \t]*(['"])/g;
const CONCATENATED_STRINGS = /(['"])[ \t]*\+[ \t]*(['"])/g;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/;
const NAMED_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)\+?=([\s\S]*)$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VARIABLE_REFERENCE = /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g;
const VARIABLE_NAME = /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])/;
const DECLARATION_COMMANDS = new Set(['export', 'local', 'declare', 'readonly', 'typeset']);
const MAX_EXPANSIONS = 64;
const SHELL_KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', '!', '{', '}', 'time']);
const NON_COMMAND_KEYWORDS = new Set(['for', 'case', 'select', 'function', 'esac', '[[', '[', 'test']);
const WRAPPER_ARGUMENT_LETTERS = {
  sudo: 'ugCDhprtUT',
  env: 'uCS',
  command: '',
  builtin: '',
  exec: 'a',
  nice: 'n',
  nohup: '',
  stdbuf: 'ioe',
  timeout: 'sk',
  xargs: 'ILnPsdEa',
};
const WRITE_REDIRECTS = new Set(['>', '>>', '>|', '&>', '&>>', '<>']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const SCRIPT_INTERPRETER = /^(?:python[\d.]*|pypy[\d.]*|node(?:js)?|deno|bun|ts-node|tsx|uvx?|poetry|pipenv|npx)$/;
const PYTHON_WRITE = /write_text\(|write_bytes\(|\.write\(|writelines\(/;
const PYTHON_OPEN_FOR_WRITING = /open\([^)]*,\s*['"][wax+][^'"]*['"]|open\([^)]*mode\s*=\s*['"][wax+]/;
const NODE_WRITE = /writeFileSync|appendFileSync|createWriteStream|fs\.writeFile|fs\.appendFile|fs\.promises\.writeFile/;
const STANDARD_STREAM_WRITE = /\b(?:sys\.|process\.)?std(?:out|err)\.write\(/g;
const WRITE_CALL = new RegExp(
  '(?:\\b(?:shutil\\.(?:copy|copy2|copyfile|move)|os\\.(?:replace|rename)|fs\\.(?:copyFileSync|renameSync|copyFile|rename))\\()|' +
  '(?:\\b(?:fs\\.(?:promises\\.)?)?(?:writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream)\\()|' +
  '(?:\\.(?:write_text|write_bytes|open)\\()|' +
  '(?:(?:\\b(?:io|codecs)\\.|(?<![\\w.]))open\\()',
  'g'
);
const SECOND_ARGUMENT_TARGETS = /^(?:shutil\.|os\.|fs\.(?:copyFile|rename))/;
const WRITE_MODE = /^(['"])[rwxabtU+]*[wax+][rwxabtU+]*\1$/;
const MODE_KEYWORD = /^mode\s*=\s*(.+)$/;
const STRING_LITERAL = /^[rubfRUBF]{0,2}(['"])([\s\S]*)\1$/;
const PATH_WRAPPER = /^(?:pathlib\.)?(?:Path|PurePath|str|os\.path\.(?:abspath|expanduser|realpath|normpath)|path\.(?:resolve|normalize))\(([\s\S]*)\)$/;
const PATH_JOIN = /^(?:os\.path\.join|path\.join|path\.resolve)\(([\s\S]*)\)$/;
const ARGV_ITEM = /^sys\.argv\[(\d+)\]$/;
const ASSIGNED_EXPRESSION = (name) => new RegExp(`(?:^|[\\s;(,])(?:const\\s+|let\\s+|var\\s+)?${name}\\s*=(?!=)\\s*([^\\n;]+)`, 'g');
const MAX_RESOLUTION_DEPTH = 4;
const SED_OPTIONS = { argumentLetters: 'efl', attachedLetters: '', digitLetters: '', scriptLetters: 'ef', scriptLongNames: ['expression', 'file'] };
const PERL_OPTIONS = { argumentLetters: 'eEMmI', attachedLetters: 'xCdDF', digitLetters: '0l', scriptLetters: 'eE', scriptLongNames: [] };
const COPY_LONG_ARGUMENTS = ['target-directory', 'suffix', 'mode', 'owner', 'group'];
const MAX_NESTING = 4;
const STREAM_OPERAND = { value: '', dynamic: true, quoted: false, stream: true };
const DOC = 'doc';
const ELSEWHERE = 'elsewhere';
const UNKNOWN = 'unknown';
const DIRECTORY_PROBE = 'x.md';

function parseShell(source) {
  const events = [];
  const pendingHeredocs = [];
  const length = source.length;
  let index = 0;
  let segment = createSegment();
  let word = null;
  let pendingRedirect = null;

  function createSegment() {
    return { words: [], redirects: [], raw: '', heredocBodies: [], herestrings: [], substitutions: [], piped: false };
  }

  function take(count) {
    segment.raw += source.slice(index, index + count);
    index += count;
  }

  function currentWord() {
    if (!word) word = { value: '', dynamic: false, quoted: false };
    return word;
  }

  function finishWord() {
    if (!word) return;
    const finished = word;
    word = null;
    if (!pendingRedirect) {
      segment.words.push(finished);
      return;
    }
    const { operator, stripTabs } = pendingRedirect;
    pendingRedirect = null;
    if (operator === '<<') pendingHeredocs.push({ delimiter: finished.value, stripTabs, segment });
    else if (operator === '<<<') segment.herestrings.push(finished.value);
    else segment.redirects.push({ operator, target: finished });
  }

  function finishSegment() {
    finishWord();
    pendingRedirect = null;
    events.push({ kind: 'segment', segment });
    segment = createSegment();
  }

  function closingDoubleQuote(from) {
    let position = from;
    while (position < length) {
      const character = source[position];
      if (character === '\\') { position += 2; continue; }
      if (character === '"') return position;
      if (character === '$' && source[position + 1] === '(') { position = closingIndex(position + 1, '(', ')') + 1; continue; }
      if (character === '`') {
        const close = source.indexOf('`', position + 1);
        position = close === -1 ? length : close + 1;
        continue;
      }
      position++;
    }
    return length;
  }

  function closingIndex(from, open, close) {
    let depth = 0;
    let position = from;
    while (position < length) {
      const character = source[position];
      if (character === '\\') { position += 2; continue; }
      if (character === "'") {
        const end = source.indexOf("'", position + 1);
        position = end === -1 ? length : end + 1;
        continue;
      }
      if (character === '"') { position = closingDoubleQuote(position + 1) + 1; continue; }
      if (character === open) depth++;
      else if (character === close && --depth === 0) return position;
      position++;
    }
    return length;
  }

  function readExpansion(target) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '`') {
      const end = source.indexOf('`', index + 1);
      const close = end === -1 ? length : end;
      segment.substitutions.push(source.slice(index + 1, close));
      target.value += source.slice(index, close + 1);
      target.dynamic = true;
      take(close + 1 - index);
      return;
    }
    if (next === '(' || next === '{') {
      const close = closingIndex(index + 1, next, next === '(' ? ')' : '}');
      const inner = source.slice(index + 2, close);
      if (next === '(' && !inner.startsWith('(')) segment.substitutions.push(inner);
      target.value += source.slice(index, close + 1);
      target.dynamic = true;
      take(close + 1 - index);
      return;
    }
    const name = VARIABLE_NAME.exec(source.slice(index + 1, index + 65));
    if (name) {
      target.value += '$' + name[0];
      target.dynamic = true;
      take(1 + name[0].length);
      return;
    }
    target.value += character;
    take(1);
  }

  function readDoubleQuoted() {
    const target = currentWord();
    target.quoted = true;
    take(1);
    while (index < length && source[index] !== '"') {
      const character = source[index];
      if (character === '\\' && index + 1 < length) {
        const escaped = source[index + 1];
        target.value += '"\\$`'.includes(escaped) ? escaped : escaped === '\n' ? '' : character + escaped;
        take(2);
        continue;
      }
      if (character === '$' || character === '`') { readExpansion(target); continue; }
      target.value += character;
      take(1);
    }
    take(1);
  }

  function readSingleQuoted() {
    const target = currentWord();
    target.quoted = true;
    const end = source.indexOf("'", index + 1);
    const close = end === -1 ? length : end;
    target.value += source.slice(index + 1, close);
    take(close + 1 - index);
  }

  function readAnsiQuoted() {
    const target = currentWord();
    target.quoted = true;
    let position = index + 2;
    while (position < length && source[position] !== "'") position += source[position] === '\\' ? 2 : 1;
    const close = Math.min(position, length);
    target.value += source.slice(index + 2, close).replace(/\\(.)/g, '$1');
    take(close + 1 - index);
  }

  function skipDescriptor() {
    while (index < length && /[0-9-]/.test(source[index])) take(1);
  }

  function readRedirect() {
    const character = source[index];
    if (word && !word.quoted && /^\d+$/.test(word.value)) word = null;
    else finishWord();
    if (source[index + 1] === '(') {
      const close = closingIndex(index + 1, '(', ')');
      segment.substitutions.push(source.slice(index + 2, close));
      const target = currentWord();
      target.value += source.slice(index, close + 1);
      target.dynamic = true;
      take(close + 1 - index);
      return;
    }
    if (character === '<') {
      if (source.startsWith('<<<', index)) { pendingRedirect = { operator: '<<<' }; take(3); return; }
      if (source.startsWith('<<-', index)) { pendingRedirect = { operator: '<<', stripTabs: true }; take(3); return; }
      if (source.startsWith('<<', index)) { pendingRedirect = { operator: '<<', stripTabs: false }; take(2); return; }
      if (source.startsWith('<>', index)) { pendingRedirect = { operator: '<>' }; take(2); return; }
      if (source.startsWith('<&', index)) { take(2); skipDescriptor(); return; }
      pendingRedirect = { operator: '<' };
      take(1);
      return;
    }
    if (source.startsWith('>>', index)) { pendingRedirect = { operator: '>>' }; take(2); return; }
    if (source.startsWith('>|', index)) { pendingRedirect = { operator: '>|' }; take(2); return; }
    if (source.startsWith('>&', index)) {
      take(2);
      if (/[0-9-]/.test(source[index] || '')) { skipDescriptor(); return; }
      pendingRedirect = { operator: '&>' };
      return;
    }
    pendingRedirect = { operator: '>' };
    take(1);
  }

  function readHeredocBodies() {
    while (pendingHeredocs.length) {
      const heredoc = pendingHeredocs.shift();
      const bodyLines = [];
      while (index < length) {
        const newline = source.indexOf('\n', index);
        const line = source.slice(index, newline === -1 ? length : newline);
        index = newline === -1 ? length : newline + 1;
        const comparable = heredoc.stripTabs ? line.replace(/^\t+/, '') : line;
        if (comparable === heredoc.delimiter || line.trim() === heredoc.delimiter) break;
        bodyLines.push(line);
      }
      heredoc.segment.heredocBodies.push(bodyLines.join('\n'));
    }
  }

  while (index < length) {
    const character = source[index];
    const next = source[index + 1];

    if (character === '\\') {
      if (next === '\n') { take(2); continue; }
      const target = currentWord();
      target.quoted = true;
      target.value += next === undefined ? '' : next;
      take(2);
      continue;
    }
    if (character === "'") { readSingleQuoted(); continue; }
    if (character === '$' && next === "'") { readAnsiQuoted(); continue; }
    if (character === '"') { readDoubleQuoted(); continue; }
    if (character === '$' || character === '`') { readExpansion(currentWord()); continue; }
    if (character === '#' && !word) {
      const newline = source.indexOf('\n', index);
      take((newline === -1 ? length : newline) - index);
      continue;
    }
    if (character === '\n') {
      finishSegment();
      take(1);
      readHeredocBodies();
      continue;
    }
    if (character === ' ' || character === '\t' || character === '\r') { finishWord(); take(1); continue; }
    if (character === ';') { finishSegment(); take(next === ';' ? 2 : 1); continue; }
    if (character === '&') {
      if (next === '>') {
        finishWord();
        const operator = source[index + 2] === '>' ? '&>>' : '&>';
        pendingRedirect = { operator };
        take(operator.length);
        continue;
      }
      finishSegment();
      take(next === '&' ? 2 : 1);
      continue;
    }
    if (character === '|') {
      finishSegment();
      segment.piped = next !== '|';
      take(next === '|' || next === '&' ? 2 : 1);
      continue;
    }
    if (character === '>' || character === '<') { readRedirect(); continue; }
    if (character === '(' || character === ')') {
      finishSegment();
      events.push({ kind: character === '(' ? 'enter' : 'leave' });
      take(1);
      continue;
    }
    currentWord().value += character;
    take(1);
  }
  finishSegment();
  return events;
}

function skipWrapperOptions(words, start, name) {
  const argumentLetters = WRAPPER_ARGUMENT_LETTERS[name];
  let position = start;
  while (position < words.length) {
    const value = words[position].value;
    if (value === '--') return position + 1;
    if (name === 'env' && ASSIGNMENT.test(value)) { position++; continue; }
    if (!value.startsWith('-') || value === '-') break;
    position += value.length === 2 && argumentLetters.includes(value[1]) ? 2 : 1;
  }
  if (name === 'timeout' && position < words.length) position++;
  return position;
}

function invocationOf(words) {
  let position = 0;
  let viaXargs = false;
  while (position < words.length) {
    const value = words[position].value;
    if (SHELL_KEYWORDS.has(value) || ASSIGNMENT.test(value)) { position++; continue; }
    const name = path.basename(value);
    if (NON_COMMAND_KEYWORDS.has(name)) return null;
    if (Object.prototype.hasOwnProperty.call(WRAPPER_ARGUMENT_LETTERS, name)) {
      if (name === 'xargs') viaXargs = true;
      position = skipWrapperOptions(words, position + 1, name);
      continue;
    }
    return { name, args: words.slice(position + 1), viaXargs };
  }
  return null;
}

function optionsAndOperands(args, argumentLetters, longArgumentNames) {
  const options = new Map();
  const operands = [];
  let optionsEnded = false;
  for (let position = 0; position < args.length; position++) {
    const word = args[position];
    const value = word.value;
    if (optionsEnded || !value.startsWith('-') || value === '-') { operands.push(word); continue; }
    if (value === '--') { optionsEnded = true; continue; }
    if (value.startsWith('--')) {
      const [name, attached] = value.slice(2).split(/=(.*)/s);
      if (longArgumentNames.includes(name)) {
        const argument = attached !== undefined ? { ...word, value: attached } : args[++position];
        if (argument) options.set(name, argument);
      }
      continue;
    }
    for (let letter = 1; letter < value.length; letter++) {
      if (!argumentLetters.includes(value[letter])) continue;
      const attached = value.slice(letter + 1);
      const argument = attached ? { ...word, value: attached } : args[++position];
      if (argument) options.set(value[letter], argument);
      break;
    }
  }
  return { options, operands };
}

function inPlaceEdit(args, editor) {
  let inPlace = false;
  let scriptGiven = false;
  let optionsEnded = false;
  const operands = [];
  for (let position = 0; position < args.length; position++) {
    const value = args[position].value;
    if (optionsEnded || !value.startsWith('-') || value === '-') { operands.push(args[position]); continue; }
    if (value === '--') { optionsEnded = true; continue; }
    if (value.startsWith('--')) {
      const name = value.slice(2).split('=')[0];
      if (name === 'in-place') inPlace = true;
      if (editor.scriptLongNames.includes(name)) {
        scriptGiven = true;
        if (!value.includes('=')) position++;
      }
      continue;
    }
    for (let letter = 1; letter < value.length; letter++) {
      const flag = value[letter];
      if (flag === 'i') {
        inPlace = true;
        const suffix = args[position + 1];
        if (value === '-i' && suffix && /^(?:|\.[\w.-]*)$/.test(suffix.value)) position++;
        break;
      }
      if (editor.scriptLetters.includes(flag)) scriptGiven = true;
      if (editor.argumentLetters.includes(flag)) {
        if (letter === value.length - 1) position++;
        break;
      }
      if (editor.attachedLetters.includes(flag)) break;
      if (editor.digitLetters.includes(flag)) {
        while (letter + 1 < value.length && /[0-9]/.test(value[letter + 1])) letter++;
      }
    }
  }
  if (!inPlace) return null;
  return scriptGiven ? operands : operands.slice(1);
}

function isDirectory(candidate) {
  try { return fs.statSync(candidate).isDirectory(); } catch { return false; }
}

function homeExpanded(text) {
  if (text === '~') return os.homedir();
  return text.startsWith('~/') ? path.join(os.homedir(), text.slice(2)) : text;
}

function variableValues(name, scope) {
  if (scope.variables.has(name)) return scope.variables.get(name);
  if (name === 'HOME') return [os.homedir()];
  if (name === 'PWD') return scope.cwd === null ? null : [scope.cwd];
  return process.env[name] === undefined ? null : [process.env[name]];
}

function expandedValues(word, scope) {
  if (!word.dynamic) return [word.value];
  if (word.value.includes('$(') || word.value.includes('`')) return null;
  let results = [''];
  let cursor = 0;
  for (const reference of word.value.matchAll(VARIABLE_REFERENCE)) {
    const values = variableValues(reference[1] || reference[2], scope);
    if (!values) return null;
    const literal = word.value.slice(cursor, reference.index);
    results = results.flatMap((prefix) => values.map((value) => prefix + literal + value)).slice(0, MAX_EXPANSIONS);
    cursor = reference.index + reference[0].length;
  }
  const tail = word.value.slice(cursor);
  results = results.map((prefix) => prefix + tail);
  return results.some((text) => text.includes('$')) ? null : results;
}

function resolvedPaths(word, scope) {
  const values = expandedValues(word, scope);
  if (values === null) return null;
  const paths = [];
  for (const value of values) {
    const expanded = homeExpanded(value);
    if (path.isAbsolute(expanded)) paths.push(path.resolve(expanded));
    else if (scope.cwd === null) return null;
    else paths.push(path.resolve(scope.cwd, expanded));
  }
  return paths;
}

const sdlcRootByDirectory = new Map();
const profileRootByDirectory = new Map();

function cachedSdlcRootOf(resolved) {
  const startDirectory = isDirectory(resolved) ? resolved : path.dirname(resolved);
  if (!sdlcRootByDirectory.has(startDirectory)) {
    sdlcRootByDirectory.set(startDirectory, sdlcRootOf(path.join(startDirectory, DIRECTORY_PROBE)));
  }
  return sdlcRootByDirectory.get(startDirectory);
}

function cachedProfileRootOf(directory) {
  if (!profileRootByDirectory.has(directory)) {
    profileRootByDirectory.set(directory, ancestorsOf(directory).find((ancestor) => isDirectory(path.join(ancestor, 'docs', 'basics'))) || null);
  }
  return profileRootByDirectory.get(directory);
}

function partsBelow(root, resolved) {
  if (!root) return null;
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative.split(path.sep);
}

function partsBelowSdlcRoot(resolved) {
  return partsBelow(cachedSdlcRootOf(resolved), resolved);
}

function isUnderProfileDocs(resolved) {
  const parts = partsBelow(cachedProfileRootOf(path.dirname(resolved)), resolved);
  return Boolean(parts && parts.length > 1 && parts[0] === 'docs');
}

function isDocPath(resolved) {
  if (!MARKDOWN_PATH.test(resolved)) return false;
  const parts = partsBelowSdlcRoot(resolved);
  return Boolean(parts && parts.slice(0, -1).includes('docs')) || isUnderProfileDocs(resolved);
}

function isDocsDirectory(word, scope) {
  const paths = resolvedPaths(word, scope);
  if (!paths) return false;
  return paths.some((resolved) => {
    if (!word.value.endsWith('/') && !isDirectory(resolved)) return false;
    const parts = partsBelowSdlcRoot(resolved);
    return Boolean(parts && parts.includes('docs'));
  });
}

function targetVerdict(word, scope) {
  if (word.stream || word.value === '{}') return UNKNOWN;
  const paths = resolvedPaths(word, scope);
  if (paths === null) return OTHER_EXTENSION.test(word.value) ? ELSEWHERE : UNKNOWN;
  return paths.some(isDocPath) ? DOC : ELSEWHERE;
}

function judgeTargets(sign, words, scope, context) {
  const verdicts = words.map((word) => ({ word, verdict: targetVerdict(word, scope) }));
  const doc = verdicts.find((entry) => entry.verdict === DOC);
  if (doc) return { sign, target: doc.word.value };
  if (context.mentionsDoc && verdicts.some((entry) => entry.verdict === UNKNOWN)) return { sign, target: null };
  return null;
}

function docCandidatesIn(text) {
  const joined = text.replace(STRING_JOIN, (match, closing, separator) => (separator === '+' ? '' : '/'));
  const candidates = [];
  let tokenStart = 0;
  for (let position = 0; position < joined.length; position++) {
    if (CANDIDATE_BOUNDARY.test(joined[position])) {
      tokenStart = position + 1;
      continue;
    }
    const endsMarkdown = joined[position] === '.' && /^md$/i.test(joined.slice(position + 1, position + 3)) &&
      !/[A-Za-z0-9_-]/.test(joined[position + 3] || '');
    if (endsMarkdown) candidates.push(joined.slice(tokenStart, position + 3));
  }
  return candidates.filter((candidate) => !candidate.includes('\\'));
}

function codePathIsDoc(candidate, givenScope) {
  const scope = givenScope.cwd === null && givenScope.guessCwd ? { ...givenScope, cwd: givenScope.guessCwd } : givenScope;
  const paths = resolvedPaths({ value: candidate, dynamic: candidate.includes('$') }, scope) ||
    resolvedPaths({ value: candidate, dynamic: false }, scope);
  if (paths && paths.some(isDocPath)) return true;
  const rootedSuffix = candidate.startsWith('/docs/') && !isDirectory('/docs');
  return rootedSuffix && scope.cwd !== null && isDocPath(path.resolve(scope.cwd, '.' + candidate));
}

function findSearchesDocs(invocation, segment, scope) {
  if (!invocation || invocation.name !== 'find' || !MARKDOWN_MENTION.test(segment.raw)) return false;
  const searchRoots = [];
  for (const word of invocation.args) {
    if (/^[-(!)]/.test(word.value)) break;
    searchRoots.push(word);
  }
  if (!searchRoots.length) searchRoots.push({ value: '.', dynamic: false });
  return searchRoots.some((searchRoot) => (resolvedPaths(searchRoot, scope) || []).some((directory) =>
    isDocPath(path.join(directory, 'x.md')) ||
    (isDirectory(path.join(directory, 'docs')) && isDocPath(path.join(directory, 'docs', 'x.md')))
  ));
}

function mentionsDoc(entry) {
  const { segment, invocation } = entry;
  const texts = [segment.raw, ...segment.heredocBodies, ...segment.substitutions];
  const named = texts.some((text) => docCandidatesIn(text).some((candidate) => codePathIsDoc(candidate, entry)));
  return named || findSearchesDocs(invocation, segment, entry);
}

function execInvocations(args) {
  const invocations = [];
  for (let position = 0; position < args.length; position++) {
    if (!/^-(?:exec|execdir|ok|okdir)$/.test(args[position].value)) continue;
    const commandWords = [];
    position++;
    while (position < args.length && args[position].value !== ';' && args[position].value !== '+') {
      commandWords.push(args[position]);
      position++;
    }
    const invocation = invocationOf(commandWords);
    if (invocation) invocations.push(invocation);
  }
  return invocations;
}

function copyFinding({ args, viaXargs }, scope, context) {
  const { options, operands } = optionsAndOperands(args, 'tSmog', COPY_LONG_ARGUMENTS);
  const targetDirectory = options.get('t') || options.get('target-directory');
  const hasDestination = targetDirectory || operands.length >= 2 || (viaXargs && operands.length === 1);
  if (!hasDestination) return null;
  const destination = targetDirectory || operands[operands.length - 1];
  const sources = targetDirectory ? operands : operands.slice(0, -1);
  const sign = 'a copy or move onto the doc';
  const verdict = targetVerdict(destination, scope);
  if (verdict === DOC) return { sign, target: destination.value };
  const copiesMarkdownIntoDocs = isDocsDirectory(destination, scope) && sources.some((source) => MARKDOWN_PATH.test(source.value));
  if (copiesMarkdownIntoDocs) return { sign, target: destination.value };
  return verdict === UNKNOWN && context.mentionsDoc ? { sign, target: null } : null;
}

function writerFinding(invocation, scope, context) {
  const { name, args, viaXargs } = invocation;
  const fromStream = viaXargs ? [STREAM_OPERAND] : [];
  if (name === 'sed' || name === 'gsed' || name === 'perl') {
    const files = inPlaceEdit(args, name === 'perl' ? PERL_OPTIONS : SED_OPTIONS);
    return files && judgeTargets(name === 'perl' ? 'perl -i' : 'sed -i', [...files, ...fromStream], scope, context);
  }
  if (name === 'tee') return judgeTargets('tee', optionsAndOperands(args, '', []).operands, scope, context);
  if (name === 'truncate') {
    return judgeTargets('truncate', [...optionsAndOperands(args, 'sr', ['size', 'reference']).operands, ...fromStream], scope, context);
  }
  if (name === 'cp' || name === 'mv' || name === 'install') return copyFinding(invocation, scope, context);
  if (name === 'find') {
    for (const executed of execInvocations(args)) {
      const finding = writerFinding(executed, scope, context);
      if (finding) return finding;
    }
    return null;
  }
  if (SHELLS.has(name)) {
    const flag = args.findIndex((word) => /^-[a-z]*c[a-z]*$/.test(word.value));
    if (flag !== -1) return args[flag + 1] ? context.nested(args[flag + 1].value, scope) : null;
    for (const script of [...scope.segment.heredocBodies, ...scope.segment.herestrings]) {
      const finding = context.nested(script, scope);
      if (finding) return finding;
    }
    const readsStandardInput = !viaXargs &&
      (!args.some((word) => !word.value.startsWith('-')) || args.some((word) => /^-[a-z]*s[a-z]*$/.test(word.value)));
    return readsStandardInput && scope.segment.piped && context.mentionsDoc ? { sign: 'a shell that runs a script piped into it', target: null } : null;
  }
  if (name === 'eval') return context.nested(args.map((word) => word.value).join(' '), scope);
  return null;
}

function redirectFinding(entry, context) {
  const targets = entry.segment.redirects
    .filter((redirect) => WRITE_REDIRECTS.has(redirect.operator))
    .map((redirect) => redirect.target);
  return targets.length ? judgeTargets('a shell redirect into the doc', targets, entry, context) : null;
}

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (let position = 0; position < text.length; position++) {
    const character = text[position];
    if (quote) {
      current += character;
      if (character === '\\') { current += text[position + 1] || ''; position++; continue; }
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") { quote = character; current += character; continue; }
    if ('([{'.includes(character)) depth++;
    else if (')]}'.includes(character)) depth--;
    if (character === separator && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current.trim());
  return parts;
}

function callArguments(text, openParen) {
  const args = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (let position = openParen + 1; position < text.length; position++) {
    const character = text[position];
    if (quote) {
      current += character;
      if (character === '\\') { current += text[position + 1] || ''; position++; continue; }
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') { quote = character; current += character; continue; }
    if ('([{'.includes(character)) depth++;
    else if (')]}'.includes(character)) {
      if (depth === 0) {
        if (current.trim() || args.length) args.push(current.trim());
        return args;
      }
      depth--;
    } else if (character === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  return null;
}

function receiverBefore(text, dotIndex) {
  let position = dotIndex - 1;
  while (position >= 0 && /\s/.test(text[position])) position--;
  if (text[position] === ')') {
    for (let depth = 0; position >= 0; position--) {
      if (text[position] === ')') depth++;
      else if (text[position] === '(' && --depth === 0) break;
    }
    position--;
  }
  while (position >= 0 && /[\w.]/.test(text[position])) position--;
  return text.slice(position + 1, dotIndex).trim();
}

function opensForWriting(modeArgument, args) {
  const keyword = args.map((arg) => MODE_KEYWORD.exec(arg)).find(Boolean);
  const mode = keyword ? keyword[1].trim() : modeArgument;
  if (!mode) return false;
  return STRING_LITERAL.test(mode) ? WRITE_MODE.test(mode) : true;
}

function scriptWriteTargets(text) {
  const targets = [];
  for (const match of text.matchAll(WRITE_CALL)) {
    const call = match[0];
    const args = callArguments(text, match.index + call.length - 1);
    if (args === null) return null;
    const positional = args.filter((arg) => !/^\w+\s*=(?!=)/.test(arg));
    if (call.startsWith('.')) {
      if (call === '.open(' && !opensForWriting(positional[0], args)) continue;
      targets.push(receiverBefore(text, match.index));
      continue;
    }
    if (call.endsWith('open(')) {
      if (opensForWriting(positional[1], args)) targets.push(positional[0] || '');
      continue;
    }
    targets.push((SECOND_ARGUMENT_TARGETS.test(call) ? positional[1] : positional[0]) || '');
  }
  return targets;
}

function isBalanced(text) {
  let depth = 0;
  for (const character of text) {
    if (character === '(') depth++;
    else if (character === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

function combinedValues(parts, separator, text, depth) {
  let results = [''];
  for (const [position, part] of parts.entries()) {
    const values = resolvedExpression(part, text, depth + 1);
    if (!values || values.some((value) => value.literal === undefined)) return null;
    const joiner = position === 0 ? '' : separator;
    results = results.flatMap((prefix) => values.map((value) => prefix + joiner + value.literal)).slice(0, MAX_EXPANSIONS);
  }
  return results.map((literal) => ({ literal }));
}

function resolvedExpression(expression, text, depth) {
  if (depth > MAX_RESOLUTION_DEPTH || !expression) return null;
  let current = expression.trim();
  while (current.startsWith('(') && current.endsWith(')') && isBalanced(current.slice(1, -1))) current = current.slice(1, -1).trim();
  const literal = STRING_LITERAL.exec(current);
  if (literal && !literal[2].includes(literal[1])) return [{ literal: literal[2] }];
  const argv = ARGV_ITEM.exec(current);
  if (argv) return [{ argv: Number(argv[1]) }];
  const wrapped = PATH_WRAPPER.exec(current);
  if (wrapped && splitTopLevel(wrapped[1], ',').length === 1) return resolvedExpression(wrapped[1], text, depth + 1);
  const joined = PATH_JOIN.exec(current);
  if (joined) return combinedValues(splitTopLevel(joined[1], ','), '/', text, depth);
  for (const [operator, separator] of [['+', ''], ['/', '/']]) {
    const parts = splitTopLevel(current, operator);
    if (parts.length > 1) return combinedValues(parts, separator, text, depth);
  }
  if (!IDENTIFIER.test(current)) return null;
  const assigned = [...text.matchAll(ASSIGNED_EXPRESSION(current))].map((match) => resolvedExpression(match[1], text, depth + 1));
  if (!assigned.length || assigned.some((values) => values === null)) return null;
  return assigned.flat();
}

function scriptArguments(invocation) {
  const args = invocation ? invocation.args : [];
  for (let position = 0; position < args.length; position++) {
    const value = args[position].value;
    if (value === '-c' || value === '-e') return [args[position], ...args.slice(position + 2)];
    if (value === '-m') return args.slice(position + 1);
    if (value === '-' || !value.startsWith('-')) return args.slice(position);
  }
  return [];
}

function resolvedTargetFinding(sign, targets, text, entry, invocation) {
  const argv = scriptArguments(invocation);
  let unresolved = false;
  for (const target of targets) {
    const values = resolvedExpression(target, text, 0);
    if (!values) { unresolved = true; continue; }
    for (const value of values) {
      if (value.literal !== undefined) {
        if (codePathIsDoc(value.literal, entry)) return { finding: { sign, target: value.literal } };
        continue;
      }
      const word = argv[value.argv];
      const verdict = word ? targetVerdict(word, entry) : UNKNOWN;
      if (verdict === DOC) return { finding: { sign, target: word.value } };
      if (verdict === UNKNOWN) unresolved = true;
    }
  }
  return { finding: null, unresolved };
}

function scriptWriteFinding(entry, context) {
  const { segment, invocation } = entry;
  const runsScript = segment.heredocBodies.length > 0 || (invocation && SCRIPT_INTERPRETER.test(invocation.name));
  if (!runsScript) return null;
  const text = [segment.raw, ...segment.heredocBodies].join('\n').replace(STANDARD_STREAM_WRITE, 'print(');
  const sign = PYTHON_WRITE.test(text) ? 'a Python write'
    : PYTHON_OPEN_FOR_WRITING.test(text) ? 'a Python open for writing'
    : NODE_WRITE.test(text) ? 'a Node write'
    : null;
  if (!sign) return null;
  const scriptText = text.replace(CONCATENATED_STRINGS, '');
  const targets = scriptWriteTargets(scriptText);
  if (targets && targets.length) {
    const judged = resolvedTargetFinding(sign, targets, scriptText, entry, invocation);
    if (judged.finding) return judged.finding;
    if (!judged.unresolved) return null;
  }
  const named = docCandidatesIn(text).find((candidate) => codePathIsDoc(candidate, entry));
  if (named) return { sign, target: named };
  const verdicts = (invocation ? invocation.args : []).map((word) => ({ word, verdict: targetVerdict(word, entry) }));
  const passedDoc = verdicts.find((item) => item.verdict === DOC);
  if (passedDoc) return { sign, target: passedDoc.word.value };
  const passesUnknownPath = verdicts.some((item) => item.verdict === UNKNOWN && item.word.dynamic);
  return passesUnknownPath && context.mentionsDoc ? { sign, target: null } : null;
}

function changedDirectory(scope, args) {
  const operand = args.find((word) => !word.value.startsWith('-'));
  if (!operand) return os.homedir();
  if (operand.value === '-') return null;
  const paths = resolvedPaths(operand, scope);
  return paths && paths.length === 1 ? paths[0] : null;
}

function recordBindings(words, scope) {
  if (!words.length) return;
  const first = words[0].value;
  if (first === 'for' && words.length > 1) {
    const listStart = words.findIndex((word, position) => position > 1 && word.value === 'in');
    const list = listStart === -1 ? null : words.slice(listStart + 1).map((word) => expandedValues(word, scope));
    scope.variables.set(words[1].value, list && list.every(Boolean) ? list.flat().slice(0, MAX_EXPANSIONS) : null);
    return;
  }
  const readAt = words.findIndex((word) => word.value === 'read');
  if (readAt !== -1 && words.slice(0, readAt).every((word) => SHELL_KEYWORDS.has(word.value))) {
    words.slice(readAt + 1).filter((word) => IDENTIFIER.test(word.value)).forEach((word) => scope.variables.set(word.value, null));
    return;
  }
  const declared = DECLARATION_COMMANDS.has(first);
  const assignments = words.slice(declared ? 1 : 0).filter((word) => !(declared && word.value.startsWith('-')));
  if (!assignments.length || !assignments.every((word) => NAMED_ASSIGNMENT.test(word.value))) return;
  for (const word of assignments) {
    const [, name, value] = NAMED_ASSIGNMENT.exec(word.value);
    scope.variables.set(name, expandedValues({ ...word, value }, scope));
  }
}

function docWriteIn(command, startCwd, nesting, inherited = {}) {
  if (nesting > MAX_NESTING) return null;
  const entries = [];
  const directoryStack = [];
  const running = {
    cwd: startCwd,
    guessCwd: startCwd === null ? inherited.guessCwd || null : startCwd,
    variables: new Map(inherited.variables || []),
  };
  for (const event of parseShell(command)) {
    if (event.kind === 'enter') { directoryStack.push({ cwd: running.cwd, guessCwd: running.guessCwd }); continue; }
    if (event.kind === 'leave') {
      if (directoryStack.length) Object.assign(running, directoryStack.pop());
      continue;
    }
    const invocation = invocationOf(event.segment.words);
    const entry = { segment: event.segment, invocation, cwd: running.cwd, guessCwd: running.guessCwd, variables: new Map(running.variables) };
    entries.push(entry);
    if (invocation && (invocation.name === 'cd' || invocation.name === 'pushd')) {
      running.cwd = changedDirectory(entry, invocation.args);
      if (running.cwd !== null) running.guessCwd = running.cwd;
    }
    recordBindings(event.segment.words, running);
  }

  const context = {
    mentionsDoc: Boolean(inherited.mentionsDoc) || entries.some(mentionsDoc),
    nested: (inner, scope) => docWriteIn(inner, scope.cwd, nesting + 1, {
      variables: scope.variables, guessCwd: scope.guessCwd, mentionsDoc: context.mentionsDoc,
    }),
  };
  for (const entry of entries) {
    if (entry.invocation && entry.invocation.name === 'git') continue;
    const finding = redirectFinding(entry, context) ||
      (entry.invocation && writerFinding(entry.invocation, entry, context)) ||
      scriptWriteFinding(entry, context);
    if (finding) return finding;
  }
  for (const entry of entries) {
    for (const inner of entry.segment.substitutions) {
      const finding = context.nested(inner, entry);
      if (finding) return finding;
    }
  }
  return null;
}

function blockMessage(finding) {
  const what = finding.target
    ? `${finding.sign}: ${finding.target}`
    : `${finding.sign}, on a target the command takes from a docs .md path it names`;
  return 'alpha-sdlc: this Bash command writes a markdown doc under docs/ (' + what + '). ' +
    'Write it with the Edit or Write tool instead — the doc hooks (table shape, ladder rung, secrets) ' +
    'run only on those tools, so a doc written through Bash is never checked. ' +
    'For several sites, send all the Edit calls in one message — they run in parallel and each one is checked. ' +
    'Reading or copying a doc out through Bash is fine; git commands on docs are fine.\n';
}

function main() {
  let payload;
  try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return 0; }
  if ((payload.tool_name || '') !== 'Bash') return 0;
  const command = String((payload.tool_input || {}).command || '');
  if (!MARKDOWN_MENTION.test(command)) return 0;

  let finding = null;
  try {
    finding = docWriteIn(command, path.resolve(payload.cwd || process.cwd()), 0);
  } catch {
    return 0;
  }
  if (!finding) return 0;
  process.stderr.write(blockMessage(finding));
  return 2;
}

process.exitCode = main();
