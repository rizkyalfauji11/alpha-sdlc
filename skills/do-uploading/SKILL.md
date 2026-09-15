---
name: do-uploading
description: Optional tracker phase. Upload a task-list document (produced by do-slicing) to the org's tracker — Jira or GitHub Issues, per the profile's Org settings — bulk-create the tasks with story points, assignee and Epic/milestone parent, then write the created keys back into the TRD. Use when the user wants to upload/create the Jira tasks from the task list, push the sliced tasks to Jira, or import the task list. Triggers on "upload the task list", "create the jira tasks", "push tasks to jira", "/do-uploading", "import to jira".
---

> **Optional phase — tracker teams only.** Only run this if you used `do-slicing` and want the tasks created in the org's tracker (Jira or GitHub Issues, per Org settings). Teams without one skip it — development works straight from the TRD/plan.

You are uploading an already-written **task-list document to the org's tracker** (Jira or GitHub Issues — see Tracker routing below). This is the step `do-slicing` deliberately stops short of. Creating tracker items is an **external write** — the draft + human-approve discipline in `../../principles.md` is at its strongest here.

**Apply `../../principles.md`** — the plugin's `SessionStart` hook already injected it, so **read the file in full now only if it isn't in context** (hooks off, or a compaction dropped it); apply it either way — especially **draft + human-approve before any external write**, and ask-don't-assume for the Epic and assignee.

## Source

- Input = the task-list document from `do-slicing`, normally `docs/development/<feature-name>/task-list.md`. Confirm the path; if it doesn't exist, point the user to `do-slicing` first.
- Parsing: tasks are `#### T<id> — <title>`, each carrying a **story-point value + rationale** and a layer tag. **Check each part's `_Approved: <YYYY-MM-DD>_` stamp before uploading its tasks — missing → STOP** and send that part back to `do-slicing`; creating tracker items for tasks that never passed their review gate creates tracker items for work that never passed its gate (an explicit *proceed anyway* still overrides, with the gap recorded).

## Required inputs — ask first

1. **Jira project / board key** — e.g. `<PROJ>`; confirm which project the tasks belong in.
2. **Epic key** — e.g. `<PROJ>-1234`. **Hard precondition:** ask for it up front and **verify it is actually an Epic in that project** before creating anything. Never guess it from the feature name.
3. **Assignee** — who the tasks go to (or explicitly unassigned).

## Tracker routing

Read the profile's **Org settings → Tracker** (`01-overview.md`). `Jira` → the Jira mechanics below. `GitHub Issues` → the GitHub mechanics below. `none` → this skill doesn't apply; say so.

## Jira mechanics

Use the Atlassian MCP tools. Nothing here is org-specific — **discover fields at runtime rather than hardcoding ids**, because they differ per Jira instance.

- **Story Points** — discover the field id via `getJiraIssueTypeMetaWithFields` (commonly named "Story point estimate" or "Story Points"; often `customfield_10016`, **but it varies — never hardcode, and ask if two candidates are ambiguous**). Write the task's story-point value there.
- **Epic parent link** — set `parent: {"key": "<EPIC-KEY>"}`. On older instances that reject it, fall back to the epic-link custom field (often `customfield_10014`) — discover it, don't assume it.
- **Issue type** — confirm which type the tasks should be created as (Task / Story) from the project's metadata, not from habit.
- **Any additional required field** — if `getJiraIssueTypeMetaWithFields` reports a required field this skill doesn't know about (an org's own sizing, component, or category field), **stop and ask the user what value it takes** rather than skipping or inventing one. Record their answer in the run summary so the next upload doesn't re-ask blindly.
- **Sample-first, then batches of ≤ 5 with a review checkpoint after each** — never create the whole backlog unattended. This is the external-write gate; honor it strictly.
- **On any create failure, stop the batch** and report the exact Jira error — never keep creating past an error, and never retry silently in a way that risks duplicates.

## GitHub Issues mechanics

Use the `gh` CLI (available wherever the plugin runs) — same external-write discipline as Jira: **sample-first, then batches of ≤ 5 with a checkpoint after each; stop the batch on any create failure.**

- **Create:** `gh issue create --title "T<id> — <title>" --body <traced description + AC IDs> --label "sp:<points>" --label "<layer>"` — story points as an `sp:<n>` label (GitHub has no native points field; if the org uses Projects fields for points, ask and use `gh project item-edit` instead — discover, don't assume).
- **Epic parent:** a **milestone** (`--milestone <name>`) or a tracking issue the org designates — ask which convention the org uses; verify it exists before creating anything.
- **Write-back:** the created issue numbers (`#123`) land next to each task in `task-list.md` and the TRD work slices, same as Jira keys; idempotent re-runs skip tasks that already carry a number.

## Plugin additions

1. **Close the TRD ↔ Jira loop.** After each batch verifies, **write the created issue keys back into the source artifacts**: next to each task in `task-list.md`, and next to the matching work slice in the TRD (hub manifest / spoke Work-slices, e.g. `- [x] [Android] Scan deep-link — <PROJ>-1234`). The TRD and Jira now point at each other.
2. **Idempotent re-runs.** Before creating, skip any task that already carries a Jira key in `task-list.md` (from a prior run). Only upload the un-keyed tasks.

## After upload

Report in the shared **step-summary format** (`principles.md`) — header (development · phase · step · status), then the 5W+1H one self-contained statement each (no naked references) — **What** (plain + engineer), **Why**, **Who**, **When**, **Where**, **How** (ending with what I need from you) — engineer detail last — covering: the Epic the tasks were linked under, the created keys + links, total count, the field ids actually used (so the next run is reproducible), and anything skipped or flagged. Then confirm the TRD and task-list doc were updated with the new keys.
