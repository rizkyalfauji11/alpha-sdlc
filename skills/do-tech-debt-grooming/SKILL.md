---
name: do-tech-debt-grooming
description: Groom an engineer-initiated tech-debt / improvement into a Technical Requirements Doc, section-by-section with one gate per section. For behavior-preserving work — refactors, performance, fragility, dependency upgrades, cleanup — not product features (use do-grooming for those). Triggers on "tech debt", "refactor", "improve this", "pay down debt", "clean up", "this is slow/fragile", "/do-tech-debt-grooming".
---

You are grooming an **engineer-initiated improvement** (tech debt, refactor, performance, fragility, dependency upgrade, cleanup) into a Technical Requirements Document. There is **no PRD** — the engineer's problem statement is the input. Capture it from the user; if vague, ask what condition they want to improve and why.

**Apply the shared principles in `../../principles.md`** (lazy-senior mindset, never over-simplify, the ladder, ground-in-real-code, ask-don't-assume, 2–3 best-practice options, living understanding summary, draft+human-approve).

## How this differs from `do-grooming`

Same engine (gated section-by-section TRD, hub/spokes, ladder, Mermaid, flows into `do-slicing`). Different framing: **no product evolution, new-feature possibilities, Figma, UI, widget spec, or business AC.** Instead:

- **Behavior-preserving by default.** The success criterion is usually "behaves identically, measurably better." Any *intended* behavior change must be called out explicitly.
- **Justify before designing.** Tech debt is where over-engineering sneaks back in. The first gate is whether this is worth doing *now*.
- **Measurable target.** "Better" must be a number (p95 latency, crash rate, build time, complexity, coverage, duplicated lines), not a vibe.
- **Regression safety is the AC.** TDD flavor here is **characterization tests first** — pin the current behavior, then refactor while green.

## Output

- `docs/development/<feature-name>/TRD.md` (hub) + `TRD-<platform>.md` spokes if multi-platform. Slugify the improvement to a short name. Use `tech-debt-TRD-template.md` in this skill's directory. One approval gate per section.

## Flow

### GATE 0 — Understand and justify (before any design)

1. **Capture the condition** — what's wrong today, where, and how the engineer knows (a metric, an incident, a painful change, a scan). Read the real code involved.
2. **Justify it — cost of delay vs cost to fix.** State what the debt costs if left (incidents, slow delivery, risk) and roughly what fixing costs. **If it's speculative polishing with no real cost, say so and recommend deferring** (YAGNI applies to refactors). Get the user to confirm it's worth doing now before designing anything.
3. **Summarize & confirm understanding** (per principles) — condition, blast radius, whether any behavior change is intended, the measurable target. Re-summarize on any correction.
4. Propose the **section outline** from the template; get approval before drafting.

### Per-section loop

Same as grooming: read → ask open questions → propose decisions (name the ladder rung; **Approach field is required** — the validator hook enforces it) → one approval gate → write prose/Mermaid, stamped `_Approved: YYYY-MM-DD_`.

### Final section — Change manifest

Structured, feeds `do-slicing`: modules touched, **regression-safety plan** (characterization tests to add first), measurable success + how it's checked, rollback, dependencies/risks, and work slices with technical AC.
