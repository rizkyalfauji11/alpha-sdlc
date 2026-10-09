# Stage steps — every rule, in full

> Read by `do-development` **in full** before the first stage of every session, and again after a
> compaction. `SKILL.md` holds the gates and the flow; this file states each step's rules in full,
> `client-ui-rules.md` the UI ones — where a rule is whole in a `SKILL.md` step, this file names
> that step instead of repeating it. Nothing here relaxes a gate in `SKILL.md` or a rule in
> `../../rules/execute.md` — where two texts ever seem to disagree, the stricter one binds. In
> auto-run the stops below resolve as `SKILL.md` → *Auto-run* says.

## Contents

0. Stage discipline · 1. Frame · 2. Test first · 3. Build · 5. Conformance review · 7. Integrated
smoke · 8. Present · 9. On approval. Step 4 is whole in `SKILL.md`; step 6 is `client-ui-rules.md`
R1–R5 on the mechanics of `client-ui.md` §5.

## 0. Stage discipline

- **Stages built together are recorded, and each still gets its own review.** When two or more
  stages land in one change — auto-run building a band of small UI stages at once — each of their
  plan blocks carries **`Built with:`** naming the others, and each stage still gets its own
  conformance review round and its own checkpoint verdict. `scripts/check-coverage.js` fails a
  one-sided record and a done stage without its own verdict.
- **Respect "safe to stop after".** When the user wants to halt, stop cleanly after a stage the plan
  marks safe (working/shippable state). If they want to stop at an unsafe point, tell them what's
  left half-done.
- **Plan drift → surface it, don't wing it.** If implementing reveals the plan is wrong, incomplete,
  or fights the real code, stop and tell the user; update the plan (or send it back to
  `do-planning`) before coding around it.
- **Build only decided scope — undecided gap → Open Decision → back to grooming.** Implement exactly
  the design/AC, never more. If a stage hits something the design doesn't cover (a gap you'd have to
  guess), **stop the stage, add it to the spoke's `Open Decisions`, and hand back to `do-grooming`**
  for the user to decide. Never invent behavior/UI/scope to fill it (that's the over-delivery bug).
- **Follow the codebase, not your taste.** Match existing conventions, naming, and the package
  layout the plan fixed. The ladder governs build-vs-reuse.
- **Platforms can run in parallel sessions.** Once the plans are approved, backend, web and any
  other platform can each run `do-development` in its own session at the same time — each owns its
  plan and code; shared docs change by targeted Edit and are committed at once; one session boots
  the full stack at a time; a seam stage whose other half isn't built stops and reports (per
  `principles.md` → *Parallel work*).

## 1. Frame — the Jira ticket

- **Move the Jira ticket to In Progress when its work starts — only if the work is tracked in
  Jira.** If the Jira phases were skipped and there are no ticket keys, **skip this rule entirely**
  (nothing to update). When a stage begins and it *is* linked to a Jira key (written back by
  `do-uploading`), transition that ticket to **In Progress** via the Atlassian MCP — use
  `getTransitionsForJiraIssue` to find the board's actual transition name (boards differ), then
  `transitionJiraIssue`. Skip if it's already In Progress or has no linked key; transition each
  ticket only once (when the first stage touching it starts). Announce the transition; don't gate
  each one — running this skill is the approval. If the transition fails, report it and continue
  coding (don't block implementation on a status update).

## 2. Test first — red, green, refactor

- **Test-Driven Development — test first, every stage.** Implement each stage as **red → green →
  refactor**: write the failing test(s) first, watch them fail for the right reason, write the
  minimal code to pass, then refactor while green. The tests come from the **stage's acceptance
  criteria** (the AC carried from the TRD/tasks) — that's the spec. Calibrate per `principles.md`:
  test real behavior, logic, and the AC; don't write test theater for trivial getters. Where a stage
  genuinely can't be unit-tested (e.g. native widget rendering, pure UI, or **greenfield scaffolding
  stages** — there's nothing to assert until the harness exists), say so and fall back to the plan's
  verify step — don't fake a test to look TDD. For scaffolding, the verify step *is* the real check:
  **the command runs (build/run/test/lint), the created tree matches the foundation TRD's structure
  section, and the dependency rule holds** — and the conformance review checks the built tree
  against that structure, which is what makes base drift catchable on day one.

## 3. Build — the contract's types, reuse, wiring, assets

On a client plan, `client-ui-rules.md` R1–R7 bind at this step too.

- **Consume the backend via the contract's types — don't re-guess the shape.** When a stage calls
  the backend, use the **typed client / types generated from the hub's machine-checkable contract**
  (per `docs/basics/15-api-reference.md`); if the project generates them, run the generator rather
  than hand-writing an interface (a hand-written type is where `title: string` diverges from the
  real `title: {en,id}` and crashes at render). Handle **every field as the contract types it** —
  nullable, enum, and **localized objects rendered through the locale helper, never raw** (raw
  render of `{en,id}` is the "Objects are not valid as a React child" crash). Test fixtures for this
  stage **derive from the contract (or recorded real responses) with relevant, domain-realistic
  values — never hand-authored or randomized/placeholder shapes** that can pass while reality fails.
  For **authenticated** calls, follow `docs/basics/13-auth.md`'s token handling — attach/refresh via
  the existing interceptor and handle 401 (refresh-and-retry, no loop); don't hand-roll a parallel
  auth path. **Shared-entity stages implement exactly the cache wiring the plan named** — the
  canonical query keys read and the invalidations/events fired, per `docs/basics/08-data-cache.md`'s
  sync convention; a private key for an entity another feature owns is drift, not a choice.
- **Reuse lookup before writing any shared-ish logic (rung 2 — reuse — has an index).** Before
  writing a helper, formatter, validator, base class, wrapper, or hook, **search
  `docs/basics/19-code-inventory.md` first** (it catalogs reusable units project-wide, not just
  core/common) — exact match → reuse; similar → adapt + update its row; none → write it and
  **register it on create** (name · plain+engineer description · location · used-by). A duplicate of
  a registered job is drift — if the inventory shows one already exists elsewhere, reuse or raise
  it, never write a second. **Wire every boundary per `02-architecture.md` → Layer interaction &
  wiring patterns** — interface/impl/binding placement, async and error types at the boundary, DTO
  mapping at the data edge — the conformance review checks the pattern, not just the dependency
  rule.
- **Asset search flow, then register-on-create.** Before creating any asset, search in order,
  stopping at the first hit: (1) **registry** `docs/basics/17-asset-registry.md` by name/tags; (2)
  **assets module** — if no registry or no match, the asset-providing module/package located via
  `docs/basics/03-ui-architecture.md`; (3) **ask the user** — whole-project scan or create new.
  Exact → reuse; similar → adapt + re-validate with the user. Only when the outcome is genuinely
  **create new**, create it *and* **register it** in `17-asset-registry.md` (name, description,
  path, tags) — an unregistered new asset breaks the search-before-create loop and duplicates creep
  back.

## 5. Conformance review — fresh eyes, before verifying and before presenting

- **Conformance review before verifying — fresh eyes on the diff, never the author's.** Every stage
  gets reviewed against the profile, the principles, and its own plan **before** the visual/smoke
  verification and **before** it's presented (flow step 5). Run it with the **reviewer subagent**
  (`alpha-sdlc:sdlc-reviewer`) handed only the packet `scripts/review-packet.js` writes — the
  **stage diff + the stage's plan/AC + the feature's `review-charter.md` + the principles sections
  this diff can actually violate** — the principles are in the packet because the
  principles-conformance check audits against them, and a reviewer asked to check a document it was
  never given checks nothing. The packet is deliberately *not* your build reasoning, because the
  context that made a decision is the worst context for auditing it ("I wrote it, so it looks
  right"). The reviewer also gets **`conformance-reviewer.md`** (this skill's directory) — the
  three-part checklist it works from: profile conformance · principles conformance · plan/AC
  conformance.
- **The packet — one file per round, written by script.** Log and save the outputs where `SKILL.md`
  step 5 says — under `.alpha-sdlc/`, because a log in the repo root shows up as a changed
  production file — and run `review-packet.js` as it shows. Uncommitted paths that are not this
  stage's — another session's or an earlier stage's work in the same tree, which `next-step.js`
  lists (the first five; `git status --short` gives the rest) — go in with `--exclude <path>…`, and
  the packet's header
  names them; never exclude a path this stage changed. Its
  `.alpha-sdlc/review/<feature>-<platform>-s<n>-r<round>.md` holds the diff, the stage block with
  its AC and slice rows, the charter's currency, your log, the settled `check-coverage.js` (with
  the stage's changed tests) and `find-orphans.js --diff` outputs, the rules this diff can violate
  with the withheld ones named, and the file → dimension map. No charter, or one whose recorded
  profile commit has moved → the reviewers fall back to the `docs/basics/` docs the diff touches.
- **Three economies, all from `principles.md` → *Reviews run as parallel dimensions*, and none of
  them cuts rigor:** the charter replaces re-reading `docs/basics/` every stage (it was distilled
  once at planning, and carries the profile commit it was built from — rebuild it if that moved,
  and fall back to the docs themselves if there is no charter); the principles are **narrowed to
  what this diff can break**, with the packet naming which sections were withheld and on what test,
  because a reviewer cannot find a violation of a rule the change is incapable of breaking; and the
  **mechanical checks run first** — the repo's doc checks, `scripts/check-coverage.js`,
  `scripts/find-orphans.js`, the raw-literal command the token doc records — with their output in
  the packet and those dimensions marked settled.
- **The tier is measured, never chosen** — `scripts/review-tier.js` sets it inside the packet, and
  full when unsure:
  - **script-only** — a stage whose diff **cannot change reachable production behaviour** (docs,
    tests, formatting, a version string, a pure move) skips the reviewer entirely and closes on
    those scripts and the stage's own suite — but **reachability decides that, never appearance**:
    a deleted call site or a removed dependency is never in that band.
  - **light** — the light tier runs all three in one reviewer when the stage measures small and
    low-risk: one `alpha-sdlc:sdlc-reviewer` runs every dimension and re-runs the stage's own tests
    and the sabotage checks; then the `review-gaps.js` command the packet prints. No critic agent.
  - **full** — **three dimensions, one reviewer each** (`principles.md` → *Reviews run as parallel
    dimensions*): (a) profile and design system — checklist item 1; (b) principles and test
    quality — item 2, the one dimension that re-runs the stage's own tests and the sabotage checks;
    (c) plan/AC and the mechanical checks — item 3, on the settled coverage and orphan outputs, and
    for UI stages, **case completeness: every section case implemented, driven by its declared
    source/trigger, with none silently dropped**. The packet's file → dimension map gives every
    changed file an owner. When the reports come back, **before you fix anything, run the
    completeness critic**: `review-gaps.js` first, then `alpha-sdlc:sdlc-reviewer-critic` on the
    reports, the map, the diff stat and the gaps output — what no dimension actually looked at. Its
    findings join this round's.
- **Launch the round in the foreground, as `SKILL.md` step 5 says** — never two stages' reviews in
  one message; a reviewer left running in the background only adds polling, and in auto-run it
  ends the turn. Each writes `<packet stem>-<id>.md` (`-single.md` on the light tier); file the
  critic's as `<packet stem>-critic.md`. The packet carries your verification commands with their
  exit codes and summary lines, so no reviewer re-runs the whole suite.
- **Every finding is labeled measured or inferred.** Measured names the file and line, the command,
  test or grep that produced it, and **which copy was read** (committed `HEAD` or the working tree,
  and which files were already modified when the review started); **inferred is a question, not a
  defect.** The reviewer **leaves the working tree exactly as it found it.**
- **Verify before acting.** The author **verifies before acting** — open the cited file at the cited
  line before editing anything on a report's authority: a review that is wrong in one finding is not
  wrong in all of them, and acting on the wrong one costs a whole round.
- **Findings split by kind.** An **objective violation** → fix it in this stage and re-verify green
  (wrong layer · raw literal instead of a token · swallowed/missing error log · hand-written type
  where the generator exists · private query key for a shared entity · unregistered asset/component
  · missing profile-doc update · stray console.log · any comment at all beyond a machine directive —
  delete it and rename, and if the *why* can't live in a name put it in the commit message; only
  what the Org settings' comment allowlist permits stays). A **judgment or scope finding** → the
  **hard STOP** of `SKILL.md` step 5: an **Open Decision** for the user (`do-grooming`), **never
  fix-and-continue**. Anything deliberate survives only when it's **named and accepted** in the
  stage packet.
- **This step replaces the scattered self-checks** — conventions/error-handling, the token
  no-raw-literals check, and comment hygiene all run here, once, instead of three partial passes.
  **If a reviewer subagent can't run in this session, say so and run the same checklist inline as an
  explicit self-review** — the step is never skipped, and "looks fine" is not a review.
- **Close the stage on the findings' closing proofs** (`SKILL.md` step 5). **When a second round is
  owed** there, send the previous findings plus the change since that round, re-running only the
  dimensions that had findings: `review-packet.js … --round 2 --prev <packet stem>-merged.md
  --dimensions <ids that had findings>` (the change since round 1 comes from that round's
  snapshot). **Every round counts:** an objective-violation count flat or rising across three
  rounds is a STOP — escalate to the user with the trend instead of launching another round.
- **Carry the verdict into the stage packet** (step 8's *Conformance review* slot): which docs were
  checked, findings by kind, what you fixed, each finding's closing proof and its output, the
  needs-eyes count, the objective-violation count per round, what you're asking about.

## 7. Integrated smoke — boot both, hit it for real

- **Integrated smoke for full-stack stages — boot both, hit it for real.** With layer-split stages
  the seam is crossed **twice**, and both count: the **`data` stage** is where the real
  API/DB/3rd-party call lands (drive the real request — a data stage that passes on unit tests alone
  is exactly the hole this gate exists to close), and the **`presentation` stage** is where the real
  response renders (drive the screen against it). The stage's own **Crosses the FE↔BE seam** line
  decides this — read it, don't re-derive it; the plan settled it where the architecture was being
  thought about rather than here, where guessing safely means running the expensive thing. It reads
  `yes` when the stage adds, changes **or removes** a call the app really makes, or renders a real
  response. **Removal counts, and this is the case that gets missed:** deleting a call site looks
  mechanical, and a deletion whose path had **no test coverage** is proven by nothing at all — a
  `[data]` stage shipped exactly that way, dropping a live endpoint the plan had assumed was dead,
  on unit tests that all forced the other branch. An uncovered deleted path is a `yes` even when the
  plan's line says otherwise; say so at the checkpoint.
- When it is `yes`, a green unit test is not enough — after it's green, **boot the real backend +
  real frontend** per `docs/basics/09-environment.md`'s *Full-stack run recipe* (FE pointed at the
  running BE) and exercise the stage's actual request through the real HTTP stack **with relevant,
  domain-realistic data (never randomized/placeholder)**. It must show **zero unexpected 4xx/5xx
  (catches 405/route/method drift), zero client/browser console errors, and zero
  error-boundary/crash activations** — an error boundary hiding the crash behind a fallback that
  *looks* fine still fails.
- **On a mobile client the three signals translate rather than reduce** (the mapping and the
  collection rule are `do-testing`'s, under Boot & Smoke): the build under test is installed and
  foregrounded per `09-environment.md`'s *Mobile app under test*, a console error becomes an error
  or fatal line in the device log attributable to the app, and an error-boundary activation becomes
  a crash report.
- **Where `09-environment.md` names a driver, the smoke is written as a spec that framework runs** —
  it then leaves a video, screenshots and the accessibility tree in a report rather than only your
  word, and the next stage re-runs it for nothing (`principles.md` → *A recorded run outranks a
  watched one*). If both can't boot in-session, that is the **STOP** of `SKILL.md` step 7.
- **The smoke checks freshness, not just errors:** when the stage has a flow binding / touches
  shared entities, also **mutate in the source** (create/update via the owner's real flow) and
  confirm the consumer's view **updates per the TRD's decided freshness** — a smoke that never
  changes the owner's data passes while "the consumer's list isn't synchronized" ships. This catches
  the wiring/data-shape bug *at the stage that caused it*, not at the end. (The full feature-level
  version is `do-testing`'s Boot & Smoke gate.)

## 8. Present — the slots of the stage packet

The structured packet is the **Details (for engineers)** section of the step summary, slot by slot:

- **Plan summary** — what this stage set out to do (goal + the AC/tasks it covers), so they review
  against intent.
- **Test cases** — each test written, what behavior/AC it asserts, and its result (pass). Call out
  anything *not* covered by a test and why (e.g. UI fell back to a manual check).
- **Changes summary** — what actually changed, per file/module (and any drift from the plan), then
  the diff itself.
- **Conformance review** — who reviewed (reviewer subagent, or inline self-review + why), **which
  `docs/basics/` docs were checked** against this diff, and the findings **by kind**: objective
  violations *fixed* (each one, and the re-verify result) · judgment/scope findings **raised as Open
  Decisions** (with the question the user has to answer) · anything deliberate **named and
  accepted**. Include the comment check here — **zero comments added** (machine directives only,
  plus what the Org settings' comment allowlist permits), and where a comment was tempting, the
  **name/constant/function that replaced it** (or the commit message that now carries the *why*).
  "Clean" is a valid verdict — but say *what was checked* to earn it, never just "clean". Add the
  tier and the merged report's path.
- **Profile updates** — any `docs/basics/` doc this stage changed a recorded fact in (new endpoint →
  api-reference, migration → database, new env var → environment, new asset → asset-registry, new
  token / approved deviation → design-tokens, etc.), updated + re-stamped in the same change —
  the doc's one stamp line rewritten, what changed said here and in the commit, never logged in the
  doc. "None" if the stage touched nothing the profile tracks.
- **Section cases (UI stages)** — its gate is `SKILL.md` step 8; its shape is `client-ui.md` §5.
- **Visual parity (UI stages)** — what this slot reports (the final screenshot beside the design,
  the AI checklist + pixel-diff, iteration count, accepted platform deviations, full-scroll
  coverage, token findings) is in **`client-ui.md` §5 — read it now if you have not**; the static
  no-raw-literals result lives in *Conformance review*, not here. "n/a" for non-UI, or note if
  parity couldn't be rendered in-session.
- **Integrated smoke (full-stack stages)** — the real request driven through the booted stack, and
  the result: 4xx/5xx, console errors, error-boundary trips (all zero to pass). "n/a" for non-seam
  stages, or note if the stack couldn't be booted in-session.
- **Verification** — the green test + build result.

## 9. On approval — the commit and the session boundary

- **Commit every approved stage automatically.** A stage maps naturally to a commit/PR — the moment
  the user **approves** the stage, **commit its changes right away** with a conventional message (no
  offer, no asking; approval *is* the go-ahead). Commit only — don't push unless the user asks.
  Branch first if the project uses feature branches; if it commits straight to its working branch,
  commit there. Never commit an *unapproved* stage — the approval gate still stands; auto-commit
  fires only after it passes. **Commit the stage's own paths by name** — never `git add -A` or
  `commit -a`: another platform's session may be running in the same tree (per `principles.md` →
  *Parallel work*).
- **Then the session boundary** (`principles.md` → *The session is disposable — the files are the
  state.*) — only after the verdict, `Status: done <date>` and the commit; never mid-stage, between
  a review report and its fixes, or while a background agent runs:
  1. **Persist first.** Each checkpoint remark a later stage depends on becomes a dated
     `- **Carry-forward:** …` line in that stage's block — bookkeeping like `Status`, not an edit
     that stales its stamp; a remark that changes what that stage builds is plan drift instead
     (§0). A plan amendment is a plan edit (a *Moved in* line when an AC claim moved); every
     decision goes into its artifact. Nothing a later stage needs lives only in the chat.
  2. **Write the next-file** `.alpha-sdlc/next/<feature>--<platform>.json` in the session's working
     directory (the workspace parent when the session starts there): `skill`
     `alpha-sdlc:do-development`, `args` `<feature> <platform>`, `unit` the next stage, `"status":
     "ready"`, `at` (ISO time), `head` (commit SHA), `repo` (path), `handoff`.
  3. **Write the handoff** `.alpha-sdlc/handoff/<feature>--<platform>.md` when session-only facts
     exist — the running stack's PIDs and ports, the tooling consents the user gave.
  4. **Offer the fresh session in the Next paragraph**, worded as `SKILL.md` step 9 gives it.
- **After the last stage** the next-file names `alpha-sdlc:do-testing`.
