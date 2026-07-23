---
name: do-slicing
description: Optional Jira phase. Turn an approved TRD into a task-list DOCUMENT, scored by Story Points (Jira default) OR an Appendix-style weighting — always asks which — built part-by-part (part → review → write). Writes the document only; uploading to Jira is a separate downstream skill; skip both if you don't use Jira. Use when the user wants to slice a TRD into tasks, create a task list from a TRD, story-point or weight a TRD's work, or prep tasks for Jira. Triggers on "slice the TRD", "create task list", "story point the tasks", "appendix task list", "/do-slicing", "weight the tasks".
---

> **Optional phase — Jira only.** Skip `do-slicing` and `do-uploading` entirely if your team doesn't track work in Jira: `do-planning` → `do-development` → `do-testing` run directly off the TRD's work slices + AC. Only use this phase if you want the TRD's slices turned into weighted Jira tickets.

You are converting an **approved TRD into a task-list document**, scored with a task-**weighting scheme** (e.g. a Jira "Appendix"-style field). This is the grooming → development hand-off for Jira teams. **This skill writes the document only — it does NOT create or upload anything to Jira; `do-uploading` does that.**

The weighting/Appendix mechanics are **organization-specific** — point this skill at your own Jira weighting scheme. This plugin ships against the amarbank "Choose Appendix (v3)" flow as the reference implementation; adapt the field names/weights to your setup, or skip the phase.

**First, read `../../principles.md` in full now, then apply it** (lazy-senior mindset, never over-simplify, ground-in-real-code, ask-don't-assume, 2–3 best-practice options, living understanding summary). Creating the doc is internal — the no-external-write gate matters most for the *upload* skill, not this one.

## Source of tasks

- **Source = the TRD work slices.** Read the feature's TRD under `docs/development/<feature-name>/`: the hub's **Change manifest → work-slice summary** and every spoke's **Work slices** (with their AC). The TRD is the plan; do not invent tasks that aren't traceable to a slice (ask the user to amend the TRD instead).

## Weighting mode — ALWAYS ask first

**Every run, ask the user which weighting to use — Appendix (v3) or Story Points. Never assume.** The choice determines how tasks are scored and, later, which Jira field `do-uploading` writes.

### Mode A — Appendix (v3)  *(org-specific)*

Follow the contract in `~/.claude/skills/create-appendix-task-list/SKILL.md` — the live-Jira fetch of `Choose Appendix (v3)` (`customfield_11543`), weight tiers (MOB-V/L/M/H = 1/2/4/8 or weight-ref PDF), the output template (§1–§7), and the iron rules (**≤ 8 pt per task**, one appendix category per task → split duplicates across tasks, 16-pt lines split into 8/8 halves, stable `T<group>.<n>` IDs, no git/build/test-verification line items). Don't restate those rules — read that skill and apply them.
- **OVERRIDE on category picking:** the referenced skill auto-picks the closest category and marks `*` without asking. **This plugin asks instead** (per `principles.md`): when a line has **no exact match** in the live field, present the **2–3 closest options in the right weight tier and let the user pick** — only options that exist in the field, never invent one. Mark it `*`, note in §6.2. Happens at the review step.

### Mode B — Story Points  *(Jira default, no org setup)*

Standard relative estimation — works for any team, no Appendix field needed. Estimate each task on the **modified Fibonacci scale: 1, 2, 3, 5, 8, 13**, weighing **complexity + effort/volume + uncertainty** (relative sizing, **never hours**):
- **1** trivial (config/one-liner) · **2** small · **3** straightforward slice · **5** moderate, some unknowns · **8** complex / multi-part · **13** very complex → **must be split** (nothing larger than 13; break it into smaller tasks).
- Give a **one-line rationale** per estimate (what drove the number). One task = one story-point value.
- Same part → review → write loop; the task-list records **task + story points + rationale** per task instead of appendix line-items.

## Required inputs — ask first

1. **Feature** — which `docs/development/<feature-name>/` TRD to slice. Confirm it's approved/complete; if not, offer to run `do-grooming` first.
2. **Weighting mode** — Appendix (v3) or Story Points. **Always ask.**
3. *(Appendix mode only)* **Jira board key** (`FFE` / `FEG` / URL) to fetch the live Choose Appendix (v3) options, and a **weight-ref PDF/md** if the board's options don't encode weight in their label.
4. *(Story Points mode)* confirm the scale — default is modified Fibonacci (1, 2, 3, 5, 8, 13); no Jira board or weight-ref needed to write the doc.

## Flow — part → review → write

> Present every review gate below in the shared **step-summary format** (`principles.md`): *Where we are* + status · *In plain terms* · *What this step did* · *What I need from you* · engineer detail last.

A **part** = one phase group (or one platform spoke's slices). Build the document incrementally, one part at a time:

1. **Setup (once):** confirm the **weighting mode** (always ask). Appendix → fetch the live Choose Appendix (v3) options + weights; Story Points → confirm the scale. Summarize the TRD's full slice set grouped into parts, and confirm the part list with the user.
2. **For each part, loop:**
   - **Part** — take the part's TRD slices.
   - **Review** — draft that part's tasks and **show them for review** (approve / edit / re-split):
     - *Appendix mode:* task ID, title, description traced to the TRD slice, appendix line items + categories + per-line weights, task total, ≤8pt flags/splits.
     - *Story Points mode:* task ID, title, description traced to the TRD slice, **story points + one-line rationale** (split anything > 13).
   - **Write** — append the approved part to the task-list document. Move to the next part.
3. After all parts: write the summary (grand total / point distribution, open items) and present the finished document. Note the mode used at the top so `do-uploading` knows which Jira field to write.

## Output

- Write to `docs/development/<feature-name>/task-list.md` (or the path the user requests).
- The document IS the deliverable. **Stop here.** Do not create Jira issues — tell the user the doc is ready and that uploading is the next (separate) skill.
