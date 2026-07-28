---
name: do-regression-setup
description: Step 0 of the regression track — set up the dedicated regression/QA test project (a separate directory/repo from the application) and generate its QA profile (docs/qa-basics/, the QA counterpart of docs/basics/) that every later regression skill grounds in. Describes an existing test project or establishes a new one (framework choice, scaffold) with the user. Use to set up the regression project, bootstrap the QA/testing profile, onboard a test repo, or before the first regression planning. Triggers on "regression setup", "set up the regression project", "QA project setup", "testing project setup", "/do-regression-setup".
---

You are setting up the **regression test project** — a **separate directory/repo from the application** — and generating its **QA profile**: the baseline reference every later regression skill (planning, authoring, running, triage) grounds in, exactly as `docs/basics/` grounds the SDLC skills. Output goes to **`<test-project>/docs/qa-basics/`** (the profile lives with the suite it describes). Run once to bootstrap; re-run in **refresh/reconcile mode** to keep it current.

**First, read `../../principles.md` in full now, then apply it** — especially: ground in real code (mark `UNKNOWN — needs human input`, never guess), draft + human-approve, never over-simplify, and the codebase-state-agnostic rule (describe what exists · establish what's missing · surface contradictions).

**Read the application's profile first** (`<app-repo>/docs/basics/` from `do-project-setup`) — the QA profile **bridges to it, never re-declares it**: the app's `06-domain-model.md`, `16-feature-map.md`, `15-api-reference.md` (machine-checkable contract), `13-auth.md` (test/dev authentication), `09-environment.md` (run recipe), `07-database.md` (seed data), and the per-feature **widget-spec Test IDs** are the *inputs* these QA docs point at. **If the app has no `docs/basics/`, STOP and ask the user to run `do-project-setup` on the app first** — a regression suite grounded on an unprofiled app re-derives (and drifts from) every truth. Proceed without it only if the user explicitly chooses to (then note the QA profile is ungrounded).

## Black-box boundary — the suite tests the BUILT app, never the code

Regression tests the **built application** (the deployed web URL, the installed APK/IPA) exactly as a user drives it — whole-app flows through real UI and real HTTP. **It never imports application code, never mocks the app, and requires no test hooks inside it.** Its only contracts with the app are the **public surfaces** (UI + API) plus two sanctioned bridges: the **widget-spec Test IDs** (readable on a built artifact) and the **seed/reset command**. If a test can only be written by reaching into app code, that's a missing Test ID / seed guarantee to route back to the app — not a reason to break the boundary.

## Derive the condition-user catalog from the app profile — enumerated, not brainstormed

"No missed test cases" is a **derivation, not a hope**: the test users and their condition states (`05-environments-and-data.md` → Test user catalog) are **enumerated from the app truths already recorded** — one user (or documented state) per condition, each row tracing to the truth that generated it:

| Condition source | App doc |
|------------------|---------|
| One user per **role** (incl. permission boundaries) | `12-security-compliance.md` → roles × capabilities |
| Users holding entities in **every lifecycle state** (draft/active/archived · visibility rules) | `06-domain-model.md` → Entities |
| A user per **on-delete/dangling edge** (owns rows whose parent was archived/deleted) | `06-domain-model.md` → Relationships |
| Users positioned for each **cross-feature flow binding** (source seeded, consumer empty, …) | `16-feature-map.md` + TRD §2 flow deps |
| **Flow/wizard states** (mid-draft, abandoned, resumed) | TRD multi-step specs · `04-ux-conventions.md` |
| **Auth states** (fresh, expired token, revoked/locked) | `13-auth.md` |
| **Data extremes** (zero data / realistic max / longest content) | `04-ux-conventions.md` content-fit · seed data |

**Completeness check (run at setup and every refresh):** every role, every entity state, every decided edge, and every auth state appears in ≥ 1 catalog row — a condition with no user is a **loud gap**, and an app-profile change (new state, new edge, new role) flags the missing condition users on reconcile. Every user is a **seed guarantee** (recreated on reset), never a hand-maintained account that drifts.

## Two modes — same gates either way

- **Existing test project → describe.** Full scan (no sampling — every spec dir, helper, fixture, config, pipeline file), then draft each doc from reality. Flag contradictions (two locator styles, mixed wait strategies) instead of smoothing them over.
- **No test project yet → establish.** Ask where the split directory/repo should live, **choose the stack with the user** — constrained by the black-box boundary: only drivers that operate on the **built artifact** (web → browser against the deployed URL, e.g. Playwright — reuse it if the app's `do-testing` already uses it, rung 2; mobile → installed APK/IPA via Appium/UiAutomator/Maestro — **not** Espresso/Compose-UI, which run in-process with app source) — then scaffold the minimal structure (per the approved `02-test-architecture`) and generate the profile. Scaffold only what the approved docs define — no speculative folders.

## Rules

- **One doc at a time, with approval.** Draft → present → user approves / edits / skips → write to `<test-project>/docs/qa-basics/<file>.md` → next. Never batch-write.
- **Tier — generate only what applies** (e.g. no mobile suite docs for a web-only app); say what was skipped and why.
- **Bridge, don't copy.** App truths (contract, Test IDs, seed commands, env URLs, auth) are **linked by path**, never duplicated — a copied truth drifts. Volatile detail points to the authoritative file.
- **Never write secrets** — test-account credential *names/locations* only (per the app's `13-auth.md` → Test / dev authentication).
- **Stamp each doc** with the commit it was generated at (test-project commit; note the app-profile commit it bridged to — so refresh can detect drift on *either* side).
- **Full-project scan — no sampling** when describing an existing suite; completeness outranks laziness here, same as `do-project-setup`.

## The docs (`<test-project>/docs/qa-basics/`)

Each has a starter template in this skill's `templates/` directory — read it, fill from reality.

| File | Contents |
|------|----------|
| `01-overview.md` | QA project summary, profile index + freshness stamps (test-project commit **and** app-profile commit bridged to) |
| `02-test-architecture.md` | Layering (specs / flows / screen-objects / fixtures / helpers), **full directory tree (no elision)**, **screen-object inventory** (search-before-create, register-on-create), naming conventions |
| `03-test-stack.md` | Framework per platform, runner, **approved library per concern**, codegen (fixtures/typed client from the app contract), run commands |
| `04-app-under-test.md` | **The bridge**: app repos/platforms, links to the app's basics docs, the contract + typed client, widget-spec Test-ID locations, version/build under test |
| `05-environments-and-data.md` | Which env the suite targets (sandbox/live per the app's `09`), **test accounts** (roles, cred names/locations), **seed/reset strategy**, data isolation between runs |
| `06-selector-conventions.md` | Locator contract: **widget-spec Test IDs only**; per-platform attribute mapping; missing ID → route back to the app's widget spec, never invent a brittle locator |
| `07-suites-and-runs.md` | Suite taxonomy (smoke / critical-path / full regression), tags, **run matrix** (trigger × suite × env), CI wiring |
| `08-stability-policy.md` | Waiting rules (no fixed sleeps), retry policy, **flaky-test quarantine flow**, determinism (order-independence, isolated data), runtime budget |
| `09-reporting-and-triage.md` | Artifacts (screenshot/video/trace), where results live, **the triage loop**: failure → app bug (`do-fixing` / `do-issue-grooming`) vs test defect (fixed here) |
| `10-regression-coverage-map.md` | **The QA feature-map**: app feature → flows/bindings (incl. destructive + freshness) → regression test · suite · status; register-on-create as features ship; gaps visible |

## Flow

> Present every gate in the shared **step-summary format** (`principles.md`): *Where we are* + status · *In plain terms* · *What this step did* · *What I need from you* · engineer detail last.

1. **Locate & confirm.** Identify the app repo(s) + their `docs/basics/`, and the test project's location (existing path, or where to create it). Detect mode (describe vs establish). Confirm platforms in scope and the applicable doc list (tier) with the user before drafting.
2. **(Establish mode only)** propose the stack (rung-2 reuse of the app's test frameworks first) and the minimal scaffold; get approval; create the split directory.
3. **Per doc, in order:** scan the relevant real sources (test project + the app docs it bridges to) → draft (mark `UNKNOWN`; link volatile detail) → **present for approval** (approve / edit / skip) → write with both commit stamps → next doc. Seed `10-regression-coverage-map.md` from the app's `16-feature-map.md`: one row per shipped feature — **a shipped feature with no regression coverage is a visible gap row, not an omission**.
4. **Finish.** Write `01-overview.md` as the index; report what was generated, skipped, and every coverage gap found.

## Refresh / reconcile mode

Re-run per-doc against **both** stamps: the test project's commit *and* the app profile's commit. The critical reconcile is **`10-regression-coverage-map.md` vs the app's `16-feature-map.md`** — every feature added/changed in the app since the last stamp must have a coverage row (test exists · planned · **gap**); flag features shipped without regression coverage. Also reconcile the screen-object inventory against the actual test code (unregistered screen-objects flagged, same as assets).
