---
name: do-development
description: Implement a feature stage-by-stage by executing its development plan — write the code for one stage, verify it, then STOP at the stage's checkpoint for review before continuing. Keeps changes small and reviewable; lets the user stop after any safe stage. Use when the user wants to build/implement/code a planned feature, execute the dev plan, or work through the stages. Triggers on "implement", "build the feature", "execute the plan", "code the stages", "/do-development", "start development".
---

You are **implementing a feature by executing its development plan**, one stage at a time. The plan (`plan-<platform>.md` from `do-planning`) already decided the stages, order, package layout, and checkpoints — you follow it. **The whole discipline is: implement one stage → verify → stop at the checkpoint → wait for review.** Never run past a checkpoint unattended.

**Apply the shared principles in `../../principles.md`** — now against the *code itself*: climb the ladder for every implementation decision (reuse before writing), **never over-simplify** (keep the validation, error handling, edge cases the plan calls for), ground in real code, and surface (don't silently absorb) any place reality differs from the plan.

## Source

- **Input = the plan**, normally `docs/development/<feature-name>/plan-<platform>.md`, plus the TRD spoke + tasks it references. If there's no plan, point the user to `do-planning` first — this skill executes a plan, it doesn't invent one.
- The plan **is the state**: stages get marked done as they pass review, so a re-run resumes at the next unfinished stage.

## Rules

- **Test-Driven Development — test first, every stage.** Implement each stage as **red → green → refactor**: write the failing test(s) first, watch them fail for the right reason, write the minimal code to pass, then refactor while green. The tests come from the **stage's acceptance criteria** (the AC carried from the TRD/tasks) — that's the spec. Calibrate per `principles.md`: test real behavior, logic, and the AC; don't write test theater for trivial getters. Where a stage genuinely can't be unit-tested (e.g. native widget rendering, pure UI), say so and fall back to the plan's verify step — don't fake a test to look TDD.
- **One stage at a time. Hard stop at each ⏸ checkpoint.** Implement the current stage, verify it, present it, and **wait for approval** before the next stage. "Approved stage 1" is not approval for stage 2.
- **Respect "safe to stop after".** When the user wants to halt, stop cleanly after a stage the plan marks safe (working/shippable state). If they want to stop at an unsafe point, tell them what's left half-done.
- **Plan drift → surface it, don't wing it.** If implementing reveals the plan is wrong, incomplete, or fights the real code, stop and tell the user; update the plan (or send it back to `do-planning`) before coding around it.
- **Follow the codebase, not your taste.** Match existing conventions, naming, and the package layout the plan fixed. The ladder governs build-vs-reuse.
- **Apply the widget-spec Test IDs (client UI).** When implementing UI on Android/iOS/Web, set each element's **exact Test ID** from the screen's widget-spec doc (`docs/development/<feature-name>/widget-spec/<screen-name>.md`) via the native attribute (`testTag` / `accessibilityIdentifier` / `data-testid`) and its content description as the accessibility label. If you add a UI element the spec doesn't list, **add it to the widget spec** (with a convention-following ID) — don't ship an unaddressable element. These IDs are the contract `do-testing` locates by; a missing/renamed ID breaks QA's UI tests.
- **Register-on-create for assets.** Before creating any asset, search `docs/basics/asset-registry.md` (exact → similar by tags). When the ladder outcome is genuinely **create new**, create it *and* **add it to the asset registry** in the same step (name, description, path, tags) — an unregistered new asset breaks the search-before-create loop and duplicates creep back.
- **Don't auto-commit.** A stage maps naturally to a commit/PR — at the checkpoint, *offer* to commit, but only commit when the user asks (and branch first if on the default branch).
- **Move the Jira ticket to In Progress when its work starts.** When a stage begins and it's linked to a Jira key (from the plan/task-list, written back by `do-uploading`), transition that ticket to **In Progress** via the Atlassian MCP — use `getTransitionsForJiraIssue` to find the board's actual transition name (boards differ), then `transitionJiraIssue`. Skip if it's already In Progress or has no linked key; transition each ticket only once (when the first stage touching it starts). Announce the transition; don't gate each one — running this skill is the approval. If the transition fails, report it and continue coding (don't block implementation on a status update).

## Flow — per stage

For the next unfinished stage in the plan:

1. **Frame** — restate the stage goal, its planned changes, and the tasks/AC it covers. Note any drift you already foresee from the real code. **Move the stage's linked Jira ticket(s) to In Progress** (per the rule above) and report it.
2. **Red** — write the failing test(s) for this stage's acceptance criteria/behavior, in the packages the plan fixed. Run them; confirm they **fail for the right reason** (not a compile/setup error). For stages that can't be unit-tested, say so and use the plan's verify step instead.
3. **Green** — write the *minimal* code to make the tests pass, climbing the ladder per decision (reuse existing, stdlib, native, dep, then new). Keep the diff scoped to the stage. Run the tests + project build until green. **Report results honestly** — never claim done on red.
4. **Refactor** — clean up while staying green (ladder, never over-simplify away validation/error handling/edge cases the AC needs). Re-run to confirm still green.
5. **Present + ⏸ STOP** — give the user a structured review packet, not just a raw diff:
   - **Plan summary** — what this stage set out to do (goal + the AC/tasks it covers), so they review against intent.
   - **Test cases** — each test written, what behavior/AC it asserts, and its result (pass). Call out anything *not* covered by a test and why (e.g. UI fell back to a manual check).
   - **Changes summary** — what actually changed, per file/module (and any drift from the plan), then the diff itself.
   - **Verification** — the green test + build result.
   Then ask: approve / request changes / stop here. Do not touch the next stage until they respond.
6. **On approval** — mark the stage done in `plan-<platform>.md` (resumable), offer to commit, and either continue to the next stage or stop if the user wants (honoring safe-stop).

## After the last stage

Confirm every task/AC the plan covered is implemented and verified, report what's done and anything deferred, and hand off to testing (`do-testing`, when it exists) — the AC are its input.
