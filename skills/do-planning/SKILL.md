---
name: do-planning
description: Create a staged development plan document from an approved TRD and its tasks — work broken into small, independently reviewable stages with explicit STOP/review checkpoints, so implementation is reviewed incrementally instead of as one huge change. Use when the user wants a development plan, an implementation plan, to plan the build, or to stage the work for review. Triggers on "development plan", "plan the implementation", "stage the work", "/do-planning", "break the build into steps".
---

You are writing a **development plan document**: the ordered, staged plan an engineer follows to implement a feature. **The whole point is reviewability** — the work is split into small stages, each a self-contained reviewable change with an explicit checkpoint, so the user can review stage-by-stage and **stop after any stage** instead of facing one enormous diff at the end.

**Apply the shared principles in `../../principles.md`** (lazy-senior mindset, never over-simplify, the ladder, ground-in-real-code, ask-don't-assume, 2–3 best-practice options, living understanding summary).

## Source & output

- **Inputs:** the feature's approved TRD (`docs/development/<feature-name>/` hub + the relevant spoke) — its **work slices + AC are the source of work**. If you ran the optional Jira phases (`do-slicing`/`do-uploading`), also use `task-list.md` / Jira keys; if you skipped them, plan straight off the TRD. Either way the plan implements what the TRD already decided — it does **not** re-open design (send those back to `do-grooming`).
- **Development is per-platform** → write one plan per platform: `docs/development/<feature-name>/plan-<platform>.md`. Use `plan-template.md` in this skill's directory.

## What makes a good stage (the core rule)

- **Small enough to review in one sitting** — roughly one concern / one coherent diff. If a stage would be a huge change, split it. Prefer many small stages over few big ones.
- **Ordered by dependency** — contract/data first, then logic, then UI; match the hub's release ordering.
- **Ends in a checkpoint**: how to verify it works, and an explicit **⏸ STOP — review** marker.
- **Marks whether it's safe to stop after** — ideally the codebase is in a working (compiles, tests pass, shippable-behind-flag) state at as many checkpoints as possible, so pausing leaves nothing half-broken. Call out the stages where stopping would leave things incomplete.
- **Traces to AC / work slices** — each stage lists the acceptance criteria / TRD work slices it satisfies (plus task IDs / Jira keys if the Jira phases were run). Every slice should be covered by some stage; flag any that aren't.
- **Detail the *shape* of the change, not the code.** A stage must be reviewable before it's built: give per-file change intent, new/changed signatures · data shapes · endpoints · props, and pseudocode/notes for genuinely tricky logic (races, money caps, retries, edge cases). **Calibrate by risk** — a trivial change stays one line, a risky one gets the interface + edge cases. Never paste full method bodies or boilerplate — that turns the plan into a stale second copy of the diff (over-engineering). The plan describes the shape; the diff fills in the bodies.

## Flow — stage → review → write

1. Read the TRD spoke + tasks, scan the real code paths the work touches, and **summarize the implementation scope** for the user to confirm. **Present the summary, then STOP and wait for confirmation** before the architecture layout (don't plan on a stale or unconfirmed understanding).
2. **Write the Architecture & package layout first.** Map where each piece of the work lands in the real repo (which package/directory/file), grounded in the existing structure — reuse it (ladder rung 2), propose new packages only where needed and name the rung. **If the project uses clean/layered architecture, place each piece in the right layer (presentation / domain / data) and respect the dependency rule** (per `principles.md`) — don't impose layering if the project doesn't use it. This is *not* a re-statement of the TRD design; link to the TRD and keep this concrete (file-system level). It's the map the stages slot into; keep it short for small features. **Present the layout, then STOP — end your turn and wait for approval. Do not start the stage breakdown in the same turn.**
3. Propose the **stage breakdown** (titles + one-line goals + order only) — each stage references the package layout from step 2. **Present it, then STOP and wait for approval. Do not detail any stage until the user approves the shape.**
4. For each stage, in order: **draft** the stage detail (goal, files/modules, approach per the ladder, concrete changes, **the test(s) to write first from the AC** — TDD red, verify step, checkpoint, safe-to-stop flag, tasks covered) → **present it and STOP** (approve / edit / re-split — end your turn, wait for the verdict; do not draft the next stage or write the file yet) → on approval, **write** it into `plan-<platform>.md` and move to the next stage. Every stage with real logic must name its test so `do-development` can write it first; flag stages that genuinely can't be unit-tested.
5. After all stages: write the sequencing summary (dependency order, which checkpoints are safe stop points, any uncovered tasks).

This skill writes the **plan**. Implementing it (coding stage-by-stage, pausing at checkpoints) is the user's call to make afterwards — the plan is what lets them stop wherever they want.
