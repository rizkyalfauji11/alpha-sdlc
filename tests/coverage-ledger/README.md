# Coverage ledger

`scripts/rule-coverage.js` proves that no rule was dropped. It extracts every normative clause of
the baseline corpus and looks for each one in the working tree. This directory signs off every
clause it cannot find intact: one JSON file per area, `tests/coverage-ledger/<area>.json`. The
checker reads every `.json` file here.

## Run it

```
node scripts/rule-coverage.js                                 # whole corpus against origin/main
node scripts/rule-coverage.js --files 'skills/do-fixing/**'   # only clauses from your files
node scripts/rule-coverage.js --show reworded,ledgered        # also list what passed by match
node scripts/rule-coverage.js --baseline <ref> --json         # another baseline, machine-readable
```

**Quote every glob.** An unquoted glob expands against the working tree, so a file you deleted no
longer matches and its clauses drop out of the check silently. Exit 0 means every clause is
intact or ledgered and every reference resolves; 1 means something needs work; 2 is a usage or
git error.

## What counts as a clause

- **Corpus.** Baseline: `principles.md`, `skills/**/*.md`, `agents/*.md`, `plain-language/*.md`,
  `hooks/*.md` and the prompt hooks of `hooks/hooks.json`, read from the baseline commit. Current:
  the same paths in the working tree plus hand-written `rules/*.md`. Generated bundles are skipped
  — they copy `principles.md`, so a stale bundle cannot hide a deleted rule.
- **Blocks.** Paragraphs, list items, headings, table cells and code lines are separate blocks; a
  clause never spans two of them. Front matter is ignored.
- **Clauses.** Each sentence, or each `;`-separated part, of at least 25 characters that carries
  must, never, always, only, required, unless, except, don't or do not, STOP, ⏸, ★, →, Approved,
  or opens with a bold lead of three or more words that is not a `Label:`.

## Verdicts

| Verdict | Meaning | Entry |
|---|---|---|
| exact | Found verbatim — case, emphasis and line wraps ignored. | no |
| reworded | A sentence (or two adjacent) shares ≥ 60% of content words and every hard token. | no |
| weakened | ≥ 60% shared, but a hard token is gone; the report names it. | yes |
| missing | Nothing comes close; the report shows the nearest sentence. | yes |
| relocated | A gate (STOP, ⏸, GATE) left its `SKILL.md`, so a compaction loses it. | yes |

**Hard tokens:** numbers, code spans, STOP, never, always, only, unless, except, ★, ⏸, ≥, ≤, and
the presence of a negation (not, no, never, without …). A reworded clause keeps all of them.

## The ledger file

```json
{
  "baseline": "origin/main",
  "entries": [
    {
      "clause": "new/changed design token or approved deviation → `18-design-tokens`",
      "file": "skills/do-fixing/SKILL.md",
      "verdict": "merged",
      "reason": "R10/DEV-13: the union change → doc map in principles.md carries this row",
      "where": "principles.md → *Keep the project profile current*"
    }
  ]
}
```

- **`baseline`** — the ref the entries were written against. It must resolve to the commit being
  checked; otherwise the file's entries are not applied and the report says so.
- **`clause`** — the clause as the report printed it, or a distinctive part of it. The part must be
  at least 40 characters, or the whole clause when it is shorter.
- **`file`** — the baseline path the clause came from, exactly as the report prints it.
- **`verdict`** — one of the six below.
- **`reason`** — the recommendation id that justifies the change, then why in one clause.
- **`where`** — the file, and the section or rule, where the meaning lives now. Only `removed` may
  omit it.

| Verdict | Use it when |
|---|---|
| reworded | The meaning is unchanged but the wording moved past the checker's tolerance. |
| merged | The clause was folded into another clause that now says both. |
| moved | The text lives elsewhere; for a relocated gate, `where` quotes its `SKILL.md` line. |
| duplicate | It restated a rule that lives, unchanged, at `where`. |
| changed | The rule itself changed on purpose; `reason` names the recommendation. |
| removed | The rule is gone on purpose; `reason` says why nothing replaces it. |

An entry covers a flagged clause when `file` is equal and the entry's normalised `clause` is
contained in the flagged one. Entries that cover nothing are listed as notes, never as failures.

## Reference checks

The same run fails when a reference does not resolve. With `--files`, it checks the references
in those files only — unless the list names `principles.md` or `rules/applicability.json`, which
can break any skill, so then it checks every skill.

- **Rule references.** Every `principles.md` → *Title* and `rules` → *Title* names a rule in
  `principles.md`, by its bold lead or any bold span inside it.
- **Skill references.** Every `` `do-x` `` → *Section* and `` `do-x` `` → Step N names a heading or
  a bold lead in one of that skill's files.
- **Plugin paths.** Every `../../…` and `../do-x/…` path in a skill file outside its templates
  exists.
- **Loaded rules.** Each skill loads every rule its files cite — directly, or through a file or
  `do-x` section they point to. A skill loads `principles.md` when its `SKILL.md` says to read it
  in full; otherwise it loads the bundles `rules/applicability.json` assigns it, plus any
  `rules/<bundle>.md` its files name, such as `rules/ui.md` for client platforms.
