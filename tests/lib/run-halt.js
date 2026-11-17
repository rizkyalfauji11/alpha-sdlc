const REPOSITORY = /^[a-z]+:[^\s:]+$/;
const COMMIT = /^[0-9a-f]{7,40}$/;
const TRD_FILE = /^TRD(?:-[A-Za-z0-9-]+)?\.md$/;
const ROW_ID = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*|[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)$/;

const isString = (value) => typeof value === 'string';
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value) => isString(value) && value.trim().length > 0;
const onlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key));

function haltSentence(halted) {
  if (isString(halted)) return halted;
  if (isObject(halted) && isString(halted.sentence)) return halted.sentence;
  return null;
}

function haltShapeProblems(halted) {
  if (isString(halted)) return nonEmpty(halted) ? [] : ['halted is a non-empty string'];
  if (!isObject(halted)) return ['halted is a sentence or {sentence, waitsOn, remedy}'];
  const problems = [];
  const need = (ok, what) => { if (!ok) problems.push(what); };
  need(onlyKeys(halted, ['sentence', 'waitsOn', 'remedy']), 'halted carries only sentence, waitsOn and remedy');
  need(nonEmpty(halted.sentence), "halted's sentence is a non-empty string");
  need(Array.isArray(halted.waitsOn) && halted.waitsOn.every((each) => isObject(each) && onlyKeys(each, ['repository', 'commit', 'paths']) &&
    REPOSITORY.test(each.repository || '') && COMMIT.test(each.commit || '') && Array.isArray(each.paths) && each.paths.length > 0 && each.paths.every(nonEmpty)),
  "halted's waitsOn items are {repository <provider>:<path>, commit, paths[]}");
  need(Array.isArray(halted.remedy) && halted.remedy.every((each) => isObject(each) && onlyKeys(each, ['repository', 'document', 'units']) &&
    REPOSITORY.test(each.repository || '') && TRD_FILE.test(each.document || '') && Array.isArray(each.units) &&
    each.units.every((unit) => ROW_ID.test(unit)) && new Set(each.units).size === each.units.length),
  "halted's remedy items are {repository, document TRD.md | TRD-<name>.md, units[] of row ids without a revision, empty for the document's own grooming}");
  const first = Array.isArray(halted.remedy) && halted.remedy[0];
  if (first && Array.isArray(first.units) && first.units.length > 0 && nonEmpty(halted.sentence)) {
    need(halted.sentence.includes(`--units ${first.units.join(',')}`) && halted.sentence.includes(first.document),
      "a halt with a remedy types its first run in the sentence, --units and document included");
  }
  if (first && Array.isArray(first.units) && first.units.length === 0 && nonEmpty(halted.sentence)) {
    need(!halted.sentence.includes('--units') && halted.sentence.includes(first.document),
      "a remedy with no units types its document's own grooming command in the sentence, with no --units");
  }
  return problems;
}

module.exports = { haltSentence, haltShapeProblems };
