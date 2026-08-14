---
name: do-uploading
description: Optional Jira phase. Upload a task-list document (produced by do-slicing) to Jira — bulk-create the tasks with story points, assignee and Epic parent — then write the created keys back into the TRD. Use when the user wants to upload/create the Jira tasks from the task list, push the sliced tasks to Jira, or import the task list. Triggers on "upload the task list", "create the jira tasks", "push tasks to jira", "/do-uploading", "import to jira".
---

> **Optional phase — Jira only.** Only run this if you used `do-slicing` and want the tasks created in Jira. Teams not using Jira skip it — development works straight from the TRD/plan.

You are uploading an already-written **task-list document to Jira**. This is the step `do-slicing` deliberately stops short of. Creating Jira issues is an **external write** — the draft + human-approve discipline in `../../principles.md` is at its strongest here.

**First, read `../../principles.md` in full now, then apply it** — especially **draft + human-approve before any external write**, and ask-don't-assume for the Epic and assignee.

## Source

- Input = the task-list document from `do-slicing`, normally `docs/development/<feature-name>/task-list.md`. Confirm the path; if it doesn't exist, point the user to `do-slicing` first.
- Parsing: tasks are `#### T<id> — <title>`, each carrying a **story-point value + rationale** and a layer tag.

## Required inputs — ask first

1. **Jira project / board key** — e.g. `<PROJ>`; confirm which project the tasks belong in.
2. **Epic key** — e.g. `<PROJ>-1234`. **Hard precondition:** ask for it up front and **verify it is actually an Epic in that project** before creating anything. Never guess it from the feature name.
3. **Assignee** — who the tasks go to (or explicitly unassigned).

## Jira mechanics

Use the Atlassian MCP tools. Nothing here is org-specific — **discover fields at runtime rather than hardcoding ids**, because they differ per Jira instance.

- **Story Points** — discover the field id via `getJiraIssueTypeMetaWithFields` (commonly named "Story point estimate" or "Story Points"; often `customfield_10016`, **but it varies — never hardcode, and ask if two candidates are ambiguous**). Write the task's story-point value there.
- **Epic parent link** — set `parent: {"key": "<EPIC-KEY>"}`. On older instances that reject it, fall back to the epic-link custom field (often `customfield_10014`) — discover it, don't assume it.
- **Issue type** — confirm which type the tasks should be created as (Task / Story) from the project's metadata, not from habit.
- **Any additional required field** — if `getJiraIssueTypeMetaWithFields` reports a required field this skill doesn't know about (an org's own sizing, component, or category field), **stop and ask the user what value it takes** rather than skipping or inventing one. Record their answer in the run summary so the next upload doesn't re-ask blindly.
- **Sample-first, then batches of ≤ 5 with a review checkpoint after each** — never create the whole backlog unattended. This is the external-write gate; honor it strictly.
- **On any create failure, stop the batch** and report the exact Jira error — never keep creating past an error, and never retry silently in a way that risks duplicates.

## Plugin additions

1. **Close the TRD ↔ Jira loop.** After each batch verifies, **write the created issue keys back into the source artifacts**: next to each task in `task-list.md`, and next to the matching work slice in the TRD (hub manifest / spoke Work-slices, e.g. `- [x] [Android] Scan deep-link — <PROJ>-1234`). The TRD and Jira now point at each other.
2. **Idempotent re-runs.** Before creating, skip any task that already carries a Jira key in `task-list.md` (from a prior run). Only upload the un-keyed tasks.

## After upload

Report in the shared **step-summary format** (`principles.md`) — header (phase · step · status), then the 5W+1H one line each — **What** (plain + engineer), **Why**, **Who**, **When**, **Where**, **How** (ending with what I need from you) — engineer detail last — covering: the Epic the tasks were linked under, the created keys + links, total count, the field ids actually used (so the next run is reproducible), and anything skipped or flagged. Then confirm the TRD and task-list doc were updated with the new keys.
