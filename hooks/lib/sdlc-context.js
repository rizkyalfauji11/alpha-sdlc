const fs = require('fs');
const os = require('os');
const path = require('path');

const PROFILE_MARKER = path.join('docs', 'basics');
const STATE_MARKER = '.alpha-sdlc';
const DOCS_DIRECTORY_NAME = 'docs';
const IGNORED_CHILDREN = new Set(['node_modules', 'vendor', 'build', 'dist', 'target']);
const DOC_PATH = /^(.*?)[\\/]docs[\\/](?:basics|development)[\\/]/;

function isDirectory(candidate) {
  try { return fs.statSync(candidate).isDirectory(); } catch { return false; }
}

function hasProfile(directory) {
  return isDirectory(path.join(directory, PROFILE_MARKER));
}

function isHomeOrFilesystemRoot(directory) {
  const resolved = path.resolve(directory);
  return resolved === path.resolve(os.homedir()) || path.dirname(resolved) === resolved;
}

function ancestorsOf(start) {
  const chain = [];
  let current = path.resolve(start);
  for (;;) {
    chain.push(current);
    const parent = path.dirname(current);
    if (parent === current) return chain;
    current = parent;
  }
}

function projectDocsDirectoryAbove(directory) {
  const chain = ancestorsOf(directory);
  for (let index = 1; index < chain.length; index++) {
    if (path.basename(chain[index - 1]) !== DOCS_DIRECTORY_NAME) continue;
    const owner = chain[index];
    if (isHomeOrFilesystemRoot(owner)) continue;
    if (hasProfile(owner) || isDirectory(path.join(owner, STATE_MARKER))) return chain[index - 1];
  }
  return null;
}

function outsideProjectDocs(directory) {
  let current = path.resolve(directory);
  for (let docs = projectDocsDirectoryAbove(current); docs; docs = projectDocsDirectoryAbove(current)) {
    current = path.dirname(docs);
  }
  return current;
}

function hasState(directory) {
  if (!isDirectory(path.join(directory, STATE_MARKER))) return false;
  return !isHomeOrFilesystemRoot(directory) && !projectDocsDirectoryAbove(directory);
}

function childProfileRoots(directory) {
  let entries;
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !IGNORED_CHILDREN.has(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .filter(hasProfile);
}

function isSdlcRoot(directory) {
  if (hasProfile(directory)) return true;
  return hasState(directory) && !childProfileRoots(directory).length;
}

function temporaryRoots() {
  const roots = new Set(['/tmp', '/private/tmp', '/var/folders', '/private/var/folders', path.resolve(os.tmpdir())]);
  try { roots.add(fs.realpathSync(os.tmpdir())); } catch {}
  return [...roots];
}

function isTemporaryPath(candidate) {
  const resolved = path.resolve(candidate);
  return temporaryRoots().some((root) => resolved === root || resolved.startsWith(root + path.sep));
}

function sdlcRootOf(target) {
  const resolved = path.resolve(target);
  const start = isDirectory(resolved) ? resolved : path.dirname(resolved);
  const marked = ancestorsOf(start).find(isSdlcRoot);
  if (marked) return marked;
  if (isTemporaryPath(resolved)) return null;
  const match = DOC_PATH.exec(resolved);
  return match ? match[1] || path.sep : null;
}

function profileRootsFor(cwd) {
  const start = path.resolve(cwd || process.cwd());
  const own = ancestorsOf(start).find(hasProfile);
  if (own) return [own];
  return childProfileRoots(start);
}

function isSdlcContext(cwd) {
  const start = path.resolve(cwd || process.cwd());
  return profileRootsFor(start).length > 0 || ancestorsOf(start).some(hasState);
}

function stateDirectoryFor(cwd) {
  return path.join(path.resolve(cwd || process.cwd()), STATE_MARKER);
}

function anchoredRootOf(cwd) {
  const start = outsideProjectDocs(cwd || process.cwd());
  const chain = ancestorsOf(start);
  return chain.find(hasState) || chain.find(hasProfile) || start;
}

function sessionRootFor(cwd) {
  const launched = process.env.CLAUDE_PROJECT_DIR;
  if (launched && path.isAbsolute(launched)) {
    const root = outsideProjectDocs(launched);
    if (isDirectory(root) && !isHomeOrFilesystemRoot(root) && isSdlcContext(root)) return root;
  }
  return anchoredRootOf(cwd);
}

function sessionStateDirectoryFor(cwd) {
  const root = sessionRootFor(cwd);
  return isHomeOrFilesystemRoot(root) ? null : path.join(root, STATE_MARKER);
}

function realPathOf(candidate) {
  try { return fs.realpathSync(candidate); } catch { return candidate; }
}

function stateDirectoriesFor(cwd) {
  const resolved = path.resolve(cwd || process.cwd());
  const roots = [resolved, sessionRootFor(resolved), anchoredRootOf(resolved)];
  if (!ancestorsOf(resolved).some(hasProfile)) roots.push(...childProfileRoots(resolved));
  const seen = new Set();
  const directories = [];
  for (const root of roots) {
    const key = realPathOf(root);
    if (seen.has(key)) continue;
    seen.add(key);
    directories.push(path.join(root, STATE_MARKER));
  }
  return directories;
}

module.exports = {
  ancestorsOf,
  isSdlcRoot,
  isTemporaryPath,
  sdlcRootOf,
  profileRootsFor,
  isSdlcContext,
  stateDirectoryFor,
  projectDocsDirectoryAbove,
  sessionStateDirectoryFor,
  stateDirectoriesFor,
};
