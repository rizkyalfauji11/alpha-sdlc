# A halt on the platform

Read this file in a grooming or planning run on the platform, as its run-schema guide says: when a
session is about to end on work outside the run, and at the start of a session whose run ledger
holds `halted`. A terminal session never reads it. Each run's guide names its own cases; this file
says what they share.

## When a session halts

A session halts when it ends with no gate and no question open because its next unit waits on work
this run cannot do: a re-gate or a review that must run in another skill or a terminal, a
prerequisite not built, a hub change the run may not make. A Continue with nothing changed would
only stop at the same place again. Its last report carries:
- **`halted`** — one plain sentence naming what must happen, where, and then Continue: `Planning
  waits for grooming: run /alpha-sdlc:do-grooming platform-development to re-gate TRD.md and
  TRD-backend.md, then Continue`. No Markdown, no line break; a command is written as it is typed.
  The detail stays in the row's note (`Stopped`, `Held back`, `Runs from a terminal`), which keeps
  its label; `halted` is what the platform shows the member;
- **`commitRead`** — the session's clone's `HEAD`, from `git rev-parse --short HEAD`;
- **`sessionEnded: true`**, no gate and no question.

`halted` is never sent:
- with a gate or a question open, or with `trdComplete` or `planComplete`;
- at a boundary or after an answer the run asks again on Continue — *Not now* to a push, *ask the
  team* — because Continue carries on from there;
- for a stop the member asked for: Stop here, Pause;
- when the consumer's schema does not declare it. The report is then the same without the field,
  and the ledger keeps the halt all the same.

## The ledger keeps it

Before the report is sent, the run ledger takes `"halted": { "report": <that report as a full
snapshot>, "waitsOn": [ { "clone": <its directory>, "commit": <its HEAD>, "paths": [ … ] } ],
"reach": <the --for value, or null> }`:
- `waitsOn` — every document or folder the sentence names, grouped by the clone that holds it, with
  that clone's `HEAD`: the report's `commitRead` for the session's own clone, `git -C <clone>
  rev-parse --short HEAD` for another. A prerequisite not built is waited on through
  `docs/basics/16-feature-map.md`;
- `reach` — `review` when `run-reach.js --for review` decided the halt (`grooming-run-review.md` →
  *The fallback*), else null.

## A session that starts on a halt

A session whose ledger holds `halted` checks it first, before *Resume*, before the plan or a TRD is
read:
1. For each `waitsOn` entry: `git diff --name-only <commit> -- <paths>` and `git status
   --porcelain -- <paths>`, with `-C <clone>` for a clone other than the session's own, the only
   form the platform allows. A printed path means a document changed.
2. With `reach`: `run-reach.js` again, with that `--for`. Exit 0 means the run reaches the work now.
3. Nothing changed and `run-reach.js`, when asked, still exits 1: the reason still holds. Send the
   ledger's report again as it is — whole, its `halted` and `commitRead` unchanged — as the
   session's first and last report. Nothing else is read or written.
4. Otherwise the halt is lifted. Remove `halted` from the ledger, then resume as `SKILL.md` says. A
   halt the files still give is a new one: its sentence, its `commitRead` and its `waitsOn` come
   from what this session read.

A platform line that arrives after the halt is answered in plain text, never with a report.
