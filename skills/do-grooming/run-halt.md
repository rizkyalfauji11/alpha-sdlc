# A halt on the platform

Read this file in every platform run, as its run-schema guide says: when a session is about to end
on work outside the run, and when one starts with `halted` in its run ledger. A terminal session
never reads it. Each guide names its own cases; this file says what they share.

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

**`halted` is an object** when the consumer's schema declares one (`RunHalt`, alone or in a
`oneOf` beside a string); otherwise it is the sentence alone. The object is `{ "sentence": <the
sentence>, "waitsOn": [ … ], "remedy": [ … ] }`:
- `waitsOn` — the ledger's `waitsOn` (below), each `clone` named by `repository`: the
  `Repository` cell (`<provider>:<path>`) of the feature README's `## Platforms` row whose clone
  holds it — `{ "repository", "commit", "paths" }`;
- `remedy` — the grooming runs that lift the halt, in the order they must run: a change to the
  hub's `TRD.md` before a platform TRD's re-gate. Each is `{ "repository", "document": "TRD.md" |
  "TRD-<name>.md", "units": [ <row id>, … ] }`, the units as `units.md` → *The command* writes
  them, never a revision. Empty when no grooming run lifts it: a prerequisite not built, a plugin
  release, a review or command that runs from a terminal, a refusal of the command itself.

With a remedy, the sentence names its first run as typed, units included: `Planning waits for
grooming: run /alpha-sdlc:do-grooming platform-development web --units
share-sheet/widget-spec,share-sheet/hdr to re-gate TRD-web.md, then Continue`. A remedy is named
only when its units are known — the rows the refusal or the answer names; otherwise it is empty and
the sentence names the documents. A development, testing or fixing run sends it (its *A halt*).

**`commands`** is a fourth key, sent only by a development, testing or fixing run whose `RunHalt`
declares it, for every halt a command on this machine lifts: the commands the next stage needs that
the platform does not allow, and the commands that supply what the machine lacks — a runtime
version, a driver, a service that is down or runs the wrong code, a database to migrate or seed —
each as the session would run it, naming its subcommand or target or another clone's script
(`../<repo>/<script> <subcommand>`), passing `scripts/check-run-commands.js --entry`. The member is
never handed a chore a command does, even one this session's tools refuse: that refusal is what
`commands` lifts. The remedy is then empty, and the sentence names each command and what it does:
`Development waits for its commands: approve docker exec on the platform, or run
/alpha-sdlc:do-project-setup refresh to record it, then Continue`, `Development waits for this
machine: approve make -C ../<repo> dev-seed to seed the test accounts, then Continue`. The next
session runs the approved fix commands first, before the halted stage. Approved for this run on the
platform, they are allowed in the session Continue starts; one still refused halts again with the
same object. Without `commands` in the schema the object goes without it and the sentence alone
names them.

**A platform TRD behind its hub.** When what lifts the halt is a platform TRD's re-walk because its
`Hub alignment` stamp is older than the hub's last change, its own grooming command with no
`--units` lifts it: that run re-walks the points the moved hub sections feed and restamps the TRD,
re-gating no row (`grooming-review.md` → *The hub moving*). Its remedy is `{ "repository",
"document": "TRD-<name>.md", "units": [] }`, after any hub remedy, and the sentence names that
command as typed: `Planning waits for grooming: run /alpha-sdlc:do-grooming platform-development
backend to re-gate TRD-backend.md against hub rev 4c9369b, then Continue`. An empty `units` is sent
only when the consumer's schema lets it be empty — its `units` declares no `minItems`, or 0; under
`minItems: 1` that remedy is left out and the sentence alone names the command.

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
