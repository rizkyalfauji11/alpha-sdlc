---
name: do-slicing
description: Optional Jira phase. Turn an approved TRD into a task-list DOCUMENT, story-pointed on the modified Fibonacci scale, built part-by-part (part → review → write). Writes the document only; uploading to Jira is a separate downstream skill; skip both if you don't use Jira. Use when the user wants to slice a TRD into tasks, create a task list from a TRD, story-point a TRD's work, or prep tasks for Jira. Triggers on "slice the TRD", "create task list", "story point the tasks", "/do-slicing", "size the tasks".
---

> **Optional phase — Jira only.** Skip `do-slicing` and `do-uploading` entirely if your team doesn't track work in Jira: `do-planning` → `do-development` → `do-testing` run directly off the TRD's work slices + AC. Only use this phase if you want the TRD's slices turned into weighted Jira tickets.

You are converting an **approved TRD into a task-list document**, story-pointed. This is the grooming → development hand-off for Jira teams. **This skill writes the document only — it does NOT create or upload anything to Jira; `do-uploading` does that.**

**Story Points is the only built-in scheme, deliberately** — it works on any Jira with no custom-field setup. If your org sizes work with a custom weighting field instead, keep using whatever skill implements it and skip this phase; this plugin stays standalone rather than depending on an org-specific one.

**First, read `../../principles.md` in full now, then apply it** (lazy-senior mindset, never over-simplify, ground-in-real-code, ask-don't-assume, 2–3 best-practice options, living understanding summary). Creating the doc is internal — the no-external-write gate matters most for the *upload* skill, not this one.

## Source of tasks

- **Source = the TRD work slices.** Read the feature's TRD under `docs/development/<feature-name>/`: the hub's **Change manifest → work-slice summary** and every spoke's **Work slices** (with their AC). The TRD is the plan; do not invent tasks that aren't traceable to a slice (ask the user to amend the TRD instead).
- **Split tasks by architecture layer, so one task ≈ one development stage.** Read the repo's real layers from `docs/basics/02-architecture.md` and split each slice the same way `do-planning` stages it: `[contract]` (only when the API contract changes) → `[domain]` → `[data]` → `[presentation]`; on an **unlayered** project, minimum `[UI]` vs `[data-integration]` (API calls, DB, 3rd-party SDKs) — and never invent a layer the project doesn't have. Rules that keep this honest:
  - **Tag the layer in the task title** so the board shows which layer is in flight.
  - **Only the layers the slice touches** — a screen reusing an existing endpoint with no new business rule is one `[presentation]` task, not three. No ceremonial layer tasks.
  - **Shared lower-layer work is one task** — 3 screens over 1 repository = one `[domain]` + one `[data]` + one `[presentation]` task per screen.
  - **Size each layer task on its own** — its own story-point value + rationale; layer tasks are independently sized, and the split rule still binds on top (**anything > 13 must be split**).
  - **Tell the user the ticket count grows** before writing the part — a 3-screen feature goes from ~3 tickets to ~5–6. That's the cost of per-layer status on the board; if they'd rather have coarse tickets, they can say so and the tasks stay slice-level (the plan still splits by layer internally).

## Sizing — Story Points

Standard relative estimation, no custom Jira field required. Estimate each task on the **modified Fibonacci scale: 1, 2, 3, 5, 8, 13**, weighing **complexity + effort/volume + uncertainty** (relative sizing, **never hours**):
- **1** trivial (config/one-liner) · **2** small · **3** straightforward slice · **5** moderate, some unknowns · **8** complex / multi-part · **13** very complex → **must be split** (nothing larger than 13; break it into smaller tasks).
- Give a **one-line rationale** per estimate (what drove the number). One task = one story-point value.
- Stable task IDs (`T<group>.<n>`), and **no git/build/test-verification line items** — those aren't work, they're the definition of done.

## Required inputs — ask first

1. **Feature** — which `docs/development/<feature-name>/` TRD to slice. Confirm it's approved/complete; if not, offer to run `do-grooming` first.
2. **Scale** — confirm modified Fibonacci (1, 2, 3, 5, 8, 13) or the team's variant. Nothing else is needed to write the doc; no Jira access at this stage.

## Flow — part → review → write

> Present every review gate below in the shared **step-summary format** (`principles.md`): *Where we are* + status · *In plain terms* · *What this step did* · *What I need from you* · engineer detail last.

A **part** = one phase group (or one platform spoke's slices). Build the document incrementally, one part at a time:

1. **Setup (once):** confirm the **scale**, then summarize the TRD's full slice set grouped into parts and confirm the part list with the user.
2. **For each part, loop:**
   - **Part** — take the part's TRD slices.
   - **Review** — draft that part's tasks and **show them for review** (approve / edit / re-split): task ID, title, description traced to the TRD slice, layer tag, **story points + one-line rationale** (split anything > 13).
   - **Write** — append the approved part to the task-list document. Move to the next part.
3. After all parts: write the summary (grand total / point distribution, open items) and present the finished document.

## Output

- Write to `docs/development/<feature-name>/task-list.md` (or the path the user requests).
- The document IS the deliverable. **Stop here.** Do not create Jira issues — tell the user the doc is ready and that uploading is the next (separate) skill.
