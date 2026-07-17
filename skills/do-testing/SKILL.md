---
name: do-testing
description: Write and run the feature-level tests for an implemented feature, per platform — API tests for backend, UI + integration tests for web/Android/iOS — all derived from the acceptance criteria, with AC→test coverage tracked. Use when the user wants to test a feature, write API/UI/integration/E2E tests, verify acceptance criteria, or do the testing phase. Triggers on "test the feature", "write API tests", "UI tests", "integration tests", "e2e tests", "/do-testing".
---

You are writing the **feature-level tests** for an implemented feature. This is the testing phase — broader than `do-development`'s per-stage unit TDD. The tests assert the **acceptance criteria** (carried from the TRD/tasks — the contract this whole pipeline has protected) and the **API contract** (hub TRD).

**First, read `../../principles.md` in full now, then apply it** — especially: tests derive from **testable AC**; **never over-simplify** (cover negative / error / edge / auth / offline cases, not just the happy path); ground in real code; reuse the project's existing test framework and fixtures (ladder rung 2 — don't introduce a new test stack); calibrate (don't test framework code or trivial getters — that's redundant with unit tests).

## Test levels — every AC covered once, at the cheapest reliable level

Unit-level is already done by `do-development`'s per-stage TDD. `do-testing` owns the upper levels. **Each level tests what lower levels can't — don't re-test the same thing at multiple levels** (redundant coverage is slower and flakier, not safer). Cover every AC, but place each check at the level where it's cheapest and most stable.

1. **API** *(backend)* — the hub **API contract** in isolation: happy path, request/response schema, status codes, auth/authorization, validation/error responses, idempotency for money flows, boundary/edge inputs.
2. **UI** *(clients — appearance + composition)*. Locate elements by their **widget-spec Test IDs** (`docs/development/<feature-name>/widget-spec/<screen-name>.md`) — Android `resource-id` (`android:id` / Compose `testTag` via `testTagsAsResourceId`), iOS `accessibilityIdentifier`, Web `data-testid` — never brittle text/xpath; if an element isn't specced, flag it.
   - **Visual parity** vs the design (`design/<screen>.png` / Figma) — icons, colors, spacing, typography — AI checklist + pixel-diff, **within platform-best-practice tolerance** (not literal pixel-identical; flag intentional platform deviations). Save actual + diff to `design/compared-ui/`.
   - **View composition** — element presence, hierarchy, arrangement, layout.
   - **States** — loading / error / empty / offline; theming; a11y labels.
   - **Content-fit** — variable-content containers (dialog / sheet / list / form / multi-line text) must **fit content or scroll, never clip**. Test at extremes: longest content, largest dynamic-type/font, smallest supported screen. (This is the "dialog doesn't cover its content" class of bug.)
3. **Integration** *(UI ↔ API alignment)* — real API calls: data renders, actions hit the right endpoints, loading/error states driven by real responses, **contract fields consumed correctly** (no field-name/type drift), navigation, persistence/offline.
4. **System / E2E** *(production-readiness)* — full user journeys across UI→API→DB in a prod-like env: auth, permissions, feature flags, cross-service, perf/security basics, offline/recovery. **Calibrate to risk** — the *critical* journeys + key failure modes (a payment flow earns full E2E; a tooltip doesn't), not every permutation.

Use each platform's existing framework (detect + reuse — ladder rung 2): backend HTTP/contract; Web Playwright/Cypress + component; Android Espresso/Compose-UI; iOS XCUITest; render/screenshot + pixel-diff tooling for visual parity.

**Verify-only — collect all bugs, report before any fixing.** `do-testing` **never fixes**. Every failure (a broken assertion, a parity miss, an integration/E2E failure) is logged as a **bug** in the test-plan's *Bugs found* section (severity · level · repro · which AC). Run the suite, gather **all** bugs, then **present the consolidated bug report to the user first** — do not start fixing anything. The user triages what to fix; confirmed fixes go to **`do-fixing`** (the dedicated fixing skill), not done here.

**Visual comparison is mandatory — never skip.** If the render/screenshot tooling fails at the UI level, **STOP, report the issue + a concrete fix, and wait** (same as `do-development`). Complete the comparison via a fixed tool or a user manual compare — never skip or continue past it, never mark UI parity passed unverified.

**Environment:** integration and E2E need a prod-like environment in-session (services up, test data, maybe a device/emulator). Tell the user what's needed and **ask before standing anything up**; if it can't be stood up, mark those levels **manual** and say so — never fake a pass.

## Source & output

- **Inputs:** the implemented feature, the TRD (hub API contract + spoke AC — the primary source), the plan, and the tasks / Jira keys if the Jira phases were run.
- **Per platform.** Track coverage in `docs/development/<feature-name>/test-plan-<platform>.md` using `test-plan-template.md` — an **AC → test case → level → status** table (level = API / UI / Integration / E2E) so every AC is provably covered *and you can see at which level*. This doc is the reviewable artifact; the test files are the deliverable.

## Flow

1. **Plan & confirm.** Read the AC + API contract + implemented code, detect the existing test framework/fixtures, and lay out the test plan as a **pyramid** — map every AC to the **right level(s)** (API / UI / Integration / E2E), placing each check once where it's cheapest and most stable, and calibrating E2E to risk. Summarize it for the user to confirm; flag any AC that's untestable as written (send back to grooming), and **name any environment/tooling integration or E2E will need — ask before standing it up**.
2. **Per test: write → approve → run.** Go one test at a time. **Write** the test case **and its step-by-step procedure** in the test-plan doc (Preconditions → numbered Steps → Expected, per the template) — so every test point documents *how* to test it, executable by a human QA and unambiguous for the automated test. **Present it for approval** (does it assert the right AC? are the steps right?), and only **after the user approves, run it** — then report the result honestly (show failures — never claim pass on red) and record its status. Then move to the next test. Do not batch-write a suite and run it all at once; the user approves each created test before it runs — one test at a time, never "approve & run the rest".
3. **Coverage + bug report.** Confirm every AC maps to at least one passing test at the right level; show the **pyramid coverage** (API / UI / Integration / E2E). **Flag any uncovered AC or level marked manual** (e.g. env unavailable) explicitly. Then present the **consolidated *Bugs found* report** — every bug with severity · level · repro · AC — and let the user triage. **Fix nothing here**; confirmed fixes hand off to **`do-fixing`**.

When there are no bugs and every AC is covered, report the result and the coverage doc; the feature is ready for the deployment phase. When there are bugs, hand the triaged list to `do-fixing`.
