---
name: do-tech-debt-grooming
description: Groom an engineer-initiated tech-debt / improvement into a Technical Requirements Doc, section-by-section with one gate per section. For behavior-preserving work — refactors, performance, fragility, dependency upgrades, cleanup — not product features (use do-grooming for those). Triggers on "tech debt", "refactor", "improve this", "pay down debt", "clean up", "this is slow/fragile", "/do-tech-debt-grooming".
---

You are grooming an **engineer-initiated improvement** (tech debt, refactor, performance, fragility,
dependency upgrade, cleanup) into a Technical Requirements Document. There is **no PRD** — the
engineer's problem statement is the input. Capture it from the user; if vague, ask what condition
they want to improve and why.

**Read `../../rules/groom.md` in full now** — these are this skill's binding rules, generated from
`principles.md`. They include the UI rules (containers never clip, identity not position, component
fidelity, visual values are tokens), which bind here on every platform. After a compaction, re-read
it and the reference file of your current step before the next gate. If the read is denied
(headless runs), say so in the step report — rules never loaded cannot bind. Especially:
lazy-senior mindset, never over-simplify, the ladder, ground-in-real-code, ask-don't-assume, 2–3
best-practice options, living understanding summary, draft+human-approve.

**Auto-run/auto-decide NEVER applies in this skill** — this is a decision phase. If the user asks
for auto mode here, decline in one line ("this phase decides — gates apply; auto-run starts at
`do-development`") and proceed gated: every gate blocks as normal, nothing auto-decides.

Every gate you present: header `<development> · <phase> · <step> · ✅/⏸/⚠️`, then Bottom line (what
happened + what I need from you) → Why it matters (never omitted when a question is asked) →
Options ★ → Context (only where it adds something) → Details (for engineers) → Next as the last
paragraph (rules → *Present every step bottom line first*). The plain layer is in the org's
language and follows its guide in `../../plain-language/` when one exists (`id.md` for Bahasa
Indonesia) — at every gate, in every phase.

## Gates

- No `docs/basics/` → **STOP**: ask for `do-project-setup` first; groom without it only if the user
  explicitly chooses to.
- Gate 0 → **STOP** at step 2 until the user confirms the work is worth doing now, at step 3 until
  the understanding is confirmed, at step 4 until the outline is approved; then write the skeleton.
- Each section → ask, propose, **STOP** for approval — one at a time, never a batch; on approval
  write it and stamp `_Approved: <YYYY-MM-DD> · <commit>_`.
- The hub review, once the last section is written → verdict, **STOP**; no spoke before the `Hub
  review` row is ✅. Each spoke's hub-alignment review → verdict, **STOP**; it is complete only on a
  clean, stamped pass. A hub-wrong finding changes the hub only on a yes to that change itself.
- Review rounds flat or rising across three → **STOP**, escalate with the trend.
- Auto-run never applies here.

## Flow

**Read the project profile first** (`docs/basics/` from `do-project-setup`) — **start with
`06-domain-model.md` + `16-feature-map.md`** (what the refactor's blast radius touches), then
architecture, code structure, tech-stack, database, conventions as needed — as your grounding
reference before scanning code from scratch. Tech-debt work especially depends on knowing the real
structure and conventions you're preserving. If a section looks stale (repo moved past its commit
stamp), note it and suggest a refresh.

**If there's no `docs/basics/` (project not set up yet), STOP and ask the user to run
`do-project-setup` first** — grooming grounds in that profile, and skipping it means grooming on an
ungrounded view. Wait for their answer: recommend setting up first; proceed without it only if the
user explicitly chooses to (then fall back to scanning the repo, and note that decisions are
ungrounded).

### GATE 0 — Understand and justify (before any design)

0. **Start from the register.** Read `docs/basics/20-tech-debt-register.md` — the standing backlog:
   if the improvement is already a `TD-<n>` row, groom that row (flip it `groomed → <TRD link>` when
   this TRD lands; when the paid work ships — `do-testing` green — the row is deleted); if it is
   new, **add its row first** (register-on-create: it takes the register's **Next ID**, which the
   same edit increments), then groom.
1. **Capture the condition** — what's wrong today, where, and how the engineer knows (a metric, an
   incident, a painful change, a scan). Read the real code involved. **Map the cross-feature blast
   radius:** run the impact analysis in `docs/basics/16-feature-map.md` (reverse dependency edges) +
   `06-domain-model.md`'s *Consumed by* — which features consume the modules/entities/contracts
   being refactored. Those consumers' flows are what "behavior-preserving" must preserve.
2. **Justify it — cost of delay vs cost to fix.** State what the debt costs if left (incidents, slow
   delivery, risk) and roughly what fixing costs. **If it's speculative polishing with no real cost,
   say so and recommend deferring** (YAGNI applies to refactors). Get the user to confirm it's worth
   doing now before designing anything.
3. **Summarize & confirm understanding** (per principles) — condition, blast radius, whether any
   behavior change is intended, the measurable target. Re-summarize on any correction.
4. Propose the **section outline** from the template; get approval before drafting. **On approval,
   write the skeleton** `docs/development/<feature-name>/TRD.md`: the header rows filled; §1's
   **Gate-0 notes** (the register row, the condition and blast radius, the go-ahead and why, the
   confirmed understanding); *Carry-forward answers* for what the user already said about a later
   section; each approved heading with `_Pending_` on the line under it and no body yet.

### Per-section loop

Same as grooming — **one section at a time, one approval gate per section, never all sections in one
batch.** For each section: read → ask open questions (none open → say so in one line and propose in
the same turn) → propose decisions (name the ladder rung **and the world-wide standard**; **the
Approach field is required** — the validator hook rejects one left empty or as a whole `<…>`
placeholder) → get the user's approval → write prose/Mermaid, `_Pending_` replaced by
`_Approved: <YYYY-MM-DD> · <commit>_` (today, HEAD's short hash) → move to the next section. One
section at a time; never offer to approve the rest in a batch. An answer that belongs to a later
section goes into *Carry-forward answers* at once (`- §<n>: <the answer>`); that section's gate
folds it in and deletes it. **Surface gaps as Open Decisions** (2–3 options, mark one — the ★
always the quality/world-standard option, never the cheapest) — never invent scope to fill them. No
template placeholder (`<…>`) survives into a TRD; the hook blocks `<YYYY-MM-DD>`, `<hash>`,
`<engineer>`.

### Final section — Change manifest

Structured, feeds `do-slicing`: modules touched, **regression-safety plan** (characterization tests
to add first), measurable success + how it's checked, rollback, dependencies/risks, and work slices
**claiming their AC by ID from §6** — never restating the criterion's prose.

### Hub review, spokes, then the phase end

Once the last section is written, the hub review (*Reviews* below). When the work spans platforms,
each spoke follows from `../do-grooming/TRD-spoke-template.md`, the approved hub as primary
context — its outline (**STOP** for approval), its skeleton, the per-section loop, its
hub-alignment review. After the hub review ✅ (with spokes: the last alignment ✅), tell the user
the TRD is complete and flip the register row.

## Resume (fresh session)

The TRD is the state — stamps, `_Pending_` headings, §1's Gate-0 notes, *Carry-forward answers*,
the `Hub review` and *Spokes* rows, each spoke's header rows. Run `node ../../scripts/next-step.js
docs/development/<feature-name> [<platform>] --phase grooming` first (a spoke: its platform): exit 0
names the next unit, exit 1 a STOP to present, exit 2 an older or unknown format — read the files it
lists instead. Read `.alpha-sdlc/next/<feature-name>--hub.json` (a spoke: `--<platform>`) and its
handoff when present, set the next-file's `status` to `consumed`, and state the recorded
understanding in one line. Re-read only what it lists. Never re-run Gate 0 or a stamped section,
and never re-ask what the TRD records.

**Session boundaries** (rules → *The session is disposable — the files are the state*): after the
Gate-0 skeleton is written, after the hub review ✅, after each spoke's alignment ✅, and at the
phase end — never mid-section, never between a review report and its fixes. Persist first, then
write the next-file (`skill` `alpha-sdlc:do-tech-debt-grooming`, `args` `<feature-name>
[<platform>]`; at the phase end `do-slicing` when the work is tracked, else `do-planning`) and offer
"/clear, then 'lanjut'" in Next.

## Reviews — `../do-grooming/grooming-review.md`, tech-debt row

Same engine (gated section-by-section TRD, hub/spokes, ladder, Mermaid, flows into `do-slicing`) —
**including the hub-alignment review**: every spoke passes it before it's complete, gets stamped on
both sides, and is re-reviewed whenever a hub section changes (see `do-grooming` → *Hub-alignment
review*) — and the hub passes the **hub review** before the first spoke (`do-grooming` → Step 2a).
Run both by `../do-grooming/grooming-review.md` — read it before each review and whenever a hub edit
stales a spoke (once per session, again after a compaction). This variant:
**read that checklist by what it checks, not by its section numbers — a tech-debt TRD numbers its
sections differently:** its AC registry is §6 and its slices are §8, so the AC ↔ slice point reads
"every §6 AC claimed by ≥ 1 §8 slice and back" (a spoke's: its §8 and §9); **contract fidelity and
feature-flow coverage apply only when the refactor touches a contract or a user flow** — skip them
otherwise and say so in the verdict rather than reporting them passed, building that packet with
`--items` that leave them out. Stamps: every hub-review round appends its count to the `Hub review`
row; each spoke's stamp sits in the hub's *Spokes* row (its one hub-side home) and in the spoke's
`Hub alignment` and `Alignment rounds` rows.

## How this differs from `do-grooming`

Different framing: **no product evolution, new-feature possibilities, Figma, or business AC — and
this skill authors no widget spec or section slicing** (it isn't designing UI). **But when the
target *is* UI** — extracting a component, migrating a screen's toolkit, splitting a god-view — the
screen's existing **`section-slicing/<screen>.md` is the behavior-preserving contract**: every case
it lists must still render identically after the refactor, so bind the TRD's *Regression safety*
section to that case list (case → how it's proven unchanged) and treat the case crops as the
before-picture. **If the screen has no section-slicing doc, say so and call it a risk** — a UI
refactor without an enumerated case list is how a variant nobody remembered disappears; offer to
have `do-grooming` slice the screen first (recommended for anything beyond a rename), or fall back
to a screenshot baseline of the cases you can reach and record what stays uncovered. Instead:

- **Behavior-preserving by default.** The success criterion is usually "behaves identically,
  measurably better." Any *intended* behavior change must be called out explicitly.
- **Justify before designing.** Tech debt is where over-engineering sneaks back in. The first gate
  is whether this is worth doing *now*.
- **Measurable target.** "Better" must be a number (p95 latency, crash rate, build time, complexity,
  coverage, duplicated lines), not a vibe.
- **Regression safety is the AC.** TDD flavor here is **characterization tests first** — pin the
  current behavior, then refactor while green. **When the refactor touches shared entities,
  contracts, or cache wiring, regression safety extends to the seam:** the consuming features'
  **flow-binding tests (create + destructive)** and their Boot & Smoke journeys must stay green too
  — unit-level characterization alone can pass while a consumer's flow breaks.

## Output

- `docs/development/<feature-name>/TRD.md` (hub) + `TRD-<platform>.md` spokes if multi-platform.
  Slugify the improvement to a short name. Use `tech-debt-TRD-template.md` in this skill's
  directory; a spoke uses `../do-grooming/TRD-spoke-template.md`. One approval gate per section.
