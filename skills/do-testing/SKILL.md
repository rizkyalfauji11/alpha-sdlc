---
name: do-testing
description: Write and run the feature-level tests for an implemented feature, per platform — API tests for backend, UI + integration tests for web/Android/iOS — all derived from the acceptance criteria, with AC→test coverage tracked. Use when the user wants to test a feature, write API/UI/integration/E2E tests, verify acceptance criteria, or do the testing phase. Triggers on "test the feature", "write API tests", "UI tests", "integration tests", "e2e tests", "/do-testing".
---

You are writing the **feature-level tests** for an implemented feature. This is the testing phase —
broader than `do-development`'s per-stage unit TDD. The tests assert the **acceptance criteria**
(carried from the TRD/tasks — the contract this whole pipeline has protected) and the **API
contract** (hub TRD).

**Read `../../rules/execute.md` in full now** (and `../../rules/ui.md` when the platform is web,
Android or iOS) — these are this skill's binding rules, generated from `principles.md`. After a
compaction, re-read it and the reference file of your current step before the next gate. If the
read is denied (headless runs), say so in the step report — rules never loaded cannot bind.
Especially: tests derive from **testable AC**; **never over-simplify** (cover negative / error /
edge / auth / offline cases, not just the happy path); ground in real code; reuse the project's
existing test framework and fixtures (ladder rung 2 — reuse: don't introduce a new test stack);
calibrate (don't test framework code or trivial getters — that's redundant with unit tests).

Every gate you present (plan, per-test approval, test review, coverage + bug report): header
`<development> · <phase> · <step> · ✅/⏸/⚠️`, then Bottom line → Why it matters → Options ★ →
Context → Details (for engineers) → Next as the last paragraph (rules → *Present every step bottom
line first*).

**Auto-run** (`principles.md` → *Auto-run mode* binds every line here): the plan, each test's
approval, the test review's verdict and the bug report become reports, and the environment and
tooling stand up without asking — only an actual failure halts. Each test is still written,
stamped `Approved: auto <date>` and run one at a time, never batched; every bug routes to
`do-fixing` in severity order (blockers first), in the same turn. Re-test green at the marker's
`until` → set `.alpha-sdlc/auto-run.json`'s `status` to `done` (an `until` of the profile reconcile
runs it first).

## Gates

- **1** — no *Full-stack run recipe* → STOP, `do-project-setup` first; an untestable AC → back to
  grooming. ⏸ STOP until the user confirms the plan (pyramid, critical journeys, environment);
  stamp `Plan approved`. Ask before standing anything up; record `Environment approved`.
- **2** — per test: write it with its procedure, ⏸ STOP for approval, stamp `Approved: <date>`,
  then run it. One test at a time — never "approve & run the rest".
- **UI** — render/screenshot tooling fails → STOP, report the issue + a concrete fix, and wait.
- **Boot & Smoke** — the stack can't boot → report the blocker + fix; the feature stays blocked,
  never manual.
- **3** — test review before the coverage report; a changed test re-enters step 2; a finding that
  questions an AC → Open Decision to grooming; objective violations flat or rising over three
  rounds → STOP.
- **4** — ⏸ STOP: present the bug report and let the user triage; fix nothing here. The session
  boundary comes only after the triage is recorded — never between tests.
- **Done** — only when `check-feature-done.js` exits 0; then the profile reconcile.
- **Auto-run** — each ⏸ is a report stamped `auto <date>`; only the five halting cases stop.

## Flow

1. **Plan & confirm.** Read the AC + API contract + implemented code, detect the existing test
   framework/fixtures, and lay out the test plan as a **pyramid** — map every AC to the **right
   level(s)** (API / UI / Integration / E2E), placing each check once where it's cheapest and most
   stable, and calibrating E2E to risk. **Read `boot-smoke.md` now, and on web, Android or iOS
   `ui-levels.md`** — once per session, again after a compaction. **Then take the feature's
   critical journeys from the hub's §3 *Feature flow* → *Critical journeys* (grooming decided them;
   don't re-invent them here — if that line is missing or vague, say so and get it decided rather
   than guessing what "critical" meant) **and drive exactly those in the mandatory Boot & Smoke
   level** and confirm the *Full-stack run recipe* exists in `docs/basics/09-environment.md` (if
   it's missing/incomplete, that's the first blocker to resolve — send to `do-project-setup`).
   Write `test-plan-<platform>.md` from `test-plan-template.md` and summarize it for the user to
   confirm; flag any AC that's untestable as written (send back to grooming), and **name any
   environment/tooling the levels will need — ask before standing it up**. ⏸ STOP. On approval
   stamp `Plan approved` with the date and the commit testing starts from; once the user approves
   the environment, record `Environment approved` with what and the date.
2. **Per test: write → approve → run.** Go one test at a time. **Write** the test case **and its
   step-by-step procedure** in the test-plan doc (Preconditions → numbered Steps → Expected, per the
   template) — so every test point documents *how* to test it, executable by a human QA and
   unambiguous for the automated test. **Present it for approval** (does it assert the right AC? are
   the steps right?), and only **after the user approves — record the test's `Approved: <date>` in
   its procedure block — run it** — then report the result honestly (show failures — never claim
   pass on red) and record its status. Then move to the next test. Do not batch-write a suite and
   run it all at once; the user approves each created test before it runs — one test at a time,
   never "approve & run the rest".
3. **Test review (fresh eyes) — before the coverage report.** The tests are the proof the feature
   is done, and their author is the worst judge of whether they prove it. Log the suite's run under
   `.alpha-sdlc/` and build the packet: `node ../../scripts/review-packet.js
   docs/development/<feature-name> <platform> --kind tests --base <the commit in Plan approved, else
   the last one before the tests> --verify <log> [--report <junit.xml|playwright.json>]`. Tests in
   another repository add its packet to the round (`--repo <it> --base <its commit in Plan
   approved>`) for the same reviewers, whose reports feed its `review-gaps.js` too; only the packet
   without `--repo` settles coverage. The packet — never your testing reasoning — runs
   `check-coverage.js --test-plan` first, marked settled: every register AC has a row, every test
   file and name a row cites exists and, with `--report`, every recorded status matches the run.
   The right level, each manual level's reason and whether a test asserts its AC stay with
   dimension (a). The checklist:
   1. **AC fidelity** — each test asserts the behavior of the AC it claims, not a symptom string or
      a bare status code: remove that behavior and the test fails.
   2. **Coverage honesty** — every AC in the register is claimed by at least one test at the right
      level, no AC is covered only by a test that doesn't assert it, and every level marked manual
      says why.
   3. **No test theater** — no assertion that cannot fail, no mock of the unit under test, no
      Integration/E2E test that mocks the API it exists to exercise, no test of a trivial getter.
   4. **Not over-simplified** — the negative, edge, auth and empty/error cases the AC needs are
      there.
   5. **Recorded = real** — each status in the test-plan matches an actual run (the reviewer re-runs
      what it doubts); UI tests locate by widget-spec Test IDs, never brittle text or xpath.

   Two dimensions, one reviewer each (`principles.md` → *Reviews run as parallel dimensions*): (a)
   items 1, 2 and 5 — what the tests prove, against the AC register and the recorded results, with
   `check-coverage.js`; (b) items 3 and 4 — test theater and over-simplification, re-running the
   tests it judges and the sabotage checks. Both run on `alpha-sdlc:sdlc-reviewer`; the test review
   is never tiered. **Launch both in one message, in the foreground**, each handed only the packet
   path and its dimension id; the packet carries the run output, so neither re-runs the whole
   suite. Record the file → dimension map, and **before you fix anything, run the completeness
   critic** over the merged findings, that map and the diff — for a test review it is the one that
   catches a changed test file no dimension opened: the `review-gaps.js` command in the packet's
   *Reviewers* section, then `alpha-sdlc:sdlc-reviewer-critic`; both go into the merged report.

   Fix every objective violation in the tests — a changed test goes back through step 2 (re-approve,
   re-run) — and **close on the findings' closing proofs rather than another round**: here the proof
   is almost always the test itself run and recorded, so a second round is owed only on a
   **needs-eyes** finding or a proof that would not go green (`principles.md` → *One round, closed
   by proof*). A finding that questions the AC itself is not a testing fix — it goes back to
   grooming as an **Open Decision**. The review never fixes product code: a test that fails for a
   real bug is a bug for the report, not a finding. No subagent available → identical checklist
   inline, and say so. When the review closes, fill the plan's `Test review` row: `reviewed <date>
   · rounds <n> · <verdict>`.
4. **Coverage + bug report.** Confirm every AC maps to at least one passing test at the right level;
   show the **pyramid coverage** (API / UI / Integration / E2E) **and the Boot & Smoke result** (the
   critical journeys run against the real assembled app, with 4xx/5xx · console errors ·
   error-boundary trips all zero). **Flag any uncovered AC or level 1–4 marked manual** explicitly.
   **Boot & Smoke is not reportable as manual** — if it hasn't actually run, the feature is blocked,
   not covered (say so with the blocker + fix). Then present the **consolidated *Bugs found*
   report** — every bug with severity · level · repro · AC — and let the user triage. ⏸ STOP.
   **Fix nothing here**; confirmed fixes hand off to **`do-fixing`**. Record each answer in the
   bug's `Fix? (user)` cell as it comes — `yes`, `no` or `defer`, then the date (auto-run: `auto
   <date>`); a `no` or `defer` also sets its Status to `won't fix` or `deferred`. Triage recorded,
   the phase ends at a session boundary (`principles.md` → *The session is disposable — the files
   are the state*): write the next-file for `alpha-sdlc:do-fixing` at the first bug to fix, and the
   handoff file when the stack still runs or tooling consents were given; Next offers the fresh
   session (`/clear`, then 'lanjut').

When there are no bugs, every AC is covered, **and Boot & Smoke has actually passed against the real
assembled app**, report the result and the coverage doc; the feature is ready for the deployment
phase. **Confirm it mechanically first:** `node ../../scripts/check-feature-done.js
docs/development/<feature-name> <platform>` must exit 0 — it reads the test plan's Boot & Smoke and
AC-covered lines and every bug's status, so a blocked journey or a fix not re-verified cannot be
called done. **Then reconcile the profile — run `do-project-setup` in refresh mode** so
`docs/basics/` reflects what was built (each change to its doc, per the change → doc map in
`principles.md` → *Keep the project profile current*) before the next feature grooms against it — a
phase end: write the next-file for that reconcile and offer the fresh session. When there are
bugs, hand the triaged list to `do-fixing` — **always `do-fixing`, never `do-issue-grooming`
directly**: a testing bug is in-pipeline work, and any class escalation happens from inside
`do-fixing` only with found cross-feature evidence (and never instead of the fix). Do the profile
reconcile after the fixes land and re-testing is green.

## Resume (fresh session)

`test-plan-<platform>.md` is the state: `Plan approved`, `Environment approved`, each test's
`Approved` stamp and status, the `Test review` row, the *Bugs found* table with its triage.
1. Run `node ../../scripts/next-step.js docs/development/<feature-name> <platform> --phase testing`
   first. Exit 0 → it names the next unit and what to re-read; exit 1 → a STOP applies: present it;
   exit 2 → an older or unknown format: read the files it lists, never guess the position.
2. Read `.alpha-sdlc/next/<feature>--<platform>.json` and its handoff when present, set its
   `status` to `consumed`, and state the recorded understanding in one line.
3. Re-read what it lists, plus `boot-smoke.md` (and `ui-levels.md` on a client), in one message.
   Never re-run step 1 when `Plan approved` is stamped, never redo a test whose status is recorded
   (the re-test after `do-fixing` re-runs the suite on purpose), never re-ask a recorded triage.

## Test levels — every AC covered once, at the cheapest reliable level

Unit-level is already done by `do-development`'s per-stage TDD. `do-testing` owns the upper levels.
**Each level tests what lower levels can't — don't re-test the same thing at multiple levels**
(redundant coverage is slower and flakier, not safer). Cover every AC, but place each check at the
level where it's cheapest and most stable.

1. **API** *(backend)* — the hub **API contract** in isolation: happy path, request/response schema,
   status codes, auth/authorization, validation/error responses, idempotency for money flows,
   boundary/edge inputs.
2. **UI** *(clients — appearance + composition)* — `ui-levels.md` → *The UI level*.
3. **Integration** *(UI ↔ API alignment)* — real API calls: data renders, actions hit the right
   endpoints, loading/error states driven by real responses, **contract fields consumed correctly**
   (no field-name/type drift), navigation, persistence/offline.
4. **System / E2E** *(production-readiness)* — full user journeys across UI→API→DB in a prod-like
   env: auth, permissions, feature flags, cross-service, perf/security basics, offline/recovery.
   **Calibrate to risk** — the *critical* journeys + key failure modes (a payment flow earns full
   E2E; a tooltip doesn't), not every permutation.
5. **Boot & Smoke (integrated) — MANDATORY, non-skippable — but it REDUCES, it never skips.** On a
   **foundation TRD** it reduces to: the harness commands run, the structure and dependency
   assertions hold, the app boots, and its entry point answers. On a platform set with **no client**
   it reduces to: the real service booted and its critical journeys driven through the real HTTP
   stack. On a **mobile client** (Android or iOS) it does not reduce — it **translates**
   (`ui-levels.md` → *Boot & Smoke on a mobile client*). Name which reduction applied in the
   verdict — an unnamed reduction reads as a skip. Otherwise it runs in full, as `boot-smoke.md`
   specifies: the real frontend and backend booted together the way the user runs the app, the
   critical journeys driven through the real HTTP stack with domain-realistic data and real auth,
   failing on any unexpected 4xx/5xx, console error, failed network request or error-boundary
   trip, the runtime requests reconciled against the contract, and the cross-feature and
   flow-dependency journeys in both directions. This level owns the FE↔BE **seam**; unlike levels
   1–4 it **cannot be marked manual or skipped for the feature's critical path** (the hard gate
   below).

Use each platform's existing framework (detect + reuse — ladder rung 2, reuse): backend
HTTP/contract; Web Playwright/Cypress + component; Android Espresso/Compose-UI; iOS XCUITest — and
for a journey driven across both mobile platforms, the single-API driver `09-environment.md`
records, rather than writing the same journey twice per platform. UI tooling is in `ui-levels.md`.

**Verify-only — collect all bugs, report before any fixing.** `do-testing` **never fixes**. Every
failure (a broken assertion, a parity miss, an integration/E2E failure) is logged as a **bug** in
the test-plan's *Bugs found* section (severity · level · repro · which AC). Run the suite, gather
**all** bugs, then **present the consolidated bug report to the user first** — do not start fixing
anything. The user triages what to fix; confirmed fixes go to **`do-fixing`** (the dedicated fixing
skill), not done here.

**Visual comparison is mandatory — never skip.** If the render/screenshot tooling fails at the UI
level, **STOP, report the issue + a concrete fix, and wait** (same as `do-development`). Complete
the comparison via a fixed tool or a user manual compare — never skip or continue past it, never
mark UI parity passed unverified.

**Environment:** integration and E2E need a prod-like environment in-session (services up, test
data, maybe a device/emulator). Tell the user what's needed and **ask before standing anything up**;
if it can't be stood up, mark **those levels (1–4)** manual and say so — never fake a pass.

**Boot & Smoke is the exception — it is a hard gate, not a manual-able level.** The feature is **not
"done" until the real assembled app boots and its critical journeys pass** the Boot & Smoke checks
(zero unexpected 4xx/5xx, zero console errors, zero error-boundary trips). If the stack genuinely
can't be booted in-session (missing/incomplete run recipe, env truly unavailable), **do not mark it
manual and move on** — report the exact blocker + concrete fix (complete the run recipe, install the
driver, boot the device, point at a shared dev/staging environment) and **leave the feature blocked,
not done**, until the integrated boot actually runs. Fix the blocker or the feature stays blocked —
never claim done on isolated levels alone. (The one narrow allowance: if the run recipe is missing,
the fix is to fill it in `do-project-setup` — that's the blocker to resolve, not a reason to skip.)

## Source & output

- **Platforms can be tested in parallel sessions** — each owns its `test-plan-<platform>.md`; only
  one session boots the full stack at a time, and Boot & Smoke drives the running stack rather than
  starting a second one (per `principles.md` → *Parallel work*).
- **Inputs:** the implemented feature, the TRD (hub API contract + spoke AC — the primary source),
  the plan, and the tasks / Jira keys if the Jira phases were run — all on disk.
- **Test code is code — zero comments, names carry the case.** The same rules bind here as anywhere
  (`principles.md`): no comments in test files (hook-blocked), and the **test name states the case
  it proves** — `showsEmptyStateWhenListIsEmpty`, `hidesPrimaryActionWhenOffline`, ideally naming
  the section case ID it covers — so a failing test report reads as a list of broken behaviors, not
  `test_3`. Fixtures follow the same discipline: named, contract-derived, domain-realistic (never
  randomized/placeholder).
- **Per platform.** Track coverage in `docs/development/<feature-name>/test-plan-<platform>.md`
  using `test-plan-template.md` — an **AC → test case → level → status** table (level = API / UI /
  Integration / E2E) so every AC is provably covered *and you can see at which level*. This doc is
  the reviewable artifact; the test files are the deliverable.
