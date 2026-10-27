# The grooming review and the spokes' re-walk in the hub's run

Read this file in a run on the platform on the hub's `TRD.md` (`grooming-run-schema.md`) when
`next-step.js` names the grooming review, its close or a spoke's first review, and when an *Add a
platform* run reaches its step 4. A terminal session never reads it: there `SKILL.md` and
`grooming-review.md` apply as written. A platform TRD's run never does this work: it has no
subagents, edits only its own clone and the hub's feature folder, and lasts 30 minutes.

## Contents

- **Whether this run reaches every spoke** — `run-reach.js`, before anything is written
- **The fallback** — the work goes to a terminal, as before 0.44.0
- **The review's row**
- **The review in the run** — packet, reviewers, the `review ran` stamp, fixes
- **The verdict gate** — its questions and its decisions
- **The close** — stamps and commits per clone, the push
- **The spokes' re-walk in Add a platform**
- **Time**

## Whether this run reaches every spoke

Before the packet, before `review ran`, before any spoke is opened for the re-walk, run
`node <plugin root>/scripts/run-reach.js <hub feature folder> --for review` — for the re-walk,
`--for rewalk`. It reads the command line of the `claude` process running it, never an assumption:
the run's `--add-dir` directories, its `--disallowedTools` and `--settings` (the platform's
`featureFolders`, opened per clone by the bridge's edit guard) and its `--allowedTools`.
- **exit 0, `reach: this run`** — every row of the README's `## Platforms` has its clone in the
  run's directories, its feature folder is one the run may edit, and, for the review, the run may
  launch `alpha-sdlc:sdlc-reviewer`, `alpha-sdlc:sdlc-reviewer-deep` and
  `alpha-sdlc:sdlc-reviewer-critic`. Each `ask:` line — a clone not on `feat/<feature>` — is a
  question on the review's row, or on the change manifest's row for the re-walk, which blocks it;
  nothing is written for the work before the member answers.
- **exit 1, `reach: a terminal`** — each `cannot:` line is one reason: a bridge older than
  `featureFolders`, a clone not on this machine, a reviewer `--allowedTools` does not allow, a spoke
  whose TRD is not written yet. *The fallback*.
- **exit 0, `reach: terminal`** — no run on the platform after all: follow `SKILL.md`.
- **exit 2** — an input it could not read, its stderr the reason: as exit 1.

## The fallback

Nothing of the work is written in the run, so nothing is left half-written. **The review**: the
run's last report holds the review's row `pending`, a note *Runs from a terminal* naming every
`cannot:` line and the command — `/alpha-sdlc:do-grooming <feature>`, from a terminal session in
the workspace parent, as `SKILL.md` says — then `halted`, `sessionEnded: true`, no gate, no
question and no `trdComplete`. The halt reads `The grooming review runs from a terminal: run
/alpha-sdlc:do-grooming <feature> in the workspace parent, then Continue`; it waits on the hub's
`TRD.md` and on `reach` `review`, so a Continue after the bridge or the web changes runs
`run-reach.js` again (`run-halt.md`). **The re-walk**: the hub's own re-walk and restamp run as
before; the change manifest's row takes a note *Spokes re-walk from a terminal* naming the reasons,
and step 5 pushes the hub's clone only.

## The review's row

`grooming-review`, named `Grooming review`, group `TRD.md`, description *The hub and every spoke,
reviewed once by fresh eyes*, its `ordinal` after the hub's last section. Added by the report that
starts the review, `being fixed` until its verdict, `waiting on you` at the verdict gate and while a
question blocks it, `approved` once the close is committed. The review is a run of its own, as *Add
a platform* is: its `reviewRounds` start at round 1, kept in the ledger under `groomingReview`
apart from the self-review's, and its `trdComplete` finishes this run only.

## The review in the run

`grooming-review.md` → *How the grooming review runs*, with these differences:
1. The packet's command runs by the script's absolute path, `docs/development/<feature>` the hub's
   feature folder; a spoke added after ✅ takes the scoped form `next-step.js` names. The packet
   reads each spoke in its own clone.
2. Each reviewer is launched with the `Agent` tool — `alpha-sdlc:sdlc-reviewer` for dimensions (a)
   and (b), `alpha-sdlc:sdlc-reviewer-deep` for (c), then `alpha-sdlc:sdlc-reviewer-critic` — its
   prompt the packet path, its dimension and one line: *this run's Bash is the platform's list and
   it reads only: write nothing, return the report*. The run writes each returned report to the
   path the packet names, with the Write tool, under its own clone's `.alpha-sdlc/review/`.
3. `review ran <date> · rev <the hub commit the packet read>` is written on the `Hub review` row
   and committed in the hub's clone by explicit path before any fix.
4. A spoke fix is made in that spoke's clone, inside its feature folder. A fix that changes a
   spoke's decisions is a question on the review's row, its diff in the evidence, never a gate of
   another file's row. Each hub-wrong finding waits as a `pending hub change` row.
5. Round 1 is the merged verdict's finding count, sent whole in `reviewRounds`; each later round is
   the closing proofs run again.

## The verdict gate

On the review's row, its key `grooming-review@<revision>`, shaped as a section's gate except:
- `stampLine` — `TRD.md · Grooming review`; `approve` reads `Approve Grooming review`.
- `summary` — *What was checked* (the hub points and each spoke's alignment points, which a command
  settled and which were read), *Findings by direction* (spoke wrong, hub wrong, deliberate
  divergence, each with its count), *What was fixed* (each fix, its lines and its proof's result),
  then *Why it matters*; `needFromYou` asks for the questions on the row, then the approval.
- `detail` — caption *The verdict*; pane *Proposed* (note *the fixes and stamps the close writes*,
  `body` the merged verdict in Markdown, `editable` true) and pane *Current* (note *pending in
  TRD.md*, `body` null).
- `evidence` — caption *Read while reviewing*: the packet, each reviewer's report, the
  `review-gaps.js` output and each proof's output, with their paths.
- `consequences` — *Approve stamps the hub ✅ and every spoke reviewed, committing each clone by
  explicit path* and *Nothing is pushed until you say yes*.

**Its questions**, sent with the gate, each blocking the row: one per needs-eyes and judgment
finding, `grooming-review:<finding>`, its proposed fix the recommended option; one per spoke
decision a fix changes; and the held hub change as one, `grooming-review:hub-change`, options
*Change the hub* (recommended) and *Keep the hub* (requires a reason).

**Its decisions** — `approve` closes the review once no question blocks the row; one that arrives
while a question is open is answered in plain text and acts on nothing. `approve-with-edits`: the
edited pane — a fix dropped or changed — is what the close writes. `regenerate`: the fixes are
redone by the feedback and the verdict gate comes again under the next revision, in a full
snapshot; never a second packet and never a reviewer again.

## The close

`grooming-review.md` → *Closing on proofs* and *Stamps*, in this order: the hub change on its yes
and the fixes, closed on their proofs (the next round); the hub's commit; each spoke's `Hub
alignment` row `reviewed <date> · hub rev <that hub commit>`, committed in its clone; then the hub's
*Spokes* cells the same and its `Hub review` row ✅, committed in the hub's clone. Every commit is
`git -C <clone> add` with each path, then `git -C <clone> commit` — never `-A` or `.`.

Then the question `push` on the review's row (`grooming-run-schema.md` → *Pushes*): *Push now*
pushes `feat/<feature>` of the hub's clone, then of each spoke's clone, each with that section's
retry. A refusal is `push:refused` naming the clone; the clones already pushed stay pushed, and a
later session counts each by its remote. `trdComplete` comes once the last round is clean, every
stamp is committed, no question blocks the row and every clone is pushed.

## The spokes' re-walk in Add a platform

Once the hub's re-walk of step 4 is written and `run-reach.js --for rewalk` exits 0: an added
platform moves the change manifest and the *Spokes* table, so each spoke whose TRD exists re-walks
alignment points 3, 9 and 10, and 11 with two or more spokes (`grooming-review.md` → *The hub
moving*), against the hub and that spoke, resolved by direction — a spoke fix is a question on the
change manifest's row, a hub-wrong finding a `pending hub change` row. Its stamp, in the spoke and
in the hub's *Spokes* cell: a ✅ stamp becomes `reviewed <its date> · hub rev <the hub commit> ·
amended <date>`; a `self-reviewed` stamp is rewritten; `NOT REVIEWED` is left as it is. Each clone
is committed by explicit path. The findings join the hub's re-walk in `reviewRounds`, and step 5
pushes the hub's clone, then each spoke clone the re-walk wrote.

## Time

A run on the hub's `TRD.md` may last two hours (the platform's `maxDurationMs`, 7,200,000). The
session never ends between the packet and the verdict gate. A run cut at the cap resumes from the
files: `review ran` sends Continue to the close, never to a second review; before that stamp the
review starts again, since nothing of it was decided.
