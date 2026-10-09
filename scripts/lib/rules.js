const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', '..');
const principlesPath = path.join(pluginRoot, 'principles.md');
const rulesDirectory = path.join(pluginRoot, 'rules');
const applicabilityPath = path.join(rulesDirectory, 'applicability.json');

const SECTION_HEADING = /^## (.+?)\s*$/;
const AGREEMENTS_HEADING = /^## Working agreements\s*$/;
const AGREEMENT_LEAD = /^- \*\*(.+?)(?:\*\*|$)/;
const BOLD_SPAN = /\*\*([^*]+?)\*\*/g;

function slugOf(title) {
  return title
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

function parsePrinciples(text) {
  const rules = [];
  let current = null;
  let inAgreements = false;
  const open = (rule) => {
    current = { ...rule, lines: [] };
    rules.push(current);
  };
  open({ id: 'preamble', title: 'Preamble', kind: 'preamble' });
  for (const line of text.split('\n')) {
    const section = SECTION_HEADING.exec(line);
    if (section) {
      inAgreements = AGREEMENTS_HEADING.test(line);
      const title = section[1];
      open(inAgreements
        ? { id: 'working-agreements', title, kind: 'heading' }
        : { id: slugOf(title.split(' — ')[0]), title, kind: 'section' });
      current.lines.push(line);
      continue;
    }
    const lead = inAgreements ? AGREEMENT_LEAD.exec(line) : null;
    if (lead) {
      const title = lead[1].replace(/\s+/g, ' ').trim();
      open({ id: slugOf(title), title, kind: 'agreement' });
    }
    current.lines.push(line);
  }
  return rules.map(({ lines, ...rule }) => ({ ...rule, text: lines.join('\n') }));
}

function readPrinciples(filePath = principlesPath) {
  return parsePrinciples(fs.readFileSync(filePath, 'utf8'));
}

function boldSpansOf(ruleText) {
  return [...ruleText.matchAll(BOLD_SPAN)].map((match) => match[1].replace(/\s+/g, ' ').trim());
}

function readApplicability(filePath = applicabilityPath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

module.exports = {
  pluginRoot,
  principlesPath,
  rulesDirectory,
  applicabilityPath,
  slugOf,
  parsePrinciples,
  readPrinciples,
  boldSpansOf,
  readApplicability,
};
