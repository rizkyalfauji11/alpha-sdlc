---
name: do-slicing
description: Turn an approved TRD into a task-list DOCUMENT — a list of tasks with descriptions, scored against the live Jira "Choose Appendix (v3)" field — built part-by-part (part → review → write). This skill ONLY writes the document; uploading the tasks to Jira is a separate downstream skill. Use when the user wants to slice a TRD into tasks, create a task list / appendix task list from a TRD, weight a TRD's work, or prep tasks for Jira. Triggers on "slice the TRD", "create task list", "appendix task list", "/do-slicing", "weight the tasks".
---

You are converting an **approved TRD into a task-list document**, scored with the **Choose Appendix (v3)** weight field. This is grooming → development hand-off. **This skill writes the document only — it does NOT create or upload anything to Jira. The upload is a separate skill, added later.**

**Apply the shared principles in `../../principles.md`** (lazy-senior mindset, never over-simplify, ground-in-real-code, ask-don't-assume, 2–3 best-practice options, living understanding summary). Creating the doc is internal — the no-external-write gate matters most for the *upload* skill, not this one.

## Source & Appendix

- **Source of tasks = the TRD work slices.** Read the feature's TRD under `docs/development/<feature-name>/`: the hub's **Change manifest → work-slice summary** and every spoke's **Work slices** (with their AC). The TRD is the plan; do not invent tasks that aren't traceable to a slice (ask the user to amend the TRD instead).
- **Appendix (v3) format + scoring rules:** follow the contract in `~/.claude/skills/create-appendix-task-list/SKILL.md` — the live-Jira fetch of `Choose Appendix (v3)` (`customfield_11543`), weight tiers (MOB-V/L/M/H = 1/2/4/8 or weight-ref PDF), the output template (§1–§7), and the iron rules (**≤ 8 pt per task**, one appendix category per task → split duplicates across tasks, 16-pt lines split into 8/8 halves, stable `T<group>.<n>` IDs, no git/build/test-verification line items). Do not restate those rules here — read that skill and apply them so the doc matches what the upload skill will parse.
- **OVERRIDE on category picking:** the referenced skill auto-picks the closest category and marks `*` without asking. **This plugin does the opposite** (per `principles.md` ask-don't-assume): when a line item has **no exact match** in the live Choose Appendix (v3) field, **present the 2–3 closest options in the right weight tier and ask the user to pick.** Only options that exist in the live field — never invent one. Record the user's pick, still mark it `*`, and note it in §6.2. The ask happens at the part's review step, so it doesn't stall drafting.

## Required inputs — ask first

1. **Feature** — which `docs/development/<feature-name>/` TRD to slice. Confirm it's approved/complete; if not, offer to run `do-grooming` first.
2. **Jira board key** (`FFE` / `FEG` / URL) — to fetch the live Choose Appendix (v3) options.
3. **Weight-ref PDF/md** — only if the board's options don't encode weight in their label (per the Appendix skill's decision tree).

## Flow — part → review → write

A **part** = one phase group (or one platform spoke's slices). Build the document incrementally, one part at a time:

1. **Setup (once):** fetch the live Choose Appendix (v3) options + weights, summarize the TRD's full slice set grouped into parts, and confirm the part list with the user.
2. **For each part, loop:**
   - **Part** — take the part's TRD slices.
   - **Review** — draft that part's tasks (task ID, title, description traced to the TRD slice/section, appendix line items + categories + per-line weights, task total, ≤8pt flags/splits per the iron rules) and **show it to the user for review** — approve / edit / re-split. Apply edits.
   - **Write** — append the approved part to the task-list document. Move to the next part.
3. After all parts: write the summary sections (grand total, weight distribution, open items per the Appendix template) and present the finished document.

## Output

- Write to `docs/development/<feature-name>/task-list.md` (or the path the user requests).
- The document IS the deliverable. **Stop here.** Do not create Jira issues — tell the user the doc is ready and that uploading is the next (separate) skill.
