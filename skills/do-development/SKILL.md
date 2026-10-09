---
name: do-development
description: Implement a feature stage-by-stage by executing its development plan — write the code for one stage, verify it, then STOP at the stage's checkpoint for review before continuing. Keeps changes small and reviewable; lets the user stop after any safe stage. Use when the user wants to build/implement/code a planned feature, execute the dev plan, or work through the stages. Triggers on "implement", "build the feature", "execute the plan", "code the stages", "/do-development", "start development".
---

You are **implementing a feature by executing its development plan**, one stage at a time. The plan
(`plan-<platform>.md` from `do-planning`) already decided the stages, order, package layout, and
checkpoints — you follow it. **The whole discipline is: implement one stage → review it against the
profile + principles → verify → stop at the checkpoint → wait for approval.** Never run past a
checkpoint unattended — **unless the user explicitly opted into auto-run mode** (*Auto-run* below).
If there's no plan, point the user to `do-planning` first — this skill executes a plan, it doesn't
invent one.

**Read `../../rules/execute.md` in full now** (and `../../rules/ui.md` when the plan targets a
client platform: web, android or ios) — these are this skill's binding rules, generated from
`principles.md`; every rule this skill cites from `principles.md` is in them. After a
compaction, re-read it and the reference file of your current step before the next gate. If the
read is denied (headless runs), say so in the step report — rules never loaded cannot bind. Apply
them against the *code itself*, especially: climb the ladder for every implementation decision
(reuse before writing), **never over-simplify** (keep the validation, error handling, edge cases the
plan calls for), ground in real code, and surface (don't silently absorb) any place reality differs
from the plan.

Every gate you present: header `<development> · <phase> · <step> · ✅/⏸/⚠️`, then Bottom line →
Why it matters → Options ★ → Context → Details (for engineers) → Next as the last paragraph (rules →
*Present every step bottom line first*).

## Gates

- Start: no plan → `do-planning`. A stage's plan-gate stamp missing, a placeholder or stale → STOP,
  back to `do-planning`. A TRD AC no stage's `Covers:` claims → STOP, back to `do-planning`.
- Any step: plan drift → stop and tell the user. A gap the design doesn't cover (a UX pattern the
  conventions lack, an off-scale value used systematically, an uncovered case) → stop the stage,
  Open Decision, back to `do-grooming`. Ask first before installing tooling, booting a device,
  swapping a component, extracting a scaffold component, or creating an asset no search found.
- 5: never skipped (no subagent → the checklist inline, said so). Judgment/scope finding → hard
  STOP, Open Decision. Objective-violation count flat or rising over three rounds → STOP.
- 6: render tooling fails → STOP, report a fix, wait. Case crop `pending export` → STOP, report.
  Assembly with nothing to measure → STOP, back to `do-grooming`.
- 7: the stack can't boot → STOP and say so; never pass on isolated tests alone.
- 8: groomed screen with no section-slicing doc → STOP, back to `do-grooming`. ⏸ Present, then
  STOP: approve / request changes / stop here; never touch the next stage before the answer.
- 9: never commit an unapproved stage; the session boundary only after verdict, `Status: done`,
  commit.
- Auto-run (marker `running`): each ⏸ is a report, verdict `auto <date>`, commit, next stage; every
  other stop takes ★, recorded — except the five halting cases.

## Flow

**Start of every session, before the first stage it builds:**
- Run `node ../../scripts/next-step.js docs/development/<feature-name> <platform> --phase
  development` (*Resume* below reads its output). **Input = the plan**, normally
  `docs/development/<feature-name>/plan-<platform>.md`, plus the TRD spoke + tasks it references.
- **Check a stage's `Approved (plan gate)` stamp before building it, starting at stage 1: missing,
  still the template placeholder, or recorded at a commit/date before *this stage's own last edit* →
  STOP** — scoped to the stage block, never the whole file, since step 9 rewrites the plan after
  every stage, so a file-wide test fails on every resumed run. Send it back to `do-planning` — the
  plan was never approved, or was edited after approval (an explicit *proceed anyway* still
  overrides, with the gap recorded, per `principles.md`).
- **Before stage 1, also check the plan covers the TRD:** an AC in the TRD's numbered AC register
  that no stage's `Covers:` claims → **STOP** back to `do-planning` — that's decided scope nobody
  planned to build, and it otherwise surfaces as an uncovered AC at `do-testing`, three phases
  later.
- **Read `stage-steps.md` (this skill's directory) in full** — once per session, again after a
  compaction: every rule the steps below apply, stated in full. Batch it with the reads below.
- **The moment you open `plan-<platform>.md`, check what it targets — if it's a client platform
  (Android, iOS or Web), read this skill's `client-ui-rules.md` and `client-ui.md` in full right
  then, before stage 1** — once per session, and after a compaction again before the next UI
  stage. The plan's `Platform` row says which; it ships as an unfilled `<placeholder>`, so the
  filename is the fallback. A `[domain]` or `[data]` stage in a client plan still reads them,
  because which stage is `[presentation]` is only known one stage at a time. A Backend plan skips
  both files entirely.
- **Ground** through the feature's `review-charter.md` (rebuild it if its recorded profile commit
  is behind) plus every profile doc the stage's *Conformance review* line or changes name, and for
  client UI **`18-design-tokens.md`** — the visual contract you build every value from; open other
  docs at the fact the stage touches. No charter → `docs/basics/06-domain-model.md`,
  `16-feature-map.md`, `08-data-cache.md`, `04-ux-conventions.md`, `10-conventions.md` (+ `18` for
  client UI). (No STOP gate here — the plan already grounded in the profile; this is orientation,
  not re-derivation.)

**Per stage** — for the next unfinished stage in the plan:

1. **Frame** — check this stage's plan-gate stamp and ground in the docs it names (above); restate
   the stage goal, its planned changes, and the tasks/AC it covers, and apply its `Carry-forward:`
   lines. Note any drift you already foresee from the real code. **If the stage is linked to Jira
   ticket(s), move them to In Progress** (`stage-steps.md` §1) and report it — otherwise skip (no
   Jira).
2. **Red** — write the failing test(s) for this stage's acceptance criteria/behavior, in the
   packages the plan fixed. Run them; confirm they **fail for the right reason** (not a
   compile/setup error). For stages that can't be unit-tested, say so and use the plan's verify step
   instead.
3. **Green** — write the *minimal* code to make the tests pass, climbing the ladder per decision
   (reuse existing, stdlib, native, dep, then new). Keep the diff scoped to the stage. Run the
   stage's tests **and the surrounding suite** — no regressions — plus the project build, until
   green. **A red test you did not cause is still named in the stage packet**: an unmentioned
   failure is a report falsified by omission. **Report results honestly** — never claim done on red.
4. **Refactor** — clean up while staying green (ladder, never over-simplify away validation/error
   handling/edge cases the AC needs): clearer names, smaller functions, dead code out, comments a
   better name makes unnecessary deleted. Re-run to confirm still green. The doc/principle
   **auditing happens in step 5** — don't half-do it here and call it checked.
5. **Conformance review (fresh eyes) — before verifying, before presenting** (in full:
   `stage-steps.md` §5). Log your verification commands with exit codes and summary lines under
   `.alpha-sdlc/`, never the repo root, and save the doc-check output and, on client UI, the
   raw-literal output there. Run `node ../../scripts/review-packet.js
   docs/development/<feature-name> <platform> --stage <n> --base <the stage's base commit> --verify
   <log> --settled <each output>` (another session's uncommitted paths: `--exclude`,
   `stage-steps.md` §5); its first stdout lines give the packet path, the tier (`review-tier.js`,
   by measure), the reviewers and the settled exit codes. **Reviewers run in the foreground, the
   whole round in one message, at most 3 in flight**, each handed only the packet path and its
   dimension id (on a UI stage, also the section-slicing doc the packet lacks) — never your build
   reasoning. The tier sets the round (`stage-steps.md` §5): **script-only** — no
   reviewer, close on the settled scripts and the stage's own suite; **light** — one
   `alpha-sdlc:sdlc-reviewer` for every dimension, then `review-gaps.js`; **full** — one reviewer
   per `conformance-reviewer.md` item, then, **before you fix anything**, `review-gaps.js` and
   `alpha-sdlc:sdlc-reviewer-critic`, whose findings join the round's.
   Merge every report, the gaps output and the file → dimension map into `<packet stem>-merged.md`
   — the same file:line counts once: one verdict, one objective-violation count. Then **fix every
   objective violation in this stage and re-verify green** — each one **verified** at its cited file
   and line first. **STOP on any judgment/scope finding** — record it as an **Open Decision** and
   hand back to the user/`do-grooming` rather than resolving it yourself. A design gap filled with
   invented behavior/UI, scope beyond the plan, a deviation from a decided convention, or a
   simplification that trades away correctness is one — **never fix-and-continue on those**, because
   self-approving a scope change is exactly the gate this step exists to hold. **Close the stage on
   the findings' closing proofs, not on another round**: every named command's output in the
   packet, needs-eyes zero, no fix that changed product behaviour; a correction that changes what
   the code *does* is written **test-first** and that test is its proof (`principles.md` → *One
   round, closed by proof*). **A second round is owed only** for a needs-eyes finding, a fix that
   added product behaviour, or a proof that would not go green. If no subagent can run, run the
   identical checklist inline as an explicit self-review and say that's what happened — never skip
   the step.
6. **Visual parity + content-fit (UI stages with a design ref)** — **what you compare depends on the
   stage's kind** (the plan's *Stage kind*): the dispatch for a `shell` / `section` / `assembly`
   stage, the content extremes, the section-slicing doc's Interactions (`X`) rows, and where each
   iteration is saved are in **`client-ui.md` §5 — read it now if you have not** (its rules:
   `client-ui-rules.md` R1–R5).
   Skip only for non-UI stages or when no design ref exists — **never** because rendering failed.
   **If the render/screenshot tooling fails or isn't working, do NOT skip or continue past the UI
   comparison** — STOP, report the exact problem and a concrete fix (install / permission / config /
   boot the device), and wait. A case whose crop is **`pending export`** or missing with no explicit
   marker → **STOP and report**; an assembly with nothing to measure → STOP, back to `do-grooming`
   (`client-ui.md` §5).
7. **Integrated smoke (full-stack stages)** — if the stage crosses the FE↔BE seam (its own line
   decides), boot the real backend + real frontend (per the *Full-stack run recipe*) and drive the
   stage's real request through the running stack with relevant, domain-realistic data. Confirm
   zero unexpected 4xx/5xx, zero console errors, zero error-boundary trips. Skip only for stages
   that don't touch the seam; if you can't boot both in-session (missing recipe, env can't stand
   up), **STOP and say so** at the checkpoint — don't mark the stage passed on isolated tests alone.
   Removal, mobile signals, the driver spec, freshness: `stage-steps.md` §7.
8. **Present + ⏸ STOP** — present in the shared **step-summary format** (`principles.md`): the
   **bottom line** first (what this stage built + what I need from you), then **why it matters**,
   then only the context the header and bottom line haven't given — one self-contained statement
   each (no naked references — every case/AC/token ID carries its plain essence inline), in the
   org's language per its guide in `../../plain-language/` when one exists. The structured packet is
   the **Details (for engineers)** section — not the opening — and the report **ends with what
   happens next** (`principles.md` → *Next*): the next stage and whether it starts now, or what the
   review's verdict leaves to fix or to decide. Its slots: `stage-steps.md` §8. **Section cases (UI
   stages)** — the case-coverage table and its totals for **the cases this stage claims**; its shape
   is in **`client-ui.md` §5 — read it now if you have not**. "n/a" only for a **legacy screen this
   feature's grooming never touched** — a screen with a widget spec in this feature's directory but
   no section-slicing doc is an **unfinished spoke: STOP, back to `do-grooming`**, never build it
   caseless. Then ask: approve / request changes / stop here. Do not touch the next stage until they
   respond.
9. **On approval** — record the stage's **Checkpoint verdict** (`approved <date>` — or `auto <date>`
   in auto-run), set the stage's **`Status:` to `done <date>`** in `plan-<platform>.md`, and
   **commit the stage's changes automatically** (conventional message; no push unless asked). Then
   the **session boundary** (`principles.md` → *The session is disposable — the files are the
   state.*; `stage-steps.md` §9): persist first — each checkpoint remark a later stage depends on as
   a `Carry-forward:` line in that stage's block, each decision in its artifact — then write the
   next-file and any handoff. The Next paragraph offers the fresh session — "/clear, then 'lanjut'"
   or `/alpha-sdlc:do-development <feature> <platform>` — which resumes at the first stage whose
   `Status` is not done; continue in place only when the user asks or little work remains, or stop
   if the user wants (honoring safe-stop).

**After the last stage** — confirm every task/AC the plan covered is implemented and verified,
report what's done and anything deferred, and hand off to `do-testing` — the AC are its input. Write
the next-file for `do-testing` and offer the fresh session; in auto-run, go straight into it.

## Resume (fresh session)

The plan is the state; `.alpha-sdlc/next/<feature>--<platform>.json` and its handoff carry the rest.
1. Run `node ../../scripts/next-step.js docs/development/<feature-name> <platform> --phase
   development` first. It prints the next stage's block, its covered AC rows and `Carry-forward:`
   lines, and the STOPs (a missing, placeholder or stale plan-gate stamp, checked through
   `git log -L`; an unclaimed AC), the charter's freshness, the re-read list and uncommitted files
   in the stage's own paths. Exit 0: build that stage · 1: its STOP applies · 2: it cannot read the
   format — read the files it lists.
2. Read the next-file and its handoff, set the next-file's `status` to `consumed`, and state the
   recorded understanding in one line — never re-ask what the files already answer.
3. In one parallel batch, read what this session has not read yet: `stage-steps.md`, both UI files
   on a client plan, the *Ground* docs (charter, the stage's docs, `18` on client UI), the spoke's
   AC rows this stage covers and the stage block — not the whole plan.
4. **Uncommitted changes in the stage's own files are in-progress work** — run its tests and carry
   on from them; never discard them. Other uncommitted paths belong to another session or stage:
   leave them.
5. Never redo a done stage. A verdict without `Status: done` means step 9 is unfinished: finish it
   first.

## Auto-run

Only on the user's explicit opt-in (`principles.md` → *Auto-run mode*): each checkpoint emits its
full packet as a **report**, stamps `Checkpoint verdict: auto <date>`, commits, and continues —
through every stage and **onward into `do-testing`** when the last stage lands — while questions
auto-answer with the ★ recommendation (recorded) and the chain halts only where nothing can be
decided: failed mandatory tooling, physically missing inputs, external writes, a fix that has
failed three times, and a change the hub would need. **On opt-in, write
`.alpha-sdlc/auto-run.json`** (`principles.md` → *The opt-in is written down*): a `Stop` hook then
keeps the turn going through every checkpoint, and the chain stops only by setting that file's
`status` to `halted` (with the reason) or `done`. Append each decision taken for you to its
`decisions` array as it happens — the chain report's *Decisions taken for you* is built from it.
Presenting a report is not the end of the turn: the next tool call follows it. Plan drift: adopt the
★-recommended plan amendment, record it in the plan + report, continue. A design gap auto-decides
its ★ recommendation on the spot — record `decided: auto ★<option>` in the spoke's Open Decisions
and keep building per it; no mid-chain hand-back to grooming — unless answering it would change the
hub: auto-run never edits the hub, so that gap halts the chain and asks. A judgment/scope finding
auto-decides its ★ resolution — recorded — and the stage continues. The default scope is the whole
chain in one session, with no session boundary; with `"scope": "unit"`, once a stage closes set
`status` to `handoff`, write the next-file and end the turn; the next session resumes the chain with
'lanjut' and sets `running` again.

## Rules

One line each; `stage-steps.md` states them in full, `client-ui-rules.md` the UI ones.
- **One stage at a time. Hard stop at each ⏸ checkpoint.** Implement the current stage, verify it,
  present it, and **wait for approval** before the next stage. "Approved stage 1" is not approval
  for stage 2.
- **Stages built together are recorded** — `Built with:` on each block, each with its own review
  round and checkpoint verdict · **respect "safe to stop after"** · **follow the codebase, not your
  taste** · **reuse lookup** in `19-code-inventory.md`, wiring per `02-architecture.md` · **consume
  the backend via the contract's generated types** · **asset search flow, then register-on-create**.
- **UI (client plans):** don't trust code-from-image — render and compare every ref row, per
  section, never skipped · every visual value is a token, never a value off the mockup; a wrong
  token is a defect inside pixel tolerance · every section case built from its declared source and
  compared to its crop · interactions per `04-ux-conventions` · containers fit or scroll, never
  clip · Test IDs from the widget spec · each element its specced type and canonical component,
  never swapped. After a compaction, re-read both UI files before the next UI stage.
- **Commit every approved stage automatically** — its own paths by name, never `git add -A` or
  `commit -a`; never an unapproved stage · **platforms can run in parallel sessions**
  (`principles.md` → *Parallel work*) · **move a linked Jira ticket to In Progress** when its first
  stage starts — only if the work is tracked in Jira.
