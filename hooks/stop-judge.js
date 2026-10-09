#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isSdlcContext } = require('./lib/sdlc-context');
const { resolveGuide } = require('./lib/plain-language');

const RULES_PATH = path.join(__dirname, 'stop-judge-rules.md');
const DEFAULT_MODEL = 'claude-opus-5-5';
const DEFAULT_EFFORT = 'medium';
const NESTED_TIMEOUT_MS = 60000;
const SHORTEST_TIMEOUT_MS = 100;
const LONGEST_TIMEOUT_MS = 85000;
const OUTPUT_BUFFER_BYTES = 16 * 1024 * 1024;
const HEADER_SEARCH_LINES = 5;
const HEADER_SEPARATOR = ' · ';
const SHORTEST_PLAIN_LAYER = 200;
const LONGEST_PLAIN_LAYER = 120000;
const KEPT_HEAD = 90000;
const KEPT_TAIL = 30000;
const MINIMUM_LANGUAGE_VOTES = 5;
const MOST_LABEL_WORDS = 3;
const MOST_BOLD_LABEL_WORDS = 4;
const LOG_FILE = 'judge-log.jsonl';
const ROTATED_LOG_FILE = 'judge-log.1.jsonl';
const LOG_ROTATION_BYTES = 5 * 1024 * 1024;
const NOTICES_FILE = 'judge-notices.json';
const NOTICE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CHILD_VARIABLES_TO_DROP = ['CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_EFFORT'];
const UNUSABLE_BINARY_CODES = new Set(['ENOENT', 'EACCES', 'EINVAL', 'ENOEXEC']);

const PLAIN_LAYER_LEAD = "Your step summary's plain layer is hard for a non-engineer to follow.";
const INTERACTIVE_REWRITE =
  'Present the header line and the plain layer again, changing only the wording of the quoted sentences. ' +
  'Keep every fact. End with the Next/Selanjutnya paragraph. ' +
  'In place of the engineer details, write one line saying they are unchanged above.';
const HEADLESS_REWRITE =
  'Present the whole summary again with only the wording of the plain layer changed — ' +
  'keep every fact, the header and the engineer details as they are.';
const GUIDE_PREFACE = "The project's plain-language guide follows. Rules 6 and 7 refer to its glossary columns.";

const LANGUAGE_NAMES = { id: 'Indonesian', en: 'English' };
const STOPWORDS = {
  id: new Set(['yang', 'dan', 'untuk', 'ini', 'itu', 'dengan', 'tidak', 'sudah', 'belum', 'saya', 'anda', 'akan', 'bisa', 'ada', 'dari', 'pada']),
  en: new Set(['the', 'and', 'to', 'of', 'is', 'that', 'for', 'with', 'this', 'it', 'be', 'are', 'was', 'will', 'not', 'on']),
};

const LINE_DECORATION = /^\s{0,3}(?:>\s?)*\s*(?:(?:[-*+•]|\d{1,2}[.)])\s+)?/;
const STARTS_WITH_LETTER = /^\s{0,3}\p{L}/u;
const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const BOLD_LABEL = /^(\*\*|__)(.+?)\1/;
const PLAIN_LABEL = /^(\p{L}[\p{L}\s()\x27-]{0,40}?)\s*(?:[:.](?:\s|$)|$)/u;
const LABEL_EDGE = /[\s:.—–-]+$/;
const LABEL_LEAD = /^[\s:.—–-]+/;
const FENCE = /^\s{0,3}(\x60{3,}|~{3,})/;
const FENCED_BLOCK = /^\s{0,3}(\x60{3,}|~{3,})[^\n]*\n[\s\S]*?^\s{0,3}\1[^\n]*$/gm;
const INLINE_CODE = /\x60+[^\x60\n]*\x60+/g;
const SECTION_LABEL = /^(?:bottom line|why it matters|options|context|intinya|kenapa (?:ini )?penting|pilihan|konteks)$/i;
const FIXED_DETAILS_LABEL = /^(?:details? \(?for engineers?\)?|detail untuk engineer)$/i;
const DISTINCTIVE_PLAIN_LABEL =
  /^(?:bottom line|why it matters|intinya|kenapa (?:ini )?penting|selanjutnya|details? \(?for engineers?\)?|detail untuk engineer)$/i;
const DETAILS_LABEL = /detail|engineer|teknis|technical/i;
const PLAIN_DETAILS_LABEL = /^(?:details?|technical|engineer(?:ing)?|teknis)\b/i;
const NEXT_LABEL = /^(?:(?:the )?next(?: steps?)?|(?:langkah )?selanjutnya)$/i;
const VERDICT_LINE = /^[\s>*_\x60#-]*VERDICT\s*:\s*[*_\x60]*\s*(PASS|FAIL)\b/i;
const RULE_LINE = /^[\s>*_-]*(?:rule\s*|aturan\s*)?(\d{1,2})\b[*_]*\s*[.):—–-]?\s*(.*)$/i;
const RULE_LEADING_MARKS = /^[\s:*_—–-]+/;
const RULE_HELD = /^(?:ok\b|pass(?:es|ed)?\b|n\/a\b|not applicable\b|tidak berlaku\b|✓|✔|✅)/i;
const UNKNOWN_OPTION = /(?:unknown|unrecognized) (?:option|argument)s?:?\s*\x27?(-{1,2}[\w-]+)/i;
const FORBIDDEN_COLUMN_HEADER = /jangan|salah|don\x27?t|avoid|wrong|never/i;
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/;
const PLACEHOLDER_WORD = /^[XYZ]$/;
const ATTACHED_SUFFIX = /^(.+?)\(([^)\s]+)\)$/;
const ACRONYM = /^[A-Z0-9]{2,}$/;
const ABBREVIATION = /\b(?:e\.g|i\.e|etc|vs|dll|dsb|mis|no)\./gi;
const DECIMAL_POINT = /(\d)\.(\d)/g;
const PERIOD_RUN = /\.{2,}/g;
const FILE_NAME = /\b[\w-]+\.(?:js|ts|tsx|jsx|go|md|py|json|ya?ml|kt|swift|java|rb|sql)\b/gi;
const SENTENCE_END = /(?<=[.!?])\s+/;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

const pluginRoot = () => path.resolve(process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..'));

function linesOf(message) {
  return String(message).replace(/\r\n?/g, '\n').split('\n');
}

function cleanLabel(text) {
  return text.replace(/[*_\x60]/g, '').replace(/\s+/g, ' ').replace(LABEL_EDGE, '').trim();
}

function labelOf(line) {
  const content = line.replace(LINE_DECORATION, '');
  const heading = HEADING.exec(content);
  if (heading) return { kind: 'heading', text: cleanLabel(heading[1]) };
  const bold = BOLD_LABEL.exec(content);
  if (bold) {
    const text = cleanLabel(bold[2]);
    const colon = /:\s*$/.test(bold[2]) || /^\s*:/.test(content.slice(bold[0].length));
    return { kind: 'bold', text, shaped: colon || text.split(' ').length <= MOST_BOLD_LABEL_WORDS };
  }
  if (!STARTS_WITH_LETTER.test(line)) return null;
  const plain = PLAIN_LABEL.exec(content);
  return plain ? { kind: 'plain', text: cleanLabel(plain[1]) } : null;
}

function labelledLines(lines) {
  const labelled = [];
  let openFence = null;
  lines.forEach((line, index) => {
    const fence = FENCE.exec(line);
    if (fence) {
      if (!openFence) openFence = fence[1][0];
      else if (fence[1][0] === openFence) openFence = null;
      return;
    }
    if (openFence) return;
    const label = labelOf(line);
    if (label && label.text) labelled.push({ index, label });
  });
  return labelled;
}

function headerIndexOf(lines) {
  let seen = 0;
  for (let index = 0; index < lines.length && seen < HEADER_SEARCH_LINES; index++) {
    if (!lines[index].trim()) continue;
    seen++;
    if (lines[index].includes(HEADER_SEPARATOR)) return index;
  }
  return -1;
}

function isMarkerLabel(label) {
  if (label.kind === 'plain') return DISTINCTIVE_PLAIN_LABEL.test(label.text);
  return SECTION_LABEL.test(label.text) || FIXED_DETAILS_LABEL.test(label.text) || NEXT_LABEL.test(label.text);
}

function isDetailsLabel(label) {
  if (label.kind === 'heading') return DETAILS_LABEL.test(label.text);
  if (label.kind === 'bold') return label.shaped && DETAILS_LABEL.test(label.text);
  return PLAIN_DETAILS_LABEL.test(label.text) && label.text.split(' ').length <= MOST_LABEL_WORDS;
}

function lineWithoutLabel(line, label) {
  if (label.kind === 'bold' && label.shaped) return line.replace(BOLD_LABEL, '');
  if (label.kind === 'plain' && (isMarkerLabel(label) || NEXT_LABEL.test(label.text))) return line.replace(PLAIN_LABEL, '');
  return line;
}

function hasStepSummaryMarkers(message) {
  const lines = linesOf(message);
  return headerIndexOf(lines) !== -1 || labelledLines(lines).some(({ label }) => isMarkerLabel(label));
}

function splitMessage(message) {
  const lines = linesOf(message);
  const headerIndex = headerIndexOf(lines);
  const header = headerIndex === -1 ? '' : lines[headerIndex].trim();
  const body = lines.filter((line, index) => index !== headerIndex);
  const whole = body.join('\n').trim();
  const labelled = labelledLines(body);
  const details = labelled.find(({ label }) => isDetailsLabel(label));
  if (!details) {
    return { header, plain: whole, mode: 'whole', reason: 'no engineer-details heading was found', endsInsideDetails: null };
  }
  const closing = labelled.filter(({ index, label }) => index > details.index && NEXT_LABEL.test(label.text)).pop();
  const beforeDetails = body.slice(0, details.index).join('\n').trim();
  const closingParagraph = closing ? body.slice(closing.index).join('\n').trim() : '';
  const plain = [beforeDetails, closingParagraph].filter(Boolean).join('\n\n');
  const shared = { header, detailsLabel: details.label.text, nextKept: Boolean(closing), endsInsideDetails: !closing };
  if (plain.length < SHORTEST_PLAIN_LAYER) {
    return { ...shared, plain: whole, mode: 'whole', reason: `the plain layer is under ${SHORTEST_PLAIN_LAYER} characters` };
  }
  return { ...shared, plain, mode: 'plain', reason: null };
}

function withoutCode(text) {
  return text.replace(FENCED_BLOCK, ' ').replace(INLINE_CODE, ' ');
}

function languageVoteOf(text) {
  const counts = Object.fromEntries(Object.keys(STOPWORDS).map((code) => [code, 0]));
  for (const word of withoutCode(text).toLowerCase().match(/\p{L}+/gu) || []) {
    for (const code of Object.keys(STOPWORDS)) if (STOPWORDS[code].has(word)) counts[code]++;
  }
  const ranked = Object.entries(counts).sort((first, second) => second[1] - first[1]);
  const total = ranked.reduce((sum, [, count]) => sum + count, 0);
  const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];
  return { language: total < MINIMUM_LANGUAGE_VOTES || tied ? 'unknown' : ranked[0][0], counts };
}

function guideAppliesTo(guide, language) {
  if (!guide) return false;
  if (language === 'unknown' || language === guide.code) return true;
  return !STOPWORDS[guide.code] && language !== 'en';
}

function phrasesOfCell(cell) {
  return cell
    .replace(/\s+\([^)]*\)/g, ' ')
    .replace(/[*"“”‘’]/g, '')
    .split(/\s*,\s*|\s+\/\s+/)
    .map((phrase) => phrase.trim())
    .filter((phrase) => [...phrase].length >= 2);
}

function forbiddenPhrasesOf(guideText) {
  const phrases = [];
  let headerCell = null;
  let insideForbiddenTable = false;
  for (const line of guideText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      headerCell = null;
      insideForbiddenTable = false;
      continue;
    }
    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
    if (cells.every((cell) => TABLE_SEPARATOR_CELL.test(cell))) {
      insideForbiddenTable = Boolean(headerCell && FORBIDDEN_COLUMN_HEADER.test(headerCell));
      continue;
    }
    if (insideForbiddenTable) phrases.push(...phrasesOfCell(cells[0]));
    else headerCell = cells[0];
  }
  return [...new Set(phrases)];
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternOfPhrase(phrase) {
  const body = phrase.split(/\s+/).map((word) => {
    if (PLACEHOLDER_WORD.test(word)) return '\\S+(?:\\s+\\S+){0,3}';
    const suffixed = ATTACHED_SUFFIX.exec(word);
    if (suffixed) return escapeRegExp(suffixed[1]) + '(?:' + escapeRegExp(suffixed[2]) + ')?';
    return escapeRegExp(word);
  }).join('\\s+');
  return new RegExp('(?<![\\p{L}\\p{N}_-])' + body + '(?![\\p{L}\\p{N}_-])', ACRONYM.test(phrase) ? 'u' : 'iu');
}

function forbiddenPhraseHits(text, guideText) {
  const searchable = withoutCode(text);
  const hits = [];
  for (const phrase of forbiddenPhrasesOf(guideText)) {
    const match = patternOfPhrase(phrase).exec(searchable);
    if (match) hits.push(match[0].replace(/\s+/g, ' ').toLowerCase());
  }
  return [...new Set(hits)];
}

function sentenceCountOf(text) {
  let count = 0;
  for (const rawLine of withoutCode(text).split('\n')) {
    const label = labelOf(rawLine);
    if (label && label.kind === 'heading') continue;
    const content = rawLine.replace(LINE_DECORATION, '').trim();
    const line = (label ? lineWithoutLabel(content, label) : content).replace(LABEL_LEAD, '').trim();
    if (!WORD_CHARACTER.test(line)) continue;
    const neutral = line
      .replace(PERIOD_RUN, '…')
      .replace(ABBREVIATION, 'x')
      .replace(DECIMAL_POINT, '$1$2')
      .replace(FILE_NAME, 'file');
    count += Math.max(1, neutral.split(SENTENCE_END).filter((part) => WORD_CHARACTER.test(part)).length);
  }
  return count;
}

function shortenedPlainLayer(plain) {
  if (plain.length <= LONGEST_PLAIN_LAYER) return { text: plain, omitted: 0 };
  const omitted = plain.length - KEPT_HEAD - KEPT_TAIL;
  return { text: `${plain.slice(0, KEPT_HEAD)}\n\n[… ${omitted} characters omitted by the hook …]\n\n${plain.slice(-KEPT_TAIL)}`, omitted };
}

function factsFor(split, vote, guideApplied, hits, sentences, omitted) {
  const facts = [];
  if (split.mode === 'plain') {
    facts.push(`extraction: the engineer details (from the "${split.detailsLabel}" label on) were removed` +
      (split.nextKept ? '; the closing Next/Selanjutnya paragraph after them is kept' : ''));
  } else {
    facts.push(`extraction: none — ${split.reason}, so PLAIN LAYER holds the whole message below the header; ` +
      'apply the engineer-details boundary yourself');
  }
  if (omitted) facts.push(`the hook omitted ${omitted} characters from the middle of a very long plain layer`);
  const tally = Object.entries(vote.counts).map(([code, count]) => `${LANGUAGE_NAMES[code] || code} ${count}`).join(', ');
  facts.push(`plain-layer language by stopword vote: ${vote.language} (${tally})`);
  facts.push(`sentences in the plain layer: ${sentences}`);
  if (guideApplied) {
    const found = hits.length ? hits.map((hit) => `"${hit}"`).join(', ') : 'none';
    facts.push(`phrases from the guide's left-hand column found outside code spans: ${found}`);
  }
  facts.push(split.header ? 'header line: present' : `header line: none in the first ${HEADER_SEARCH_LINES} lines`);
  if (split.endsInsideDetails !== null) {
    facts.push(`the message ends inside the engineer details: ${split.endsInsideDetails ? 'yes' : 'no'}`);
  }
  return facts;
}

function judgeInputOf(header, plainText, facts) {
  return [
    'last_assistant_message, split by the hook into HEADER, PLAIN LAYER and FACTS',
    '',
    '=== HEADER ===',
    header || `(none in the first ${HEADER_SEARCH_LINES} lines)`,
    '',
    '=== PLAIN LAYER ===',
    plainText,
    '',
    '=== FACTS (mechanical hints; confirm each against the text) ===',
    ...facts.map((fact) => '- ' + fact),
    '',
  ].join('\n');
}

function systemPromptOf(rules, guide, guideApplied) {
  return guideApplied ? `${rules.trim()}\n\n${GUIDE_PREFACE}\n\n${guide.text}` : rules.trim();
}

function childEnvironment() {
  const environment = { ...process.env, ALPHA_JUDGE_NESTED: '1' };
  for (const name of CHILD_VARIABLES_TO_DROP) delete environment[name];
  return environment;
}

function nestedTimeout() {
  const requested = Number(process.env.ALPHA_JUDGE_TIMEOUT_MS);
  if (!Number.isFinite(requested) || requested <= 0) return NESTED_TIMEOUT_MS;
  return Math.min(LONGEST_TIMEOUT_MS, Math.max(SHORTEST_TIMEOUT_MS, Math.round(requested)));
}

function callJudge(systemPrompt, input, workingDirectory) {
  const binary = process.env.ALPHA_JUDGE_CLAUDE_BIN || 'claude';
  const args = [
    '-p', '--safe-mode', '--tools', '',
    '--model', process.env.ALPHA_JUDGE_MODEL || DEFAULT_MODEL,
    '--effort', process.env.ALPHA_JUDGE_EFFORT || DEFAULT_EFFORT,
    '--no-session-persistence', '--output-format', 'json',
    '--system-prompt', systemPrompt,
  ];
  const result = spawnSync(binary, args, {
    input,
    cwd: workingDirectory,
    env: childEnvironment(),
    encoding: 'utf8',
    timeout: nestedTimeout(),
    killSignal: 'SIGKILL',
    maxBuffer: OUTPUT_BUFFER_BYTES,
    windowsHide: true,
  });
  return { binary, result };
}

function parsedOutput(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const lastObject = text.split('\n').reverse().find((line) => line.trim().startsWith('{'));
  try { return lastObject ? JSON.parse(lastObject) : null; } catch { return null; }
}

function verdictOf(resultText) {
  let verdict = null;
  for (const line of resultText.split('\n')) {
    const match = VERDICT_LINE.exec(line);
    if (match) verdict = match[1].toUpperCase();
  }
  return verdict;
}

function ruleFindingsOf(resultText) {
  const findings = [];
  let current = null;
  for (const line of resultText.split('\n')) {
    if (!line.trim()) continue;
    if (VERDICT_LINE.test(line)) {
      current = null;
      continue;
    }
    const match = RULE_LINE.exec(line);
    const rule = match ? Number(match[1]) : 0;
    if (rule >= 1 && rule <= 10) {
      const text = match[2].trim();
      current = { rule, held: RULE_HELD.test(text.replace(RULE_LEADING_MARKS, '')), lines: [text] };
      findings.push(current);
    } else if (current) {
      current.lines.push(line.trim());
    }
  }
  return findings;
}

function rewriteInstruction() {
  const headless = /^sdk/i.test(process.env.CLAUDE_CODE_ENTRYPOINT || '');
  return `${PLAIN_LAYER_LEAD} ${headless ? HEADLESS_REWRITE : INTERACTIVE_REWRITE}`;
}

function blockReasonOf(failing) {
  const ruleLines = failing.map((finding) => `Rule ${finding.rule}: ${finding.lines.join(' ')}`);
  return `${ruleLines.join('\n')}\n\n${rewriteInstruction()}`;
}

function unusableBinaryReason(binary, result) {
  const code = result.error && result.error.code;
  if (code === 'ENOENT') return `the command "${binary}" was not found`;
  if (UNUSABLE_BINARY_CODES.has(code)) return `the command "${binary}" cannot be run (${code})`;
  if (result.status === 0) return null;
  const unknownOption = UNKNOWN_OPTION.exec(`${result.stderr || ''}\n${result.stdout || ''}`);
  return unknownOption ? `"${binary}" does not accept the option ${unknownOption[1]} (update Claude Code)` : null;
}

function noticeOncePerSession(dataDirectory, session, why) {
  if (!dataDirectory) return null;
  const noticesPath = path.join(dataDirectory, NOTICES_FILE);
  let notices = {};
  try { notices = JSON.parse(fs.readFileSync(noticesPath, 'utf8')); } catch {}
  if (!notices || typeof notices !== 'object' || Array.isArray(notices)) notices = {};
  const key = String(session || 'unknown');
  if (notices[key]) return null;
  const now = Date.now();
  for (const [noticeKey, at] of Object.entries(notices)) {
    if (!(now - Date.parse(at) <= NOTICE_RETENTION_MS)) delete notices[noticeKey];
  }
  notices[key] = new Date(now).toISOString();
  try { fs.writeFileSync(noticesPath, JSON.stringify(notices)); } catch {}
  return `alpha-sdlc: the plain-language judge is off — ${why}; set ALPHA_JUDGE_CLAUDE_BIN`;
}

function usageOf(output) {
  const usage = output && output.usage;
  if (!usage || typeof usage !== 'object') return null;
  const details = usage.output_tokens_details || {};
  return {
    input_tokens: usage.input_tokens || 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
    cache_read_input_tokens: usage.cache_read_input_tokens || 0,
    output_tokens: usage.output_tokens || 0,
    thinking_tokens: details.thinking_tokens || 0,
  };
}

function dataDirectoryFor() {
  const directory = path.resolve(process.env.CLAUDE_PLUGIN_DATA || path.join(os.tmpdir(), 'alpha-sdlc'));
  try {
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  } catch {
    return null;
  }
}

function appendLog(dataDirectory, entry) {
  if (!dataDirectory) return;
  const logPath = path.join(dataDirectory, LOG_FILE);
  try {
    if (fs.statSync(logPath).size > LOG_ROTATION_BYTES) fs.renameSync(logPath, path.join(dataDirectory, ROTATED_LOG_FILE));
  } catch {}
  try { fs.appendFileSync(logPath, JSON.stringify(entry) + '\n'); } catch {}
}

function readPayload() {
  try {
    const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function judge(payload, entry, dataDirectory) {
  if (payload.stop_hook_active === true) return { skip: 'rewrite' };
  const message = typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : '';
  if (!message.trim()) return { skip: 'empty' };
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  if (!hasStepSummaryMarkers(message) && !isSdlcContext(cwd)) return { skip: 'out-of-scope' };

  const rules = fs.readFileSync(RULES_PATH, 'utf8');
  const split = splitMessage(message);
  const vote = languageVoteOf(split.plain);
  const guide = resolveGuide(cwd, pluginRoot());
  const guideApplied = guideAppliesTo(guide, vote.language);
  const hits = guideApplied ? forbiddenPhraseHits(split.plain, guide.text) : [];
  const shortened = shortenedPlainLayer(split.plain);
  const facts = factsFor(split, vote, guideApplied, hits, sentenceCountOf(split.plain), shortened.omitted);
  const input = judgeInputOf(split.header, shortened.text, facts);
  Object.assign(entry, { extraction: split.mode, language: vote.language, guide: guideApplied ? guide.code : null, inputChars: input.length });

  const { binary, result } = callJudge(systemPromptOf(rules, guide, guideApplied), input, dataDirectory || os.tmpdir());
  const output = parsedOutput(result.stdout);
  Object.assign(entry, {
    rc: result.status,
    usage: usageOf(output),
    models: output && output.modelUsage && typeof output.modelUsage === 'object' ? Object.keys(output.modelUsage) : [],
    apiMs: output && Number.isFinite(output.duration_api_ms) ? output.duration_api_ms : null,
    costUsd: output && Number.isFinite(output.total_cost_usd) ? output.total_cost_usd : null,
  });

  const unusable = unusableBinaryReason(binary, result);
  if (unusable) return { verdict: 'unavailable', error: result.error ? result.error.code : 'unknown-option', notice: unusable };
  if (result.error) return { verdict: result.error.code === 'ETIMEDOUT' ? 'timeout' : 'error', error: result.error.code || 'spawn' };
  if (result.status !== 0 || (output && output.is_error === true)) return { verdict: 'error' };
  if (!output || typeof output.result !== 'string') return { verdict: 'unparsed' };

  const verdict = verdictOf(output.result);
  const findings = ruleFindingsOf(output.result);
  const failing = findings.filter((finding) => !finding.held);
  entry.failed = [...new Set(failing.map((finding) => finding.rule))];
  if (!verdict) return { verdict: 'unparsed' };
  if (verdict === 'PASS') return { verdict };
  if (!failing.length) return { verdict: 'FAIL-unquoted' };
  return { verdict, block: blockReasonOf(failing) };
}

function run() {
  process.stdout.on('error', () => {});
  if (/^(?:off|0|false|no)$/i.test(String(process.env.ALPHA_JUDGE || '').trim())) return;
  if (process.env.ALPHA_JUDGE_NESTED === '1') return;
  const startedAt = Date.now();
  const payload = readPayload();
  if (!payload) return;
  const dataDirectory = dataDirectoryFor();
  const entry = {
    at: new Date(startedAt).toISOString(),
    session: payload.session_id || null,
    skip: null,
    ms: 0,
    rc: null,
    verdict: null,
    failed: [],
    usage: null,
    models: [],
  };
  let outcome = {};
  try {
    outcome = judge(payload, entry, dataDirectory);
  } catch (error) {
    outcome = { verdict: 'error', error: error && error.code ? error.code : 'exception' };
  }
  entry.skip = outcome.skip || null;
  entry.verdict = outcome.verdict || null;
  if (outcome.error) entry.error = outcome.error;
  entry.ms = Date.now() - startedAt;
  appendLog(dataDirectory, entry);

  if (outcome.block) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: outcome.block }));
    return;
  }
  if (outcome.notice) {
    const systemMessage = noticeOncePerSession(dataDirectory, payload.session_id, outcome.notice);
    if (systemMessage) process.stdout.write(JSON.stringify({ systemMessage }));
  }
}

module.exports = { hasStepSummaryMarkers, splitMessage, forbiddenPhrasesOf, ruleFindingsOf, verdictOf };

if (require.main === module) {
  try { run(); } catch {}
}
