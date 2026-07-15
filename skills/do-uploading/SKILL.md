---
name: do-uploading
description: Optional Jira phase. Upload a task-list document (produced by do-slicing) to Jira — bulk-create the tasks with the weighting field for the doc's mode (standard Story Points, or Appendix v3 + Weight Points), plus assignee and Epic parent — then write the created keys back into the TRD. Use when the user wants to upload/create the Jira tasks from the task list, push the sliced tasks to Jira, or import the task list. Triggers on "upload the task list", "create the jira tasks", "push tasks to jira", "/do-uploading", "import to jira".
---

> **Optional phase — Jira only.** Only run this if you used `do-slicing` and want the tasks created in Jira. Teams not using Jira skip it — development works straight from the TRD/plan. The Jira fields/epic conventions here are **organization-specific** (this plugin uses the amarbank FFE/FEG setup as the reference); adapt them to your project.

You are uploading an already-written **task-list document to Jira**. This is the step `do-slicing` deliberately stops short of. Creating Jira issues is an **external write** — the draft + human-approve discipline in `../../principles.md` is at its strongest here.

**First, read `../../principles.md` in full now, then apply it** — especially **draft + human-approve before any external write**, and ask-don't-assume for the Epic and assignee.

## Source

- Input = the task-list document from `do-slicing`, normally `docs/development/<feature-name>/task-list.md`. Confirm the path; if it doesn't exist, point the user to `do-slicing` first.

## Jira mechanics — follow the existing contract

**First, read the mode noted at the top of `task-list.md` (set by `do-slicing`): Appendix (v3) or Story Points.** It decides which weighting field to write.

- **Story Points mode** *(any Jira, no org setup):* set the standard **Story Points** field — **discover its id** via `getJiraIssueTypeMetaWithFields` (commonly "Story point estimate" / "Story Points", e.g. `customfield_10016`, but it varies per instance — never hardcode; ask if ambiguous). Write the task's story-point value there. **Skip** the Appendix (v3) and Weight Points fields entirely. Still set assignee + Epic parent. This is the portable path.
- **Appendix (v3) mode** *(org-specific):* follow the amarbank contract below.

The amarbank Appendix-mode Jira-creation rules are defined in `~/.claude/skills/upload-task-to-jira/SKILL.md` — **read it and follow it** rather than restating. In particular:
- **Required per task (Appendix mode):** Choose Appendix (v3) `customfield_11543` (multiselect array), Weight Points `customfield_10751`, Story Point Type (v2) `customfield_11312` (`Technical` = id `10949`), assignee, and **Epic parent link** (`parent: {"key": "FFE-xxxx"}`, legacy fallback `customfield_10014`).
- **Epic is a hard precondition** — ask the user for the FFE Epic key up front, verify it's an Epic in the right project before creating anything.
- **MOB category map** + field IDs + the `parent`-shape gotchas: use that skill's Quick Reference.
- **Sample-first, then batches of ≤ 5 with a review checkpoint after each** — never create the whole backlog unattended. This is the external-write gate; honor it strictly.
- Parsing: tasks are `#### T<id> — <title>`. Appendix mode has an `Appendix line | Category | Weight` table + `**Task total**` row; Story Points mode has a **story-point value + rationale** per task.

## Plugin additions

1. **Close the TRD ↔ Jira loop.** After each batch verifies, **write the created issue keys back into the source artifacts**: next to each task in `task-list.md`, and next to the matching work slice in the TRD (hub manifest / spoke Work-slices, e.g. `- [x] [Android] Scan deep-link — FFE-1234`). The TRD and Jira now point at each other.
2. **Idempotent re-runs.** Before creating, skip any task that already carries a Jira key in `task-list.md` (from a prior run). Only upload the un-keyed tasks.

## After upload

Report (per the referenced skill): the Epic the tasks were linked under, the created keys + links, total count, anything skipped or flagged. Then confirm the TRD and task-list doc were updated with the new keys.
