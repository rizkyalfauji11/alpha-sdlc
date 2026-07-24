---
name: do-planning
description: Create a staged development plan document from an approved TRD and its tasks — work broken into small, independently reviewable stages with explicit STOP/review checkpoints, so implementation is reviewed incrementally instead of as one huge change. Use when the user wants a development plan, an implementation plan, to plan the build, or to stage the work for review. Triggers on "development plan", "plan the implementation", "stage the work", "/do-planning", "break the build into steps".
---

You are writing a **development plan document**: the ordered, staged plan an engineer follows to implement a feature. **The whole point is reviewability** — the work is split into small stages, each a self-contained reviewable change with an explicit checkpoint, so the user can review stage-by-stage and **stop after any stage** instead of facing one enormous diff at the end.

**First, read `../../principles.md` in full now, then apply it** (lazy-senior mindset, never over-simplify, the ladder, ground-in-real-code, ask-don't-assume, 2–3 best-practice options, living understanding summary).

**Read the project profile first** (`docs/basics/` from `do-project-setup`) — especially `02-architecture.md`, `10-conventions.md`, `05-tech-stack.md`, and (for UI) `03-ui-architecture.md` — before scanning code from scratch. The plan's **Architecture & package layout** and stage breakdown must ground in the profile's real structure, conventions, and stack — not a guessed one — so stages land in the right place and follow existing patterns. If a section looks stale (repo moved past its commit stamp), note it and suggest a refresh.

**If there's no `docs/basics/` (project not set up yet), STOP and ask the user to run `do-project-setup` first** — planning the package/architecture layout on an ungrounded view is how stages land in the wrong place or fight existing conventions. Wait for their answer: recommend setting up first; proceed without it only if the user explicitly chooses to (then fall back to scanning the repo, and note the layout is ungrounded).

## Source & output

- **Inputs:** the feature's approved TRD (`docs/development/<feature-name>/` hub + the relevant spoke) — its **work slices + AC are the source of work**. If you ran the optional Jira phases (`do-slicing`/`do-uploading`), also use `task-list.md` / Jira keys; if you skipped them, plan straight off the TRD. Either way the plan implements what the TRD already decided — it does **not** re-open design (send those back to `do-grooming`).
- **Development is per-platform** → write one plan per platform: `docs/development/<feature-name>/plan-<platform>.md`. Use `plan-template.md` in this skill's directory.

## What makes a good stage (the core rule)

- **Small enough to review in one sitting** — roughly one concern / one coherent diff. If a stage would be a huge change, split it. Prefer many small stages over few big ones.
- **Ordered by dependency** — contract/data first, then logic, then UI; match the hub's release ordering **and the hub's Feature dependencies** — a stage that relies on another feature comes only after that feature exists. If a depended-on feature is **missing or incomplete**, STOP and surface it (Open Decision) — never plan stages on a phantom prerequisite.
- **Ends in a checkpoint**: how to verify it works, and an explicit **⏸ STOP — review** marker.
- **Marks whether it's safe to stop after** — ideally the codebase is in a working (compiles, tests pass, shippable-behind-flag) state at as many checkpoints as possible, so pausing leaves nothing half-broken. Call out the stages where stopping would leave things incomplete.
- **Traces to AC / work slices** — each stage lists the acceptance criteria / TRD work slices it satisfies (plus task IDs / Jira keys if the Jira phases were run). Every slice should be covered by some stage; flag any that aren't.
- **Detail the *shape* of the change, not the code.** A stage must be reviewable before it's built: give per-file change intent, new/changed signatures · data shapes · endpoints · props, and pseudocode/notes for genuinely tricky logic (races, money caps, retries, edge cases). **Calibrate by risk** — a trivial change stays one line, a risky one gets the interface + edge cases. Never paste full method bodies or boilerplate — that turns the plan into a stale second copy of the diff (over-engineering). The plan describes the shape; the diff fills in the bodies.

## Flow — stage → review → write

> Present every gate below in the shared **step-summary format** (`principles.md`): *Where we are* + status · *In plain terms* · *What this step did* · *What I need from you* · engineer detail last.

1. Read the TRD spoke + tasks, scan the real code paths the work touches, and **summarize the implementation scope** for the user to confirm. **Read the hub's *Feature dependencies* and confirm each depended-on feature is actually built** (check `docs/basics/16-feature-map.md`); **if a prerequisite isn't built, STOP** and route it back (Open Decision) before planning the dependent slice — don't plan around a phantom. For each **flow dependency** (a field/section fed by another feature — the hub's Flow-dependencies sub-table), plan the stage so that binding is wired to the **real source flow, not a mock**, and note it as the stage's integration point. **For UI platforms, carry the Design references into the plan's *Design references* section.** First read what **grooming already captured** — the **`Design` field in each screen's widget-spec** and any images in `docs/development/<feature-name>/design/`; reuse those, don't re-ask. Only for anything still missing:
   - **Image(s) provided now** → **save each into `docs/development/<feature-name>/design/<screen>.png`** (create the `design/` folder), record the path.
   - **Figma** → record the frame link.
   - Plus any specific needs (states, breakpoints, motion, dark mode).
   `do-development` reads these to run the visual-parity loop, so they must be in place before UI stages. **Present the summary, then STOP and wait for confirmation** before the architecture layout (don't plan on a stale or unconfirmed understanding).
2. **Write the Architecture & package layout first.** Map where each piece of the work lands in the real repo (which package/directory/file), grounded in the existing structure — reuse it (ladder rung 2), propose new packages only where needed and name the rung. **If the project uses clean/layered architecture, place each piece in the right layer (presentation / domain / data) and respect the dependency rule** (per `principles.md`) — don't impose layering if the project doesn't use it. This is *not* a re-statement of the TRD design; link to the TRD and keep this concrete (file-system level). It's the map the stages slot into; keep it short for small features. **Present the layout, then STOP — end your turn and wait for approval. Do not start the stage breakdown in the same turn.**
3. Propose the **stage breakdown** (titles + one-line goals + order only) — each stage references the package layout from step 2. **Present it, then STOP and wait for approval. Do not detail any stage until the user approves the shape.**
4. For each stage, in order: **draft** the stage detail (goal, files/modules, approach per the ladder, concrete changes, **the test(s) to write first from the AC** — TDD red, verify step, checkpoint, safe-to-stop flag, tasks covered) → **present it and STOP** (approve / edit / re-split — end your turn, wait for the verdict; do not draft the next stage or write the file yet) → on approval, **write** it into `plan-<platform>.md` and move to the next stage. Every stage with real logic must name its test so `do-development` can write it first; flag stages that genuinely can't be unit-tested.
5. After all stages: write the sequencing summary (dependency order, which checkpoints are safe stop points, any uncovered tasks).

This skill writes the **plan**. Implementing it (coding stage-by-stage, pausing at checkpoints) is the user's call to make afterwards — the plan is what lets them stop wherever they want.
