# Test Plan (<Platform>): <feature name>

| | |
|---|---|
| **Platform** | <Backend / Android / iOS / Web> |
| **Levels** | API · UI (visual + composition) · Integration (UI↔API) · System/E2E (risk-calibrated) · **Boot & Smoke (integrated — mandatory, non-skippable)** |
| **Framework** | <existing framework reused — e.g. Playwright / Espresso / XCUITest / the mobile driver in `09-environment.md` / HTTP contract> |
| **TRD** | [hub](./TRD.md) · [spoke](./TRD-<platform>.md) |
| **Plan approved** | <YYYY-MM-DD — the pyramid/plan gate> · base <commit testing started from — the test review diffs from it; one per repository when tests live in more than one, e.g. `a1b2c3d` · `../web` `e4f5a6b`> |
| **Environment approved** | <what may be stood up — services, test data, device/emulator, tooling> <YYYY-MM-DD> |
| **Test review** | <reviewed YYYY-MM-DD · rounds n · verdict — filled when step 3 closes> |
| **Date** | <YYYY-MM-DD> |

> Every acceptance criterion maps to at least one test case, at the **right level** — placed once
> where it's cheapest and most stable (don't re-test the same thing across levels). Cover the
> negative / error / edge / auth / offline cases the AC implies — not just the happy path. Mark
> uncovered AC.
> **Level** = API · UI · Integration · E2E. Visual parity is a UI-level check (within platform
> tolerance);
> **token/style conformance is a separate UI check** — a wrong token is a bug even inside pixel
> tolerance.
> **ID** is the test's ID (`TC1`…); **File** names the test file and the test name in code spans
> (`` `tests/api/payment.spec.ts` · `rejectsPaymentOverLimit` ``), so
> `check-coverage.js --test-plan` can check that both exist and that each Status matches the run.
> File paths are relative to this repository's root; a test in a sibling repository — a journey
> written in the client repo — is `../<repo>/<path>`.

## AC → test coverage

| ID | AC (the TRD's numbered AC ID + essence — the spoke's §8 registry on a hub/spoke feature; `A1`…`A6` on a foundation TRD) | Level | Test case (what it asserts) | File | Status |
|----|---------------|-------|-----------------------------|------|--------|
| TC1 | <e.g. payment > Rp1M rejected> | API | <asserts 4xx + error code, no debit> | <`test file` · `test name`> | pass / fail / pending |
| TC2 | <e.g. scan screen matches design> | UI (visual) | <icons/spacing/type parity within tolerance; diff saved> | <`test file` · `test name`> | |
| TC3 | <e.g. scan screen composition> | UI (composition) | <elements present, hierarchy, states> | <`test file` · `test name`> | |
| TC3b | <e.g. scan screen style conformance> | UI (tokens) | <no raw literals; computed font role/size/weight, divider thickness + inset, frame + card padding match `18-design-tokens.md` ↔ widget-spec *Style bindings*; agrees with sibling screens of the same scaffold> | <`test file` · `test name`> | |
| TC4 | <e.g. balance loads from API> | Integration | <real call renders; loading/error driven by response> | <`test file` · `test name`> | |
| TC5 | <e.g. end-to-end pay-at-merchant> | E2E | <full journey UI→API→DB, prod-like, auth + flag> | <`test file` · `test name`> | |

## Test procedures (step-by-step)

> One block per test point above (by ID) — how to execute it. Written so a human QA can
> run it by hand, and so the automated test's intent is unambiguous. Locate UI elements by
> their widget-spec Test IDs, not text.

### TC1 — <what it verifies>
- **Approved:** <YYYY-MM-DD — this test's write→approve gate, before it ran>
- **AC:** <the TRD's numbered AC ID + its essence, e.g. `AC-2 — archived parent shows
  "unavailable"`; `A1`…`A6` on a foundation TRD>
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

## Boot & Smoke (integrated) — mandatory

> The real frontend + real backend booted together (per `docs/basics/09-environment.md` →
> *Full-stack
> run recipe*), the **critical journeys named in the hub's §3 *Feature flow*** — driven through the
> real HTTP stack with
> **relevant, domain-realistic data (never randomized/placeholder)**. **Not markable manual** — if
> it
> didn't run, the feature is blocked, not done. A pass = every cell below is clean.

**Stack booted:** <BE cmd + ready-check · FE cmd + ready-check · FE→BE base URL used> — or the
blocker if it couldn't boot.

| Critical journey | 4xx/5xx (unexpected) | Console errors | Error-boundary / crash | Requests match contract/routes | Result |
|------------------|----------------------|----------------|------------------------|--------------------------------|--------|
| <e.g. open Menu Categories, load list, edit one> | none | none | none | yes | pass / fail |

<Any failure here is logged as a bug below (level = Boot & Smoke).>

## Bugs found

> Every failure logged here first — **presented to the user before any fixing**. `do-testing`
> does not fix; confirmed fixes go to `do-fixing`. Severity: blocker / major / minor / trivial.
> **Fix? (user)** records the triage as it is given: `yes`, `no` or `defer`, then the date
> (`auto <date>` under auto-run); `no` / `defer` set Status to `won't fix` / `deferred`.
> **Attempts** starts at 0; `do-fixing` adds 1 on every failed re-verification and stops at 3
> (three strikes). Status stays the last column — `check-feature-done.js` reads it.

| # | Bug | Severity | Level | AC | Repro steps | Fix? (user) | Attempts | Status |
|---|-----|----------|-------|----|-------------|-------------|----------|--------|
| B1 | <what's wrong> | major | UI (visual) | <AC ref> | <1. … 2. …> | <yes / no / defer> <YYYY-MM-DD> | 0 | open → (do-fixing) |

## Coverage summary

- **AC covered:** <n of m>
- **By level:** API <n> · UI <n> · Integration <n> · E2E <n>
- **Boot & Smoke (integrated):** <pass / FAILED / blocked — with blocker> — *mandatory; feature is
  not done until this passes*
- **Flow dependencies:** <each binding from the hub's Flow-dependencies sub-table → its data-flow
  test in **both directions** (create: appears per decided freshness · destructive: on-delete edge
  honored) · status, or "none"> — *each binding must have both*
- **Integrity coverage (per consumed entity):** <entity → visibility ✓ (allowed states only) ·
  on-delete ✓ (no dangling ref/crash) · freshness ✓ (decided mechanism) — or "none consumed">
- **Stepped flows:** <each Multi-step flow → its wizard test set (per-step validation · back/resume
  · cross-step refetch · abort-clean · atomic commit) · status, or "none">
- **Section cases (client UI):** <every case ID from each screen's `section-slicing/<screen>.md` →
  its test → status (e.g. `body.summary/C1–C4` ✓ · `ftr.actions/C5` ✓ · interaction `X1` ✓).
  Per-screen case totals are the plan's *Screen stage map*; an unasserted case is a coverage gap,
  not a pass. "none — no section-slicing doc" if not applicable.>
- **Style conformance (client UI):** <static no-raw-literals: pass/fail (+ literals found) ·
  computed-style assertions: which ran per platform (web strongest; note weaker Android/iOS coverage
  honestly) · screenshot baseline: tool or "none in repo" · cross-screen consistency vs sibling
  screens · unregistered deviations found → bugs>

- **E2E scope (risk-calibrated):** <which critical journeys got E2E, and why others didn't>
- **Uncovered AC (gaps):** <list, or "none">
- **Manual-only (env unavailable / no automation possible):** <list + why, or "none">
- **Failing tests (→ bugs, see the Bugs-found table below):** <list, or "none">
