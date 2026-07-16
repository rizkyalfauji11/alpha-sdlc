# Test Plan (<Platform>): <feature name>

| | |
|---|---|
| **Platform** | <Backend / Android / iOS / Web> |
| **Levels** | API · UI (visual + composition) · Integration (UI↔API) · System/E2E (risk-calibrated) |
| **Framework** | <existing framework reused — e.g. Playwright / Espresso / XCUITest / HTTP contract> |
| **TRD** | [hub](./TRD.md) · [spoke](./TRD-<platform>.md) |
| **Date** | <YYYY-MM-DD> |

> Every acceptance criterion maps to at least one test case, at the **right level** — placed once
> where it's cheapest and most stable (don't re-test the same thing across levels). Cover the
> negative / error / edge / auth / offline cases the AC implies — not just the happy path. Mark uncovered AC.
> **Level** = API · UI · Integration · E2E. Visual parity is a UI-level check (within platform tolerance).

## AC → test coverage

| ID | AC / behavior | Level | Test case (what it asserts) | File | Status |
|----|---------------|-------|-----------------------------|------|--------|
| TC1 | <e.g. payment > Rp1M rejected> | API | <asserts 4xx + error code, no debit> | <path> | pass / fail / pending |
| TC2 | <e.g. scan screen matches design> | UI (visual) | <icons/spacing/type parity within tolerance; diff saved> | <path> | |
| TC3 | <e.g. scan screen composition> | UI (composition) | <elements present, hierarchy, states> | <path> | |
| TC4 | <e.g. balance loads from API> | Integration | <real call renders; loading/error driven by response> | <path> | |
| TC5 | <e.g. end-to-end pay-at-merchant> | E2E | <full journey UI→API→DB, prod-like, auth + flag> | <path> | |

## Test procedures (step-by-step)

> One block per test point above (by ID) — how to execute it. Written so a human QA can
> run it by hand, and so the automated test's intent is unambiguous. Locate UI elements by
> their widget-spec Test IDs, not text.

### TC1 — <what it verifies>
- **AC:** <ref to the acceptance criterion>
- **Preconditions:** <state / data / auth / environment needed before starting>
- **Steps:**
  1. <action — e.g. tap `qris_widget_scan_button`>
  2. <action>
  3. <action>
- **Expected:** <the observable result that makes this pass>

### TC2 — <what it verifies>
- **AC:** <ref>
- **Preconditions:** <…>
- **Steps:**
  1. <…>
- **Expected:** <…>

<!-- one block per test ID; include the negative / edge / error / offline cases too -->

## Bugs found

> Every failure logged here first — **presented to the user before any fixing**. `do-testing`
> does not fix; confirmed fixes go to `do-fixing`. Severity: blocker / major / minor / trivial.

| # | Bug | Severity | Level | AC | Repro steps | Fix? (user) | Status |
|---|-----|----------|-------|----|-----------  |-------------|--------|
| B1 | <what's wrong> | major | UI (visual) | <AC ref> | <1. … 2. …> | yes / no / defer | open → (do-fixing) |

## Coverage summary

- **AC covered:** <n of m>
- **By level:** API <n> · UI <n> · Integration <n> · E2E <n>
- **E2E scope (risk-calibrated):** <which critical journeys got E2E, and why others didn't>
- **Uncovered AC (gaps):** <list, or "none">
- **Manual-only (env unavailable / no automation possible):** <list + why, or "none">
- **Failing tests (→ back to do-development):** <list, or "none">
