---
name: do-regression-authoring
description: Step 1 of the regression track — turn the regression coverage map's GAP rows into approved, passing black-box tests against the built application, one test at a time (spec → approve → implement → run → register). Requires the QA profile from do-regression-setup. Use when the user wants to author/write regression tests, close coverage gaps, or grow the regression suite. Triggers on "author regression tests", "write regression tests", "close the coverage gaps", "grow the suite", "/do-regression-authoring".
---

You are **authoring regression tests** for the stand-alone QA project — closing the **GAP rows** in `docs/qa-basics/10-regression-coverage-map.md` with black-box tests that drive the **built application**. One test at a time, gated, exactly like the app-side testing discipline.

**First, read `../../principles.md` in full now, then apply it** (never over-simplify, the ladder, ask-don't-assume, step-by-step gates, plain-first step summaries).

**Read the QA profile first** (`<test-project>/docs/qa-basics/`, from `do-regression-setup`) — the learned app model (`04`), condition-user catalog (`05`), selector conventions (`06`), suite taxonomy (`07`), stability policy (`08`). **If there's no QA profile, STOP and run `do-regression-setup` first.** If the app build moved past the profile's explored stamp, recommend a refresh before authoring against a stale model.

## Rules

- **Source of work = the coverage map.** Author only rows that exist in `10-regression-coverage-map.md` (GAP or planned). A flow worth testing that has no row → add the row first (it's the registry, never bypassed).
- **One test at a time — spec approved before code, code run before done.** Never batch-write a suite.
- **Black-box always** (per the R0 boundary): the built artifact, discovered locators, public surfaces. A test that seems to need app internals = a missing input/ID/seed to request, not a boundary break.
- **Condition users only.** Preconditions come from the catalog (`05`) — **never improvise state mid-test**. A row needing an uncataloged condition → add the user + seed guarantee first (gated), then author.
- **Reuse before create** (rung 2): search the screen-object inventory (`02`) and existing flows before writing new ones; new screen-objects/flows are **registered on create**.
- **Stability policy is law** (`08`): no fixed sleeps, unique data per test, order-independent, within the suite's runtime budget.
- **Keep the profile current in the same change:** coverage row status, screen-object inventory, condition catalog, and any newly requested IDs (`06`) — updated with the test, not later.
- **Commit each approved test automatically** (conventional message; no push unless asked).

## Flow

> Present every gate in the shared **step-summary format** (`principles.md`).

1. **Plan & triage.** Read the coverage map; present the GAP/planned rows **prioritized** (integrity + critical journeys first, then flow-bindings, stepped-flows, the rest), each with: the condition users it needs (catalog hit or missing), selector readiness (IDs present per `04`/`06` or request pending), and its target suite tag (`07`). **The user picks what to author** — that selection is the work list. Rows blocked on a missing user/ID/input are named, with the unblock step.
2. **Per row, in order:**
   a. **Spec** — draft the test as a QA-executable procedure: *Preconditions* (condition users + seed state) → *numbered Steps* (through real screens, by screen-object action) → *Expected* (observable, incl. the row's kind-specific assertion: freshness mechanism, destructive edge behavior, visibility subset, wizard atomicity). Name what's reused vs created (screen-objects/flows). **Present for approval — STOP.**
   b. **Implement** — on approval: create/extend screen-objects (register them), write the spec per the stability policy, tag it for its suite.
   c. **Run it against the built app** — report honestly. **Pass** → done. **Fail** → judge: a **real app bug found** (the test did its job — file it per `09`'s triage loop with the test as repro; the test lands as the standing guard, marked expected-fail/blocked until the app fix ships) or a **spec/implementation error** (fix and re-run). Never loosen an assertion to go green.
   d. **Register & commit** — flip the coverage row (GAP → covered · or blocked-on-app-bug), update inventories, commit.
3. **After the batch** — coverage summary: rows closed, rows still GAP (and why), bugs found and filed, IDs/inputs requested. Recommend the next batch.

## Handoff

Suites grow here; running them on triggers and triaging red runs at scale is the run/triage step (next in the track). Bugs found while authoring go to the app team per `09` — this skill never fixes the app.
