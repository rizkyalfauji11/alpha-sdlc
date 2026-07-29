---
name: do-regression-setup
description: Step 0 of the regression track — set up the stand-alone regression/QA test project and generate its QA profile (docs/qa-basics/). Fully independent of the application's repo and code: QA provides the inputs (PRD, condition docs, web link, APK/IPA, API docs, test accounts — each skippable now, addable later) and the AI learns the rest by exploring the built application itself. Use to set up the regression project, bootstrap the QA/testing profile, onboard a test repo, or before the first regression planning. Triggers on "regression setup", "set up the regression project", "QA project setup", "testing project setup", "/do-regression-setup".
---

You are setting up the **stand-alone regression test project** and generating its **QA profile**: the baseline reference every later regression skill (planning, authoring, running, triage) grounds in. Output goes to **`<test-project>/docs/qa-basics/`**. Run once to bootstrap; re-run in **refresh mode** to keep it current and to fold in inputs the user skipped earlier.

**First, read `../../principles.md` in full now, then apply it** — especially: ground in what's real (mark `UNKNOWN — needs input`, never guess), draft + human-approve, never over-simplify, describe-what-exists / establish-what's-missing / surface-contradictions.

## Stand-alone — no application repo, no application code

This project needs **zero access to the application's repository or source code**. Its subject is the **built application** — the deployed web URL, the installed APK/IPA — driven exactly as a user drives it. Everything the profile needs comes from two places:

1. **What the user provides** (the input inventory below — each item skippable), and
2. **What the AI learns by exploring the built app itself** — walking it screen by screen, reading its real locator attributes, observing its real flows.

Every recorded truth is tagged with its source — `provided: <input>` · `learned: exploration` · `confirmed by user` · `UNKNOWN — needs input`. Learned-not-confirmed truths are **flagged, never silently trusted**.

## Input inventory — ask for everything, everything skippable

At GATE 0, ask the user for each input. **Any item can be skipped now and added later** — a skip is recorded as a loud **GAP** in `01-overview.md` (with what it blocks), and refresh mode folds late inputs in. Never stall on a skip; never fake what a skip leaves unknown.

| Input | Feeds | If skipped |
|-------|-------|-----------|
| PRD/BRD or any product docs | intended behavior, features, conditions (04, 05, 10) | behavior learned from exploration only — marked unconfirmed |
| Existing test docs / test cases / known-issue lists | conditions, coverage seed (05, 10) | conditions derived from PRD + exploration only |
| Web URL(s) per environment | the artifact + envs (04, 05) | that platform untestable until provided |
| APK / IPA (or download location) | mobile artifact (04) | mobile untestable until provided |
| API docs (Swagger/OpenAPI URL or file) | API tests, typed client/fixtures (03, 04) | API layer tested via observed traffic only — weaker, flagged |
| Designs / Figma | visual assertions (10) | no visual-parity rows; functional only |
| Test accounts (roles + credential names/locations) | auth + condition users (05) | flows behind login blocked — usually the first gap to close |
| Seed / reset access (scripts, DB, admin API) | data isolation (05) | seeding falls back to driving the app's own UI/API — slower, flagged |
| Deploy/build notification (webhook, channel, or "ask each time") | run triggers (07) | runs are manual/scheduled only |

## Learn by exploration

With whatever inputs exist, **explore the built application systematically — every screen reachable, not a sample** (the QA counterpart of the full-project scan): map screens and navigation, record each screen's real **locator attributes** (`data-testid` in the DOM, `resource-id` via UiAutomator dump, `accessibilityIdentifier`), trace the user flows end to end, and note observed states (empty/error/loading), roles, and lifecycle behavior. Where exploration and a provided doc **contradict**, surface it — that's a finding, not a nuisance. Screens/areas that can't be reached (missing account, feature flag) are recorded as unexplored — loud, in the gaps list.

## Black-box boundary

The suite **never imports application code, never mocks the app, and requires no hooks inside it**. Its only contracts are the app's **public surfaces** (UI + API), the **locator attributes discovered on the built artifact**, and whatever **seed/reset access** the user provided. If a test seems to need app internals, that's a missing input to request (an ID, an account, seed access) — never a reason to break the boundary.

## Derive the condition-user catalog — enumerated, not brainstormed

"No missed test cases" is a **derivation**: the test users and condition states (`05-environments-and-data.md` → Test user catalog) are enumerated from the learned + provided truths — one row per condition, each tracing to its source:

| Condition source | Comes from |
|------------------|-----------|
| One user per **role** (incl. permission boundaries) | provided accounts + PRD + observed role behavior |
| Entities in **every observed lifecycle state** (draft/active/archived…) | PRD + exploration |
| **Dangling/on-delete cases** (rows whose parent was deleted/archived) | PRD rules + exploration of delete/archive flows |
| **Cross-feature positions** (source has data, consumer empty, …) | learned flow map (04) |
| **Flow/wizard states** (mid-draft, abandoned, resumed) | exploration of stepped flows |
| **Auth states** (fresh, expired, locked) | provided accounts + observed auth behavior |
| **Data extremes** (zero data / realistic max / longest content) | exploration + condition docs |

**Completeness check (setup + every refresh):** every known role, observed entity state, delete/archive rule, and auth state appears in ≥ 1 catalog row — a known condition with no user is a loud gap. Every user is a **seed guarantee** (recreated on reset via the provided seed access, or via scripted app flows if none) — never improvised state mid-test.

## Two modes of the *project* — same gates

- **Existing test project → describe.** Full scan, draft each doc from reality, flag contradictions.
- **No test project yet → establish.** Ask where the project lives, choose the stack with the user — **built-artifact drivers only** (web → browser against the URL, e.g. Playwright; mobile → installed APK/IPA via Appium/UiAutomator/Maestro — never in-process frameworks that need app source) — scaffold the minimal structure per the approved `02-test-architecture`.

## Rules

- **One doc at a time, with approval** — draft → present → approve/edit/skip → write → next. Never batch-write.
- **Tier** — generate only what applies; say what was skipped and why.
- **Never write secrets** — credential names/locations only.
- **Stamp each doc** with the test-project commit + the **app build/version explored** (so refresh knows when the app moved).
- **Full exploration — no sampling** when learning the app; unexplored areas are named, never implied covered.

## The docs (`<test-project>/docs/qa-basics/`)

Templates in this skill's `templates/` directory — read each, fill from the inputs + exploration.

| File | Contents |
|------|----------|
| `01-overview.md` | Summary, profile index + stamps, **input inventory state (provided / skipped-GAP)** |
| `02-test-architecture.md` | Layering, **full directory tree**, screen-object inventory (register-on-create), conventions |
| `03-test-stack.md` | Built-artifact drivers per platform, approved lib per concern, codegen (from provided API docs), run commands |
| `04-app-under-test.md` | **The learned model of the app**: platforms + artifact acquisition, screen/flow map, features, observed rules — each truth tagged with its source |
| `05-environments-and-data.md` | Target envs, provided accounts, **condition-user catalog (derived)**, seed/reset strategy, isolation |
| `06-selector-conventions.md` | Locator contract from **discovered attributes**; missing IDs → request from the dev team or flagged a11y fallback |
| `07-suites-and-runs.md` | Suite taxonomy, tags, run matrix (manual/scheduled/deploy-hook per what was provided) |
| `08-stability-policy.md` | No-sleep waits, retries, quarantine, determinism, runtime budget |
| `09-reporting-and-triage.md` | Artifacts, results, **triage loop → the app team** (their tracker; or `do-fixing`/`do-issue-grooming` if they use this plugin) |
| `10-regression-coverage-map.md` | Feature/flow (from the learned model) → test · suite · status; GAPs loud; register-on-create |

## Flow

> Present every gate in the shared **step-summary format** (`principles.md`).

1. **GATE 0 — input inventory.** Ask for every input in the table above (skip = recorded GAP). Confirm the test project's location + platforms in scope + applicable docs (tier).
2. **(Establish mode)** propose stack + minimal scaffold (built-artifact drivers only); approve; create.
3. **Explore & learn.** Systematically walk the built app with the provided access; build the screen/flow/locator/condition picture; surface contradictions with provided docs.
4. **Per doc, in order:** draft from inputs + exploration (tag every truth's source; `UNKNOWN` where nothing covers it) → present for approval → write with stamps → next. Seed `10-regression-coverage-map.md` from the learned feature/flow map — this is the **test-case enumeration**: every feature/flow × condition gets a row (covered · planned · **GAP**), which `do-regression-authoring` later drafts into case docs and generates into code.
5. **Finish.** `01-overview.md` as index with the input-inventory state; report what was generated, skipped, unexplored, and every gap.

## Refresh mode

Re-run when: the user provides a **previously-skipped input** (fold it in — e.g. Swagger arrives → typed client + API rows), the **app build moved** past the explored stamp (re-explore changed areas), or on a cadence. Reconcile `10-regression-coverage-map.md` against the current learned model (new screens/flows since last exploration = new rows), the condition catalog against newly-observed states/roles, and the screen-object inventory against the actual test code.
