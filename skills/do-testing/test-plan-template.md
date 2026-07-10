# Test Plan (<Platform>): <feature name>

| | |
|---|---|
| **Platform** | <Backend / Android / iOS / Web> |
| **Test types** | <Backend: API · Web/Android/iOS: UI + integration> |
| **Framework** | <existing framework reused — e.g. Playwright / Espresso / XCUITest / HTTP contract> |
| **TRD** | [hub](./TRD.md) · [spoke](./TRD-<platform>.md) |
| **Date** | <YYYY-MM-DD> |

> Every acceptance criterion maps to at least one test case. Cover the negative / error /
> edge / auth / offline cases the AC implies — not just the happy path. Mark uncovered AC.

## AC → test coverage

| ID | AC / behavior | Test type | Test case (what it asserts) | File | Status |
|----|---------------|-----------|-----------------------------|------|--------|
| TC1 | <e.g. payment ≤ Rp1M succeeds> | API / integration | <asserts 200 + balance debited> | <path> | pass / fail / pending |
| TC2 | <e.g. payment > Rp1M rejected> | API | <asserts 4xx + error code, no debit> | <path> | |
| TC3 | <e.g. scan flow happy path> | UI | <widget tap → scanner → success screen> | <path> | |
| TC4 | <e.g. offline state> | UI / integration | <shows offline banner, no crash> | <path> | |

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

## Coverage summary

- **AC covered:** <n of m>
- **Uncovered AC (gaps):** <list, or "none">
- **Manual-only (no automation possible):** <list + why, or "none">
- **Failing tests:** <list, or "none">
