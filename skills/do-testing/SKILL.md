---
name: do-testing
description: Write and run the feature-level tests for an implemented feature, per platform — API tests for backend, UI + integration tests for web/Android/iOS — all derived from the acceptance criteria, with AC→test coverage tracked. Use when the user wants to test a feature, write API/UI/integration/E2E tests, verify acceptance criteria, or do the testing phase. Triggers on "test the feature", "write API tests", "UI tests", "integration tests", "e2e tests", "/do-testing".
---

You are writing the **feature-level tests** for an implemented feature. This is the testing phase — broader than `do-development`'s per-stage unit TDD. The tests assert the **acceptance criteria** (carried from the TRD/tasks — the contract this whole pipeline has protected) and the **API contract** (hub TRD).

**Apply the shared principles in `../../principles.md`** — especially: tests derive from **testable AC**; **never over-simplify** (cover negative / error / edge / auth / offline cases, not just the happy path); ground in real code; reuse the project's existing test framework and fixtures (ladder rung 2 — don't introduce a new test stack); calibrate (don't test framework code or trivial getters — that's redundant with unit tests).

## Test type per platform

- **Backend → API testing.** Assert the hub's **API contract**: happy path, request/response schema conformance, status codes, auth/authorization, validation/error responses, idempotency for money flows, and boundary/edge inputs.
- **Web / Android / iOS → UI testing + integration testing.**
  - *UI*: key screens and user flows render and behave per the AC (states: loading / error / empty / offline). **Locate elements by their widget-spec Test IDs** (`docs/development/<feature-name>/widget-spec/<screen-name>.md`) — Android `resource-id` (`android:id` / Compose `testTag` exposed via `testTagsAsResourceId`), iOS `accessibilityIdentifier`, Web `data-testid` — not by brittle text or xpath. If an element you need isn't in the widget spec, flag it (dev should have specced it) rather than locating by text.
  - *Integration*: modules wired together + real API integration (against the contract), navigation, and persistence/offline behavior.
- Use each platform's existing framework — e.g. backend HTTP/contract tests; Web Playwright/Cypress + component tests; Android Espresso/Compose-UI + integration; iOS XCUITest + integration. **Detect what the repo already uses and reuse it.**

## Source & output

- **Inputs:** the implemented feature, the TRD (hub API contract + spoke AC — the primary source), the plan, and the tasks / Jira keys if the Jira phases were run.
- **Per platform.** Track coverage in `docs/development/<feature-name>/test-plan-<platform>.md` using `test-plan-template.md` — an **AC → test case → type → status** table so every AC is provably covered. This doc is the reviewable artifact; the test files are the deliverable.

## Flow

1. **Plan & confirm.** Read the AC + API contract + implemented code, detect the existing test framework/fixtures, and lay out the test plan per platform — every AC mapped to one or more test cases (happy + the negative/edge/error/auth/offline cases it implies). Summarize it for the user to confirm; flag any AC that's untestable as written (send back to grooming).
2. **Per test: write → approve → run.** Go one test at a time. **Write** the test case **and its step-by-step procedure** in the test-plan doc (Preconditions → numbered Steps → Expected, per the template) — so every test point documents *how* to test it, executable by a human QA and unambiguous for the automated test. **Present it for approval** (does it assert the right AC? are the steps right?), and only **after the user approves, run it** — then report the result honestly (show failures — never claim pass on red) and record its status. Then move to the next test. Do not batch-write a suite and run it all at once; the user approves each created test before it runs. (Offer "approve & run the rest" once they're satisfied, so a large suite isn't death-by-gates.)
3. **Coverage report.** Confirm every AC maps to at least one passing test; **flag any uncovered AC or failing test** explicitly — don't paper over gaps. Note what's manual-only where automated testing genuinely isn't possible.

When tests pass and AC is covered, report the result and the coverage doc; the feature is ready for the deployment phase.
