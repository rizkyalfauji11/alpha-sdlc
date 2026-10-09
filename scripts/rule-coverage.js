#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { parsePrinciples, boldSpansOf } = require('./lib/rules');
const { shortTitleOf, isSelected } = require('./build-rules');

const pluginRoot = path.resolve(process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..'));

const USAGE =
  'usage: rule-coverage.js [--baseline <git-ref>] [--files <glob>…] [--show <verdict,…>] [--json]\n' +
  '  extracts the normative clauses of the baseline corpus (default origin/main) and finds each one in\n' +
  '  the working tree: exact, reworded, weakened, missing, or relocated (a gate that left its SKILL.md).\n' +
  '  Every weakened, missing or relocated clause needs an entry in tests/coverage-ledger/*.json.\n' +
  '  Also checks that rule and step references resolve and that each skill loads the rules it cites.\n' +
  '  Quote globs: --files \'skills/do-grooming/**\' principles.md\n';

const BASELINE_PATTERNS = ['principles.md', 'skills/**/*.md', 'agents/*.md', 'plain-language/*.md', 'hooks/*.md', 'hooks/hooks.json'];
const HOOKS_CONFIG = 'hooks/hooks.json';
const LEDGER_DIRECTORY = 'tests/coverage-ledger';
const LEDGER_VERDICTS = ['reworded', 'merged', 'moved', 'duplicate', 'changed', 'removed'];
const VERDICTS = ['exact', 'reworded', 'weakened', 'missing', 'relocated'];
const PROBLEM_VERDICTS = new Set(['weakened', 'missing', 'relocated']);
const MIN_CLAUSE_CHARS = 25;
const MIN_LEDGER_CLAUSE_CHARS = 20;
const LEDGER_MATCH_CHARS = 40;
const REWORDED_MIN_JACCARD = 0.6;
const RULE_KINDS = new Set(['section', 'agreement']);

const NORMATIVE_WORD = /\b(?:must|never|always|only|required|unless|except|don't|do not)\b/i;
const NORMATIVE_MARK = /STOP|⏸|★|→|Approved/;
const BOLD_LEAD = /^\*\*([^*]+)\*\*/;
const BOLD_ONLY = /^\*\*[^*]+\*\*$/;
const GATE_CLAUSE = /STOP|⏸|GATE/;
const HARD_WORD = /\b(never|always|only|unless|except)\b/gi;
const NEGATION = /\b(?:not|no|don't|doesn't|didn't|cannot|can't|won't|isn't|aren't|nothing|none|nor|never|without)\b/i;
const HARD_MARKS = ['★', '⏸', '≥', '≤'];
const GENERATED_NOTICE = /^[^\n]*generated from `principles\.md` by `scripts\/build-rules\.js`/i;
const READS_PRINCIPLES_IN_FULL = /Read `(?:\.\.\/\.\.\/)?principles\.md` in full/i;
const SKILL_BODY = /^skills\/[^/]+\/SKILL\.md$/;
const TEMPLATE_FILE = /(^|\/)templates\/|template[^/]*\.md$/i;

const STOPWORDS = new Set((
  'the a an and or of to in on for is are be it its this that with as by at from into than then when where which ' +
  'who what how so if but per not no was were been being has have had do does did can will would should could may ' +
  'might shall there their them they you your our we us his her she him one any all'
).split(' '));

const LIST_MARKER = /^(?:[-*+]|\d+[.)])\s+/;
const TASK_BOX = /^\[[ xX]\]\s+/;
const HEADING = /^#{1,6}\s+/;
const FENCE = /^(`{3,}|~{3,})/;
const SENTENCE_BREAK = /(?<=[.!?][*_)\]"'”’`]*)\s+(?=[*_`"'“‘(\[]*[A-Z0-9⏸★✅⚠])|;\s+/u;
const ABBREVIATION_END = /\b(?:e\.g|i\.e|vs|etc|cf|incl|approx|ca)\.[*_)\]"'”’`]*$/i;

function parseArguments(argv) {
  const options = { baseline: 'origin/main', files: [], show: new Set(), json: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--baseline' && index + 1 < argv.length) options.baseline = argv[++index];
    else if (argument === '--show' && index + 1 < argv.length) {
      for (const verdict of argv[++index].split(',')) options.show.add(verdict.trim());
    } else if (argument === '--files') {
      while (index + 1 < argv.length && !argv[index + 1].startsWith('--')) options.files.push(argv[++index]);
      if (!options.files.length) return null;
    } else return null;
  }
  return options;
}

const toPosix = (filePath) => filePath.split(path.sep).join('/');
const apostrophes = (text) => text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

function globToRegExp(glob) {
  let source = '';
  for (let index = 0; index < glob.length; index++) {
    const character = glob[index];
    if (character === '*' && glob[index + 1] === '*') {
      index++;
      if (glob[index + 1] === '/') {
        index++;
        source += '(?:.*/)?';
      } else source += '.*';
    } else if (character === '*') source += '[^/]*';
    else if (character === '?') source += '[^/]';
    else source += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

function scopeMatcher(pattern) {
  const cleaned = toPosix(pattern).replace(/^\.\//, '').replace(/\/+$/, '');
  if (/[*?]/.test(cleaned)) {
    const expression = globToRegExp(cleaned);
    return (file) => expression.test(file);
  }
  return (file) => file === cleaned || file.startsWith(cleaned + '/');
}

const BASELINE_MATCHERS = BASELINE_PATTERNS.map(globToRegExp);
const isCorpusPath = (file) => BASELINE_MATCHERS.some((expression) => expression.test(file));

function promptTextOf(hooksConfigText) {
  let config;
  try { config = JSON.parse(hooksConfigText); } catch { return ''; }
  const prompts = [];
  for (const groups of Object.values((config && config.hooks) || {})) {
    for (const group of [].concat(groups || [])) {
      for (const hook of (group && group.hooks) || []) {
        if (hook && typeof hook.prompt === 'string') prompts.push(hook.prompt);
      }
    }
  }
  return prompts.join('\n\n');
}

function git(root, args, input) {
  return spawnSync('git', ['-C', root, ...args], { input, maxBuffer: 1024 * 1024 * 1024 });
}

function resolveCommit(root, ref) {
  const result = git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return result.status === 0 ? result.stdout.toString('utf8').trim() : null;
}

function readBaselineCorpus(root, commit) {
  const listing = git(root, ['ls-tree', '-r', '-z', '--name-only', commit]);
  if (listing.status !== 0) throw new Error(`git ls-tree ${commit} failed: ${listing.stderr.toString('utf8').trim()}`);
  const names = listing.stdout.toString('utf8').split('\0').filter((name) => name && isCorpusPath(name)).sort();
  const files = new Map();
  if (!names.length) return files;
  const batch = git(root, ['cat-file', '--batch'], names.map((name) => `${commit}:${name}`).join('\n') + '\n');
  if (batch.status !== 0) throw new Error(`git cat-file failed: ${batch.stderr.toString('utf8').trim()}`);
  const buffer = batch.stdout;
  let position = 0;
  for (const name of names) {
    const newline = buffer.indexOf(0x0a, position);
    if (newline === -1) break;
    const header = buffer.slice(position, newline).toString('utf8');
    position = newline + 1;
    const match = /^[0-9a-f]+ \w+ (\d+)$/.exec(header);
    if (!match) continue;
    const size = Number(match[1]);
    const content = buffer.slice(position, position + size).toString('utf8');
    position += size + 1;
    const text = name === HOOKS_CONFIG ? promptTextOf(content) : content;
    if (text) files.set(name, text);
  }
  return files;
}

function readText(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

function markdownFilesUnder(root, relativeDirectory, recursive) {
  const found = [];
  const walk = (relative) => {
    let entries = [];
    try { entries = fs.readdirSync(path.join(root, relative), { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith('.')) continue;
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory() && recursive) walk(child);
      else if (entry.isFile() && entry.name.endsWith('.md')) found.push(child);
    }
  };
  walk(relativeDirectory);
  return found;
}

function readCurrentCorpus(root) {
  const files = new Map();
  const add = (relative) => {
    const text = readText(path.join(root, relative));
    if (text !== null && !GENERATED_NOTICE.test(text)) files.set(relative, text);
  };
  add('principles.md');
  for (const relative of markdownFilesUnder(root, 'skills', true)) add(relative);
  for (const directory of ['agents', 'plain-language', 'hooks', 'rules']) {
    for (const relative of markdownFilesUnder(root, directory, false)) add(relative);
  }
  const prompts = promptTextOf(readText(path.join(root, HOOKS_CONFIG)) || '');
  if (prompts) files.set(HOOKS_CONFIG, prompts);
  return files;
}

function stripFrontmatter(text) {
  const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

function cellsOf(row) {
  const cells = [];
  let current = '';
  for (let index = 0; index < row.length; index++) {
    if (row[index] === '\\' && row[index + 1] === '|') {
      current += '|';
      index++;
    } else if (row[index] === '|') {
      cells.push(current.trim());
      current = '';
    } else current += row[index];
  }
  cells.push(current.trim());
  return cells.filter(Boolean);
}

const isTableSeparator = (line) => /^[|\s:-]+$/.test(line) && line.includes('-');

function blocksOf(markdown) {
  const blocks = [];
  let paragraph = [];
  let fence = null;
  const flush = () => {
    if (paragraph.length) blocks.push(paragraph.join(' '));
    paragraph = [];
  };
  for (const rawLine of stripFrontmatter(markdown).replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.replace(/^\s*(?:>\s?)+/, '').trim();
    if (fence) {
      if (line.startsWith(fence)) fence = null;
      else if (line) blocks.push(line);
      continue;
    }
    const fenceOpen = FENCE.exec(line);
    if (fenceOpen) {
      flush();
      fence = fenceOpen[1];
    } else if (!line) flush();
    else if (line.startsWith('|')) {
      flush();
      if (!isTableSeparator(line)) blocks.push(...cellsOf(line));
    } else if (HEADING.test(line)) {
      flush();
      blocks.push(line.replace(HEADING, '').replace(/\s+#+$/, ''));
    } else if (LIST_MARKER.test(line)) {
      flush();
      paragraph.push(line.replace(LIST_MARKER, '').replace(TASK_BOX, ''));
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}

function sentencesOf(block) {
  const sentences = [];
  for (const piece of block.split(SENTENCE_BREAK)) {
    const sentence = piece.trim();
    if (!sentence) continue;
    const previous = sentences.length ? sentences[sentences.length - 1] : null;
    const leadStandsAlone = sentences.length === 1 && BOLD_ONLY.test(previous);
    if (previous !== null && (ABBREVIATION_END.test(previous) || leadStandsAlone)) sentences[sentences.length - 1] += ' ' + sentence;
    else sentences.push(sentence);
  }
  return sentences;
}

function isNormative(sentence) {
  const text = apostrophes(sentence);
  if (NORMATIVE_WORD.test(text) || NORMATIVE_MARK.test(text)) return true;
  const lead = BOLD_LEAD.exec(text);
  return Boolean(lead && !/:\s*$/.test(lead[1]) && lead[1].trim().split(/\s+/).length >= 3);
}

function normalized(text) {
  return apostrophes(text).replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function clausesOf(markdown) {
  const clauses = [];
  for (const block of blocksOf(markdown)) {
    for (const sentence of sentencesOf(block)) {
      if (normalized(sentence).length >= MIN_CLAUSE_CHARS && isNormative(sentence)) clauses.push(sentence);
    }
  }
  return clauses;
}

function contentWordsOf(text) {
  const words = new Set();
  for (const token of normalized(text).match(/[\p{L}\p{N}][\p{L}\p{N}'./-]*/gu) || []) {
    const word = token.replace(/['./-]+$/, '');
    if (word.length > 2 && !STOPWORDS.has(word)) words.add(word);
  }
  return words;
}

const numberValue = (raw) => (/^\d{1,3}(?:,\d{3})+$/.test(raw) ? raw.replace(/,/g, '') : raw);

function numbersOf(text) {
  return new Set([...apostrophes(text).matchAll(/\d+(?:[.,]\d+)*/g)].map((match) => numberValue(match[0])));
}

function hardWordsOf(text) {
  return new Set([...apostrophes(text).matchAll(HARD_WORD)].map((match) => match[1].toLowerCase()));
}

function hardTokensOf(text) {
  const plain = apostrophes(text);
  const tokens = new Map();
  const add = (kind, value, label) => tokens.set(`${kind}:${value}`, { kind, value, label });
  for (const match of plain.matchAll(/`([^`]+)`/g)) {
    const value = normalized(match[1]);
    if (value) add('code', value, `\`${match[1]}\``);
  }
  const outsideCode = plain.replace(/`[^`]*`/g, ' ');
  for (const match of outsideCode.matchAll(/\d+(?:[.,]\d+)*/g)) add('number', numberValue(match[0]), match[0]);
  for (const match of outsideCode.matchAll(HARD_WORD)) add('word', match[1].toLowerCase(), match[1].toLowerCase());
  if (/STOP/.test(outsideCode)) add('mark', 'STOP', 'STOP');
  for (const mark of HARD_MARKS) if (plain.includes(mark)) add('mark', mark, mark);
  if (NEGATION.test(outsideCode)) add('negation', 'negation', 'a negation (not / no / never …)');
  return [...tokens.values()];
}

function candidateOf(file, text) {
  return {
    file,
    text,
    normalized: normalized(text),
    words: contentWordsOf(text),
    numbers: numbersOf(text),
    hardWords: hardWordsOf(text),
    negated: NEGATION.test(apostrophes(text)),
  };
}

function keeps(candidate, token) {
  if (token.kind === 'code') return candidate.normalized.includes(token.value);
  if (token.kind === 'number') return candidate.numbers.has(token.value);
  if (token.kind === 'word') return candidate.hardWords.has(token.value);
  if (token.kind === 'negation') return candidate.negated;
  return candidate.text.includes(token.value);
}

const lostTokens = (hard, candidate) => hard.filter((token) => !keeps(candidate, token));

function indexCorpus(files) {
  const candidates = [];
  const normalizedFiles = new Map();
  for (const [file, text] of files) {
    const blocks = blocksOf(text);
    normalizedFiles.set(file, ` ${blocks.map(normalized).join(' ¶ ')} `);
    for (const block of blocks) {
      const sentences = sentencesOf(block);
      sentences.forEach((sentence, index) => {
        candidates.push(candidateOf(file, sentence));
        if (index + 1 < sentences.length) candidates.push(candidateOf(file, `${sentence} ${sentences[index + 1]}`));
      });
    }
  }
  const postings = new Map();
  candidates.forEach((candidate, id) => {
    for (const word of candidate.words) {
      if (!postings.has(word)) postings.set(word, []);
      postings.get(word).push(id);
    }
  });
  return { candidates, postings, normalizedFiles, everything: [...normalizedFiles.values()].join('\n') };
}

function exactFile(index, clauseKey, preferredFile) {
  const preferred = index.normalizedFiles.get(preferredFile);
  if (preferred && preferred.includes(clauseKey)) return preferredFile;
  if (!index.everything.includes(clauseKey)) return null;
  for (const [file, text] of index.normalizedFiles) if (text.includes(clauseKey)) return file;
  return null;
}

function bestMatches(index, words, onlyFile) {
  const shared = new Map();
  for (const word of words) {
    for (const id of index.postings.get(word) || []) shared.set(id, (shared.get(id) || 0) + 1);
  }
  const strong = [];
  let best = null;
  for (const [id, count] of shared) {
    const candidate = index.candidates[id];
    if (onlyFile && candidate.file !== onlyFile) continue;
    const score = count / (words.size + candidate.words.size - count);
    if (!best || score > best.score) best = { candidate, score };
    if (score >= REWORDED_MIN_JACCARD) strong.push({ candidate, score });
  }
  strong.sort((left, right) => right.score - left.score);
  return { strong, best };
}

function judged(hard, { strong, best }) {
  const keeping = strong.find((match) => !lostTokens(hard, match.candidate).length);
  const describe = (match) => ({ where: match.candidate.file, score: Number(match.score.toFixed(2)), match: match.candidate.text });
  if (keeping) return { verdict: 'reworded', ...describe(keeping) };
  if (strong.length) {
    return { verdict: 'weakened', ...describe(strong[0]), lost: lostTokens(hard, strong[0].candidate).map((token) => token.label) };
  }
  return best ? { verdict: 'missing', ...describe(best) } : { verdict: 'missing', where: null, score: 0, match: null };
}

function classify(clause, index) {
  const key = normalized(clause.text);
  const gateMustStay = SKILL_BODY.test(clause.file) && GATE_CLAUSE.test(clause.text);
  const exactAt = exactFile(index, key, clause.file);
  if (exactAt && (!gateMustStay || exactAt === clause.file)) return { verdict: 'exact', where: exactAt };
  const words = contentWordsOf(clause.text);
  const hard = hardTokensOf(clause.text);
  if (!gateMustStay) return judged(hard, bestMatches(index, words));
  const local = judged(hard, bestMatches(index, words, clause.file));
  if (local.verdict === 'reworded') return local;
  const anywhere = exactAt ? { verdict: 'exact', where: exactAt, score: 1, match: clause.text } : judged(hard, bestMatches(index, words));
  if (anywhere.verdict === 'exact' || anywhere.verdict === 'reworded') return { ...anywhere, verdict: 'relocated' };
  return local.verdict === 'weakened' ? local : anywhere;
}

function readLedger(root, baselineCommit, inScope) {
  const ledger = { entries: [], problems: [], notes: [] };
  const directory = path.join(root, LEDGER_DIRECTORY);
  let names = [];
  try { names = fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort(); } catch { return ledger; }
  for (const name of names) {
    const source = `${LEDGER_DIRECTORY}/${name}`;
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')); } catch (error) {
      ledger.problems.push(`${source}: not valid JSON (${error.message})`);
      continue;
    }
    if (!data || typeof data.baseline !== 'string' || !Array.isArray(data.entries)) {
      ledger.problems.push(`${source}: needs {"baseline": "<git ref>", "entries": [ … ]}`);
      continue;
    }
    const ledgerCommit = resolveCommit(root, data.baseline);
    if (!ledgerCommit) {
      ledger.problems.push(`${source}: baseline "${data.baseline}" is no commit in this repository`);
      continue;
    }
    if (ledgerCommit !== baselineCommit) {
      ledger.notes.push(`${source}: written against ${data.baseline} (${ledgerCommit.slice(0, 7)}), not the checked baseline — its entries are not applied`);
      continue;
    }
    data.entries.forEach((entry, position) => {
      const label = `${source} entry ${position + 1}`;
      if (!entry || typeof entry !== 'object') {
        ledger.problems.push(`${label}: not an object`);
        return;
      }
      const absent = ['clause', 'file', 'verdict', 'reason'].filter((field) => typeof entry[field] !== 'string' || !entry[field].trim());
      if (absent.length) {
        ledger.problems.push(`${label}: missing ${absent.join(', ')}`);
        return;
      }
      if (!LEDGER_VERDICTS.includes(entry.verdict)) {
        ledger.problems.push(`${label}: verdict "${entry.verdict}" is not one of ${LEDGER_VERDICTS.join(', ')}`);
        return;
      }
      if (entry.verdict !== 'removed' && (typeof entry.where !== 'string' || !entry.where.trim())) {
        ledger.problems.push(`${label}: "where" must name where the meaning lives now (only a removed clause may omit it)`);
        return;
      }
      const clauseKey = normalized(entry.clause);
      if (clauseKey.length < MIN_LEDGER_CLAUSE_CHARS) {
        ledger.problems.push(`${label}: the clause is too short to identify one baseline clause`);
        return;
      }
      const file = toPosix(entry.file).replace(/^\.\//, '');
      ledger.entries.push({ ...entry, file, clauseKey, source: label, used: false, inScope: inScope(file) });
    });
  }
  return ledger;
}

function covers(entry, problem) {
  if (entry.file !== problem.file) return false;
  const problemKey = normalized(problem.clause);
  return problemKey.includes(entry.clauseKey) && entry.clauseKey.length >= Math.min(LEDGER_MATCH_CHARS, problemKey.length);
}

const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

function titleKey(text) {
  return apostrophes(text).replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim().replace(/[.:,;]+$/, '').toLowerCase();
}

function ruleIndexOf(principlesText) {
  return parsePrinciples(principlesText || '').filter((rule) => RULE_KINDS.has(rule.kind)).map((rule) => ({
    id: rule.id,
    title: shortTitleOf(rule.title),
    own: [titleKey(rule.title), titleKey(shortTitleOf(rule.title))],
    spans: boldSpansOf(rule.text).map(titleKey),
  }));
}

function resolveRule(rules, reference) {
  const key = titleKey(reference);
  if (key.length < 3) return null;
  return rules.find((rule) => rule.own.includes(key))
    || rules.find((rule) => rule.spans.includes(key))
    || rules.find((rule) => rule.own.some((title) => title.startsWith(key)))
    || rules.find((rule) => rule.spans.some((span) => span.startsWith(key)))
    || null;
}

const RULE_REFERENCE = /(?:`?(?:\.\.\/)*principles\.md`?|`?(?:\.\.\/)*\brules(?:\/[a-z0-9-]+\.md)?`?)\s*(?:→|->)\s*\*([^*]+)\*/g;
const SKILL_REFERENCE = /`(do-[a-z-]+)`\s*(?:→|->)\s*(?:\*([^*]+)\*|(Step\s+\d+[a-z]?(?:\.\d+)?))/g;
const PLUGIN_PATH = /(?<![\w./-])((?:\.\.\/){1,2}[\w./<>*-]+)/g;
const SIBLING_FILE = /`(?:\.\/)?([\w-]+\.md)`/g;

function sectionsMatching(text, label, isStep) {
  const lines = text.split('\n');
  const key = titleKey(label);
  const stepPattern = isStep ? new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9a-z.])`) : null;
  const sections = [];
  for (let index = 0; index < lines.length; index++) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(lines[index]);
    if (heading) {
      const headingText = titleKey(heading[2]);
      if (isStep ? stepPattern.test(headingText) : headingText.includes(key)) {
        let end = index + 1;
        while (end < lines.length) {
          const next = /^(#{1,6})\s/.exec(lines[end]);
          if (next && next[1].length <= heading[1].length) break;
          end++;
        }
        sections.push({ start: index, text: lines.slice(index, end).join('\n') });
      }
      continue;
    }
    if (isStep) continue;
    const lead = /^(\s*)(?:[-*+]\s+|\d+[.)]\s+)?\*\*([^*]+)\*\*/.exec(lines[index]);
    if (lead && titleKey(lead[2]).startsWith(key)) {
      const indent = lead[1].length;
      let end = index + 1;
      while (end < lines.length) {
        const line = lines[end];
        if (/^#{1,6}\s/.test(line)) break;
        const item = /^(\s*)(?:[-*+]|\d+[.)])\s+/.exec(line);
        if (item && item[1].length <= indent) break;
        end++;
      }
      sections.push({ start: index, text: lines.slice(index, end).join('\n') });
    }
  }
  return sections;
}

function resolveSkillSection(files, skill, label, isStep) {
  const skillFile = `skills/${skill}/SKILL.md`;
  const skillFiles = [...files.keys()].filter((file) => file.startsWith(`skills/${skill}/`))
    .sort((left, right) => (left === skillFile ? -1 : right === skillFile ? 1 : left.localeCompare(right)));
  if (!skillFiles.length) return { found: [], why: `there is no skill ${skill}` };
  const found = [];
  for (const file of skillFiles) {
    for (const section of sectionsMatching(files.get(file), label, isStep)) found.push({ file, ...section });
  }
  return { found, why: found.length ? '' : `no heading or bold lead in skills/${skill}/ matches "${label}"` };
}

function bundleRuleIds(applicability, bundleNames) {
  const ids = new Set();
  const bundles = (applicability && applicability.bundles) || {};
  for (const [id, entry] of Object.entries((applicability && applicability.rules) || {})) {
    if (!entry || !Array.isArray(entry.bundles)) continue;
    if (bundleNames.some((name) => bundles[name] && isSelected(entry, name, bundles[name]))) ids.add(id);
  }
  return ids;
}

function loadSetOf(skill, ownFiles, applicability, allRuleIds) {
  const skillText = ownFiles.get(`skills/${skill}/SKILL.md`) || '';
  if (READS_PRINCIPLES_IN_FULL.test(skillText)) return { ids: new Set(allRuleIds), sources: ['principles.md in full'] };
  const bundles = (applicability && applicability.bundles) || {};
  const names = new Set(Object.keys(bundles).filter((name) => ((bundles[name] && bundles[name].skills) || []).includes(skill)));
  for (const text of ownFiles.values()) {
    for (const match of text.matchAll(/rules\/([a-z0-9][a-z0-9-]*)\.md/g)) if (bundles[match[1]]) names.add(match[1]);
  }
  return { ids: bundleRuleIds(applicability, [...names]), sources: [...names].map((name) => `rules/${name}.md`) };
}

function checkReferences(root, files, inScope) {
  const problems = [];
  const report = (file, line, message) => problems.push({ file, line, message });
  const rules = ruleIndexOf(files.get('principles.md'));
  let applicability = null;
  const applicabilityText = readText(path.join(root, 'rules', 'applicability.json'));
  if (applicabilityText !== null) {
    try { applicability = JSON.parse(applicabilityText); } catch (error) {
      report('rules/applicability.json', 1, `not valid JSON (${error.message})`);
    }
  }

  const rulesInScope = inScope('principles.md') || inScope('rules/applicability.json');
  const checksFile = (file) => rulesInScope || inScope(file);

  for (const [file, text] of files) {
    if (!checksFile(file) || file === HOOKS_CONFIG) continue;
    for (const match of text.matchAll(RULE_REFERENCE)) {
      if (!resolveRule(rules, match[1])) {
        report(file, lineAt(text, match.index), `→ *${match[1].replace(/\s+/g, ' ')}* names no rule in principles.md`);
      }
    }
    for (const match of text.matchAll(SKILL_REFERENCE)) {
      const label = (match[2] || match[3]).replace(/\s+/g, ' ');
      const resolution = resolveSkillSection(files, match[1], label, Boolean(match[3]));
      if (!resolution.found.length) report(file, lineAt(text, match.index), `\`${match[1]}\` → ${match[2] ? `*${label}*` : label} does not resolve: ${resolution.why}`);
    }
    if (!file.startsWith('skills/') || TEMPLATE_FILE.test(file)) continue;
    for (const match of text.matchAll(PLUGIN_PATH)) {
      const mention = match[1].replace(/[.,;:)`'"]+$/, '');
      if (/[<>*]/.test(mention)) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), mention));
      if (target.startsWith('..')) continue;
      if (!fs.existsSync(path.join(root, target))) report(file, lineAt(text, match.index), `names \`${mention}\`, which does not exist`);
    }
  }

  const skills = [...new Set([...files.keys()].map((file) => (/^skills\/([^/]+)\/SKILL\.md$/.exec(file) || [])[1]).filter(Boolean))].sort();
  const allRuleIds = rules.map((rule) => rule.id);
  const skillRules = {};
  for (const skill of skills) {
    const prefix = `skills/${skill}/`;
    const ownFiles = new Map([...files].filter(([file]) => file.startsWith(prefix)));
    if (![...ownFiles.keys()].some(checksFile)) continue;
    const required = new Map();
    const queue = [...ownFiles].map(([file, text]) => ({ file, text, lineOffset: 0, via: '' }));
    const visited = new Set(queue.map((item) => item.file));
    while (queue.length) {
      const item = queue.shift();
      for (const match of item.text.matchAll(RULE_REFERENCE)) {
        const rule = resolveRule(rules, match[1]);
        if (rule && !required.has(rule.id)) {
          required.set(rule.id, { title: rule.title, at: `${item.file}:${item.lineOffset + lineAt(item.text, match.index)}${item.via}` });
        }
      }
      for (const match of item.text.matchAll(SKILL_REFERENCE)) {
        const label = (match[2] || match[3]).replace(/\s+/g, ' ');
        for (const section of resolveSkillSection(files, match[1], label, Boolean(match[3])).found) {
          const key = `${section.file}#${section.start}`;
          if (visited.has(key) || visited.has(section.file)) continue;
          visited.add(key);
          queue.push({ file: section.file, text: section.text, lineOffset: section.start, via: ` (via \`${match[1]}\` → ${label})` });
        }
      }
      const linked = [];
      for (const match of item.text.matchAll(PLUGIN_PATH)) linked.push(match[1].replace(/[.,;:)`'"]+$/, ''));
      for (const match of item.text.matchAll(SIBLING_FILE)) if (match[1] !== 'SKILL.md') linked.push(match[1]);
      for (const mention of linked) {
        if (/[<>*]/.test(mention)) continue;
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(item.file), mention));
        if (!target.startsWith('skills/') || !files.has(target) || visited.has(target)) continue;
        visited.add(target);
        queue.push({ file: target, text: files.get(target), lineOffset: 0, via: ` (via ${item.file})` });
      }
    }
    const loads = loadSetOf(skill, ownFiles, applicability, allRuleIds);
    skillRules[skill] = { loads: loads.sources, requires: [...required].map(([id, need]) => ({ id, title: need.title, at: need.at })) };
    if (!loads.sources.length) {
      report(`${prefix}SKILL.md`, 1, 'loads no rules: it names neither `../../principles.md` in full nor a bundle of rules/applicability.json');
      continue;
    }
    for (const [id, need] of required) {
      if (!loads.ids.has(id)) {
        report(`${prefix}SKILL.md`, 1, `cites *${need.title}* (${need.at}), which ${loads.sources.join(' + ')} does not carry`);
      }
    }
  }
  return { problems, skillRules };
}

function run(options) {
  const root = pluginRoot;
  const baselineCommit = resolveCommit(root, options.baseline);
  if (!baselineCommit) throw new Error(`baseline "${options.baseline}" is no commit in ${root}`);
  const scope = options.files.length ? options.files.map(scopeMatcher) : null;
  const inScope = (file) => !scope || scope.some((matches) => matches(file));

  const baselineFiles = readBaselineCorpus(root, baselineCommit);
  const currentFiles = readCurrentCorpus(root);
  const index = indexCorpus(currentFiles);

  const results = [];
  let baselineFileCount = 0;
  for (const [file, text] of baselineFiles) {
    if (!inScope(file)) continue;
    baselineFileCount++;
    for (const clause of clausesOf(text)) results.push({ file, clause, ...classify({ file, text: clause }, index) });
  }

  const ledger = readLedger(root, baselineCommit, inScope);
  for (const result of results) {
    if (!PROBLEM_VERDICTS.has(result.verdict)) continue;
    const entry = ledger.entries.find((candidate) => covers(candidate, result));
    if (entry) {
      entry.used = true;
      result.ledgered = entry.source;
    }
  }

  const counts = Object.fromEntries(VERDICTS.map((verdict) => [verdict, 0]));
  for (const result of results) counts[result.verdict]++;
  counts.ledgered = results.filter((result) => result.ledgered).length;
  const unledgered = results.filter((result) => PROBLEM_VERDICTS.has(result.verdict) && !result.ledgered);
  const { problems: references, skillRules } = checkReferences(root, currentFiles, inScope);
  const unused = ledger.entries.filter((entry) => entry.inScope && !entry.used).map((entry) => entry.source);

  return {
    ok: !unledgered.length && !references.length && !ledger.problems.length,
    baseline: { ref: options.baseline, commit: baselineCommit },
    scope: options.files.length ? options.files : null,
    files: baselineFileCount,
    clauses: results.length,
    counts,
    unledgered,
    results,
    references,
    skills: skillRules,
    ledger: { problems: ledger.problems, unused, notes: ledger.notes },
  };
}

const clip = (text, limit) => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);

function printReport(report, show) {
  const write = (line) => process.stdout.write(`${line}\n`);
  const { counts } = report;
  write(`rule-coverage: ${report.clauses} baseline clause(s) in ${report.files} file(s) — baseline ${report.baseline.ref} ` +
    `(${report.baseline.commit.slice(0, 7)})${report.scope ? `, limited to ${report.scope.join(' ')}` : ''}`);
  write(`  exact ${counts.exact} · reworded ${counts.reworded} · weakened ${counts.weakened} · missing ${counts.missing} · ` +
    `relocated ${counts.relocated} · ledgered ${counts.ledgered}`);

  const describe = (result) => {
    const head = { weakened: 'WEAKENED ', missing: 'MISSING  ', relocated: 'RELOCATED', reworded: 'REWORDED ', exact: 'EXACT    ' }[result.verdict];
    const lost = result.lost && result.lost.length ? ` — lost ${result.lost.join(', ')}` : '';
    const moved = result.verdict === 'relocated' ? ` — a gate left its SKILL.md for ${result.where}` : '';
    write(`${head} ${result.file}${lost}${moved}${result.ledgered ? ` (ledgered: ${result.ledgered})` : ''}`);
    write(`  clause:  ${result.clause}`);
    if (result.match && result.verdict !== 'exact') write(`  nearest: ${result.where} (${result.score}) ${clip(result.match, 220)}`);
  };

  if (report.unledgered.length) {
    write(`\nNeeds a ledger entry (${report.unledgered.length}):`);
    report.unledgered.forEach(describe);
  }
  for (const verdict of VERDICTS.concat('ledgered')) {
    if (!show.has(verdict)) continue;
    const listed = report.results.filter((result) => (verdict === 'ledgered' ? result.ledgered : result.verdict === verdict && !result.ledgered));
    write(`\n${verdict} (${listed.length}):`);
    listed.forEach(describe);
  }
  if (report.references.length) {
    write(`\nReferences (${report.references.length}):`);
    for (const problem of report.references) write(`  ${problem.file}:${problem.line} ${problem.message}`);
  }
  if (report.ledger.problems.length) {
    write(`\nLedger problems (${report.ledger.problems.length}):`);
    for (const problem of report.ledger.problems) write(`  ${problem}`);
  }
  for (const note of report.ledger.notes) write(`note: ${note}`);
  if (report.ledger.unused.length) write(`note: ${report.ledger.unused.length} ledger entr(ies) match no weakened, missing or relocated clause: ${report.ledger.unused.join('; ')}`);

  if (report.ok) write('\nok: every baseline clause is exact, reworded or ledgered, and every reference resolves');
  else {
    write(`\nFAIL: ${report.unledgered.length} unledgered clause(s), ${report.references.length} reference problem(s), ` +
      `${report.ledger.problems.length} ledger problem(s) — see ${LEDGER_DIRECTORY}/README.md`);
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  let report;
  try { report = run(options); } catch (error) {
    process.stderr.write(`rule-coverage: ${error.message}\n`);
    process.exit(2);
  }
  if (options.json) {
    const { results, ...summary } = report;
    const detailed = results.filter((result) => result.verdict !== 'exact' || options.show.has('exact'));
    process.stdout.write(JSON.stringify({ ...summary, results: detailed }, null, 2) + '\n');
  } else printReport(report, options.show);
  process.exitCode = report.ok ? 0 : 1;
}

if (require.main === module) main();

module.exports = {
  run,
  blocksOf,
  sentencesOf,
  clausesOf,
  normalized,
  contentWordsOf,
  hardTokensOf,
  globToRegExp,
  ruleIndexOf,
  resolveRule,
};
