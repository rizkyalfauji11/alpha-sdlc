#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const USAGE =
  'usage: check-run-commands.js <repo> [--json]\n' +
  '       check-run-commands.js --entry <command> [--json]\n' +
  '  <repo>   reads <repo>/docs/basics/.alpha-sdlc.json: developmentCommands is required, autoRunCommands\n' +
  '           optional; each list is an array of commands with its date in <key>DecidedAt (or decidedOn.<key>)\n' +
  '  --entry  checks one command before it is offered\n' +
  '  exit 0: every command names its subcommand or target · 1: a command, a list or a date is refused\n' +
  '  (each refusal printed) · 2: the mirror cannot be read\n';

const LISTS = [
  { key: 'developmentCommands', required: true },
  { key: 'autoRunCommands', required: false },
];
const SHELL_OPERATORS = /[;&|<>`$(){}\n\r\\]/;
const EVAL_FLAGS = new Set(['-c', '-e', '--eval', '-p', '--print', '-r', '--command']);
const RUNNER_VERBS = {
  npm: ['run', 'run-script', 'exec', 'x'],
  pnpm: ['run', 'exec', 'dlx'],
  yarn: ['run', 'exec', 'dlx'],
  bun: ['run', 'x'],
  npx: [],
  bunx: [],
  uv: ['run'],
  poetry: ['run'],
  pipenv: ['run'],
  bundle: ['exec'],
  cargo: ['run'],
  dotnet: ['run'],
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function stopWithUsage(message) {
  process.stderr.write(message + '\n' + USAGE);
  process.exit(2);
}

function refusalOf(command) {
  if (typeof command !== 'string') return 'not a string';
  if (command !== command.trim() || !command.trim()) return 'empty, or padded with spaces';
  if (SHELL_OPERATORS.test(command)) return 'holds a shell operator; a command is one program and its arguments';
  const words = command.split(/\s+/);
  const [tool, ...rest] = words;
  if (!rest.length) return `a bare interpreter or build tool; name its subcommand or target, e.g. "${tool} test"`;
  if (rest.every((word) => word.startsWith('-'))) return 'names only flags; name its subcommand or target';
  if (EVAL_FLAGS.has(rest[0])) return `runs whatever follows ${rest[0]}; name a script or a target instead`;
  if (tool in RUNNER_VERBS) {
    const verbs = RUNNER_VERBS[tool];
    const needsTarget = verbs.length === 0 ? rest.length < 1 : verbs.includes(rest[0]) && rest.length < 2;
    if (needsTarget) return `runs anything after "${[tool, ...rest].join(' ')}"; name the script or target`;
  }
  return null;
}

function decidedAt(mirror, key) {
  if (typeof mirror[`${key}DecidedAt`] === 'string') return mirror[`${key}DecidedAt`];
  const map = mirror.decidedOn;
  return map && typeof map === 'object' && typeof map[key] === 'string' ? map[key] : null;
}

function checkMirror(mirror) {
  const lines = [];
  let refused = false;
  for (const { key, required } of LISTS) {
    const list = mirror[key];
    if (list === undefined) {
      if (required) {
        refused = true;
        lines.push(`refused: ${key} — not recorded; a do-project-setup refresh records it with the member`);
      } else {
        lines.push(`none: ${key} — not recorded; auto-run runs on developmentCommands alone`);
      }
      continue;
    }
    if (!Array.isArray(list) || !list.length) {
      refused = true;
      lines.push(`refused: ${key} — not a list of commands`);
      continue;
    }
    const date = decidedAt(mirror, key);
    if (!date || !ISO_DATE.test(date)) {
      refused = true;
      lines.push(`refused: ${key} — no ${key}DecidedAt date; the list is decided with the member, and the date says when`);
    }
    const seen = new Set();
    list.forEach((command, index) => {
      const why = refusalOf(command) || (seen.has(command) ? 'listed twice' : null);
      if (typeof command === 'string') seen.add(command);
      if (why) {
        refused = true;
        lines.push(`refused: ${key}[${index}] ${JSON.stringify(command)} — ${why}`);
      }
    });
    if (date && ISO_DATE.test(date) && list.every((command, index) => !refusalOf(command) && list.indexOf(command) === index)) {
      lines.push(`ok: ${key} — ${list.length} command(s) · decided ${date}`);
    }
  }
  return { refused, lines };
}

function main(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((arg) => arg !== '--json');
  let outcome;
  if (args[0] === '--entry') {
    if (args.length !== 2) stopWithUsage('--entry takes one command, quoted');
    const why = refusalOf(args[1]);
    outcome = { refused: Boolean(why), lines: [why ? `refused: ${JSON.stringify(args[1])} — ${why}` : `ok: ${JSON.stringify(args[1])}`] };
  } else {
    if (args.length !== 1) stopWithUsage('one repository, please');
    const file = path.join(args[0], 'docs', 'basics', '.alpha-sdlc.json');
    let mirror;
    try {
      mirror = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      process.stdout.write(json ? JSON.stringify({ readable: false, reason: error.message }) + '\n' : `unreadable — ${file}: ${error.message}\n`);
      process.exit(2);
    }
    if (!mirror || typeof mirror !== 'object' || Array.isArray(mirror)) {
      process.stdout.write(json ? JSON.stringify({ readable: false, reason: 'not an object' }) + '\n' : `unreadable — ${file}: not an object\n`);
      process.exit(2);
    }
    outcome = checkMirror(mirror);
  }
  process.stdout.write(json ? JSON.stringify({ readable: true, ...outcome }) + '\n' : outcome.lines.join('\n') + '\n');
  process.exit(outcome.refused ? 1 : 0);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { refusalOf, checkMirror };
