---
name: do-fixing
description: Fix the bugs found by do-testing — one at a time, root-cause not symptom, with a regression test that reproduces each bug first. Takes the triaged Bugs-found list, fixes only what the user approved, re-verifies, and updates status. Use when the user wants to fix bugs, address the test findings, resolve the bug report, or after do-testing surfaces bugs. Triggers on "fix the bugs", "fix the findings", "resolve the bug report", "/do-fixing".
---

You are **fixing bugs surfaced by `do-testing`** — the dedicated fixing phase (testing is
verify-only; fixing happens here). Work only the bugs the user **triaged to fix**; leave the rest.

**Read `../../rules/execute.md` in full now** (and `../../rules/ui.md` when the platform is web,
Android or iOS) — these are this skill's binding rules, generated from `principles.md`. After a
compaction, re-read it and the reference file of your current step before the next gate. If the
read is denied (headless runs), say so in the step report — rules never loaded cannot bind.
Especially: **fix the root cause, not the symptom** (grep every caller of the function you touch;
fix once where they route through, not per-call-site); ground in real code; never over-simplify;
TDD.

Every gate you present: header `<development> · <phase> · <step> · ✅/⏸/⚠️`, then Bottom line →
Why it matters → Options ★ → Context → Details (for engineers) → Next as the last paragraph (rules →
*Present every step bottom line first*).

## Gates

- **Start** — no *Bugs found* report and no issue-TRD → run `do-testing` first. A blank `Fix?
  (user)` → ask triage; work only the bugs triaged to fix, one at a time in severity order — never
  batch-fix.
- **2** — no fix before a failing test reproduces the bug (red).
- **Scope** — a fix that needs a new or changed endpoint or contract field, or code in another
  platform's repository, is a design gap: stop and route it to grooming.
- **4** — **STOP on any judgment/scope finding** — Open Decision to `do-grooming`, or
  `do-issue-grooming` for a project-wide class. Objective violations flat or rising over three
  rounds → STOP.
- **UI** — a section case the doc doesn't declare → Open Decision back to `do-grooming`, never
  authored here. Visual-bug tooling fails → stop, report + fix it; never skip the comparison.
- **5** — every failed re-verification adds 1 to `Attempts`; at 3 → STOP, Open Decision, no fourth
  attempt.
- **6** — ⏸ Present and STOP: approve / change / stop. Do not touch the next bug until they respond.
- **7** — only on approval: mark it fixed, commit by explicit path. The session boundary comes after
  the bug closes, never mid-bug.
- **After the last bug** — hand back to `do-testing` for the re-test.
- **Auto-run** — each ⏸ is a report stamped `auto`; only the five halting cases stop it.

## Flow — per bug

For each bug the user approved, in the report's order (severity first):

1. **Frame** — the bug, the AC it violates, its repro, and your root-cause hypothesis. Move its Jira
   ticket to In Progress (if tracked). On web, Android or iOS, read `ui-bugs.md` now (once per
   session, again after a compaction).
2. **Red** — write/confirm the failing test that reproduces it; run, confirm it fails for the right
   reason.
3. **Fix** — root-cause fix, minimal, climbing the ladder, and pay the open debt of the files it
   edits; run tests + build until green. Report
   honestly (no "fixed" on red).
4. **Conformance review (fresh eyes) — before re-verifying, before presenting.** Every fix is
   reviewed against the profile, the principles, and the bug report **before** re-verification and
   **before** it's presented — fresh eyes on the fix, never the fixer's, because the reasoning that
   produced a fix is the worst reasoning to audit it with. Log your verification commands with their
   exit codes under `.alpha-sdlc/` and run `node ../../scripts/review-packet.js
   docs/development/<feature-name> <platform> --bug <B#> --base <the commit this bug's work started
   from> --verify <log>` (another session's uncommitted paths: `--exclude <path>…`, which the packet
   header names; never a path this fix changed): one packet file — the fix diff, the bug row and its
   AC rows verbatim, the
   charter's currency, the rules this diff can violate, the maps, `find-orphans.js --diff` settled
   — never your diagnosis. On the issue-TRD path, which has no test plan, save the site's
   audit-table row (with its header) and the AC rows it names under `.alpha-sdlc/` and pass that
   file with `--settled`, so the packet carries the bug entry. Its first stdout lines give the
   packet path, the tier (`review-tier.js`, by measure), the reviewers and the settled exit codes.
   **Reviewers run in the foreground, the whole round in one message, at most 3 in flight**, each
   handed only the packet path and its dimension id; the checklist is `fix-reviewer.md`
   (`principles.md` → *Reviews run as parallel dimensions*):
   - **script-only** — no reviewer: close on the settled scripts and the bug's own tests.
   - **light** — one `alpha-sdlc:sdlc-reviewer` runs all three parts, re-running the regression
     test and the sabotage check; then the `review-gaps.js` command in the packet's *Reviewers*
     section.
   - **full** — one reviewer per part: (a) **fix quality** (root cause, not symptom · the regression
     test really reproduces it · right layer · siblings covered), item 1, on
     `alpha-sdlc:sdlc-reviewer-deep`, re-running the regression test and the sabotage check; (b)
     **scope discipline** (the fix, its test and its files' debt, nothing else), item 2; (c)
     **profile + principles conformance**, item 3.

   Record the file → dimension map, and when the reports come back, **before you fix anything, run
   the completeness critic** over the merged findings, that map and the diff. It is the
   `review-gaps.js` command, then on the full tier `alpha-sdlc:sdlc-reviewer-critic` on the
   reports, the map, the diff stat and the gaps output — all merged into `<packet stem>-merged.md`,
   the same file:line counted once. **Verify before acting** — open the cited file at the cited
   line before editing anything on a report's authority: a review that is wrong in one finding is
   not wrong in all of them, and acting on the wrong one costs a whole round.

   **Findings split by kind.** An **objective violation** → fix it as part of this bug's work and
   re-verify (symptom-level patch, wrong layer, raw literal instead of a token, local refetch hack
   instead of the sync convention, swallowed error, missing profile-doc update, any comment the fix
   added). A **judgment or scope finding** → **hard STOP**: scope beyond the bug, a fix that only
   works by changing decided behavior, or a bug that turns out to be a **design gap** goes back as
   an **Open Decision** (`do-grooming`); a **project-wide class** routes to `do-issue-grooming`.
   Never fix-and-continue on those — the whole reason fixing is a separate phase is that the user
   decides what gets touched. **(Auto-run: a judgment/scope finding auto-decides its ★ resolution —
   recorded — and the fix continues.)** **This step absorbs the comment check** (one review, not a
   scattered pass). **Close on the findings' closing proofs, not on another round** — run the
   command each finding named and put its output in the packet; **a second round is owed only** when
   something came back **needs-eyes**, a fix added product behaviour, or a named proof would not go
   green, per `principles.md` → *One round, closed by proof* — then re-run the packet with `--round
   2 --prev <merged findings> --dimensions <ids that had findings>`. Carry the verdict into the
   packet, with each finding's closing proof and output, the needs-eyes count, and the
   objective-violation count per round. **If a reviewer subagent can't run, say so and run the
   identical checklist inline** — the step is never skipped, and "fix looks right" is not a review.
5. **Re-verify** — re-run the bug's original failing check *and* the surrounding suite (no
   regressions). Visual bugs → re-run parity. **Boot & Smoke / integration bugs → re-boot the real
   stack and re-drive the journey** (not just an isolated test). **Shared-entity/contract/cache
   fixes → also re-run every consuming feature's flow-binding tests** (per the cross-feature impact
   rule). A failed re-verification adds 1 to the bug's `Attempts` at once (the audit row on the
   issue-TRD path) — the three-strikes count lives in the file.
6. **Present + ⏸ STOP** — in the step-summary format above, the bottom line saying what was fixed
   and what you need, with these **Details (for engineers)**: the root cause, the fix (diff), the
   now-passing regression test, the re-verify result, **Profile updates** (any `docs/basics/` doc
   this fix changed a recorded fact in, updated + re-stamped — or "None"), and the **Conformance
   review** — who reviewed (subagent, or inline + why), which docs were checked, and findings by
   kind: objective violations *fixed* · judgment/scope findings **raised** (Open Decision, or routed
   to `do-issue-grooming`) · the sibling call-sites confirmed covered · comments justified with no
   provenance. "Clean" is valid — say what was checked to earn it. The report's **last paragraph
   says what happens next** (`principles.md` → *Next*): the next bug, the re-test, or what the
   review left to fix or decide. Ask: approve / change / stop. Do not touch the next bug until they
   respond. **(Auto-run: nothing is asked — report, stamp `auto`, commit, next bug immediately.)**
7. **On approval** — mark the bug **fixed** in the test-plan *Bugs found* table, **commit the fix
   automatically** (conventional message; no push unless asked) **by explicit path**, never
   `git add -A` — a parallel session on another platform may share the tree (per `principles.md` →
   *Parallel work*) — continue or stop. The bug is closed: a session boundary (`principles.md` →
   *The session is disposable — the files are the state*) — write the next-file for the next
   triaged bug (and the handoff when the stack still runs or tooling consents were given); Next
   offers the fresh session (`/clear`, then 'lanjut').

## After the last bug

Report what was fixed, what was deferred, and any bug that turned out to be a design gap (now an
Open Decision) — built from the *Bugs found* table. Hand back to **`do-testing`** to re-run and
confirm the fixes hold and nothing regressed — the test → fix → re-test loop closes here; a phase
end, so write the next-file for that re-test and offer the fresh session. **(Auto-run: hand back in
the same turn, without stopping; when the chain reaches the marker's `until`, set
`.alpha-sdlc/auto-run.json`'s `status` to `done` before the final report.)** Once re-testing is
green, the feature's SDLC ends with the **profile reconcile** — run `do-project-setup` in refresh
mode so `docs/basics/` reflects everything built and fixed (see `do-testing`).

## Resume (fresh session)

The *Bugs found* table in `test-plan-<platform>.md` is the state — each bug's `Fix? (user)`,
`Attempts` and Status (on the issue-TRD path, its audit table).
1. Run `node ../../scripts/next-step.js docs/development/<feature-name> <platform> --phase fixing`
   first. Exit 0 → the next bug and what to re-read; exit 1 → a STOP applies (ask triage, three
   strikes): present it; exit 2 → an unknown format: read the files it lists, never guess. **On the
   issue-TRD path** (no test plan; `TRD.md` opens `# Issue TRD:`) skip it — the script has no
   fixing position there: read the hub's §2 audit table and §4 AC, and the next unit is the first
   site not fixed.
2. Read `.alpha-sdlc/next/<feature>--<platform>.json` and its handoff when present, set its
   `status` to `consumed`, and state the recorded understanding in one line.
3. Re-read what it lists, plus `ui-bugs.md` on a client, in one message. Uncommitted changes in
   the bug's own files are its work in progress — run its tests, never discard them. Never redo a
   `fixed` bug or re-ask a recorded triage; `Attempts` carries forward, never resets.

## Source

- The **Bugs found** table in `docs/development/<feature-name>/test-plan-<platform>.md` (from
  `do-testing`), and the user's triage (which bugs to fix / defer), recorded in its `Fix? (user)`
  column. If the report isn't there, run `do-testing` first.
- **Or an issue-TRD** (from `do-issue-grooming`, small-fix route): its numbered AC plus its audit
  sites — each affected site is a bug row, and its status is written back into the audit table. No
  test-plan is required on that path.
- The TRD (AC/design) + plan + the failing test(s) that exposed each bug.

## Rules

- **One bug at a time, with approval.** Never batch-fix. Fix a bug, present it, wait for approval,
  then the next. **In auto-run mode** (`principles.md` → *Auto-run mode*): still one bug at a time
  in severity order, but each presentation is a **report** (`Approved: auto <date>`), committed and
  continuing — then **hand back to `do-testing` automatically** after the last bug, looping the
  chain until re-test is green — questions along the way auto-decide their ★ recommendation
  (recorded); only failed mandatory tooling, physically missing inputs, an external write, a fix
  that has failed three times, or a change the hub would need halt it. The chain ends with one
  consolidated report + the profile-reconcile recommendation.
- **Reproduce first (regression test).** Before fixing, write/confirm a **failing test that
  reproduces the bug** (red) — derived from the AC it violates. Then fix until green. That test
  stays as a regression guard.
- **Root cause, not symptom.** Diagnose *why*; fix at the shared source so sibling call-sites are
  fixed too — not a patch on the one path the bug report named.
- **A fix that does not hold three times is the wrong fix.** Three attempts at the same bug that
  each fail re-verification means the design is wrong, not the patch — **STOP**, present the
  architectural question as an **Open Decision**, and do not attempt a fourth. Under auto-run this
  is a halting case: the chain loops until re-test is green, and nothing else terminates it.
- **Scope discipline.** Fix *only* the bug. The open debt of the files the fix edits is not added
  scope: it is paid with the fix, or kept by the user's decision (rules → *A change adds no debt*).
  No opportunistic refactors or added scope (that's the over-delivery trap). If the bug reveals a
  design gap, that's an **Open Decision → back to `do-grooming`**, not something you invent a fix
  for. **A fix that needs a new or changed endpoint
  or contract field, or code in another platform's repository, is a design gap by definition** —
  the hub and that platform's spoke are where it gets decided, and a route built from inside a fix
  has no spoke, no plan and no stage review behind it. Stop and route it to grooming; in auto-run it
  is the *change the hub would need* halting case. **A bug from `do-testing` is fixed HERE, by
  default — escalation to `do-issue-grooming` is the evidenced exception, and it never blocks the
  fix.** The routing test, in order:
  1. **Same-feature siblings** → fixed here at the shared source (the root-cause rule — always was).
  2. **Cross-feature class with ONE shared source** (a core helper, one contract, one convention
     every site routes through) → **still fixed here**: root-cause fixes it once and every feature
     heals — that's not an audit case, that's exactly what this skill is for.
  3. **Cross-feature class as N independent implementations** (no single point to fix once) → this
     alone earns `do-issue-grooming` — and only with **evidence, not suspicion**: you actually
     **found ≥1 confirmed sibling site in a different feature** (a quick grep, named file+line), not
     "the pattern likely lives elsewhere". Suspicion without a found site → **fix the bug now**,
     record the suspicion in the after-report **and as a `TD-<n>` row in
     `docs/basics/20-tech-debt-register.md` (kind: class-suspicion, ID from its Next ID)**, and let
     the user decide about an audit.
  Even when case 3 is confirmed: **fix the reported bug in this run anyway** (the feature's test →
  fix → re-test loop never waits behind a whole-project audit) and raise the class audit as a
  separate recommendation for the user.
- **Cross-feature impact — re-verify the consumers, not just the reporter.** When the fix touches a
  **shared entity, its owner's endpoint/contract, or cache wiring**, the blast radius is
  feature-level: run the **impact analysis** in `docs/basics/16-feature-map.md` (reverse dependency
  edges + `06-domain-model.md`'s *Consumed by*), list every consuming feature, and **re-run their
  flow-binding tests (create + destructive directions)** — a fix verified only against the reporting
  feature's journey is how "the fix in the owner quietly breaks a consumer" ships.
- **UI bugs** (web, Android, iOS) — missed section cases and visual, layout and style bugs follow
  `ui-bugs.md` (read at step 1): a case fixed at the case level from its declared source and crop,
  parity re-run and never skipped, a layout bug proven by `compare-geometry.js`, a style bug fixed
  at the token — never with a literal — and a sibling-screen repeat named as a class.
- **Boot & Smoke / integration bugs** (405, wrong data shape, localized object rendered raw, console
  error, error-boundary crash) — re-verify by **re-booting the real FE+BE stack and re-driving the
  journey with relevant, domain-realistic data**, not by an isolated unit test. The fix isn't
  confirmed until the real assembled app runs the journey clean (zero 4xx/5xx · console errors ·
  error-boundary trips). If the root cause is contract/shape drift, fix it at the source (correct
  the contract + regenerate the typed client / fixtures) so sibling fields don't reintroduce it. Two
  integrity classes get the same at-the-source treatment: a **freshness/staleness bug** ("consumer's
  list not synchronized") is fixed at the **sync-convention level** — the canonical query keys /
  mutation-invalidation / real-time map per `docs/basics/08-data-cache.md` — never a local refetch
  hack that patches one screen; a **dangling-reference/on-delete bug** is fixed at the **decided
  edge** (`06-domain-model.md` — DB constraint + consumer behavior together) and re-verified in the
  **destructive direction** (delete/archive in the owner → consumer behaves per the edge).
- **Jira** — if the bug's ticket is tracked, move it through the board (e.g. In Progress → Done/In
  Review) per the Atlassian MCP, only if Jira is used.
- **Keep the project profile current (`docs/basics/`).** A fix is a code change like any other — if
  it alters a fact a profile doc records, **update that doc in the same change and re-stamp its
  commit** — which doc, per the change → doc map in `principles.md` → *Keep the project profile
  current*; re-stamping rewrites the doc's one stamp line and never logs the fix in the doc. A
  changed contract shape also updates the machine-checkable contract spec. "If needed"
  is literal — only touch a doc when the fix changes a fact it tracks.
