# Re-gating named units (`--units`)

Read this file when the command carries `--units`, before *Resume* and before `next-step.js`: it
replaces the unit `next-step.js` would name. It binds in a terminal and on the platform alike;
under a grooming-run schema, `grooming-run-schema.md` still shapes every report.

## The command

`/alpha-sdlc:do-grooming <feature> [<platform>] [--trd <TRD-name.md>] --units <key>,<key>`

- The TRD is the one the rest of the command names: the hub's `TRD.md` with no platform, else the
  platform's row, as without `--units`.
- Each key is a grooming row's id, never its revision (`grooming-run-schema.md` → *Rows*): a
  section's id (`feature-flow`, `acceptance-criteria`), a screen's widget spec
  (`<screen>/widget-spec`) or one of its slicing sections (`<screen>/<section-id>`). Keys are
  separated by commas, with no spaces.
- A halt's `remedy` names its units in exactly this form (`run-halt.md`), so the platform starts the
  remedy with them as they are.

## Before the first gate

The session refuses, gating nothing, when:
- a key names no unit of that TRD; or
- the TRD's self-review is not stamped — the hub's `Hub review` row, or the spoke's
  `Hub alignment` row — because a re-gate changes approved work, and a TRD still being groomed is
  groomed without `--units`.

A refusal is said in plain text with the key or the missing stamp. On the platform it ends the
session on a halt (`run-halt.md`) whose sentence names it — `Grooming cannot re-gate
share-sheet/hdr: TRD-web.md has no such unit; start a run with the units this TRD has, then
Continue` — with `remedy` and `waitsOn` empty.

## The re-gates

- **Only the named units, each once, in the TRD's row order** — never the order typed. A unit not
  named is never proposed, edited or re-stamped in this run, even when the re-gate shows it is
  wrong: that is named in a note on the re-gated row, labelled `Also moves`, and recorded as an Open
  Decision in the TRD; it is re-gated by a run that names it.
- **Each unit is its next revision, under its own gate.** Read what it is drawn from now — the hub,
  the approved sections, the code, the change the halt or the member names — and propose it whole.
  On the platform the gate's *Current* pane holds the approved text (`grooming-run-schema.md` →
  *The gate*). A screen's widget spec and its slicing sections named together share that screen's
  one re-gate (`client-spoke.md` → *Section slicing per screen*).
- **Approve** writes the unit, re-stamps it `_Approved: <YYYY-MM-DD> · <commit>_` and commits it
  by explicit path. *Approve with edits* and *Regenerate* work as on any gate.
- **The ledger** keeps the run's place: `"units": { "keys": [ … ], "approved": { "<key>":
  <revision> } }` in `.alpha-sdlc/grooming-run/<feature>--<spoke name>.json`, written on each
  approval, in a terminal too. A session started with the same `--units` resumes at the first key
  not in `approved`; a session started with other units, or none, removes it.

## The close

Once every named unit is approved:
1. **Re-walk the review points the changed units feed**, as `grooming-review.md` → *The hub moving*
   maps them: a spoke after ✅ restamps `reviewed <date> · hub rev <commit> · amended <date>`; a
   spoke only self-reviewed rewrites its `self-reviewed` stamp; the hub appends `· amended <date>`
   to its `Hub review` row, and its spokes re-walk as *Add a platform* step 4 says. On the
   platform the re-walk is one round in `reviewRounds`. No reviewer runs.
2. **Push** as the TRD's run does without `--units` (`grooming-run-schema.md` → *Pushes*).
3. **The run ends.** On the platform its last report sends `trdComplete: true` with `sessionEnded:
   true`, since every other row was approved before it started. In a terminal, the Next paragraph
   names the phase that sent the TRD back — normally `do-planning <feature> <platform>`, to press
   Continue on the halted run.
