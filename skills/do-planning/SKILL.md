---
name: do-planning
description: Create a staged development plan document from an approved TRD and its tasks — work broken into small, independently reviewable stages with explicit STOP/review checkpoints, so implementation is reviewed incrementally instead of as one huge change. Use when the user wants a development plan, an implementation plan, to plan the build, or to stage the work for review. Triggers on "development plan", "plan the implementation", "stage the work", "/do-planning", "break the build into steps".
---

You are writing a **development plan document**: the ordered, staged plan an engineer follows to
implement a feature. **The whole point is reviewability** — the work is split into small stages,
each a self-contained reviewable change with an explicit checkpoint, so the user can review
stage-by-stage and **stop after any stage** instead of facing one enormous diff at the end.

**Auto-run/auto-decide NEVER applies in this skill** — this is a decision phase. If the user asks
for auto mode here, decline in one line ("this phase decides — gates apply; auto-run starts at
`do-development`") and proceed gated: every gate blocks as normal, nothing auto-decides.

**Read `../../rules/plan.md` in full now** (and `../../rules/ui.md` when the plan is for a client
platform: web, android or ios) — these are this skill's binding rules, generated from
`principles.md`. After a compaction, re-read it and the reference file of your current step before
the next gate. If the read is denied (headless runs), say so in the step report — rules never
loaded cannot bind. Especially: lazy-senior mindset, never over-simplify, the ladder,
ground-in-real-code, ask-don't-assume, 2–3 best-practice options, living understanding summary.

Every gate you present: header `<development> · <phase> · <step> · ✅/⏸/⚠️`, then Bottom line (what
happened + what I need from you) → Why it matters (never omitted when a question is asked) →
Options ★ → Context (only where it adds something) → Details (for engineers) → Next as the last
paragraph (rules → *Present every step bottom line first*). The plain layer is in the org's
language and follows its guide in `../../plain-language/` when one exists (`id.md` for Bahasa
Indonesia) — at every gate, in every phase.

## Gates

- No `docs/basics/` → **STOP**: ask for `do-project-setup` first; plan without it only if the user
  explicitly chooses to.
- Spoke `Hub alignment` missing, `NOT REVIEWED` or older than the hub's last change → **STOP**, back
  to `do-grooming`. A per-screen artifact (widget spec, section slicing) never stamped or changed
  after its stamp → **STOP** the same way; print that outstanding list before refusing or planning.
- A screen this feature grooms with no `section-slicing/<screen>.md` → **STOP**, back to
  `do-grooming` Step 3. Crops but no full frame → **STOP**, back to `do-grooming`.
- A depended-on feature missing or not built → **STOP**: Open Decision; never plan on a phantom.
- Step 1 scope summary → **STOP** until confirmed; record `Scope confirmed`.
- Step 2 layout → **STOP**, end the turn; record its `_Approved:` stamp.
- Step 3 stage breakdown → **STOP** until approved; write the `Stage breakdown — approved` table.
- Step 4, one stage at a time → **STOP** (approve / edit / re-split), end the turn; on approval
  write it with `Approved: <commit · date>`. Every stage ends in a **⏸ STOP — review** checkpoint.
- Auto-run never applies here.

## Flow — stage → review → write

1. Ground in the profile and the inputs (*Source & output* below). Read the TRD spoke + tasks, scan
   the real code paths the work touches, and **summarize the implementation scope** for the user to
   confirm. **Read the hub's *Feature dependencies* and confirm each depended-on feature is
   actually built** (check `docs/basics/16-feature-map.md`); **if a prerequisite isn't built,
   STOP** and route it back (Open Decision) before planning the dependent slice — don't plan around
   a phantom. For each **flow dependency** (a field/section fed by another feature — the hub's
   Flow-dependencies sub-table), plan the stage so that binding is wired to the **real source flow,
   not a mock**, and note it as the stage's integration point.
   **Per-screen artifacts gate (UI platforms): a screen this feature grooms (it has a widget spec in
   this feature's directory) with no `section-slicing/<screen>.md` is an UNFINISHED SPOKE — STOP and
   send it back to `do-grooming` Step 3** (the no-slicing tolerance exists only for legacy screens
   this feature's grooming never touched). **For UI platforms, a `[presentation]` stage must name
   the section cases it implements** — the case IDs from the screen's `section-slicing/<screen>.md`
   (`body.summary/C1–C4`, `ftr.actions/C5`, plus the *Interactions* rows) — so the stage's scope is
   the case list, not "build the screen". A screen with many cases splits by section rather than
   becoming one giant stage, and no case may go unassigned to a stage. **Carry the Design references
   into the plan's *Design references* section.** First read what **grooming already captured** —
   the **`Design` field in each screen's widget-spec** and any images in
   `docs/development/<feature-name>/design/`; reuse those, don't re-ask. Only for anything still
   missing:
   - **Image(s) provided now** → **save each into
     `docs/development/<feature-name>/design/<screen>.png`** (create the `design/` folder), record
     the path.
   - **Figma** → record the frame link.
   - Plus any specific needs (states, breakpoints, motion, dark mode).
   Carry the refs **at the grain grooming captured them — per step and per state, not one row per
   screen**: a wizard gets a ref row per step, and each specced state (empty/loading/error/extremes)
   keeps its ref or its explicit "flagged / platform-default" marker — dropping state refs here is
   how dev's parity loop only ever compares the main screen. **Every screen with an assembly stage
   has a full-frame row with the frame's size** — the assembly renders at that size with a fixture
   holding the frame's own content, and compares the layout between sections against it. A screen
   with crops but no full frame → **STOP, back to `do-grooming`** to export it; never plan an
   assembly with nothing whole to compare against.
   `do-development` reads these to run the visual-parity loop, so they must be in place before UI
   stages. **Present the summary, then STOP and wait for confirmation** before the architecture
   layout (don't plan on a stale or unconfirmed understanding). On confirmation, write the plan's
   header from `plan-template.md` with its `Scope confirmed` date and the *Design references* rows.
   Every later part is written at its own gate, filled: the doc hooks block a template placeholder
   (`<YYYY-MM-DD>`, `<hash>`) or an empty **Approach**. From here on, an answer that shapes a stage
   not written yet goes under *Carry-forward answers* the moment it is given.
2. **Read `stage-rules.md` in this skill's directory now** (once per session, again after a
   compaction) — what makes a good stage; the layer map, the breakdown and every stage follow it.
   **Write the Architecture & package layout first.** Map where each piece of the work lands in the
   real repo (which package/directory/file), grounded in the existing structure — reuse it (ladder
   rung 2 — reuse), propose new packages only where needed and name the rung **and the world-wide
   standard**. **If the project uses clean/layered architecture, place each piece in the right layer
   (presentation / domain / data) and respect the dependency rule** (per `principles.md`) — don't
   impose layering if the project doesn't use it. **This layer map is what the stage split follows**
   — the layers you place work into here become the stages in step 3, so name them explicitly
   (including the unlayered case's UI vs data-integration division). This is *not* a re-statement of
   the TRD design; link to the TRD and keep this concrete (file-system level). It's the map the
   stages slot into; keep it short for small features. **Present the layout, then STOP — end your
   turn and wait for approval. Do not start the stage breakdown in the same turn.** On approval,
   write the section with its `_Approved: <date>_` stamp.
3. Propose the **stage breakdown** (titles + one-line goals + order only) — each stage references
   the package layout from step 2, and **each title carries its layer tag** (`[contract]` /
   `[domain]` / `[data]` / `[presentation]`, or `[UI]` / `[data-integration]` on unlayered
   projects). **Lead with the count and the shape** — e.g. "3 screens over one repository → 17
   stages: domain, data, then per screen a shell + 3 section stages + assembly" — so the user sees
   how many checkpoints they're agreeing to before any stage is detailed. **Per-section splitting
   multiplies that count**, so show the per-screen shape (shell + N sections + assembly) and the
   section stages' names; if the user wants it coarser, they say so here, not after 17 stages are
   written. **Present it, then STOP and wait for approval. Do not detail any stage until the user
   approves the shape.** On approval, write the `Stage breakdown — approved <date>` table (and the
   *Screen stage map* on UI platforms), every row's Detail `pending` — a fresh session resumes from
   it.
4. For each stage, in order: **draft** the stage detail (goal, files/modules, approach per the
   ladder, concrete changes, **the test(s) to write first from the AC** — TDD red, verify step,
   checkpoint, safe-to-stop flag, tasks covered) → **present it and STOP** (approve / edit /
   re-split — end your turn, wait for the verdict; do not draft the next stage or write the file
   yet) → on approval, **write** it into `plan-<platform>.md` **with its `Approved: <commit · date>`
   recorded**, set its breakdown row's Detail to `written`, and move to the next stage. An approved
   re-split first rewrites the breakdown table (rows and approval date) and the *Screen stage map*.
   Every stage with real logic must name its test so `do-development` can write it first; flag
   stages that genuinely can't be unit-tested. A stage's draft folds in its *Carry-forward
   answers*; writing the approved stage moves them to its `Carry-forward:` line. A stamped stage is
   a session boundary (below).
5. After all stages: write the sequencing summary (dependency order, which checkpoints are safe stop
   points, any uncovered tasks — the `node ../../scripts/check-coverage.js
   docs/development/<feature-name> <platform>` output, pasted as it prints). **The coverage check is
   not tasks-only:** confirm every hub-decided **integrity AC** (entity visibility · on-delete
   behavior · freshness), every **feature-flow step** (hub §3), and every **flow binding** also maps
   to a stage — flag any that fell between tasks.
6. Write the review charter (*Source & output*) when it is missing or its profile commit is behind.
   The phase ends here: write the next-file for `do-development` and offer the fresh session.

This skill writes the **plan**. Implementing it (coding stage-by-stage, pausing at checkpoints) is
the user's call to make afterwards — the plan is what lets them stop wherever they want.

## Resume (fresh session)

`plan-<platform>.md` is the state. Run `node ../../scripts/next-step.js
docs/development/<feature-name> <platform> --phase planning` first: exit 0 names the next unit (the
scope, layout or breakdown gate, the first stage without an `Approved` stamp, the sequencing
summary or the charter), exit 1 a STOP to present, exit 2 an older or unknown format — read the
files it lists instead. Read `.alpha-sdlc/next/<feature>--<platform>.json` and its handoff when
present, set the next-file's `status` to `consumed`, and state the recorded understanding in one
line. Re-read what it lists — the spoke, the hub, the plan — plus the profile docs *Source &
output* names and, before Steps 2–4, `stage-rules.md`, in one batch (rules → *Batch independent
reads*). Never re-run a gate the plan has stamped (`Scope confirmed`, the layout's `_Approved:`,
the breakdown table, a stage's `Approved`), and never re-ask what it records, *Carry-forward
answers* included.

## Session boundaries

Per rules → *The session is disposable — the files are the state*. Planning's boundaries are the
moment a stage is stamped (Step 4) and the phase end — never mid-unit, never on an unstamped draft.
At a boundary, persist first (every answer is in the plan, *Carry-forward answers* included), then
write `.alpha-sdlc/next/<feature>--<platform>.json` `{skill, args, unit, status: "ready", at, head,
repo, handoff}` — mid-plan `alpha-sdlc:do-planning` with the next stage as `unit`, at the phase end
`alpha-sdlc:do-development` with `Stage 1` — and `.alpha-sdlc/handoff/<feature>--<platform>.md`
only when session-only facts exist. The Next paragraph offers the fresh session: "/clear, then
'lanjut'", or the command (`/alpha-sdlc:do-planning <feature> <platform>`, at the phase end
`/alpha-sdlc:do-development <feature> <platform>`). The phase end always offers it; mid-plan, offer
it when the session is long (the `boundary-guard` hook says so) and skip it when little work
remains.

## Source & output

**Read the project profile first** (`docs/basics/` from `do-project-setup`) — especially
`06-domain-model.md` + `16-feature-map.md` (the shared truths the TRD bound to),
`02-architecture.md`, `10-conventions.md`, `05-tech-stack.md`, and (for UI)
`03-ui-architecture.md` + `18-design-tokens.md` + `08-data-cache.md` — before scanning code from
scratch. The plan's **Architecture & package layout** and stage breakdown must ground in the
profile's real structure, conventions, and stack — not a guessed one — so stages land in the right
place and follow existing patterns. If a section looks stale (repo moved past its commit stamp),
note it and suggest a refresh.

**If there's no `docs/basics/` (project not set up yet), STOP and ask the user to run
`do-project-setup` first** — planning the package/architecture layout on an ungrounded view is how
stages land in the wrong place or fight existing conventions. Wait for their answer: recommend
setting up first; proceed without it only if the user explicitly chooses to (then fall back to
scanning the repo, and note the layout is ungrounded).

- **Platforms can be planned in parallel sessions** once the hub's contract is approved — each owns
  its `plan-<platform>.md`; a shared doc changes only by targeted Edit, committed at once (per
  `principles.md` → *Parallel work*).
- **Inputs:** the feature's approved TRD (`docs/development/<feature-name>/` hub + the relevant
  spoke) — its **work slices + AC are the source of work**. **Check the spoke's `Hub alignment`
  stamp first (hub/spoke feature TRD) — missing, `NOT REVIEWED`, or older than the hub's last change
  → STOP** and send it back to `do-grooming` for the hub-alignment review. Feature, issue and
  tech-debt spokes carry their own `Hub alignment` row and are read there; only a **foundation**
  spoke, which is cut from *Per-platform sections* and has no header table, is read in the hub's
  *Spokes* row instead (spelled `❌ not reviewed` there). Planning a spoke that disagrees with the
  hub bakes the disagreement into stages, where it resurfaces as a contract/integration bug two
  phases later. **Check each per-screen artifact's own stamp the same way**
  (`widget-spec/<screen>.md` `Approved` · `section-slicing/<screen>.md` `Approved (screen)` +
  per-section) and **print the outstanding list — never stamped, or changed after the stamp's
  recorded rev/date — before you refuse or plan a slice**. Derive that list from the artifacts,
  never hand-write it: a hand-written list of what's outstanding is the one list guaranteed to go
  stale, and an author can't honor a gate they can't see. If you ran the optional Jira phases
  (`do-slicing`/`do-uploading`), also use `task-list.md` / Jira keys; if you skipped them, plan
  straight off the TRD. Either way the plan implements what the TRD already decided — it does
  **not** re-open design (send those back to `do-grooming`).
- **Development is per-platform** → write one plan per platform:
  `docs/development/<feature-name>/plan-<platform>.md`. Use `plan-template.md` in this skill's
  directory.
- **Also write the review charter**, once, beside the plan:
  `docs/development/<feature-name>/review-charter.md`. It distils from `docs/basics/` only what this
  feature's reviewers must hold — the layers and the dependency rule this feature crosses, the seams
  it touches, who owns each entity it reads or writes, the conventions its code must follow, the
  house values its UI must use — and it carries the **profile commit it was built from** (a
  `Profile commit:` line with the hash in backticks, from `git log -1 --format=%h -- docs/basics`;
  `next-step.js` and `review-packet.js` compare it with the profile). Every stage's reviewer is
  then handed the charter plus its diff instead of the profile documents again. Without it twenty
  stages re-read the same unchanged documents twenty times, which is where per-stage review cost
  actually goes: the rules and the profile are the same size whether the diff is four lines or four
  hundred. Rebuild the charter when the profile commit moves; a charter whose recorded commit is
  behind is stale and says so.

## What makes a good stage — `stage-rules.md`

The full rules live in `stage-rules.md` (read at Step 2). In short:

- **Small enough to review in one sitting**; prefer many small stages over few big ones.
- **Every stage declares its seam and its rung — neither may be blank**; from rung 3 up, the rung
  line says what the rung below cannot see.
- **One stage per architecture layer the slice touches — never one stage spanning layers**: only the
  layers it touches, shared lower-layer work staged once, foundation scaffolding the exception.
- **Presentation splits again by section: shell → sections → assembly**; every case is claimed by
  exactly one stage.
- **Ordered by dependency**, contract first when the contract changes. If a depended-on feature is
  **missing or incomplete**, STOP and surface it (Open Decision) — never plan stages on a phantom
  prerequisite.
- **Ends in a checkpoint**: how to verify it works, and an explicit **⏸ STOP — review** marker.
- **Marks whether it's safe to stop after** — safe ≠ complete; a half-sectioned screen is not safe.
- **Traces to AC / work slices** — computed by `check-coverage.js`, never a hand-written table.
- **Detail the *shape* of the change, not the code.**
