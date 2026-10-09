---
name: do-uploading
description: Optional tracker phase. Upload a task-list document (produced by do-slicing) to the org's tracker — Jira or GitHub Issues, per the profile's Org settings — bulk-create the tasks with story points, assignee and Epic/milestone parent, then write the created keys back into the TRD. Use when the user wants to upload/create the Jira tasks from the task list, push the sliced tasks to Jira, or import the task list. Triggers on "upload the task list", "create the jira tasks", "push tasks to jira", "/do-uploading", "import to jira".
---

> **Optional phase — tracker teams only.** Only run this if you used `do-slicing` and want the tasks
> created in the org's tracker (Jira or GitHub Issues, per Org settings). Teams without one skip it
> — development works straight from the TRD/plan.

You are uploading an already-written **task-list document to the org's tracker** (Jira or GitHub
Issues — see Tracker routing below). This is the step `do-slicing` deliberately stops short of.
Creating tracker items is an **external write** — the draft + human-approve discipline in the
rules is at its strongest here.

**Read `../../rules/tracker.md` in full now** — these are this skill's binding rules, generated
from `principles.md`. After a compaction, re-read it before the next gate. If the read is denied
(headless runs), say so in the step report — rules never loaded cannot bind. Especially: **draft +
human-approve before any external write**, and ask-don't-assume for the Epic and assignee.

Every gate you present: header `<development> · <phase> · <step> · ✅/⏸/⚠️`, then Bottom line (what
happened + what I need from you) → Why it matters (never omitted when a question is asked) →
Options ★ → Context (only where it adds something) → Details (for engineers) → Next as the last
paragraph (rules → *Present every step bottom line first*). The plain layer is in the org's
language and follows its guide in `../../plain-language/` when one exists (`id.md` for Bahasa
Indonesia) — at every gate, in every phase.

## Gates

- No `task-list.md` → point the user to `do-slicing` first.
- A part's `_Approved:` stamp missing, or the part changed after it → **STOP**, back to
  `do-slicing` (an explicit *proceed anyway* overrides, with the gap recorded).
- Tracker `none` → this skill doesn't apply; say so.
- Jira: the Epic is verified as an Epic in that project before anything is created — never
  guessed. GitHub: the milestone or tracking issue is verified to exist.
- A required field this skill doesn't know → **STOP** and ask what value it takes.
- Sample first, then batches of ≤ 5 — each drafted and created only after the user approves, with
  a review checkpoint after each; never the whole backlog unattended.
- Any create failure → stop the batch and report the exact error; never retry silently.

## Flow — check → ask → sample → batches → write back

1. **Check the source** (*Source*): the task list exists and every part to upload has a fresh stamp.
2. **Route and ask** (*Tracker routing*, *Required inputs*): only what the tracker needs; state what
   the task list's `Upload` row already records instead of asking again.
3. **Sample, then batches of ≤ 5**: draft each create (title, points, AC, parent, assignee), create
   only on approval, verify it in the tracker, then the review checkpoint before the next batch.
4. **Write back** after each verified batch (*Plugin additions*); after the last, report (*After
   upload*).

## Resume (fresh session)

`task-list.md` is the state: a task with a `Key` line is created, and the header's `Upload` row
holds the settled answers. `next-step.js` has no uploading phase, so read the files — the task
list, `.alpha-sdlc/next/<feature>--tasks.json` and its handoff when present, in one batch (rules →
*Batch independent reads*) — set the next-file's `status` to `consumed`, and state the recorded
understanding in one line. Re-check the stamps of the parts still to upload, then continue with
the first task without a key — never re-ask what the `Upload` row records, and never re-create a
keyed task.

**Session boundaries** (rules → *The session is disposable — the files are the state*): after each
verified batch with its keys written back, and at the phase end — never mid-batch, never between a
draft and its approval. Persist first, then write the next-file
`.alpha-sdlc/next/<feature>--tasks.json` — `alpha-sdlc:do-uploading` with the next batch as
`unit`; at the phase end one `.alpha-sdlc/next/<feature>--<platform>.json` per platform spoke for
`alpha-sdlc:do-planning`, and `<feature>--tasks.json`'s `status` set to `consumed` — the upload is
done, so no later session may offer it again. The Next paragraph offers the fresh session
("/clear, then 'lanjut'" or `/alpha-sdlc:do-uploading <feature>`); skip it when little work
remains.

## Source

- Input = the task-list document from `do-slicing`, normally
  `docs/development/<feature-name>/task-list.md`. Confirm the path; if it doesn't exist, point the
  user to `do-slicing` first.
- Parsing: tasks are `#### T<g>.<n> — [<layer>] <title>` (`../do-slicing/task-list-template.md`),
  each carrying a **story-point value + rationale**, its AC IDs and its slice.
- **Check each part's `_Approved: commit <hash> · <YYYY-MM-DD>_` stamp before uploading its
  tasks. Missing, or the part changed after its stamp was written → STOP** and send that part back
  to `do-slicing`. Changed means a commit after the one that wrote the stamp, or an uncommitted
  edit, touches the part's lines (`git log -p <hash>.. -- task-list.md`, `git diff HEAD --
  task-list.md`); the `Key` lines this skill writes back are not edits. Tracker items for a part
  that never passed its review gate assign unreviewed work to people (an explicit *proceed anyway*
  still overrides, with the gap recorded).

## Tracker routing

Read the profile's **Org settings → Tracker** (`01-overview.md`). `Jira` → the Jira mechanics below.
`GitHub Issues` → the GitHub mechanics below. `none` → this skill doesn't apply; say so.

## Required inputs — ask first

Ask only what the routed tracker needs. As each answer is settled, record it in an `Upload` row of
the task list's header (tracker, project or repo, Epic or milestone, assignee, issue type, field
ids, each required-field answer) — a later run reads it instead of asking again.

**Jira** — 1. **project / board key** (e.g. `<PROJ>`; confirm which project the tasks belong in) ·
2. **Epic key** (e.g. `<PROJ>-1234`) — **hard precondition:** ask up front and **verify it is
actually an Epic in that project** before creating anything; never guess it from the feature name ·
3. **Assignee** (or explicitly unassigned).

**GitHub Issues** — the **repo**, the **milestone** the tasks belong to (verify it exists), and the
**assignee** (or explicitly unassigned).

## Jira mechanics

Use the Atlassian MCP tools. Nothing here is org-specific — **discover fields at runtime rather than
hardcoding ids**, because they differ per Jira instance.

- **Story Points** — discover the field id via `getJiraIssueTypeMetaWithFields` (commonly named
  "Story point estimate" or "Story Points"; often `customfield_10016`, **but it varies — never
  hardcode, and ask if two candidates are ambiguous**). Write the task's story-point value there.
- **Epic parent link** — set `parent: {"key": "<EPIC-KEY>"}`. On older instances that reject it,
  fall back to the epic-link custom field (often `customfield_10014`) — discover it, don't assume
  it.
- **Issue type** — confirm which type the tasks should be created as (Task / Story) from the
  project's metadata, not from habit.
- **Any additional required field** — if `getJiraIssueTypeMetaWithFields` reports a required field
  this skill doesn't know about (an org's own sizing, component, or category field), **stop and ask
  the user what value it takes** rather than skipping or inventing one. Record their answer in the
  run summary so the next upload doesn't re-ask blindly.
- **Sample-first, then batches of ≤ 5 with a review checkpoint after each** — never create the whole
  backlog unattended. This is the external-write gate; honor it strictly.
- **On any create failure, stop the batch** and report the exact Jira error — never keep creating
  past an error, and never retry silently in a way that risks duplicates.

## GitHub Issues mechanics

Use the `gh` CLI (available wherever the plugin runs) — same external-write discipline as Jira:
**sample-first, then batches of ≤ 5 with a checkpoint after each; stop the batch on any create
failure.**

- **Create:** `gh issue create --title "T<g>.<n> — [<layer>] <title>" --body <traced description +
  AC IDs> --label "sp:<points>" --label "<layer>"` — story points as an `sp:<n>` label (GitHub has
  no native points field; if the org uses Projects fields for points, ask and use `gh project
  item-edit` instead — discover, don't assume).
- **Epic parent:** a **milestone** (`--milestone <name>`) or a tracking issue the org designates —
  ask which convention the org uses; verify it exists before creating anything.
- **Write-back:** the created issue numbers (`#123`) land next to each task in `task-list.md` and
  the TRD work slices, same as Jira keys; idempotent re-runs skip tasks that already carry a number.

## Plugin additions

1. **Close the TRD ↔ Jira loop.** After each batch verifies, **write the created issue keys back
   into the source artifacts**: next to each task in `task-list.md` (a `- **Key:**` line under its
   heading), and next to the matching work slice in the TRD (hub manifest / spoke Work-slices, e.g.
   `- [x] [Android] Scan deep-link — <PROJ>-1234`). The TRD and Jira now point at each other.
2. **Idempotent re-runs.** Before creating, skip any task that already carries a Jira key in
   `task-list.md` (from a prior run). Only upload the un-keyed tasks.

## After upload

Report in the shared **step-summary format** (above) — the **bottom line** says what was created +
what I need from you — covering: the Epic the tasks were linked under, the created keys + links,
total count, the field ids actually used (so the next run is reproducible), and anything skipped or
flagged. Then confirm the TRD and task-list doc were updated with the new keys, and write the
phase-end next-files (*Session boundaries*).
