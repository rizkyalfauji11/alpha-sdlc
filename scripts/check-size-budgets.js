#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const pluginRoot = path.resolve(process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..'));

const USAGE =
  'usage: check-size-budgets.js [--json] [--budgets <file>]\n' +
  '  measures SKILL.md bodies, descriptions, reference files, templates, agents, principles.md,\n' +
  '  the rule bundles, the compact digest and the language guides against size-budgets.json;\n' +
  '  exits 1 on any hard failure, 0 when only soft targets are exceeded\n';

function parseArguments(argv) {
  const options = { json: false, budgets: null };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--budgets' && index + 1 < argv.length) options.budgets = argv[++index];
    else return null;
  }
  return options;
}

function readText(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

function splitFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return { frontmatter: '', body: text, bodyStart: 0 };
  return { frontmatter: match[1], body: text.slice(match[0].length), bodyStart: match[0].length };
}

function frontmatterValue(frontmatter, key) {
  const lines = frontmatter.split(/\r?\n/);
  const keyPattern = new RegExp(`^${key}\\s*:`);
  const start = lines.findIndex((line) => keyPattern.test(line));
  if (start === -1) return '';
  const head = lines[start].replace(new RegExp(`^${key}\\s*:\\s*`), '');
  const continuation = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s+\S/.test(line) || !line.trim()) continuation.push(line.trim());
    else break;
  }
  while (continuation.length && !continuation[continuation.length - 1]) continuation.pop();
  if (/^[>|][-+]?\s*$/.test(head)) return continuation.join(head.startsWith('|') ? '\n' : ' ').trim();
  const value = [head, ...continuation].join(' ').trim();
  const quoted = /^(["'])([\s\S]*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

function markdownFilesUnder(directory) {
  const found = [];
  const walk = (current) => {
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) found.push(full);
    }
  };
  walk(directory);
  return found;
}

function directoriesIn(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort();
  } catch { return []; }
}

const formatted = (count) => count.toLocaleString('en-US');
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const relativeToRoot = (filePath) => path.relative(pluginRoot, filePath).split(path.sep).join('/');
const lineCountOf = (text) => text.replace(/\n$/, '').split('\n').length;
const lineNumberAt = (text, offset) => text.slice(0, offset).split('\n').length;

function headingKey(text) {
  return text.replace(/[`*_]/g, '').split(' — ')[0].replace(/\s+/g, ' ').trim().replace(/^\d+[.)]\s*/, '').toLowerCase();
}

function tableOfContentsGaps(text) {
  const lines = text.split('\n');
  const headings = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) return;
    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) headings.push({ index, level: match[1].length, key: headingKey(match[2]) });
  });
  const contents = headings.find((heading) => /^(?:table of contents|contents|isi)$/.test(heading.key));
  const sectionsAt = (level) => headings.filter((heading) => heading !== contents && heading.level === level);
  const sections = sectionsAt(2).length >= 2 ? sectionsAt(2) : sectionsAt(3);
  if (sections.length < 2) return ['the file has no ## sections to list'];
  let region;
  if (contents) {
    const next = headings.find((heading) => heading.index > contents.index && heading.level <= contents.level);
    region = lines.slice(contents.index + 1, next ? next.index : lines.length);
  } else {
    region = lines.slice(0, sections[0].index);
  }
  const regionText = region.join(' ').replace(/[`*_]/g, '').replace(/\s+/g, ' ').toLowerCase();
  return sections.filter((section) => section.key && !regionText.includes(section.key)).map((section) => section.key);
}

function measure(budgets) {
  const rows = [];
  const failures = [];
  const warnings = [];
  const fail = (file, kind, message, reason) => failures.push({ file, kind, message, ...(reason ? { reason } : {}) });
  const warn = (file, kind, message) => warnings.push({ file, kind, message });
  const row = (file, kind, chars, max, target) => rows.push({ file, kind, chars, max, ...(target ? { target } : {}) });
  const targets = budgets.fileTargetChars || {};

  const skillsDirectory = path.join(pluginRoot, 'skills');
  const gatePattern = new RegExp(budgets.gateLinePattern);
  for (const skillName of directoriesIn(skillsDirectory)) {
    const skillDirectory = path.join(skillsDirectory, skillName);
    const skillFile = path.join(skillDirectory, 'SKILL.md');
    const text = readText(skillFile);
    if (text === null) continue;
    const file = relativeToRoot(skillFile);
    const { frontmatter, body, bodyStart } = splitFrontmatter(text);
    const trimmed = body.trim();
    const target = (budgets.skillBodyTargetChars || {})[skillName];
    row(file, 'skill-body', trimmed.length, budgets.skillBodyMaxChars, target);
    if (trimmed.length > budgets.skillBodyMaxChars) {
      fail(file, 'skill-body', `body ${formatted(trimmed.length)} chars > ${formatted(budgets.skillBodyMaxChars)}`, budgets.skillBodyMaxCharsReason);
    } else if (target && trimmed.length > target) {
      warn(file, 'skill-target', `body ${formatted(trimmed.length)} chars > target ${formatted(target)}`);
    }

    const firstLine = lineNumberAt(text, bodyStart + (body.length - body.trimStart().length));
    const lateGates = [];
    let offset = 0;
    trimmed.split('\n').forEach((line, index) => {
      const end = offset + line.length;
      if (end > budgets.gateLineMaxOffsetChars && gatePattern.test(line)) lateGates.push(firstLine + index);
      offset = end + 1;
    });
    if (lateGates.length) {
      const shown = lateGates.slice(0, 8).join(', ') + (lateGates.length > 8 ? ', …' : '');
      fail(file, 'gate-offset',
        `${lateGates.length} gate line(s) end past char ${formatted(budgets.gateLineMaxOffsetChars)} of the body (line ${shown})`,
        budgets.gateLineReason);
    }

    for (const heading of budgets.requiredSkillSections || []) {
      if (!new RegExp(`^${escapeRegExp(heading)}(?=\\s|$)`, 'm').test(trimmed)) {
        fail(file, 'skill-section', `has no "${heading}" section`);
      }
    }

    const description = [frontmatterValue(frontmatter, 'description'), frontmatterValue(frontmatter, 'when_to_use')]
      .filter(Boolean).join(' ');
    row(file + '#description', 'description', description.length, budgets.descriptionMaxChars, budgets.descriptionTargetChars);
    if (description.length > budgets.descriptionMaxChars) {
      fail(file, 'description', `description ${formatted(description.length)} chars > ${formatted(budgets.descriptionMaxChars)}`, budgets.descriptionMaxCharsReason);
    } else if (description.length > budgets.descriptionTargetChars) {
      warn(file, 'description-target', `description ${formatted(description.length)} chars > target ${formatted(budgets.descriptionTargetChars)}`);
    }

    for (const otherFile of markdownFilesUnder(skillDirectory)) {
      if (otherFile === skillFile) continue;
      const content = readText(otherFile) || '';
      const relativeFile = relativeToRoot(otherFile);
      const insideSkill = path.relative(skillDirectory, otherFile).split(path.sep).join('/');
      const isTemplate = /(^|\/)templates\//.test(insideSkill) || /template/i.test(path.basename(otherFile));
      const kind = isTemplate ? 'template' : 'reference';
      const max = isTemplate ? budgets.templateMaxChars : budgets.referenceFileMaxChars;
      const fileTarget = targets[relativeFile];
      row(relativeFile, kind, content.length, max, fileTarget);
      if (content.length > max) fail(relativeFile, kind, `${formatted(content.length)} chars > ${formatted(max)}`);
      else if (fileTarget && content.length > fileTarget) warn(relativeFile, 'file-target', `${formatted(content.length)} chars > target ${formatted(fileTarget)}`);
      const lines = lineCountOf(content);
      if (!isTemplate && lines > budgets.referenceTocAboveLines) {
        const gaps = tableOfContentsGaps(content);
        if (gaps.length) {
          const named = gaps.slice(0, 4).map((gap) => `"${gap}"`).join(', ') + (gaps.length > 4 ? ', …' : '');
          fail(relativeFile, 'reference-toc',
            `${lines} lines (> ${budgets.referenceTocAboveLines}) and no table of contents near the top listing its sections — missing ${named}`);
        }
      }
    }
  }

  for (const agentFile of markdownFilesUnder(path.join(pluginRoot, 'agents'))) {
    const text = readText(agentFile) || '';
    const file = relativeToRoot(agentFile);
    const bodyChars = splitFrontmatter(text).body.trim().length;
    row(file, 'agent-body', bodyChars, budgets.agentBodyMaxChars);
    if (bodyChars > budgets.agentBodyMaxChars) fail(file, 'agent-body', `body ${formatted(bodyChars)} chars > ${formatted(budgets.agentBodyMaxChars)}`);
  }

  const principles = readText(path.join(pluginRoot, 'principles.md'));
  if (principles !== null) {
    row('principles.md', 'principles', principles.length, budgets.principlesMaxChars);
    if (principles.length > budgets.principlesMaxChars) {
      fail('principles.md', 'principles', `${formatted(principles.length)} chars > ${formatted(budgets.principlesMaxChars)}`);
    }
  }

  const rulesDirectory = path.join(pluginRoot, 'rules');
  for (const rulesFile of markdownFilesUnder(rulesDirectory).filter((candidate) => path.dirname(candidate) === rulesDirectory)) {
    const text = readText(rulesFile) || '';
    const file = relativeToRoot(rulesFile);
    const name = path.basename(rulesFile, '.md');
    if (name === 'compact-digest') {
      row(file, 'compact-digest', text.length, budgets.compactDigestMaxChars);
      if (text.length > budgets.compactDigestMaxChars) {
        fail(file, 'compact-digest', `${formatted(text.length)} chars > ${formatted(budgets.compactDigestMaxChars)}`, budgets.compactDigestReason);
      }
      continue;
    }
    const max = (budgets.bundleMaxChars || {})[name];
    row(file, 'bundle', text.length, max === undefined ? null : max);
    if (max === undefined) fail(file, 'bundle', `bundle "${name}" has no budget in size-budgets.json bundleMaxChars`);
    else if (text.length > max) fail(file, 'bundle', `${formatted(text.length)} chars > ${formatted(max)}`, budgets.bundleMaxCharsReason);
  }

  for (const guideFile of markdownFilesUnder(path.join(pluginRoot, 'plain-language'))) {
    const text = readText(guideFile) || '';
    const file = relativeToRoot(guideFile);
    row(file, 'plain-language-guide', text.length, budgets.plainLanguageGuideMaxChars);
    if (text.length > budgets.plainLanguageGuideMaxChars) {
      fail(file, 'plain-language-guide', `${formatted(text.length)} chars > ${formatted(budgets.plainLanguageGuideMaxChars)}`, budgets.plainLanguageGuideReason);
    }
  }

  return { rows, failures, warnings };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  const budgetsPath = options.budgets
    || [path.join(pluginRoot, 'size-budgets.json'), path.join(__dirname, '..', 'size-budgets.json')].find((candidate) => fs.existsSync(candidate));
  let budgets;
  try { budgets = JSON.parse(fs.readFileSync(budgetsPath, 'utf8')); } catch (error) {
    process.stderr.write(`check-size-budgets: cannot read the budgets file ${budgetsPath || 'size-budgets.json'} (${error.message})\n`);
    process.exit(2);
  }

  const { rows, failures, warnings } = measure(budgets);
  if (options.json) {
    process.stdout.write(JSON.stringify({ ok: failures.length === 0, failures, warnings, rows }, null, 2) + '\n');
    process.exitCode = failures.length ? 1 : 0;
    return;
  }

  const measuredFiles = new Set(rows.map((entry) => entry.file.replace(/#.*$/, ''))).size;
  process.stdout.write(`check-size-budgets: ${failures.length} failure(s), ${warnings.length} warning(s) — ${measuredFiles} file(s) measured\n`);
  for (const failure of failures) process.stdout.write(`FAIL  ${failure.file}  ${failure.message}\n`);
  for (const warning of warnings) process.stdout.write(`WARN  ${warning.file}  ${warning.message}\n`);
  const reasons = new Map(failures.filter((failure) => failure.reason).map((failure) => [failure.kind, failure.reason]));
  if (reasons.size) {
    process.stdout.write('\nwhy:\n');
    for (const [kind, reason] of reasons) process.stdout.write(`  ${kind}: ${reason}\n`);
  }
  process.exitCode = failures.length ? 1 : 0;
}

if (require.main === module) main();

module.exports = { splitFrontmatter, frontmatterValue, tableOfContentsGaps, measure };
