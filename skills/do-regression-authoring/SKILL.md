---
name: do-regression-authoring
description: Step 1 of the regression track — draft test cases from the coverage map's GAP rows, then generate their automation code, one case at a time (draft → approve → persist the case doc → generate code → run against the built app → register). Requires the QA profile from do-regression-setup. Use when the user wants to draft test cases, generate test code, author regression tests, or close coverage gaps. Triggers on "draft test cases", "generate test code", "author regression tests", "write regression tests", "close the coverage gaps", "/do-regression-authoring".
---

You are **drafting test cases and generating their automation code** for the stand-alone QA project — closing the **GAP rows** in `docs/qa-basics/10-regression-coverage-map.md` against the **built application**. The order is fixed: **enumerate (done by `do-regression-setup`) → draft the case → approve → generate the code → run**. One case at a time, gated.

**First, read `../../principles.md` in full now, then apply it** (never over-simplify, the ladder, ask-don't-assume, step-by-step gates, plain-first step summaries).

**Read the QA profile first** (`<test-project>/docs/qa-basics/`, from `do-regression-setup`) — the learned app model (`04`), condition-user catalog (`05`), selector conventions (`06`), suite taxonomy (`07`), stability policy (`08`). **If there's no QA profile, STOP and run `do-regression-setup` first.** If the app build moved past the profile's explored stamp, recommend a refresh before drafting against a stale model.

## Rules

- **Source of work = the coverage map** (the enumerated case list). Draft only rows that exist there (GAP or planned); a flow worth testing with no row → add the row first — the map is the registry, never bypassed.
- **Draft before code, always.** No automation is written for a case whose draft isn't approved; the approved draft is **persisted as a test-case document** before generation.
- **One case at a time.** Never batch-draft a suite, never "approve the rest".
- **Black-box always** (the R0 boundary): built artifact, discovered locators, public surfaces. Needing app internals = a missing input/ID/seed to request, never a boundary break.
- **Condition users only.** Preconditions come from the catalog (`05`) — never improvised state. An uncataloged condition → add the user + seed guarantee first (gated), then draft.
- **Reuse before create** (rung 2): search the screen-object inventory (`02`) and existing flows first; new screen-objects/flows are **registered on create**.
- **Stability policy is law** (`08`): no fixed sleeps, unique data per test, order-independent, within the suite's runtime budget.
- **Keep the profile current in the same change:** coverage row, screen-object inventory, condition catalog, ID requests (`06`) — updated with the case, not later.
- **Commit each approved case automatically** (case doc + code together; conventional message; no push unless asked).

## Flow

> Present every gate in the shared **step-summary format** (`principles.md`).

1. **Plan & triage.** Read the coverage map; present the GAP/planned rows **prioritized** (integrity + critical journeys first, then flow-bindings, stepped-flows, the rest), each with: condition users needed (catalog hit or missing), selector readiness (`04`/`06`), target suite tag (`07`). **The user picks what to draft** — that's the work list. Blocked rows are named with their unblock step.
2. **Per case, in order:**
   a. **Test-case drafting** — draft the case as a QA-executable document: *Preconditions* (condition users + seed state) → *numbered Steps* (through real screens, by screen-object action) → *Expected* (observable, incl. the row's kind-specific assertion: freshness mechanism, destructive edge behavior, visibility subset, wizard atomicity). Name what's reused vs created. **Present for approval — STOP.**
   b. **Persist the case doc** — on approval, write it to `<test-project>/docs/test-cases/<feature>/<case-id>.md` (Preconditions / Steps / Expected · coverage-row link · condition users · suite tag). **The case doc is the deliverable a human QA can execute by hand**; the automation is its executable twin. It survives even if its automation is later quarantined.
   c. **Test-code generation** — generate the automation from the persisted draft: create/extend screen-objects (register them), write the spec per the stability policy, tag it for its suite. The code asserts exactly what the case doc says — no more, no less.
   d. **Run it against the built app** — report honestly. **Pass** → done. **Fail** → judge: a **real app bug found** (the case did its job — file it per `09` with the case doc + artifacts as the repro; the test lands as the standing guard, marked blocked-on-app-bug) or a **draft/generation error** (fix and re-run). Never loosen an assertion to go green.
   e. **Register & commit** — flip the coverage row (GAP → covered · blocked-on-app-bug), link both artifacts in the row (case doc · code path), update inventories, commit.
3. **After the batch** — coverage summary: cases drafted/generated, rows still GAP (why), bugs found and filed, IDs/inputs requested. Recommend the next batch.

## Handoff

Suites grow here; running them on triggers and triaging red runs at scale is the run/triage step (next in the track). Bugs found while authoring go to the app team per `09` — this skill never fixes the app.
