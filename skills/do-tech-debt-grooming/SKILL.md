---
name: do-tech-debt-grooming
description: Groom an engineer-initiated tech-debt / improvement into a Technical Requirements Doc, section-by-section with one gate per section. For behavior-preserving work — refactors, performance, fragility, dependency upgrades, cleanup — not product features (use do-grooming for those). Triggers on "tech debt", "refactor", "improve this", "pay down debt", "clean up", "this is slow/fragile", "/do-tech-debt-grooming".
---

You are grooming an **engineer-initiated improvement** (tech debt, refactor, performance, fragility, dependency upgrade, cleanup) into a Technical Requirements Document. There is **no PRD** — the engineer's problem statement is the input. Capture it from the user; if vague, ask what condition they want to improve and why.

**First, read `../../principles.md` in full now, then apply it** (lazy-senior mindset, never over-simplify, the ladder, ground-in-real-code, ask-don't-assume, 2–3 best-practice options, living understanding summary, draft+human-approve).

**Read the project profile first** (`docs/basics/` from `do-project-setup`) — **start with `06-domain-model.md` + `16-feature-map.md`** (what the refactor's blast radius touches), then architecture, code structure, tech-stack, database, conventions as needed — as your grounding reference before scanning code from scratch. Tech-debt work especially depends on knowing the real structure and conventions you're preserving. If a section looks stale (repo moved past its commit stamp), note it and suggest a refresh.

**If there's no `docs/basics/` (project not set up yet), STOP and ask the user to run `do-project-setup` first** — grooming grounds in that profile, and skipping it means grooming on an ungrounded view. Wait for their answer: recommend setting up first; proceed without it only if the user explicitly chooses to (then fall back to scanning the repo, and note that decisions are ungrounded).

## How this differs from `do-grooming`

Same engine (gated section-by-section TRD, hub/spokes, ladder, Mermaid, flows into `do-slicing`) — **including the hub-alignment review**: every spoke passes it before it's complete, gets stamped, and is re-reviewed whenever a hub section changes (see `do-grooming` → *Hub-alignment review*). Different framing: **no product evolution, new-feature possibilities, Figma, or business AC — and this skill authors no widget spec or section slicing** (it isn't designing UI). **But when the target *is* UI** — extracting a component, migrating a screen's toolkit, splitting a god-view — the screen's existing **`section-slicing/<screen>.md` is the behavior-preserving contract**: every case it lists must still render identically after the refactor, so bind the TRD's *Regression safety* section to that case list (case → how it's proven unchanged) and treat the case crops as the before-picture. **If the screen has no section-slicing doc, say so and call it a risk** — a UI refactor without an enumerated case list is how a variant nobody remembered disappears; offer to have `do-grooming` slice the screen first (recommended for anything beyond a rename), or fall back to a screenshot baseline of the cases you can reach and record what stays uncovered. Instead:

- **Behavior-preserving by default.** The success criterion is usually "behaves identically, measurably better." Any *intended* behavior change must be called out explicitly.
- **Justify before designing.** Tech debt is where over-engineering sneaks back in. The first gate is whether this is worth doing *now*.
- **Measurable target.** "Better" must be a number (p95 latency, crash rate, build time, complexity, coverage, duplicated lines), not a vibe.
- **Regression safety is the AC.** TDD flavor here is **characterization tests first** — pin the current behavior, then refactor while green. **When the refactor touches shared entities, contracts, or cache wiring, regression safety extends to the seam:** the consuming features' **flow-binding tests (create + destructive)** and their Boot & Smoke journeys must stay green too — unit-level characterization alone can pass while a consumer's flow breaks.

## Output

- `docs/development/<feature-name>/TRD.md` (hub) + `TRD-<platform>.md` spokes if multi-platform. Slugify the improvement to a short name. Use `tech-debt-TRD-template.md` in this skill's directory. One approval gate per section.

## Flow

> Present every gate below in the shared **step-summary format** (`principles.md`): header (phase · step · status) · **What** (plain + engineer phrase) · **Why** (leads whenever a question is asked) · **Who** · **When** · **Where** · **How** (ends with what I need from you) · engineer detail last.

### GATE 0 — Understand and justify (before any design)

1. **Capture the condition** — what's wrong today, where, and how the engineer knows (a metric, an incident, a painful change, a scan). Read the real code involved. **Map the cross-feature blast radius:** run the impact analysis in `docs/basics/16-feature-map.md` (reverse dependency edges) + `06-domain-model.md`'s *Consumed by* — which features consume the modules/entities/contracts being refactored. Those consumers' flows are what "behavior-preserving" must preserve.
2. **Justify it — cost of delay vs cost to fix.** State what the debt costs if left (incidents, slow delivery, risk) and roughly what fixing costs. **If it's speculative polishing with no real cost, say so and recommend deferring** (YAGNI applies to refactors). Get the user to confirm it's worth doing now before designing anything.
3. **Summarize & confirm understanding** (per principles) — condition, blast radius, whether any behavior change is intended, the measurable target. Re-summarize on any correction.
4. Propose the **section outline** from the template; get approval before drafting.

### Per-section loop

Same as grooming — **one section at a time, one approval gate per section, never all sections in one batch.** For each section: read → ask open questions → propose decisions (name the ladder rung **and the world-wide standard**; **Approach field is required** — the validator hook enforces it) → get the user's approval → write prose/Mermaid, stamped `_Approved: YYYY-MM-DD_` → move to the next section. One section at a time; never offer to approve the rest in a batch.

### Final section — Change manifest

Structured, feeds `do-slicing`: modules touched, **regression-safety plan** (characterization tests to add first), measurable success + how it's checked, rollback, dependencies/risks, and work slices with technical AC.
