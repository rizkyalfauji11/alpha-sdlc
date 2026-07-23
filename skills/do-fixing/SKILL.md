---
name: do-fixing
description: Fix the bugs found by do-testing — one at a time, root-cause not symptom, with a regression test that reproduces each bug first. Takes the triaged Bugs-found list, fixes only what the user approved, re-verifies, and updates status. Use when the user wants to fix bugs, address the test findings, resolve the bug report, or after do-testing surfaces bugs. Triggers on "fix the bugs", "fix the findings", "resolve the bug report", "/do-fixing".
---

You are **fixing bugs surfaced by `do-testing`** — the dedicated fixing phase (testing is verify-only; fixing happens here). Work only the bugs the user **triaged to fix**; leave the rest.

**First, read `../../principles.md` in full now, then apply it** — especially: **fix the root cause, not the symptom** (grep every caller of the function you touch; fix once where they route through, not per-call-site); ground in real code; never over-simplify; TDD.

## Source

- The **Bugs found** table in `docs/development/<feature-name>/test-plan-<platform>.md` (from `do-testing`), and the user's triage (which bugs to fix / defer). If the report isn't there, run `do-testing` first.
- The TRD (AC/design) + plan + the failing test(s) that exposed each bug.

## Rules

- **One bug at a time, with approval.** Never batch-fix. Fix a bug, present it, wait for approval, then the next.
- **Reproduce first (regression test).** Before fixing, write/confirm a **failing test that reproduces the bug** (red) — derived from the AC it violates. Then fix until green. That test stays as a regression guard.
- **Root cause, not symptom.** Diagnose *why*; fix at the shared source so sibling call-sites are fixed too — not a patch on the one path the bug report named.
- **Scope discipline.** Fix *only* the bug. No opportunistic refactors or added scope (that's the over-delivery trap). If the bug reveals a design gap, that's an **Open Decision → back to `do-grooming`**, not something you invent a fix for.
- **Visual bugs** — for UI parity bugs, re-run the visual-parity loop (render → compare → fix), save to `design/compared-ui/`; **never skip the comparison** — if tooling fails, stop, report + fix it.
- **Boot & Smoke / integration bugs** (405, wrong data shape, localized object rendered raw, console error, error-boundary crash) — re-verify by **re-booting the real FE+BE stack and re-driving the journey with relevant, domain-realistic data**, not by an isolated unit test. The fix isn't confirmed until the real assembled app runs the journey clean (zero 4xx/5xx · console errors · error-boundary trips). If the root cause is contract/shape drift, fix it at the source (correct the contract + regenerate the typed client / fixtures) so sibling fields don't reintroduce it.
- **Jira** — if the bug's ticket is tracked, move it through the board (e.g. In Progress → Done/In Review) per the Atlassian MCP, only if Jira is used.
- **Keep the project profile current (`docs/basics/`).** A fix is a code change like any other — if it alters a fact a profile doc records, **update that doc in the same change and re-stamp its commit** (per principles). Map: new/changed endpoint or base URL → `api-reference` (+ the machine-checkable contract spec if the shape changed); schema/migration → `database`; new env var / flag / run-recipe change → `environment`; new asset → `asset-registry`; new screen/nav/component → `ui-architecture`; new convention (e.g. a localized-render helper introduced by the fix) → `conventions`. "If needed" is literal — only touch a doc when the fix changes a fact it tracks.
- **Comments minimal & project-relevant** (per principles) — no "fixes bug B3" provenance comments; that history lives in git/the bug report.

## Flow — per bug

For each bug the user approved, in the report's order (severity first):

1. **Frame** — the bug, the AC it violates, its repro, and your root-cause hypothesis. Move its Jira ticket to In Progress (if tracked).
2. **Red** — write/confirm the failing test that reproduces it; run, confirm it fails for the right reason.
3. **Fix** — root-cause fix, minimal, climbing the ladder; run tests + build until green. Report honestly (no "fixed" on red).
4. **Re-verify** — re-run the bug's original failing check *and* the surrounding suite (no regressions). Visual bugs → re-run parity. **Boot & Smoke / integration bugs → re-boot the real stack and re-drive the journey** (not just an isolated test).
5. **Present + ⏸ STOP** — present in the shared **step-summary format** (`principles.md`): *Where we are* + status, *In plain terms*, *What this step did*, *What I need from you* — then the following as **Details (for engineers)**: the root cause, the fix (diff), the now-passing regression test, the re-verify result, **Profile updates** (any `docs/basics/` doc this fix changed a recorded fact in, updated + re-stamped — or "None"), and a **comment-hygiene self-check** (no comment a clearer name/structure would remove; no task/ticket/plan/PRD/BRD provenance in code). Ask: approve / change / stop. Do not touch the next bug until they respond.
6. **On approval** — mark the bug **fixed** in the test-plan *Bugs found* table, **commit the fix automatically** (conventional message; no push unless asked), continue or stop.

## After the last bug

Report what was fixed, what was deferred, and any bug that turned out to be a design gap (now an Open Decision). Hand back to **`do-testing`** to re-run and confirm the fixes hold and nothing regressed — the test → fix → re-test loop closes here. Once re-testing is green, the feature's SDLC ends with the **profile reconcile** — run `do-project-setup` in refresh mode so `docs/basics/` reflects everything built and fixed (see `do-testing`).
