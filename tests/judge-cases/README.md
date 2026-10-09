# Judge cases

Regression fixtures for the plain-language Stop judge (`hooks/stop-judge.js`, rules in
`hooks/stop-judge-rules.md`). Each file is one assistant message under a front-matter block:

- `expected` — `pass` or `fail`: the verdict the judge must reach.
- `rules` — the rules a failing verdict should cite; a run counts only when it cites one of them.
- `language` — the project's plain-language setting; `id` makes the hook append
  `plain-language/id.md` to the judge's system prompt.
- `context` — `sdlc` runs the case in a project with `docs/basics/`; `none` runs it outside one.
- `entrypoint` — optional; `sdk-cli` checks the headless rewrite instruction (default `cli`).
- `source` — the commit or guide example the case reproduces.

**Message bodies stay byte for byte as they were judged**, so their lines are not wrapped. The
commit cases were recovered from the eval runs behind those commits; in two engineer-details lines a
repository name was generalised — the hook never sends that section to the judge. Rule 10 (added in
9f2ab2f) makes every summary close with Next / Selanjutnya, so two cases that passed before it now
fail on rule 10 alone, and the fixed planning summary carries the closing paragraph its rewrite
added.

Run them live with `node tests/judge-eval.js` — opt-in, never part of `tests/hooks.test.js`, and
each run is one judge call on your plan. `--runs 3` is the release gate, `--case <name>` runs one
case, `--list` prints the index below, `--model` and `--effort` try another judge setting.
**Try only models that take `--effort`:** `claude-haiku-4-5` ignores it and thinks on a fixed budget
(3.7k thinking tokens and 36 s on one passing case), so failing cases hit the 60 s timeout and fail
open; the current Haiku is `claude-haiku-5-5`.

| Case | Expect | Rules | Reproduces |
|---|---|---|---|
| `c6defc0-bad-hub-quote` | fail | 3 4 6 8 10 | c6defc0 bad output 1 (no markers) · *Sebelum* 1 |
| `c6defc0-bad-runstore` | fail | 2 3 5 6 8 10 | c6defc0 bad output 2 · holds id.md *Sebelum* 2 |
| `c6defc0-chat` | pass | — | c6defc0 plain chat · rule 0 |
| `9f2ab2f-good-without-next` | fail | 10 | c6defc0 good rewrite (id.md *Sesudah* 2 in full) |
| `9f2ab2f-good-with-next` | pass | — | 9f2ab2f good rewrite with Selanjutnya |
| `9190677-long-no-decision` | fail | 6 9 10 | 9190677 long · *mata segar*, *potongan kerja* |
| `9190677-short-no-decision` | fail | 10 | 9190677 short report · passed before rule 10 |
| `9f2ab2f-short-no-decision-with-next` | pass | — | d0b331c *spoke* header · 9190677 *dan* |
| `d0b331c-planning-bad` | fail | 6 7 10 | d0b331c bad plan · *syarat kelulusan*, *sopan santun* |
| `d0b331c-planning-fixed` | pass | — | d0b331c fixed planning · *kriteria penerimaan (…)* |
| `id-after-hub` | pass | — | id.md *Sesudah* 1 as a full summary |
| `en-good-with-next` | pass | — | added · English, the guide stays out |
| `en-bad-code-names` | fail | 3 7 10 | added · English code names and jargon |
