#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const USAGE =
  'usage: check-coverage.js <feature-dir> <platform> [--stage <n> --tests <file>... [--base <rev>]] [--table]\n' +
  '       check-coverage.js <feature-dir> <platform> --test-plan [--report <junit.xml|report.json>...] [--repo <dir>]\n' +
  '  reads <feature-dir>/TRD-<platform>.md (§8 acceptance criteria, §9 work slices) — or TRD.md when it is\n' +
  '  a single-document Issue or Tech-Debt TRD (its acceptance-criteria section) — and\n' +
  '  <feature-dir>/plan-<platform>.md (each stage heading and its Covers / Moved in lines)\n' +
  '  --test-plan reads <feature-dir>/test-plan-<platform>.md instead of the plan: every AC in the register\n' +
  '  has a row in the AC → test table, every test file and test name a row claims exists, and with\n' +
  '  --report (JUnit XML, Playwright/Jest/Vitest JSON, go test -json) every recorded status matches the run\n';

class CoverageInputError extends Error {}

function inputError(message) {
  throw new CoverageInputError(message);
}

function readText(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return inputError(`cannot read ${filePath}`); }
}

const AC_ID = /AC-(\d+)/g;
const AC_RANGE = /AC-(\d+)`?\s*(?:…|\.\.\.?|–|—|to)\s*`?AC-(\d+)/g;
function acIdsIn(text) {
  const ids = [...String(text).matchAll(AC_ID)].map((match) => Number(match[1]));
  for (const range of String(text).matchAll(AC_RANGE)) {
    for (let id = Number(range[1]) + 1; id < Number(range[2]); id++) ids.push(id);
  }
  return ids;
}

function sectionOf(markdown, number) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${number}\\.`).test(line));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s+\d+\./.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

const REGISTER_ROW = /^\|\s*(~~)?\s*\**\s*AC-(\d+)\b/;
const SINGLE_DOCUMENT_TITLE = /^#\s+(?:issue|tech-?debt)\s+trd\b/i;

function registerDocumentPath(featureDirectory, platform) {
  const spokePath = path.join(featureDirectory, `TRD-${platform}.md`);
  if (fs.existsSync(spokePath)) return spokePath;
  const singlePath = path.join(featureDirectory, 'TRD.md');
  let text;
  try { text = fs.readFileSync(singlePath, 'utf8'); } catch { return spokePath; }
  const title = text.split('\n').find((line) => /^#\s/.test(line)) || '';
  return SINGLE_DOCUMENT_TITLE.test(title) ? singlePath : spokePath;
}

function registerLinesOf(spoke) {
  const numbered = sectionOf(spoke, 8);
  return numbered.some((line) => REGISTER_ROW.test(line)) ? numbered : acceptanceLinesOf(spoke);
}

function parseRegister(spoke) {
  const register = new Set();
  const retired = new Set();
  const rows = new Map();
  const tableLines = [];
  for (const line of registerLinesOf(spoke)) {
    if (/^\|/.test(line)) tableLines.push(line);
    const row = line.match(REGISTER_ROW);
    if (!row) continue;
    const id = Number(row[2]);
    (row[1] || /^\|\s*~~/.test(line) ? retired : register).add(id);
    if (!rows.has(id)) rows.set(id, []);
    rows.get(id).push(line);
  }
  const firstRow = tableLines.findIndex((line) => REGISTER_ROW.test(line));
  const header = firstRow > 0 ? tableLines.slice(0, firstRow) : [];
  return { register, retired, rows, header };
}

const SLICE_ROW = /^\|\s*\**\s*`?([A-Z]{1,3}\d+)`?\s*\**\s*\|/;
const SLICE_ITEM = /^\s*[-*]\s+(?:\[.\]\s+)?\**\s*`?([A-Z]{1,3}\d+)`?\s*\**/;
function parseSlices(spoke) {
  const slices = new Map();
  const sliceLines = sectionOf(spoke, 9);
  for (let index = 0; index < sliceLines.length; index++) {
    const row = sliceLines[index].match(SLICE_ROW);
    if (row) {
      slices.set(row[1], { acs: new Set(acIdsIn(sliceLines[index])), lines: [sliceLines[index]] });
      continue;
    }
    const item = sliceLines[index].match(SLICE_ITEM);
    if (!item) continue;
    const lines = [sliceLines[index]];
    for (let next = index + 1; next < sliceLines.length && /^\s{2,}\S/.test(sliceLines[next]); next++) {
      lines.push(sliceLines[next]);
    }
    slices.set(item[1], { acs: new Set(acIdsIn(lines.join(' '))), lines });
  }
  return slices;
}

function bulletText(block, label) {
  const start = block.findIndex((line) => new RegExp(`^\\s*[-*]\\s+\\*\\*${label}:?\\*\\*`).test(line));
  if (start === -1) return '';
  const parts = [block[start]];
  for (let next = start + 1; next < block.length; next++) {
    if (/^\s*[-*]\s+\*\*/.test(block[next]) || !block[next].trim()) break;
    parts.push(block[next]);
  }
  return parts.join(' ');
}

function parsePlan(plan, slices) {
  const sliceOfToken = (token) => {
    if (slices.has(token)) return token;
    const parent = token.replace(/[a-z]+$/, '');
    return slices.has(parent) ? parent : null;
  };
  const planLines = plan.split('\n');
  const stages = [];
  for (let index = 0; index < planLines.length; index++) {
    const heading = planLines[index].match(/^#{2,4}\s+Stage\s+(\d+)(?![\w'’])(.*)$/);
    if (!heading) continue;
    const tokens = [...heading[2].matchAll(/`([A-Z]{1,3}\d+[a-z]*)`/g)].map((match) => match[1]);
    const stageSlices = [...new Set(tokens.map(sliceOfToken).filter(Boolean))];
    const block = [];
    for (let next = index + 1; next < planLines.length && !/^#{2,4}\s/.test(planLines[next]); next++) {
      block.push(planLines[next]);
    }
    stages.push({ number: Number(heading[1]), slices: stageSlices, block, heading: planLines[index], line: index + 1 });
  }

  const movedInto = new Map();
  const recordMove = (id, stageNumber) => {
    if (!movedInto.has(stageNumber)) movedInto.set(stageNumber, new Set());
    movedInto.get(stageNumber).add(id);
  };
  for (const stage of stages) {
    const coversText = bulletText(stage.block, 'Covers');
    const [claimedPart, ...amendmentParts] = coversText.split('⚠️');
    stage.covers = new Set(acIdsIn(claimedPart.replace(/^.*?\*\*Covers:?\*\*/, '')));
    const amendment = amendmentParts.join(' ');
    for (const match of amendment.matchAll(/AC-(\d+)[^.;]*?\bmoves? to Stage (\d+)/g)) {
      recordMove(Number(match[1]), Number(match[2]));
    }
    for (const id of acIdsIn(bulletText(stage.block, 'Moved in'))) recordMove(id, stage.number);
  }
  for (const match of plan.matchAll(/`AC-(\d+)`\s*`[A-Z]{1,3}\d+[a-z]*`\s*→\s*Stage\s+(\d+)/g)) {
    recordMove(Number(match[1]), Number(match[2]));
  }
  return { stages, movedInto };
}

function readFeature(featureDirectory, platform) {
  const spokePath = registerDocumentPath(featureDirectory, platform);
  const planPath = path.join(featureDirectory, `plan-${platform}.md`);
  const spoke = readText(spokePath);
  const { register, retired, rows, header } = parseRegister(spoke);
  if (!register.size && !retired.size) inputError(`no acceptance criteria found in §8 or an acceptance-criteria section of ${spokePath}`);
  const slices = parseSlices(spoke);
  const plan = readText(planPath);
  const { stages, movedInto } = parsePlan(plan, slices);
  if (!stages.length) inputError(`no "### Stage N" headings found in ${planPath}`);
  return { spokePath, planPath, spoke, plan, register, retired, rows, header, slices, stages, movedInto };
}

function planProblems({ spokePath, register, retired, slices, stages, movedInto }) {
  const problems = [];
  const claimedBy = new Map();
  for (const stage of stages) {
    if (!stage.covers.size) problems.push(`Stage ${stage.number} claims no acceptance criterion`);
    for (const id of stage.covers) {
      if (!claimedBy.has(id)) claimedBy.set(id, []);
      claimedBy.get(id).push(stage.number);
      if (!register.has(id) && !retired.has(id)) {
        problems.push(`Stage ${stage.number} claims AC-${id}, which is not in §8 of ${path.basename(spokePath)}`);
        continue;
      }
      if (!stage.slices.length) continue;
      const inOwnSlice = stage.slices.some((slice) => slices.get(slice).acs.has(id));
      const moved = movedInto.has(stage.number) && movedInto.get(stage.number).has(id);
      if (!inOwnSlice && !moved) {
        const owners = [...slices].filter(([, slice]) => slice.acs.has(id)).map(([name]) => name);
        problems.push(
          `Stage ${stage.number} (${stage.slices.join(', ')}) claims AC-${id}, which §9 gives to ` +
            `${owners.join(', ') || 'no slice'}, with no "Moved in" record for this stage`,
        );
      }
    }
  }
  for (const id of [...register].sort((a, b) => a - b)) {
    if (!claimedBy.has(id)) problems.push(`AC-${id} is claimed by no stage`);
  }

  const builtWith = new Map();
  for (const stage of stages) {
    const partners = [...bulletText(stage.block, 'Built with').matchAll(/Stages?\s+(\d+)/g)].map((match) => Number(match[1]));
    builtWith.set(stage.number, new Set(partners.filter((number) => number !== stage.number)));
    const status = bulletText(stage.block, 'Status');
    const verdict = bulletText(stage.block, 'Checkpoint verdict').replace(/^.*?\*\*Checkpoint verdict:?\*\*/, '');
    if (/\bdone\b/i.test(status) && (!verdict.trim() || /pending|</i.test(verdict))) {
      problems.push(`Stage ${stage.number} is done but carries no checkpoint verdict of its own`);
    }
  }
  for (const [number, partners] of builtWith) {
    for (const partner of partners) {
      if (!builtWith.has(partner)) problems.push(`Stage ${number} says it was built with Stage ${partner}, which does not exist`);
      else if (!builtWith.get(partner).has(number)) {
        problems.push(`Stage ${number} says it was built with Stage ${partner}, but Stage ${partner} does not say so back`);
      }
    }
  }
  return { problems, claimedBy };
}

const TEST_TITLE = /\b(?:it|test|describe)(?:\.\w+)?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
function stageTestProblems(stage, testFiles, base) {
  const problems = [];
  const addedText = (testFile) => {
    const directory = path.dirname(path.resolve(testFile));
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', path.resolve(testFile)], { cwd: directory });
    if (tracked.status !== 0) return readText(testFile);
    const diff = spawnSync('git', ['diff', '-U0', base, '--', path.resolve(testFile)], { cwd: directory, encoding: 'utf8' });
    if (diff.status !== 0) return readText(testFile);
    return diff.stdout.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).join('\n');
  };
  for (const testFile of testFiles) {
    const source = addedText(testFile);
    for (const match of source.matchAll(TEST_TITLE)) {
      for (const id of acIdsIn(match[2])) {
        if (!stage.covers.has(id)) {
          problems.push(
            `${testFile}: the test titled "${match[2].slice(0, 80)}" names AC-${id}, ` +
              `which Stage ${stage.number} does not cover`,
          );
        }
      }
    }
  }
  return problems;
}

const GENERAL_AC_ID = /\bAC-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g;
const FOUNDATION_AC_ID = /\bA\d+\b/g;
const GENERAL_REGISTER_ROW = /^\|\s*(~~)?\s*\**\s*`?(AC-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*|A\d+)`?\s*\**\s*(~~)?\s*\|/;

function acceptanceLinesOf(spoke) {
  const numbered = sectionOf(spoke, 8);
  if (numbered.some((line) => GENERAL_REGISTER_ROW.test(line))) return numbered;
  const lines = spoke.split('\n');
  const start = lines.findIndex((line) => /^#{2,4}\s+.*acceptance criteria/i.test(line));
  if (start === -1) return [];
  const level = lines[start].match(/^#+/)[0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => {
    const heading = line.match(/^(#+)\s/);
    return heading && heading[1].length <= level;
  });
  return end === -1 ? rest : rest.slice(0, end);
}

function generalRegisterOf(spoke) {
  const active = new Set();
  const retired = new Set();
  const rows = new Map();
  let scheme = null;
  for (const line of acceptanceLinesOf(spoke)) {
    const row = line.match(GENERAL_REGISTER_ROW);
    if (!row) continue;
    const id = row[2];
    scheme = scheme || (id.startsWith('AC-') ? 'AC' : 'A');
    (row[1] || row[3] ? retired : active).add(id);
    if (!rows.has(id)) rows.set(id, []);
    rows.get(id).push(line);
  }
  return { active, retired, rows, scheme };
}

function generalAcIdsIn(text, scheme) {
  if (scheme === 'A') return [...new Set([...String(text).matchAll(FOUNDATION_AC_ID)].map((match) => match[0]))];
  const ids = new Set([...String(text).matchAll(GENERAL_AC_ID)].map((match) => match[0]));
  for (const range of String(text).matchAll(AC_RANGE)) {
    for (let id = Number(range[1]) + 1; id < Number(range[2]); id++) ids.add(`AC-${id}`);
  }
  return [...ids];
}

function cellsOf(line) {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/);
  return cells.map((cell) => cell.trim());
}

function testTableOf(testPlan, testPlanPath) {
  const lines = testPlan.split('\n');
  const tables = [];
  for (let index = 0; index < lines.length; index++) {
    if (!/^\|/.test(lines[index]) || !/^\|\s*:?-{3}/.test(lines[index + 1] || '')) continue;
    let heading = '';
    for (let back = index - 1; back >= 0; back--) {
      if (/^#{1,6}\s/.test(lines[back])) { heading = lines[back]; break; }
    }
    const rows = [];
    let next = index + 2;
    for (; next < lines.length && /^\|/.test(lines[next]); next++) rows.push({ line: lines[next], number: next + 1, cells: cellsOf(lines[next]) });
    tables.push({ heading, header: cellsOf(lines[index]), rows });
    index = next - 1;
  }
  const isAcTable = (table) => table.header.some((cell) => /\bAC\b/i.test(cell)) && table.header.some((cell) => /test|proven|file/i.test(cell));
  const table = tables.find((candidate) => /AC\s*(?:→|->|to)\s*test/i.test(candidate.heading) && isAcTable(candidate)) ||
    tables.find((candidate) => /AC\s*(?:→|->|to)\s*test/i.test(candidate.heading)) ||
    tables.find(isAcTable);
  if (!table) inputError(`no AC → test table found in ${testPlanPath}`);
  return table;
}

const TEST_FILE_REFERENCE = /^[\w./@+-]+\.(ts|tsx|js|jsx|mjs|cjs|go|kt|kts|java|swift|dart|py|rb|php|cs|scala|rs|ex|exs|feature|robot)$/;
const TEST_NAME_REFERENCE = /^[A-Za-z_][A-Za-z0-9_]{7,}$/;
const SENTENCE_TEST_NAME = /^(?=.{8,}$)[^\s`]+(?:\s+[^\s`]+)+$/;
const COMMAND_LIKE = /^(?:npm|npx|yarn|pnpm|bun|deno|go|node|python3?|pytest|gradle|\.\/gradlew|gradlew|mvn|xcodebuild|swift|flutter|dart|make|bash|sh|cd|git|curl|docker|kubectl)\b|&&|\|\||\$\(|\s[|>]\s/;
const ID_LIKE = /^(?:AC-[\w-]+|TC\d+[a-z]?|[A-Z]{1,3}\d+[a-z]?)$/;

function referencesOf(cells, referenceColumns, sentenceNames) {
  const files = [];
  const names = [];
  const sentences = [];
  for (const column of referenceColumns) {
    for (const match of String(cells[column] || '').matchAll(/`([^`]+)`/g)) {
      const span = match[1].trim().replace(/:\d+(?:-\d+)?$/, '');
      if (TEST_FILE_REFERENCE.test(span)) files.push(span);
      else if (TEST_NAME_REFERENCE.test(span) && !ID_LIKE.test(span)) names.push(span);
      else if (sentenceNames && SENTENCE_TEST_NAME.test(span) && !COMMAND_LIKE.test(span)) sentences.push(span);
    }
  }
  if (files.length) names.push(...sentences);
  return { files: [...new Set(files)], names: [...new Set(names)] };
}

function recordedStatusOf(text) {
  const plain = String(text || '').replace(/~~[^~]*~~/g, '').replace(/[*`]/g, '');
  const passed = /✅|\bpass(?:ed|es|ing)?\b|\bgreen\b/i.test(plain);
  const failed = /❌|\bfail(?:ed|s|ing)?\b|\bred\b/i.test(plain);
  if (passed && failed) return 'mixed';
  if (passed) return 'pass';
  if (failed) return 'fail';
  return 'none';
}

function decodeXml(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function junitEntries(xml) {
  const entries = [];
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attributes = {};
    for (const attribute of match[1].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attributes[attribute[1]] = decodeXml(attribute[2]);
    const body = match[2] || '';
    const status = /<(failure|error)\b/.test(body) ? 'fail' : /<skipped\b/.test(body) ? 'skip' : 'pass';
    entries.push({ name: attributes.name || '', full: `${attributes.classname || ''} ${attributes.name || ''}`.trim(), file: attributes.file || '', classname: attributes.classname || '', status });
  }
  return entries;
}

function playwrightEntries(report) {
  const entries = [];
  const walk = (suite, titles, file) => {
    const suiteFile = suite.file || file || '';
    const suiteTitles = suite.title && suite.title !== suiteFile ? [...titles, suite.title] : titles;
    for (const spec of suite.specs || []) {
      const statuses = (spec.tests || []).map((test) => test.status);
      const status = spec.ok === false || statuses.includes('unexpected') ? 'fail'
        : statuses.length && statuses.every((value) => value === 'skipped') ? 'skip' : 'pass';
      entries.push({ name: spec.title || '', full: [...suiteTitles, spec.title].join(' › '), file: spec.file || suiteFile, classname: '', status });
    }
    for (const child of suite.suites || []) walk(child, suiteTitles, suiteFile);
  };
  for (const suite of report.suites || []) walk(suite, [], '');
  return entries;
}

function jestEntries(report) {
  const entries = [];
  for (const result of report.testResults || []) {
    for (const assertion of result.assertionResults || []) {
      const status = assertion.status === 'passed' ? 'pass' : assertion.status === 'failed' ? 'fail' : 'skip';
      entries.push({ name: assertion.title || '', full: assertion.fullName || assertion.title || '', file: result.name || result.testFilePath || '', classname: '', status });
    }
  }
  return entries;
}

function goTestEntries(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (!event.Test || !['pass', 'fail', 'skip'].includes(event.Action)) continue;
    entries.push({ name: event.Test, full: `${event.Package || ''} ${event.Test}`.trim(), file: '', classname: event.Package || '', status: event.Action });
  }
  return entries;
}

function reportEntriesOf(reportPath) {
  const text = readText(reportPath);
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) return junitEntries(trimmed);
  let parsed = null;
  try { parsed = JSON.parse(trimmed); } catch {}
  if (parsed && Array.isArray(parsed.suites)) return playwrightEntries(parsed);
  if (parsed && Array.isArray(parsed.testResults)) return jestEntries(parsed);
  const goEntries = goTestEntries(trimmed);
  if (goEntries.length) return goEntries;
  return inputError(`cannot read the runner report ${reportPath}: not JUnit XML, Playwright, Jest/Vitest or go test -json output`);
}

function reportEntryMatchesFile(entry, reference) {
  const base = path.posix.basename(reference);
  const stem = base.split('.')[0];
  const directory = path.posix.dirname(reference);
  if (entry.file) return entry.file.endsWith(reference) || path.basename(entry.file) === base;
  if (!entry.classname) return false;
  return entry.classname.split('.').pop() === stem || (directory !== '.' && entry.classname.endsWith(directory));
}

function repositoryFilesOf(repo) {
  const listing = spawnSync('git', ['-C', repo, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return listing.status === 0 ? listing.stdout.split('\0').filter(Boolean) : [];
}

function wholeWord(name) {
  return new RegExp(`(^|[^A-Za-z0-9_$])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9_$])`);
}

function sourceFilesHolding(repositoryRoot, name) {
  const found = spawnSync('git', ['-C', repositoryRoot, 'grep', '-l', '-w', '-F', '--untracked', '-e', name, '--', '.', ':(exclude)*.md', ':(exclude)docs/*'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return found.status === 0 ? found.stdout.split('\n').filter(Boolean) : [];
}

function repositoryRootOf(directory) {
  const top = spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return top.status === 0 ? top.stdout.trim() : null;
}

function siblingRepositoryFile(repositoryRoot, reference) {
  const [first] = reference.split('/');
  if (!first || first === '.' || first === '..') return null;
  const workspace = path.dirname(repositoryRoot);
  if (path.join(workspace, first) === repositoryRoot) return null;
  const candidate = path.join(workspace, reference);
  return fs.existsSync(path.join(workspace, first, '.git')) && fs.existsSync(candidate) ? candidate : null;
}

function testPlanCheck({ featureDirectory, platform, reports, repo }) {
  const spokePath = registerDocumentPath(featureDirectory, platform);
  const testPlanPath = path.join(featureDirectory, `test-plan-${platform}.md`);
  const { active, retired, scheme } = generalRegisterOf(readText(spokePath));
  if (!active.size && !retired.size) inputError(`no acceptance criteria found in ${spokePath}`);
  const table = testTableOf(readText(testPlanPath), testPlanPath);
  const featureRepositoryRoot = repositoryRootOf(featureDirectory);
  const repositoryRoot = repo ? path.resolve(repo) : featureRepositoryRoot || process.cwd();
  const repositoryFiles = repositoryFilesOf(repositoryRoot);
  const statusIndex = table.header.findIndex((cell) => /status/i.test(cell));
  const statusColumn = statusIndex >= 0 ? statusIndex : table.header.length - 1;
  const explicitReferenceColumns = table.header
    .map((cell, index) => (/\bfile|where|proven|location/i.test(cell) || (/^tests?\b/i.test(cell) && !/test\s*case/i.test(cell)) ? index : -1))
    .filter((index) => index >= 0);
  const referenceColumns = explicitReferenceColumns.length ? explicitReferenceColumns : table.header.map((cell, index) => index);
  const entries = reports.flatMap(reportEntriesOf);

  const contentCache = new Map();
  const contentOf = (filePath) => {
    if (!contentCache.has(filePath)) {
      let text = '';
      try { text = fs.readFileSync(filePath, 'utf8'); } catch {}
      contentCache.set(filePath, text);
    }
    return contentCache.get(filePath);
  };
  const resolveFile = (reference) => {
    if (reference.includes('/')) {
      for (const base of [repositoryRoot, featureRepositoryRoot, featureDirectory, process.cwd()].filter(Boolean)) {
        const candidate = path.resolve(base, reference);
        if (fs.existsSync(candidate)) return [candidate];
      }
      const suffix = repositoryFiles.filter((file) => file === reference || file.endsWith('/' + reference));
      if (suffix.length) return suffix.map((file) => path.join(repositoryRoot, file));
      const sibling = siblingRepositoryFile(repositoryRoot, reference);
      return sibling ? [sibling] : [];
    }
    return repositoryFiles.filter((file) => path.posix.basename(file) === reference).map((file) => path.join(repositoryRoot, file));
  };
  const stems = new Set(repositoryFiles.map((file) => path.posix.basename(file).split('.')[0]));
  const acColumn = table.header.findIndex((cell) => /\bAC\b/i.test(cell));
  const identifyingColumns = [...new Set([0, acColumn].filter((index) => index >= 0))];
  const referencedRows = table.rows.map((row) => ({ row, ...referencesOf(row.cells, referenceColumns, explicitReferenceColumns.length > 0) }));
  const resolvedByReference = new Map();
  for (const { files } of referencedRows) {
    for (const reference of files) if (!resolvedByReference.has(reference)) resolvedByReference.set(reference, resolveFile(reference));
  }
  const tableFiles = [...new Set([...resolvedByReference.values()].flat())];
  const holdsName = (filePaths, name) => filePaths.some((filePath) => wholeWord(name).test(contentOf(filePath)));

  const problems = [];
  const covered = new Set();
  let namesChecked = 0;
  let filesChecked = 0;
  let statusesChecked = 0;
  let statusesUnchecked = 0;
  let previousFiles = [];
  for (const { row, files, names } of referencedRows) {
    const label = (row.cells[0] || '').replace(/[*`~]/g, '').trim().slice(0, 40) || `line ${row.number}`;
    const identifyingCell = identifyingColumns.map((column) => row.cells[column] || '').find((cell) => generalAcIdsIn(cell, scheme).length);
    for (const id of identifyingCell ? generalAcIdsIn(identifyingCell, scheme) : []) {
      covered.add(id);
      if (!active.has(id) && !retired.has(id)) problems.push(`${label} (line ${row.number}) names ${id}, which is not in the AC register of ${path.basename(spokePath)}`);
    }
    const resolved = files.flatMap((reference) => resolvedByReference.get(reference));
    for (const reference of files) {
      filesChecked++;
      if (!resolvedByReference.get(reference).length) problems.push(`${label} (line ${row.number}) names \`${reference}\`, which no file in ${repositoryRoot} matches`);
    }
    const ownFiles = resolved.length ? resolved : previousFiles;
    if (resolved.length) previousFiles = resolved;
    for (const name of names) {
      namesChecked++;
      if (holdsName(ownFiles, name) || holdsName(tableFiles, name) || stems.has(name)) continue;
      if (sourceFilesHolding(repositoryRoot, name).length) continue;
      problems.push(`${label} (line ${row.number}) claims test \`${name}\`, which no file in ${repositoryRoot} outside the docs contains — renamed or removed?`);
    }
    if (!reports.length) continue;
    const recorded = recordedStatusOf(row.cells[statusColumn]);
    const lookable = names.length || (files.length && entries.some((entry) => entry.file || entry.classname));
    if (!lookable || recorded === 'mixed') { statusesUnchecked++; continue; }
    const matches = entries.filter((entry) => names.length
      ? names.some((name) => entry.name === name || entry.full.includes(name) || entry.name.includes(name))
      : files.some((reference) => reportEntryMatchesFile(entry, reference)));
    statusesChecked++;
    const ran = matches.filter((entry) => entry.status !== 'skip');
    const actual = !ran.length ? 'none' : ran.some((entry) => entry.status === 'fail') ? 'fail' : 'pass';
    const subject = names.length ? names.map((name) => `\`${name}\``).join(', ') : files.map((file) => `\`${file}\``).join(', ');
    if (recorded !== 'none' && actual === 'none') {
      problems.push(`${label} (line ${row.number}) records ${recorded}, but the runner report has no run of ${subject} — a status recorded without a run`);
    } else if (recorded !== 'none' && recorded !== actual) {
      problems.push(`${label} (line ${row.number}) records ${recorded}, but the runner report has ${subject} ${actual === 'fail' ? 'failing' : 'passing'}`);
    } else if (recorded === 'none' && actual !== 'none') {
      problems.push(`${label} (line ${row.number}) records no result, but the runner report ran ${subject}: ${actual}`);
    }
  }
  for (const id of active) {
    if (!covered.has(id)) problems.push(`${id} is in the AC register but in no row of the AC → test table`);
  }
  const statusNote = reports.length
    ? `${statusesChecked} status(es) checked against ${reports.map((report) => path.basename(report)).join(', ')}` +
      (statusesUnchecked ? `, ${statusesUnchecked} row(s) name no test to look up` : '')
    : 'statuses not checked (no --report)';
  const summary = `${active.size} acceptance criteria (${retired.size} retired) · ${table.rows.length} rows · ` +
    `${filesChecked} test file reference(s) · ${namesChecked} test name(s) · ${statusNote}`;
  return { problems, summary };
}

function parseArguments(argv) {
  const positional = [];
  const options = { stage: null, tests: [], table: false, base: 'HEAD', testPlan: false, reports: [], repo: null };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--stage') options.stage = Number(argv[++index]);
    else if (argument === '--table') options.table = true;
    else if (argument === '--base') options.base = argv[++index];
    else if (argument === '--test-plan') options.testPlan = true;
    else if (argument === '--repo') options.repo = argv[++index];
    else if (argument === '--tests' || argument === '--report') {
      const target = argument === '--tests' ? options.tests : options.reports;
      while (argv[index + 1] && !argv[index + 1].startsWith('--')) target.push(argv[++index]);
    } else positional.push(argument);
  }
  if (positional.length !== 2) inputError('expected a feature directory and a platform');
  return { featureDirectory: positional[0], platform: positional[1], ...options };
}

function finish(problems, summary) {
  if (problems.length) {
    process.stdout.write(`coverage: ${problems.length} problem(s) — ${summary}\n`);
    for (const problem of problems) process.stdout.write(`  - ${problem}\n`);
    process.exit(1);
  }
  process.stdout.write(`coverage: clean — ${summary}\n`);
  process.exit(0);
}

function main(argv) {
  try {
    const options = parseArguments(argv);
    if (options.testPlan) {
      const { problems, summary } = testPlanCheck({
        featureDirectory: options.featureDirectory,
        platform: options.platform,
        reports: options.reports,
        repo: options.repo,
      });
      return finish(problems, summary);
    }
    const feature = readFeature(options.featureDirectory, options.platform);
    const { problems, claimedBy } = planProblems(feature);
    if (options.stage !== null) {
      const stage = feature.stages.find((candidate) => candidate.number === options.stage);
      if (!stage) inputError(`no Stage ${options.stage} in ${feature.planPath}`);
      problems.push(...stageTestProblems(stage, options.tests, options.base));
    }
    if (options.table) {
      const lines = [...claimedBy.entries()]
        .sort(([a], [b]) => a - b)
        .map(([id, numbers]) => `AC-${id}\tStage ${numbers.join(', ')}`);
      process.stdout.write(lines.join('\n') + '\n\n');
    }
    const summary =
      `${feature.register.size} acceptance criteria (${feature.retired.size} retired) · ${feature.slices.size} work slices · ` +
      `${feature.stages.length} stages`;
    return finish(problems, summary);
  } catch (error) {
    if (!(error instanceof CoverageInputError)) throw error;
    process.stderr.write(error.message + '\n' + USAGE);
    process.exit(2);
  }
}

module.exports = {
  CoverageInputError,
  acIdsIn,
  sectionOf,
  registerDocumentPath,
  parseRegister,
  parseSlices,
  parsePlan,
  readFeature,
  bulletText,
  acceptanceLinesOf,
  generalRegisterOf,
  generalAcIdsIn,
  cellsOf,
  testPlanCheck,
};

if (require.main === module) main(process.argv.slice(2));
