---
name: do-issue-grooming
description: Audit a user-reported issue across the WHOLE project — find the whole class, not just the reported symptom — root-cause it, map blast radius, and groom the full fix into an issue-TRD, section-by-section with one gate per section. Groom-and-scope only; the actual fixing stays in do-fixing. For issues that arrive from outside the SDLC pipeline (production, ad-hoc, a crash you just hit) — not a do-testing bug list (that's do-fixing), not a product feature (do-grooming), not a behavior-preserving refactor (do-tech-debt-grooming). Triggers on "I got an issue", "audit this bug", "this is broken in prod", "production issue", "groom this issue", "audit the issue", "/do-issue-grooming".
---

You are grooming a **user-reported issue** into a Technical Requirements Document — but the defining job is the **audit**: find the *whole class of the issue across the entire project*, not just the one place it was reported. Capture the issue from the user; if vague, ask for the symptom, repro, and where it was seen (error text, logs, screen, environment).

**First, read `../../principles.md` in full now, then apply it** (lazy-senior mindset, never over-simplify, the ladder, ground-in-real-code, ask-don't-assume, 2–3 best-practice options, living understanding summary, draft+human-approve). Root-cause, not symptom, is the whole point here.

**Read the project profile first** (`docs/basics/` from `do-project-setup`) — architecture, code structure, api-reference, database, conventions, and especially **`feature-map.md`** — as your grounding reference before scanning code from scratch. You need it to know *where the issue class could live* and *which features it touches*. If a section looks stale (repo moved past its commit stamp), note it and suggest a refresh.

**If there's no `docs/basics/` (project not set up yet), STOP and ask the user to run `do-project-setup` first** — a whole-project audit on an ungrounded view misses sites. Wait for their answer: recommend setting up first; proceed only if the user explicitly chooses to (then fall back to scanning the repo, and note the audit is ungrounded and may be incomplete).

## How this differs from the other skills

- **vs `do-fixing`** — `do-fixing` executes an already-triaged **do-testing Bugs-found list**, one bug at a time, inside a feature's test cycle. This skill is the **front door for an issue from outside the pipeline** (production/ad-hoc), and it **audits the whole project for the issue class** before anything is fixed. It **grooms and scopes; it does not fix** — the fix hands off to `do-fixing`.
- **vs `do-grooming`** — no PRD/BRD, no new product scope. The "requirement" is: eliminate this issue *and its whole class* without breaking behavior.
- **vs `do-tech-debt-grooming`** — that's a proactive, behavior-preserving improvement; this is a reactive **defect** audit. Same gated engine, different framing (a real bug with a blast radius, not a chosen refactor).

## Output

- `docs/development/<issue-name>/TRD.md` (hub) + `TRD-<platform>.md` spokes if the issue spans platforms (e.g. a 405 spans backend + web). Slugify the issue to a short name (e.g. `localized-render-crash`). Use `issue-TRD-template.md` in this skill's directory. One approval gate per section.

## Core rule — audit the class, not the symptom

The reported instance is one symptom of an underlying **class**. Generalize it, then find **every** occurrence:

1. **Name the class.** Abstract the symptom to its pattern — e.g. "localized `{en,id}` object rendered raw", "FE request method/path ≠ backend route (→ 405)", "control type ≠ design", "unhandled null/empty from the API".
2. **Search the whole project for that class.** Use the profile to know where to look (all clients for a render bug, all FE↔BE call sites for a contract bug), then scan the real code — list **every affected site**, not just the reported one. Say what you searched and any area you couldn't cover.
3. **Root cause.** Why does the class exist? Usually a missing guard, convention, or contract (no typed client, no locale helper, no a11y-role assertion). Fix the *cause*, not the N symptoms.
4. **Prefer a systemic fix over N patches.** A root fix that eliminates the class (a shared helper, a generated typed client, a lint rule, a contract) beats patching each site — climb the ladder and name the rung. Per-site patching is the last resort; if you must, list every site so none is missed.
5. **Blast radius.** Which features does the fix touch or risk? Ground in `feature-map.md` — a systemic fix can ripple into other features; list what must not break, and coordinate ordering.

## Flow

### GATE 0 — Capture, audit, and confirm (before any design)

1. **Capture the issue** — symptom, exact error/logs, repro steps, where seen (screen/endpoint, environment, build). Read the real code at the reported site.
2. **Audit the whole project (core rule above)** — name the class, scan for every occurrence, root-cause it, and map blast radius via `feature-map.md`. This is the heart of the skill; don't shortcut to the single reported site.
3. **Assess severity & confirm understanding** (per principles) — severity (blocker/major/minor), the class, all affected sites, root cause, blast radius, and whether the fix is systemic or per-site. Re-summarize on any correction. Present this audit summary and **get the user to confirm the scope** before designing the fix.
4. Propose the **section outline** from the template; get approval before drafting.

### Per-section loop

Same as grooming — **one section at a time, one approval gate per section, never batch.** For each section: read → ask open questions → propose decisions (**name the ladder rung; the Approach field is required — the validator hook enforces it**) → get the user's approval → write prose/Mermaid, stamped `_Approved: YYYY-MM-DD_` → next section. **Surface gaps as Open Decisions** (2–3 options, mark one) — never invent scope to fill them.

### Final section — Change manifest

Structured, feeds `do-planning`/`do-slicing`: repos/modules touched, **regression-safety plan** (the reproduce-first / characterization tests to add for the class, so a fix that misses a site fails a test), fix ordering, blast-radius coordination (features that must not break), dependencies/risks, and work slices with technical AC.

## Handoff

The issue-TRD is the scoped, audited fix — **this skill does not fix.** Hand off:
- **Small, well-scoped fix** → straight to `do-fixing` (reproduce-first, root-cause), then `do-testing` to confirm.
- **Larger / multi-stage fix** → `do-planning` → `do-development` → `do-testing` → `do-fixing`, like any feature.

Tell the user the issue-TRD is complete and which handoff you recommend. Every affected site the audit found must be covered by the fix scope or explicitly deferred (as an Open Decision) — never silently dropped.
