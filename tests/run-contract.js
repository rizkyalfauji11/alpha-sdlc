#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..');
const RUNS = [
  { run: 'planning', fixtures: 'planning-run', schema: 'src/features/planning-platform/planningRunSchema.generated.ts' },
  { run: 'grooming', fixtures: 'grooming-run', schema: 'src/features/platform-grooming/groomingRunSchema.generated.ts' },
];

const web = process.argv[2] || process.env.ADP_WEB;
if (!web) {
  process.stderr.write('usage: node tests/run-contract.js <adp-web clone>  (or ADP_WEB=<clone>)\n');
  process.exit(2);
}

function readSchema(file) {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text.replace(/^export const \w+ = /, '').replace(/ as const\s*$/, ''));
}

const typeOf = (value) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const matchesType = (value, type) => type === 'integer' ? Number.isInteger(value) : typeOf(value) === type;

function validate(root, node, value, at, problems) {
  if (node.$ref) {
    const name = node.$ref.replace('#/$defs/', '');
    if (!root.$defs || !root.$defs[name]) problems.push(`${at}: $ref ${node.$ref} names no definition`);
    else validate(root, root.$defs[name], value, at, problems);
  }
  if (node.type !== undefined) {
    const types = [].concat(node.type);
    if (!types.some((type) => matchesType(value, type))) {
      problems.push(`${at}: is ${typeOf(value)}, the contract allows ${types.join(' | ')}`);
      return;
    }
  }
  if (node.enum && !node.enum.some((each) => JSON.stringify(each) === JSON.stringify(value))) problems.push(`${at}: ${JSON.stringify(value)} is none of ${JSON.stringify(node.enum)}`);
  if ('const' in node && JSON.stringify(node.const) !== JSON.stringify(value)) problems.push(`${at}: is not ${JSON.stringify(node.const)}`);
  if (typeof value === 'string') {
    if (node.minLength !== undefined && value.length < node.minLength) problems.push(`${at}: shorter than ${node.minLength}`);
    if (node.maxLength !== undefined && value.length > node.maxLength) problems.push(`${at}: longer than ${node.maxLength}`);
    if (node.pattern && !new RegExp(node.pattern, 'u').test(value)) problems.push(`${at}: does not match ${node.pattern}`);
  }
  if (typeof value === 'number' && node.minimum !== undefined && value < node.minimum) problems.push(`${at}: below ${node.minimum}`);
  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) problems.push(`${at}: fewer than ${node.minItems} items`);
    if (node.items) value.forEach((item, index) => validate(root, node.items, item, `${at}[${index}]`, problems));
  }
  if (typeOf(value) === 'object') {
    for (const name of node.required || []) if (!(name in value)) problems.push(`${at}: lacks required ${name}`);
    for (const [name, child] of Object.entries(node.properties || {})) {
      if (name in value) validate(root, child, value[name], `${at}.${name}`, problems);
    }
    if (node.additionalProperties !== undefined && node.additionalProperties !== true) {
      for (const name of Object.keys(value).filter((each) => !(node.properties || {})[each])) {
        if (node.additionalProperties === false) problems.push(`${at}: ${name} is not allowed`);
        else validate(root, node.additionalProperties, value[name], `${at}.${name}`, problems);
      }
    }
  }
  if (node.oneOf) {
    const passing = node.oneOf.filter((each) => { const found = []; validate(root, each, value, at, found); return found.length === 0; });
    if (passing.length !== 1) problems.push(`${at}: matches ${passing.length} of oneOf's ${node.oneOf.length} shapes, not exactly one`);
  }
}

function problemsOf(schema, report) {
  const problems = [];
  validate(schema, schema, report, 'report', problems);
  for (const name of Object.keys(report)) {
    if (!schema.properties[name]) problems.push(`report.${name}: the contract does not declare it`);
  }
  return problems;
}

function haltedFixtures(directory) {
  const found = [];
  for (const story of fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    for (const name of fs.readdirSync(path.join(directory, story.name)).filter((each) => each.endsWith('.json')).sort()) {
      const report = JSON.parse(fs.readFileSync(path.join(directory, story.name, name), 'utf8'));
      if ('halted' in report) found.push({ name: `${story.name}/${name}`, report });
    }
  }
  return found;
}

const head = spawnSync('git', ['-C', web, 'log', '-1', '--format=%h %cs %s'], { encoding: 'utf8' });
const branch = spawnSync('git', ['-C', web, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
process.stdout.write(`contract: ${web} · ${(branch.stdout || '?').trim()} · ${(head.stdout || 'not a git clone').trim()}\n`);

let failed = 0;
for (const { run, fixtures, schema: relative } of RUNS) {
  let schema;
  try {
    schema = readSchema(path.join(web, relative));
  } catch (error) {
    process.stderr.write(`cannot read the ${run}-run schema at ${path.join(web, relative)}: ${error.message}\n`);
    process.exit(2);
  }
  const declared = schema.properties.halted;
  process.stdout.write(`\n${run} run · ${relative}\n`);
  process.stdout.write(`  halted: ${declared ? `declared, ${JSON.stringify(declared.type)}` : 'NOT declared'}\n`);
  if (declared && ![].concat(declared.type).includes('string')) {
    process.stdout.write('  halted is declared, but not as a string\n');
    failed++;
  }
  const samples = haltedFixtures(path.join(pluginRoot, 'tests', 'fixtures', fixtures));
  if (!samples.length) {
    process.stdout.write(`  FAIL no ${fixtures} fixture sends halted\n`);
    failed++;
  }
  for (const { name, report } of samples) {
    const { pluginVersion: _version, ...unnamed } = report;
    if (!problemsOf(schema, unnamed).some((problem) => problem.includes('lacks required pluginVersion'))) {
      process.stderr.write(`the validator passed ${name} without its pluginVersion: it checks nothing\n`);
      process.exit(2);
    }
    const problems = problemsOf(schema, report);
    process.stdout.write(`  ${problems.length ? 'FAIL' : 'ok  '} ${fixtures}/${name}\n`);
    for (const problem of problems) process.stdout.write(`       ${problem}\n`);
    if (problems.length) failed++;
  }
}

process.stdout.write(failed ? `\n${failed} problem(s): the contract the web passes does not take these reports as they are\n` : '\nevery halted fixture conforms to the contract\n');
process.exit(failed ? 1 : 0);
