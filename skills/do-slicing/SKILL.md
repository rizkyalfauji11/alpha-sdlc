---
name: do-slicing
description: Optional tracker phase. Turn an approved TRD into a task-list DOCUMENT, story-pointed on the modified Fibonacci scale, built part-by-part (part → review → write). Writes the document only; uploading to the tracker (Jira or GitHub Issues, per Org settings) is the separate downstream skill; skip both if you don't track work in one. Use when the user wants to slice a TRD into tasks, create a task list from a TRD, story-point a TRD's work, or prep tasks for Jira. Triggers on "slice the TRD", "create task list", "story point the tasks", "/do-slicing", "size the tasks".
---

> **Optional phase — tracker teams only.** Skip `do-slicing` and `do-uploading` entirely if your
> team doesn't track work in Jira or GitHub Issues: `do-planning` → `do-development` → `do-testing`
> run directly off the TRD's work slices + AC. Only use this phase if you want the TRD's slices
> turned into story-pointed tracker items.

You are converting an **approved TRD into a task-list document**, story-pointed. This is the
grooming → development hand-off for tracker teams. **This skill writes the document only — it does
NOT create or upload anything to the tracker; `do-uploading` does that.**

**Story Points is the only built-in scheme, deliberately** — it works on any Jira with no
custom-field setup. If your org sizes work with a custom weighting field instead, keep using
whatever skill implements it and skip this phase; this plugin stays standalone rather than depending
on an org-specific one.

**Read `../../rules/tracker.md` in full now** — these are this skill's binding rules, generated
from `principles.md`. After a compaction, re-read it and `task-list-template.md` before the next
gate. If the read is denied (headless runs), say so in the step report — rules never loaded cannot
bind. Especially: lazy-senior mindset, never over-simplify, ground-in-real-code, ask-don't-assume,
2–3 best-practice options, living understanding summary. Creating the doc is internal — the
no-external-write gate matters most for the *upload* skill, not this one.

Every gate you present: header `<development> · <phase> · <step> · ✅/⏸/⚠️`, then Bottom line (what
happened + what I need from you) → Why it matters (never omitted when a question is asked) →
Options ★ → Context (only where it adds something) → Details (for engineers) → Next as the last
paragraph (rules → *Present every step bottom line first*). The plain layer is in the org's
language and follows its guide in `../../plain-language/` when one exists (`id.md` for Bahasa
Indonesia) — at every gate, in every phase.

## Gates

- TRD not approved/complete → offer the matching grooming skill first.
- Spoke `Hub alignment` missing, `NOT REVIEWED` or older than the hub's last change → **STOP**.
- Setup → **STOP** until the scale and the part list are confirmed; record both in the task list.
- Each part → show its tasks for review (approve / edit / re-split) and **STOP**; on approval write
  it stamped `_Approved: commit <hash> · <YYYY-MM-DD>_`. Anything > 13 points is split first.
- After the last part: the summary, then **stop** — never create tracker items here.

## Flow — part → review → write

**Required inputs — ask first:**

1. **Feature** — which `docs/development/<feature-name>/` TRD to slice. Confirm it's
   approved/complete; if not, offer to run the matching grooming skill first. **Check the spoke's
   `Hub alignment` stamp the way `do-planning` does — missing, `NOT REVIEWED`, or older than the
   hub's last change → STOP**: this branch ends in external writes, so an unreviewed spoke's
   disagreement with its hub would be assigned to a human as tickets. A foundation spoke has no
   header table, so read its row in the hub's *Spokes* table (spelled `❌ not reviewed` there).
2. **Scale** — confirm modified Fibonacci (1, 2, 3, 5, 8, 13) or the team's variant. Nothing else is
   needed to write the doc; no Jira access at this stage.

A **part** = one phase group (or one platform spoke's slices). Build the document incrementally, one
part at a time:

1. **Setup (once):** confirm the **scale**, then summarize the TRD's full slice set grouped into
   parts and confirm the part list with the user. On confirmation, write the task list's header
   from `task-list-template.md` with the scale and the part list, each with its date — a fresh
   session reads them instead of asking again.
2. **For each part, loop:**
   - **Part** — take the part's TRD slices.
   - **Review** — draft that part's tasks and **show them for review** (approve / edit / re-split):
     task ID, title, description traced to the TRD slice **and its AC IDs from the TRD's numbered AC
     registry** (e.g. `AC-3, AC-7` — the spoke's §8 registry on a hub/spoke feature, never restated
     prose), layer tag, **story points + one-line rationale** (split anything > 13).
   - **Write** — append the approved part to the task-list document, **stamped `_Approved: commit
     <hash> · <YYYY-MM-DD>_` under the part's heading** (the doc records its gates, same as a TRD;
     `<hash>` is HEAD when the part is approved — `do-uploading` checks it), each task as
     `#### T<g>.<n> — [<layer>] <title>` per `task-list-template.md`. Move to the next part.
3. After all parts: write the summary (grand total / point distribution, open items) and present the
   finished document.

## Resume (fresh session)

`task-list.md` is the state: its header records the confirmed scale and part list, and each written
part carries its stamp. `next-step.js` has no slicing phase, so read the files: the next part is the
first in the part list with no stamped section. Read `.alpha-sdlc/next/<feature>--tasks.json` and
its handoff when present, set the next-file's `status` to `consumed`, and state the recorded
understanding in one line. Re-read the hub, the spokes' work slices and AC, and
`task-list-template.md` in one batch (rules → *Batch independent reads*). Never re-ask the scale or
the part list once recorded, and never re-gate a stamped part.

**Session boundaries** (rules → *The session is disposable — the files are the state*): after each
stamped part and at the phase end — never mid-part, never on an unstamped draft. Persist first,
then write the next-file `.alpha-sdlc/next/<feature>--tasks.json` — `alpha-sdlc:do-slicing` with
the next part as `unit`; at the phase end `alpha-sdlc:do-uploading`. The Next paragraph offers the
fresh session ("/clear, then 'lanjut'" or `/alpha-sdlc:do-slicing <feature>`); skip it when little
work remains.

## Source of tasks

- **Source = the TRD work slices.** Read the feature's TRD under `docs/development/<feature-name>/`:
  the hub's **Change manifest → work-slice summary** and every spoke's **Work slices** (with their
  AC). The TRD is the plan; do not invent tasks that aren't traceable to a slice (ask the user to
  amend the TRD instead).
- **Split tasks by architecture layer, so one task ≈ one development stage.** Read the repo's real
  layers from `docs/basics/02-architecture.md` and split each slice the same way `do-planning`
  stages it: `[contract]` (only when the API contract changes) → `[domain]` → `[data]` →
  `[presentation]`; on an **unlayered** project, minimum `[UI]` vs `[data-integration]` (API calls,
  DB, 3rd-party SDKs) — and never invent a layer the project doesn't have. Rules that keep this
  honest:
  - **Tag the layer in the task title** so the board shows which layer is in flight.
  - **Only the layers the slice touches** — a screen reusing an existing endpoint with no new
    business rule is one `[presentation]` task, not three. No ceremonial layer tasks.
  - **Shared lower-layer work is one task** — 3 screens over 1 repository = one `[domain]` + one
    `[data]` + one `[presentation]` task per screen.
  - **Size each layer task on its own** — its own story-point value + rationale; layer tasks are
    independently sized, and the split rule still binds on top (**anything > 13 must be split**).
  - **Tell the user the ticket count grows** before writing the part — a 3-screen feature goes from
    ~3 tickets to ~5–6. That's the cost of per-layer status on the board; if they'd rather have
    coarse tickets, they can say so and the tasks stay slice-level (the plan still splits by layer
    internally).

## Sizing — Story Points

Standard relative estimation, no custom Jira field required. Estimate each task on the **modified
Fibonacci scale: 1, 2, 3, 5, 8, 13**, weighing **complexity + effort/volume + uncertainty**
(relative sizing, **never hours**):
- **1** trivial (config/one-liner) · **2** small · **3** straightforward slice · **5** moderate,
  some unknowns · **8** complex / multi-part · **13** very complex → **must be split** (nothing
  larger than 13; break it into smaller tasks).
- Give a **one-line rationale** per estimate (what drove the number). One task = one story-point
  value.
- Stable task IDs (`T<group>.<n>`), and **no git/build/test-verification line items** — those aren't
  work, they're the definition of done.

## Output

- Write to `docs/development/<feature-name>/task-list.md` (or the path the user requests).
- The document IS the deliverable. **Stop here.** Do not create Jira issues — tell the user the doc
  is ready and that uploading is the next (separate) skill.
