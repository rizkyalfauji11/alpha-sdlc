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

| AC / behavior | Test type | Test case (what it asserts) | File | Status |
|---------------|-----------|-----------------------------|------|--------|
| <e.g. payment ≤ Rp1M succeeds> | API / integration | <asserts 200 + balance debited> | <path> | pass / fail / pending |
| <e.g. payment > Rp1M rejected> | API | <asserts 4xx + error code, no debit> | <path> | |
| <e.g. scan flow happy path> | UI | <widget tap → scanner → success screen> | <path> | |
| <e.g. offline state> | UI / integration | <shows offline banner, no crash> | <path> | |

## Coverage summary

- **AC covered:** <n of m>
- **Uncovered AC (gaps):** <list, or "none">
- **Manual-only (no automation possible):** <list + why, or "none">
- **Failing tests:** <list, or "none">
