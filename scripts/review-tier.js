#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const USAGE =
  'usage: review-tier.js <repo> --base <rev> [--head <rev>] [--json]\n' +
  '  compares <base> with <head>, or with the working tree (untracked files included) when no --head\n' +
  '  script-only  no production line changes reachable behaviour — docs, tests, whitespace (git diff -w,\n' +
  '               except whitespace-sensitive files), version strings, pure renames — and none is deleted\n' +
  '  light        at most 150 production lines; no contract, schema/migration, auth/token/session/PII or\n' +
  '               UI path; no call, side-effect import, dependency or production file removed that no\n' +
  '               added line restores\n' +
  '  full         everything else, and whenever the measure is unsure\n' +
  '  production lines exclude tests, docs, generated files and lockfiles\n';

const LIGHT_LINE_LIMIT = 150;
const LISTED_PER_REASON = 5;
const GENERATED_MARKER_BYTES = 2048;
const UNTRACKED_READ_LIMIT = 4 * 1024 * 1024;

class TierInputError extends Error {}

const LOCKFILE_NAMES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock',
  'deno.lock', 'Podfile.lock', 'Package.resolved', 'Gemfile.lock', 'poetry.lock', 'Pipfile.lock',
  'uv.lock', 'composer.lock', 'Cargo.lock', 'go.sum', 'gradle.lockfile', 'pubspec.lock', 'mix.lock',
  'flake.lock', 'packages.lock.json',
]);

const MANIFEST_NAMES = new Set([
  'package.json', 'app.json', 'composer.json', 'bower.json', 'manifest.json', 'lerna.json', 'deno.json',
  'pubspec.yaml', 'Cargo.toml', 'pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile', 'build.gradle',
  'build.gradle.kts', 'gradle.properties', 'libs.versions.toml', 'Podfile', 'Gemfile', 'go.mod',
  'pom.xml', 'Package.swift', 'mix.exs', 'Chart.yaml', 'project.pbxproj', 'version.properties',
  'version.txt', 'VERSION',
]);
const MANIFEST_PATTERN = /\.podspec$|(^|\/)requirements[^/]*\.txt$/;

const STATE_PATH = /(^|\/)\.alpha-sdlc\//;
const CONTRACT_PATHS = [
  /(^|\/)[^/]*(openapi|swagger|asyncapi)[^/]*\.(ya?ml|json)$/i,
  /(^|\/)(openapi|swagger|asyncapi)\//i,
  /\.(proto|graphql|graphqls|gql|avsc|avdl|thrift|raml|wsdl)$/i,
  /(^|\/)contracts?\//i,
  /(^|\/)pacts?\/[^/]+\.json$/i,
  /(^|\/)api[-_]?specs?(\/|\.)/i,
];
const SCHEMA_PATHS = [
  /(^|\/)(migrations?|migrate|alembic|flyway|liquibase|changesets?)\//i,
  /\.sql$/i,
  /(^|\/)(schema\.prisma|schema\.rb|structure\.sql)$/i,
  /(^|\/)(prisma|drizzle)\//i,
  /(^|\/)db\/schema/i,
  /(^|\/)schemas\/[^/]+\/\d+\.json$/i,
  /(^|\/)(models|entities)\.py$/i,
  /(^|\/)(entity|entities)\//i,
  /[A-Za-z0-9](Entity|Database)\.(kt|java|swift|ts|cs|scala)$/,
  /\.xcdatamodeld?(\/|$)/i,
];
const DOCS_EXTENSION = /\.(md|markdown|rst|adoc|asciidoc)$/i;
const SHIPPED_CONTENT_DIRECTORY = /(^|\/)(src|app|lib|public|static|assets|resources|content|templates|pages|internal|cmd|pkg)\//;
const DOCS_NAME = /(^|\/)(README|CHANGELOG|CHANGES|HISTORY|LICEN[CS]E|NOTICE|AUTHORS|CONTRIBUTORS|CONTRIBUTING|CODEOWNERS|SECURITY|CODE_OF_CONDUCT)(\.(md|markdown|mdx|txt|rst|adoc|asciidoc))?$/i;
const DOCS_DIRECTORY = /(^|\/)docs?\//i;
const GITHUB_TEMPLATE_DIRECTORY = /(^|\/)\.github\/(ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE)[^/]*\//i;
const DOC_FILE = /\.(md|markdown|mdx|rst|adoc|asciidoc|txt|pdf|png|jpe?g|gif|svg|webp|drawio|puml|plantuml|mmd|excalidraw)$/i;
const TEST_DIRECTORY = /(^|\/)(__tests__|__mocks__|__snapshots__|__fixtures__|tests?|specs?|e2e|cypress|playwright|androidTest|testFixtures|integration_test|test_driver|testdata|[A-Za-z0-9_-]*Tests)\//;
const TEST_FILE = new RegExp([
  '\\.(test|spec|e2e|cy)\\.[^/]+$',
  '_test\\.(go|dart|py|exs|rs)$',
  '(^|/)test_[^/]+\\.py$',
  '_spec\\.rb$',
  '(Test|Tests|Spec|IT)\\.(kt|java|swift|scala|groovy|cs|m)$',
  '\\.mocks\\.dart$',
  '\\.snap$',
  '(^|/)conftest\\.py$',
  '(^|/)(jest|vitest|playwright|cypress|karma|wdio|detox)\\.config\\.[^/]+$',
  '(^|/)\\.mocharc[^/]*$',
  '(^|/)(setupTests|jest\\.setup)\\.[^/]+$',
].join('|'));
const GENERATED_PATH = new RegExp([
  '(^|/)(generated|__generated__)/',
  '\\.generated\\.',
  '\\.(g|freezed|gr)\\.dart$',
  '\\.pb\\.(go|swift|dart|cc|h)$',
  '_pb2(_grpc)?\\.pyi?$',
  '_grpc\\.pb\\.go$',
  '\\.pb\\.gw\\.go$',
  '_generated\\.go$',
  'zz_generated',
  '\\.min\\.(js|css)$',
  '\\.map$',
  '(^|/)R\\.java$',
  '(^|/)BuildConfig\\.(java|kt)$',
].join('|'));
const GENERATED_MARKER = /@generated\b|\bDO NOT EDIT\b|\bthis file (?:is|was) (?:automatically |auto-?)?generated\b/i;
const GENERATED_MARKER_LINES = 5;

const STYLE_OR_ASSET = /\.(css|scss|sass|less|styl|pcss|png|jpe?g|gif|svg|webp|avif|ico|bmp|ttf|otf|woff2?|eot|lottie|riv|xib|storyboard|strings)$|(^|\/)res\/(layout|drawable|values|menu|navigation|anim|animator|color|mipmap|font)[^/]*\/|\.xcassets\//i;
const UI_EXTENSION = /\.(css|scss|sass|less|styl|pcss|vue|svelte|astro|html?|hbs|handlebars|ejs|pug|jade|erb|twig|jinja2?|j2|njk|mustache|liquid|xib|storyboard|tsx|jsx|png|jpe?g|gif|svg|webp|avif|ico|bmp|ttf|otf|woff2?|eot|lottie|riv)$/i;
const UI_DIRECTORY = /(^|\/)(components?|screens?|pages?|views?|layouts?|styles?|themes?|ui|widgets?|compose|composables?|templates?|partials|assets|public|static|design[-_]?system)\//i;
const UI_RESOURCE = /(^|\/)res\/(layout|drawable|values|menu|navigation|anim|animator|color|mipmap|font|xml|raw)[^/]*\/|\.(xcassets|lproj)\//i;
const UI_FILE = new RegExp([
  '(Screen|View|ViewController|Activity|Fragment|Composable|Component|Page|Layout|Dialog|Sheet|Cell|Widget|Theme|Styles?|Colors?|Typography|Icons?)\\.(kt|java|swift|dart|ts|js|m|mm)$',
  '_(screen|page|view|widget|dialog|sheet|theme|style|colors?)\\.dart$',
  '(^|/)(tailwind|postcss)\\.config\\.[^/]+$',
  '(^|/)(Localizable\\.strings|strings\\.xml)$',
].join('|'));
const AUTH_WORDS = new Set([
  'auth', 'authn', 'authz', 'authentication', 'authorization', 'authorize', 'authorizer', 'oauth', 'oauth2',
  'oidc', 'saml', 'sso', 'jwt', 'jwks', 'login', 'logout', 'signin', 'signout', 'signup', 'session',
  'sessions', 'credential', 'credentials', 'password', 'passwords', 'passwd', 'passcode', 'otp', 'mfa',
  'totp', 'biometric', 'biometrics', 'keystore', 'keychain', 'secret', 'secrets', 'crypto', 'cipher',
  'encrypt', 'encryption', 'decrypt', 'decryption', 'permission', 'permissions', 'acl', 'rbac', 'guard',
  'guards', 'interceptor', 'interceptors', 'token', 'tokens', 'bearer', 'csrf', 'xsrf', 'cookie', 'cookies',
  'pii', 'gdpr', 'kyc', 'ktp', 'nik', 'npwp', 'ssn', 'passport', 'consent', 'privacy', 'personal',
  'identity', 'dob', 'birthdate', 'masking', 'redact', 'redaction', 'sensitive', 'compliance', 'aml',
]);
const DESIGN_TOKEN_CONTEXT = new Set(['design', 'theme', 'themes', 'style', 'styles', 'color', 'colors', 'spacing', 'typography', 'palette']);
const WHITESPACE_SENSITIVE = /\.(py|pyi|ya?ml|pug|jade|sass|haml|slim|coffee|nim|hs|fs|fsx|mk|feature)$|(^|\/)(Makefile|GNUmakefile|Snakefile|Dockerfile)$/i;
const HINT_SPAN = /`([^`\n]+)`/g;
const HINT_PATH = /^(?!https?:)[\w@.*-]+(?:\/[\w@.*-]+)+\/?$/;
const HINT_FILE = /^[\w.-]+\.(kt|kts|java|swift|ts|tsx|js|jsx|mjs|go|py|rb|dart|php|cs|scala|rs|m|mm)$/;

const VERSION_KEY = '(?:version|versionName|versionCode|VERSION_NAME|VERSION_CODE|MARKETING_VERSION|CURRENT_PROJECT_VERSION|appVersion|buildNumber)';
const VERSION_LINE = new RegExp(
  `^\\s*(?:[\\w]+\\.)?["']?${VERSION_KEY}["']?\\s*(?:[:=]|\\s)\\s*["']?v?\\d[\\w.+-]*["']?\\s*[,;]?\\s*$`,
);
const CALL = /([A-Za-z_$][\w$]*)\s*\(/g;
const NOT_A_CALL = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'fun', 'func', 'def', 'fn', 'class',
  'interface', 'struct', 'enum', 'new', 'typeof', 'sizeof', 'await', 'async', 'yield', 'case', 'when',
  'guard', 'match', 'elif', 'else', 'with', 'do', 'try', 'throw', 'throws', 'delete', 'void', 'super',
  'this', 'self', 'init', 'constructor', 'import', 'export', 'from', 'assert', 'print', 'println',
  'printf', 'map', 'filter', 'forEach', 'reduce', 'then', 'finally', 'push', 'pop', 'shift', 'unshift',
  'slice', 'splice', 'concat', 'join', 'split', 'trim', 'replace', 'includes', 'indexOf', 'find', 'some',
  'every', 'sort', 'keys', 'values', 'entries', 'get', 'set', 'has', 'add', 'toString', 'valueOf',
  'parse', 'stringify', 'log', 'debug', 'info', 'warn', 'error', 'format', 'apply', 'call', 'bind',
  'equals', 'hashCode', 'let', 'also', 'run', 'takeIf', 'isEmpty', 'isNotEmpty', 'size', 'length',
  'append', 'len', 'str', 'int', 'float', 'list', 'dict', 'range', 'Sprintf', 'Errorf', 'Println', 'Printf',
]);
const SIDE_EFFECT_IMPORT = /^\s*(?:import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)\s*;?\s*$)/;
const STRUCTURAL_LINE = /^\s*[{}\[\](),;]*\s*$|^\s*(?:\/\/|#|\/\*|\*|--|<!--)/;

function parseArguments(argv) {
  const options = { repo: null, base: null, head: null, json: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--base') options.base = argv[++index];
    else if (argument === '--head') options.head = argv[++index];
    else if (argument === '--json') options.json = true;
    else if (!options.repo && !argument.startsWith('--')) options.repo = argument;
    else throw new TierInputError(`unexpected argument ${argument}`);
  }
  if (!options.repo || !options.base) throw new TierInputError('expected a repository and --base <rev>');
  return options;
}

function git(repo, args, environment) {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', '-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    env: environment || process.env,
  });
  if (result.error || result.status !== 0) {
    throw new TierInputError(`git ${args.join(' ')} failed: ${String(result.stderr || result.error || '').trim()}`);
  }
  return result.stdout;
}

function resolveRevision(repo, revision) {
  return git(repo, ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`]).trim();
}

function wordsOf(filePath) {
  return filePath
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function readHead(absolutePath, limit) {
  try {
    const descriptor = fs.openSync(absolutePath, 'r');
    try {
      const buffer = Buffer.alloc(limit);
      const length = fs.readSync(descriptor, buffer, 0, limit, 0);
      return buffer.subarray(0, length);
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    return null;
  }
}

function authHintsOf(repo) {
  const hints = [];
  const trackedNames = new Set();
  let tracked = null;
  for (const doc of ['12-security-compliance.md', '13-auth.md']) {
    let text;
    try { text = fs.readFileSync(path.join(repo, 'docs', 'basics', doc), 'utf8'); } catch { continue; }
    for (const match of text.matchAll(HINT_SPAN)) {
      const span = match[1].trim().replace(/:\d+(?:-\d+)?$/, '');
      if (span.startsWith('docs/')) continue;
      if (HINT_PATH.test(span)) {
        const directory = span.replace(/\/$/, '');
        if (!span.includes('*') && !fs.existsSync(path.join(repo, directory))) continue;
        if (!span.includes('*') && span.endsWith('/') && directory.split('/').length < 2) continue;
        hints.push({ kind: span.includes('*') ? 'glob' : 'path', value: directory, source: doc });
      } else if (HINT_FILE.test(span)) {
        if (!tracked) {
          tracked = git(repo, ['ls-files', '-z']).split('\0').filter(Boolean);
          for (const file of tracked) trackedNames.add(path.posix.basename(file));
        }
        if (trackedNames.has(span)) hints.push({ kind: 'name', value: span, source: doc });
      }
    }
  }
  return hints;
}

function globPattern(glob) {
  let pattern = '';
  for (let index = 0; index < glob.length; index++) {
    const character = glob[index];
    if (character === '*' && glob[index + 1] === '*') {
      pattern += glob[index + 2] === '/' ? '(?:.*/)?' : '.*';
      index += glob[index + 2] === '/' ? 2 : 1;
    } else if (character === '*') pattern += '[^/]*';
    else if (character === '?') pattern += '[^/]';
    else pattern += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`);
}

function hintMatching(filePath, hints) {
  return hints.find((hint) => {
    if (hint.kind === 'name') return path.posix.basename(filePath) === hint.value;
    if (hint.kind === 'glob') return globPattern(hint.value).test(filePath);
    return filePath === hint.value || filePath.startsWith(hint.value + '/');
  });
}

function classOf(filePath) {
  if (STATE_PATH.test(filePath)) return 'state';
  if (LOCKFILE_NAMES.has(path.posix.basename(filePath))) return 'lockfile';
  if (CONTRACT_PATHS.some((pattern) => pattern.test(filePath))) return 'production';
  if (DOCS_EXTENSION.test(filePath) && (DOCS_DIRECTORY.test(filePath) || !SHIPPED_CONTENT_DIRECTORY.test(filePath))) return 'docs';
  if (TEST_DIRECTORY.test(filePath) || TEST_FILE.test(filePath)) return 'test';
  if (DOCS_NAME.test(filePath) || GITHUB_TEMPLATE_DIRECTORY.test(filePath)) return 'docs';
  if (DOCS_DIRECTORY.test(filePath) && DOC_FILE.test(filePath)) return 'docs';
  if (GENERATED_PATH.test(filePath)) return 'generated';
  return 'production';
}

function flagsOf(filePath, hints) {
  const flags = [];
  if (CONTRACT_PATHS.some((pattern) => pattern.test(filePath))) flags.push('contract');
  if (SCHEMA_PATHS.some((pattern) => pattern.test(filePath))) flags.push('schema');
  const words = wordsOf(filePath);
  const styled = STYLE_OR_ASSET.test(filePath) || words.some((word) => DESIGN_TOKEN_CONTEXT.has(word));
  const authWord = words.find((word) => AUTH_WORDS.has(word) && !(styled && (word === 'token' || word === 'tokens')));
  const hint = hintMatching(filePath, hints);
  if (authWord || hint) flags.push('auth');
  if (UI_EXTENSION.test(filePath) || UI_DIRECTORY.test(filePath) || UI_RESOURCE.test(filePath) || UI_FILE.test(filePath)) {
    flags.push('ui');
  }
  return { flags, authEvidence: hint ? `${hint.source} names ${hint.value}` : authWord ? `"${authWord}" in the path` : null };
}

function changedEntries(repo, range, pathspec) {
  const tokens = git(repo, ['diff', '--name-status', '-z', '-M', ...range, '--', ...pathspec]).split('\0');
  const entries = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (!status) continue;
    const letter = status[0];
    if (letter === 'R' || letter === 'C') {
      entries.push({ status: letter, similarity: Number(status.slice(1)) || 0, oldPath: tokens[index], path: tokens[index + 1] });
      index += 2;
    } else {
      entries.push({ status: letter, path: tokens[index] });
      index += 1;
    }
  }
  return entries;
}

function unquoted(rawPath) {
  if (!rawPath.startsWith('"')) return rawPath;
  return rawPath.slice(1, -1).replace(/\\(["\\])/g, '$1').replace(/\\t/g, '\t').replace(/\\n/g, '\n');
}

function pathsOfDiffLine(line) {
  const rest = line.slice('diff --git '.length);
  const half = (rest.length - 5) / 2;
  if (Number.isInteger(half) && rest.startsWith('a/') && rest.slice(2, 2 + half) === rest.slice(5 + half)) {
    const same = rest.slice(2, 2 + half);
    return { oldPath: same, newPath: same };
  }
  const split = rest.match(/^"?a\/(.+?)"? "?b\/(.+?)"?$/);
  return split ? { oldPath: split[1], newPath: split[2] } : {};
}

function parsePatch(patchText) {
  const blocks = [];
  let current = null;
  for (const line of patchText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = { ...pathsOfDiffLine(line), removed: [], added: [], binary: false, submodule: false, modeChange: false, inHunk: false };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    if (!current.inHunk) {
      if (line.startsWith('--- ')) { const value = unquoted(line.slice(4)); if (value !== '/dev/null') current.oldPath = value.replace(/^a\//, ''); }
      else if (line.startsWith('+++ ')) { const value = unquoted(line.slice(4)); if (value !== '/dev/null') current.newPath = value.replace(/^b\//, ''); }
      else if (line.startsWith('rename from ')) current.oldPath = unquoted(line.slice(12));
      else if (line.startsWith('rename to ')) current.newPath = unquoted(line.slice(10));
      else if (line.startsWith('old mode ')) current.modeChange = true;
      else if (line.startsWith('Binary files ') || line === 'GIT binary patch') current.binary = true;
      else if (line.startsWith('@@')) current.inHunk = true;
      continue;
    }
    if (line.startsWith('@@')) continue;
    if (line.startsWith('+')) current.added.push(line.slice(1));
    else if (line.startsWith('-')) current.removed.push(line.slice(1));
    if (/^[+-]Subproject commit /.test(line)) current.submodule = true;
  }
  const byPath = new Map();
  for (const block of blocks) {
    const key = block.newPath || block.oldPath;
    if (key) byPath.set(key, block);
    if (block.oldPath && !byPath.has(block.oldPath)) byPath.set(block.oldPath, block);
  }
  return byPath;
}

function untrackedEntries(repo, pathspec) {
  return git(repo, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspec])
    .split('\0')
    .filter(Boolean)
    .map((file) => {
      const content = readHead(path.join(repo, file), UNTRACKED_READ_LIMIT) || Buffer.alloc(0);
      const binary = content.subarray(0, 8000).includes(0);
      const lines = binary ? [] : content.toString('utf8').split('\n');
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      return { status: 'A', path: file, untracked: true, block: { added: lines, removed: [], binary, submodule: false, modeChange: false } };
    });
}

function generatedByMarker(repo, filePath, head) {
  let start = null;
  if (head) {
    const shown = spawnSync('git', ['-C', repo, 'show', `${head}:${filePath}`], { maxBuffer: 64 * 1024 * 1024 });
    if (shown.status === 0) start = shown.stdout.subarray(0, GENERATED_MARKER_BYTES);
  } else {
    start = readHead(path.join(repo, filePath), GENERATED_MARKER_BYTES);
  }
  if (!start) return false;
  return start.toString('utf8').split('\n').slice(0, GENERATED_MARKER_LINES).some((line) => GENERATED_MARKER.test(line));
}

function isManifest(filePath) {
  return MANIFEST_NAMES.has(path.posix.basename(filePath)) || MANIFEST_PATTERN.test(filePath);
}

function dependencyKeyOf(line) {
  const keyed = line.match(/^\s*["']?([\w.@/-]+)["']?\s*[=:]\s*/);
  const quoted = line.match(/["']([^"']+)["']/);
  const bare = line.match(/^\s*(?:require\s+)?([A-Za-z0-9_.@/-]+)/);
  const raw = keyed ? keyed[1] : quoted ? quoted[1] : bare ? bare[1] : null;
  if (!raw) return null;
  const coordinates = raw.split(':');
  if (coordinates.length >= 3) return coordinates.slice(0, 2).join(':');
  return raw.replace(/(==|>=|<=|~=|!=|\^|~|@\d).*$/, '').trim() || null;
}

function callNamesOf(line) {
  const names = [];
  for (const match of line.matchAll(CALL)) {
    const name = match[1];
    if (name.length > 2 && !NOT_A_CALL.has(name)) names.push(name);
  }
  return names;
}

function removalsOf(files) {
  const productionFiles = files.filter((file) => file.class === 'production' && file.behaviourChange);
  const addedCalls = new Set();
  const addedText = [];
  for (const file of files) {
    if (file.class !== 'production' && file.class !== 'generated') continue;
    for (const line of file.addedLines) {
      for (const name of callNamesOf(line)) addedCalls.add(name);
      addedText.push(line);
    }
  }
  const joinedAdded = addedText.join('\n');
  const removals = [];
  const seen = new Set();
  const record = (kind, name, filePath) => {
    const key = `${kind}:${name}:${filePath}`;
    if (seen.has(key)) return;
    seen.add(key);
    removals.push({ kind, name, path: filePath });
  };
  for (const file of productionFiles) {
    if (file.status === 'D') { record('file', file.path, file.path); continue; }
    const manifest = isManifest(file.path);
    const ownAdded = file.addedLines.join('\n');
    for (const line of file.removedLines) {
      if (STRUCTURAL_LINE.test(line) || VERSION_LINE.test(line)) continue;
      if (manifest) {
        const key = dependencyKeyOf(line);
        if (key && key.length > 1 && !ownAdded.includes(key)) record('dependency', key, file.path);
        continue;
      }
      const sideEffect = line.match(SIDE_EFFECT_IMPORT);
      if (sideEffect) {
        const module = sideEffect[1] || sideEffect[2];
        if (!joinedAdded.includes(module)) record('import', module, file.path);
        continue;
      }
      for (const name of callNamesOf(line)) {
        if (!addedCalls.has(name)) record('call', name, file.path);
      }
    }
  }
  return removals;
}

function listed(items) {
  const shown = items.slice(0, LISTED_PER_REASON).join(', ');
  return items.length > LISTED_PER_REASON ? `${shown} (+${items.length - LISTED_PER_REASON} more)` : shown;
}

function measureTier({ repo, base, head = null, pathspec = null }) {
  const root = git(path.resolve(repo), ['rev-parse', '--show-toplevel']).trim();
  const baseCommit = resolveRevision(root, base);
  const headCommit = head ? resolveRevision(root, head) : null;
  const range = headCommit ? [baseCommit, headCommit] : [baseCommit];
  const spec = pathspec && pathspec.length ? pathspec : ['.', ':(exclude).alpha-sdlc'];
  const hints = authHintsOf(root);

  const entries = changedEntries(root, range, spec);
  const sensitivePaths = entries.map((entry) => entry.path).filter((file) => WHITESPACE_SENSITIVE.test(file));
  const ignoringWhitespace = parsePatch(git(root, ['diff', '-U0', '-M', '-w', '--ignore-blank-lines', ...range, '--', ...spec]));
  const plain = parsePatch(git(root, ['diff', '-U0', '-M', ...range, '--', ...spec]));
  const all = headCommit ? entries : [...entries, ...untrackedEntries(root, spec)];

  const files = all.map((entry) => {
    const sensitive = sensitivePaths.includes(entry.path);
    const plainBlock = entry.block || plain.get(entry.path) || null;
    const block = entry.block || (sensitive ? plainBlock : ignoringWhitespace.get(entry.path)) || null;
    let fileClass = classOf(entry.path);
    if (fileClass === 'production' && entry.status !== 'D' && generatedByMarker(root, entry.path, headCommit)) fileClass = 'generated';
    const { flags, authEvidence } = flagsOf(entry.path, hints);
    const addedLines = block ? block.added : [];
    const removedLines = block ? block.removed : [];
    const binary = Boolean(plainBlock && plainBlock.binary);
    const submodule = Boolean(plainBlock && plainBlock.submodule);
    const modeChange = Boolean(plainBlock && plainBlock.modeChange);
    const pureRename = entry.status === 'R' && entry.similarity === 100 && !modeChange;
    const versionOnly = isManifest(entry.path) && addedLines.length + removedLines.length > 0 &&
      [...addedLines, ...removedLines].every((line) => VERSION_LINE.test(line));
    const contentChange = addedLines.length + removedLines.length > 0;
    const behaviourChange = binary || submodule || modeChange || ['A', 'C', 'D', 'T', 'U', 'X', '?'].includes(entry.status) ||
      (contentChange && !versionOnly);
    return {
      path: entry.path,
      oldPath: entry.oldPath || null,
      status: entry.untracked ? '?' : entry.status,
      class: fileClass,
      flags,
      authEvidence,
      added: addedLines.length,
      deleted: removedLines.length,
      binary,
      submodule,
      modeChange,
      pureRename,
      versionOnly,
      whitespaceOnly: !contentChange && !binary && !submodule && !modeChange && !pureRename && ['M', 'R'].includes(entry.status),
      styleOnly: STYLE_OR_ASSET.test(entry.path),
      behaviourChange,
      addedLines,
      removedLines,
    };
  }).filter((file) => file.class !== 'state');

  return decide({ files, baseCommit, headCommit, root });
}

function decide({ files, baseCommit, headCommit, root }) {
  const production = files.filter((file) => file.class === 'production');
  const reviewable = files.filter((file) => (file.class === 'production' || file.class === 'generated') && file.behaviourChange);
  const productionLines = production.reduce((sum, file) => sum + file.added + file.deleted, 0);
  const counts = (fileClass) => files.filter((file) => file.class === fileClass).length;
  const removals = removalsOf(files);
  const reasons = [];
  const result = (tier) => ({
    tier,
    reasons,
    repo: root,
    base: baseCommit,
    head: headCommit || 'working tree',
    productionLines,
    removals,
    files: files.map(({ addedLines, removedLines, ...file }) => file),
  });

  const behavioural = files.filter((file) => file.behaviourChange && (file.class === 'production' || file.class === 'generated' || file.class === 'lockfile'));
  if (!files.length) {
    reasons.push('nothing changed between the base and ' + (headCommit ? 'the head' : 'the working tree'));
    return result('script-only');
  }
  if (!behavioural.length) {
    const parts = [
      [counts('docs'), 'docs'],
      [counts('test'), 'test'],
      [production.filter((file) => file.whitespaceOnly).length, 'whitespace-only'],
      [production.filter((file) => file.versionOnly).length, 'version-string'],
      [production.filter((file) => file.pureRename && !file.added && !file.deleted).length, 'pure-rename'],
    ].filter(([count]) => count).map(([count, label]) => `${count} ${label}`);
    reasons.push(`no production line changes reachable behaviour: ${parts.join(' · ')} file(s)`);
    return result('script-only');
  }

  const flagged = (flag) => reviewable.filter((file) => file.flags.includes(flag));
  const full = [];
  if (productionLines > LIGHT_LINE_LIMIT) full.push(`${productionLines} production lines changed (light allows ${LIGHT_LINE_LIMIT})`);
  const contract = flagged('contract');
  if (contract.length) full.push(`contract path: ${listed(contract.map((file) => file.path))}`);
  const schema = flagged('schema');
  if (schema.length) full.push(`schema or migration path: ${listed(schema.map((file) => file.path))}`);
  const auth = flagged('auth');
  if (auth.length) full.push(`auth, token, session or PII path: ${listed(auth.map((file) => `${file.path} (${file.authEvidence})`))}`);
  const ui = flagged('ui');
  if (ui.length) full.push(`UI path: ${listed(ui.map((file) => file.path))}`);
  const removedLabel = { call: 'call or declaration', import: 'side-effect import', dependency: 'dependency or manifest entry', file: 'production file' };
  for (const kind of ['file', 'call', 'import', 'dependency']) {
    const ofKind = removals.filter((removal) => removal.kind === kind);
    if (!ofKind.length) continue;
    const names = ofKind.map((removal) => kind === 'file' ? removal.path : kind === 'call' ? `${removal.name}( in ${removal.path}` : `${removal.name} in ${removal.path}`);
    full.push(`removed ${removedLabel[kind]} that no added line restores — reachability unsure: ${listed(names)}`);
  }
  const binary = production.filter((file) => file.binary);
  if (binary.length) full.push(`binary production file, lines unmeasured: ${listed(binary.map((file) => file.path))}`);
  const submodule = files.filter((file) => file.submodule);
  if (submodule.length) full.push(`submodule moved: ${listed(submodule.map((file) => file.path))}`);
  if (full.length) {
    reasons.push(...full);
    return result('full');
  }

  const generated = files.filter((file) => file.class === 'generated' && file.behaviourChange).length;
  const lockfiles = files.filter((file) => file.class === 'lockfile').length;
  const extra = [generated && `${generated} generated`, lockfiles && `${lockfiles} lockfile`].filter(Boolean);
  reasons.push(`${productionLines} production lines changed (light allows ${LIGHT_LINE_LIMIT}) in ${production.filter((file) => file.behaviourChange).length} file(s)` +
    (extra.length ? `; ${extra.join(' and ')} file(s) not counted` : ''));
  reasons.push('no contract, schema or migration, auth/token/session/PII or UI path; nothing removed that no added line restores');
  return result('light');
}

function textReport(measure) {
  const lines = [`tier: ${measure.tier}`];
  for (const reason of measure.reasons) lines.push(`  - ${reason}`);
  lines.push(`base ${measure.base.slice(0, 12)} → ${measure.head === 'working tree' ? 'working tree' : measure.head.slice(0, 12)} · ${measure.productionLines} production line(s)`);
  for (const file of measure.files) {
    const flags = file.flags.length ? `  [${file.flags.join(', ')}]` : '';
    const size = file.binary ? 'binary' : `+${file.added} -${file.deleted}`;
    lines.push(`  ${file.class.padEnd(10)} ${file.status}  ${file.path}  ${size}${flags}`);
  }
  return lines.join('\n') + '\n';
}

function main(argv) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}`);
    process.exit(2);
  }
  let measure;
  try {
    measure = measureTier(options);
  } catch (error) {
    if (!(error instanceof TierInputError)) throw error;
    process.stderr.write(`review-tier: ${error.message}\n`);
    process.exit(2);
  }
  process.stdout.write(options.json ? JSON.stringify(measure, null, 2) + '\n' : textReport(measure));
}

module.exports = { measureTier, classOf, flagsOf, globPattern, TierInputError, LIGHT_LINE_LIMIT };

if (require.main === module) main(process.argv.slice(2));
