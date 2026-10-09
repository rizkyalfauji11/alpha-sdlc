#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { parsePrinciples, boldSpansOf } = require('./lib/rules');

const pluginRoot = path.resolve(process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..'));

const RULE_KINDS = new Set(['section', 'agreement']);
const REVIEW_TRIGGERS = new Set(['always', 'code', 'ui', 'data', 'contract', 'tests', 'docs', 'trd', 'never']);
const BUNDLE_NAME = /^[a-z0-9][a-z0-9-]*$/;
const DIGEST_NAME = 'compact-digest';
const RESERVED_NAMES = new Set([DIGEST_NAME, 'applicability']);
const DIGEST_SPAN_MIN_CHARS = 25;
const DIGEST_HEADER =
  'Binding rules digest, generated from `principles.md` by `scripts/build-rules.js` — ' +
  'edit `principles.md`, never this file.';
const CLOSING_LEAD = 'Not in this bundle (they do not govern these skills, or bind through the add-on named beside them):';
const ADD_ON_CLOSING =
  'This bundle adds to the reading skill\'s own bundle; every other rule binds through that bundle.';

const USAGE =
  'usage: build-rules.js [--check] [--principles <file>] [--applicability <file>] [--out <dir>] [--skills <dir>]\n' +
  '  writes rules/<bundle>.md for every bundle in rules/applicability.json and rules/compact-digest.md;\n' +
  '  --check writes nothing and exits 1 when an output is stale or the applicability entries do not\n' +
  '  match the rules in principles.md\n';

function parseArguments(argv) {
  const options = { check: false };
  const valued = new Set(['--principles', '--applicability', '--out', '--skills']);
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--check') options.check = true;
    else if (valued.has(argument) && index + 1 < argv.length) options[argument.slice(2)] = argv[++index];
    else return null;
  }
  return options;
}

function shortTitleOf(title) {
  const flat = title.replace(/\s+/g, ' ').trim().replace(/[.:]+$/, '');
  const beforeDash = flat.split(' — ')[0];
  const firstSentence = beforeDash.split(/(?<=\.)\s+(?=[A-Z])/)[0];
  return firstSentence.replace(/[.:]+$/, '').trim();
}

const flatKey = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();

function ruleRecords(rules) {
  return rules.filter((rule) => RULE_KINDS.has(rule.kind));
}

function validationProblems(rules, applicability, skillNames) {
  const problems = [];
  const bundles = applicability && applicability.bundles;
  const entries = applicability && applicability.rules;
  const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (!isObject(bundles)) problems.push('applicability.json has no "bundles" object');
  if (!isObject(entries)) problems.push('applicability.json has no "rules" object');
  if (problems.length) return problems;

  const bundleNames = Object.keys(bundles);
  for (const name of bundleNames) {
    if (!BUNDLE_NAME.test(name) || RESERVED_NAMES.has(name)) {
      problems.push(`bundle "${name}" cannot be a file name under rules/ — use lowercase words joined by "-"`);
    }
    const bundle = bundles[name];
    if (!isObject(bundle) || !Array.isArray(bundle.skills)) problems.push(`bundle "${name}" has no "skills" array`);
    else if (!bundle.skills.length && !bundle.readWhen) problems.push(`bundle "${name}" names no skills and no "readWhen"`);
  }

  const knownIds = new Set();
  for (const rule of ruleRecords(rules)) {
    if (knownIds.has(rule.id)) problems.push(`two rules share the id "${rule.id}" — make their bold leads differ`);
    knownIds.add(rule.id);
    if (!Object.prototype.hasOwnProperty.call(entries, rule.id)) {
      problems.push(`rule "${rule.id}" (*${shortTitleOf(rule.title)}*) has no entry in applicability.json`);
    }
  }

  for (const [id, entry] of Object.entries(entries)) {
    if (!knownIds.has(id)) {
      problems.push(`applicability.json names "${id}", which is no rule in principles.md`);
      continue;
    }
    if (!isObject(entry) || !Array.isArray(entry.bundles)) {
      problems.push(`rule "${id}" has no "bundles" array`);
      continue;
    }
    if (!entry.bundles.length) problems.push(`rule "${id}" is in no bundle, so no skill would load it`);
    for (const bundleName of entry.bundles) {
      if (bundleName !== '*' && !bundleNames.includes(bundleName)) problems.push(`rule "${id}" names unknown bundle "${bundleName}"`);
    }
    if ('digest' in entry && typeof entry.digest !== 'boolean') problems.push(`rule "${id}" has a "digest" that is not true or false`);
    if ('review' in entry) {
      if (!Array.isArray(entry.review)) problems.push(`rule "${id}" has a "review" that is not an array`);
      else {
        for (const trigger of entry.review) {
          if (!REVIEW_TRIGGERS.has(trigger)) problems.push(`rule "${id}" names unknown review trigger "${trigger}"`);
        }
      }
    }
  }

  if (skillNames) {
    const assigned = new Set();
    for (const name of bundleNames) {
      for (const skill of (bundles[name] && bundles[name].skills) || []) {
        assigned.add(skill);
        if (!skillNames.includes(skill)) problems.push(`bundle "${name}" names "${skill}", which has no skills/${skill}/SKILL.md`);
      }
    }
    for (const skill of skillNames) {
      if (!assigned.has(skill)) problems.push(`skill "${skill}" is in no bundle, so it would load no rules`);
    }
  }
  return problems;
}

const isAddOn = (bundle) => !(bundle.skills || []).length;

function isSelected(entry, bundleName, bundle) {
  return entry.bundles.includes(bundleName) || (entry.bundles.includes('*') && !isAddOn(bundle));
}

function selectedRuleIds(bundleName, bundle, rules, entries) {
  return new Set(ruleRecords(rules).filter((rule) => isSelected(entries[rule.id], bundleName, bundle)).map((rule) => rule.id));
}

function noticeFor(bundle) {
  const skills = (bundle.skills || []).join(', ');
  const readWhen = bundle.readWhen ? `${skills ? '; also read when ' : 'read when '}${bundle.readWhen}` : '';
  return `Generated from \`principles.md\` by \`scripts/build-rules.js\` for: ${skills}${readWhen}. ` +
    'Edit `principles.md`, never this file.';
}

function addOnReadersFrom(skillsDirectory, bundles) {
  if (!skillsDirectory) return null;
  const names = (skill, addOnName) => {
    try { return fs.readFileSync(path.join(skillsDirectory, skill, 'SKILL.md'), 'utf8').includes(`rules/${addOnName}.md`); } catch { return false; }
  };
  const readers = new Map();
  for (const [addOnName, addOn] of Object.entries(bundles)) {
    if (!isAddOn(addOn)) continue;
    readers.set(addOnName, new Set(Object.entries(bundles)
      .filter(([, bundle]) => !isAddOn(bundle) && (bundle.skills || []).some((skill) => names(skill, addOnName)))
      .map(([bundleName]) => bundleName)));
  }
  return readers;
}

function withheldListOf(bundleName, rules, selected, entries, bundles, readers) {
  const addOnsRead = Object.entries(bundles || {}).filter(([name, candidate]) =>
    isAddOn(candidate) && (!readers || (readers.get(name) || new Set()).has(bundleName)));
  const named = new Map();
  const lines = ruleRecords(rules).filter((rule) => !selected.has(rule.id)).map((rule) => {
    const addOn = addOnsRead.find(([name, candidate]) => isSelected(entries[rule.id], name, candidate));
    if (!addOn) return `- *${shortTitleOf(rule.title)}*`;
    named.set(addOn[0], addOn[1]);
    return `- *${shortTitleOf(rule.title)}* — in \`rules/${addOn[0]}.md\``;
  });
  const readWhen = [...named].filter(([, addOn]) => addOn.readWhen).map(([name, addOn]) => `\`rules/${name}.md\` is read when ${addOn.readWhen}.`);
  return [...(lines.length ? lines : ['- none']), ...(readWhen.length ? ['', ...readWhen] : [])];
}

function bundleText(bundleName, bundle, rules, entries, bundles, readers) {
  const selected = selectedRuleIds(bundleName, bundle, rules, entries);
  const carriesAgreement = rules.some((rule) => rule.kind === 'agreement' && selected.has(rule.id));
  const kept = rules.filter((rule) =>
    rule.kind === 'preamble' || selected.has(rule.id) || (rule.kind === 'heading' && carriesAgreement));
  const body = kept.map((rule) => rule.text).join('\n').replace(/\s+$/, '');
  if (isAddOn(bundle)) return `${noticeFor(bundle)}\n\n${body}\n\n${ADD_ON_CLOSING}\n`;
  const closing = [CLOSING_LEAD, ...withheldListOf(bundleName, rules, selected, entries, bundles, readers)].join('\n');
  return `${noticeFor(bundle)}\n\n${body}\n\n${closing}\n`;
}

function digestLineOf(rule) {
  const title = shortTitleOf(rule.title);
  const spans = boldSpansOf(rule.text);
  const pieces = [];
  if (spans.length && (flatKey(spans[0]).startsWith(flatKey(title)) || flatKey(rule.title).startsWith(flatKey(spans[0])))) {
    const lead = spans.shift();
    const tail = lead.replace(/\s+/g, ' ').slice(title.length).replace(/^[\s.:;,—–-]+/, '').trim();
    if (tail) pieces.push(tail);
  }
  pieces.push(...spans.filter((span) => span.length >= DIGEST_SPAN_MIN_CHARS));
  return pieces.length ? `- **${title}** — ${pieces.join(' · ')}` : `- **${title}**`;
}

function digestText(rules, entries) {
  const lines = ruleRecords(rules).filter((rule) => entries[rule.id].digest === true).map(digestLineOf);
  return `${DIGEST_HEADER}\n\n${lines.join('\n')}\n`;
}

function buildOutputs(principlesText, applicability, skillsDirectory) {
  const rules = parsePrinciples(principlesText);
  const readers = addOnReadersFrom(skillsDirectory, applicability.bundles);
  const outputs = new Map();
  for (const [name, bundle] of Object.entries(applicability.bundles)) {
    outputs.set(`${name}.md`, bundleText(name, bundle, rules, applicability.rules, applicability.bundles, readers));
  }
  outputs.set(`${DIGEST_NAME}.md`, digestText(rules, applicability.rules));
  return outputs;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function skillNamesIn(skillsDirectory) {
  if (!skillsDirectory) return null;
  let entries;
  try { entries = fs.readdirSync(skillsDirectory, { withFileTypes: true }); } catch { return null; }
  return entries
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsDirectory, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

const displayPath = (filePath) => {
  const relative = path.relative(process.cwd(), filePath);
  return relative && !relative.startsWith('..') ? relative : filePath;
};

function strayOutputs(outDirectory, outputs) {
  let present = [];
  try { present = fs.readdirSync(outDirectory).filter((name) => name.endsWith('.md')); } catch {}
  return present
    .filter((name) => !outputs.has(name))
    .map((name) => `${displayPath(path.join(outDirectory, name))} is produced by no bundle in applicability.json — delete it or add its bundle`);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  const principlesPath = path.resolve(options.principles || path.join(pluginRoot, 'principles.md'));
  const applicabilityPath = path.resolve(options.applicability || path.join(pluginRoot, 'rules', 'applicability.json'));
  const outDirectory = path.resolve(options.out || path.join(pluginRoot, 'rules'));
  const skillsDirectory = options.skills ? path.resolve(options.skills) : (options.principles ? null : path.join(pluginRoot, 'skills'));

  let principlesText;
  try { principlesText = fs.readFileSync(principlesPath, 'utf8'); } catch (error) {
    process.stderr.write(`build-rules: cannot read ${displayPath(principlesPath)} (${error.code || error.message})\n`);
    process.exit(2);
  }
  let applicability;
  try { applicability = readJson(applicabilityPath); } catch (error) {
    const why = error.code === 'ENOENT' ? 'not found' : `not valid JSON: ${error.message}`;
    process.stdout.write(`build-rules: ${displayPath(applicabilityPath)} ${why} — every rule needs an applicability entry\n`);
    process.exit(1);
  }

  const problems = validationProblems(parsePrinciples(principlesText), applicability, skillNamesIn(skillsDirectory));
  if (problems.length) {
    process.stdout.write(`build-rules: ${problems.length} problem(s) in ${displayPath(applicabilityPath)}\n`);
    for (const problem of problems) process.stdout.write(`  - ${problem}\n`);
    process.exit(1);
  }

  const outputs = buildOutputs(principlesText, applicability, skillsDirectory);
  if (options.check) {
    const stale = [];
    for (const [name, text] of outputs) {
      const target = path.join(outDirectory, name);
      let onDisk = null;
      try { onDisk = fs.readFileSync(target, 'utf8'); } catch {}
      if (onDisk === null) stale.push(`${displayPath(target)} is missing`);
      else if (onDisk !== text) stale.push(`${displayPath(target)} is stale`);
    }
    stale.push(...strayOutputs(outDirectory, outputs));
    if (stale.length) {
      process.stdout.write(`build-rules --check: ${stale.length} output(s) out of date — run node scripts/build-rules.js\n`);
      for (const line of stale) process.stdout.write(`  - ${line}\n`);
      process.exit(1);
    }
    process.stdout.write(`build-rules --check: ${outputs.size - 1} bundle(s) and the compact digest are fresh\n`);
    process.exit(0);
  }

  fs.mkdirSync(outDirectory, { recursive: true });
  for (const [name, text] of outputs) {
    const target = path.join(outDirectory, name);
    fs.writeFileSync(target, text);
    process.stdout.write(`${String(text.length).padStart(7)} chars  ${displayPath(target)}\n`);
  }
  for (const stray of strayOutputs(outDirectory, outputs)) process.stdout.write(`note: ${stray}\n`);
}

if (require.main === module) main();

module.exports = { shortTitleOf, validationProblems, buildOutputs, digestLineOf, bundleText, noticeFor, isSelected, isAddOn };
