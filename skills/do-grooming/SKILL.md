---
name: do-grooming
description: Groom a PRD/BRD into a Technical Requirements Document (TRD.md) section-by-section, with one approval gate per section. Use when the user wants to groom a requirement, turn a PRD/BRD into a TRD, do technical grooming, or kick off SDLC grooming. Triggers on "groom", "do grooming", "/do-grooming", "create a TRD", "technical grooming".
---

You are grooming a product requirement into a **Technical Requirements Document**.
Identify the PRD/BRD source from the user's request (a URL, a file path). If none is given, ask for it.

**First, read `../../principles.md` in full now, then apply it** (lazy-senior-engineer mindset, never over-simplify, the ladder, ground-in-real-code, ask-don't-assume, 2–3 best-practice options, living understanding summary, draft+human-approve). The rules below are grooming-specific additions.

**Read the project profile first** (`docs/basics/` from `do-project-setup`) — architecture, code structure, tech-stack, database, api-reference, conventions, etc. — as your grounding reference before scanning code from scratch. If a section looks stale (repo moved past its commit stamp), note it and suggest a refresh.

**If there's no `docs/basics/` (project not set up yet), STOP and ask the user to run `do-project-setup` first** — grooming grounds in that profile, and skipping it means grooming on an ungrounded view. Wait for their answer: recommend setting up first; proceed to groom without it only if the user explicitly chooses to (then fall back to scanning the repo, and note that decisions are ungrounded).

## Hub + spokes model

A feature's TRD is split into a **hub** (shared, single source of truth) and one **spoke per platform** that teams groom independently:

```
docs/development/<feature-name>/
  TRD.md            ← hub: context, system design, API contract, cross-cutting, change manifest
  TRD-backend.md    ← spoke (only for platforms in scope)
  TRD-android.md
  TRD-ios.md
  TRD-web.md
```

- **The hub is the single source of truth.** The API contract, system design, and cross-cutting decisions live there once. Spokes **link** to the hub — never copy the contract into a spoke, or it drifts.
- **The hub is groomed first — hard gate, no spoke without an approved hub contract.** A spoke depends on the hub's **API contract** (it derives its typed client + fixtures from that machine-checkable contract), so a spoke **cannot** be groomed until the hub exists **and its API-contract section is approved**. If a user asks to groom a spoke and there's no hub — or a hub exists but its API-contract section isn't approved yet — **STOP and groom the hub (through at least the approved API contract) first.** Never start a spoke on a missing or unapproved contract; that's exactly how spokes drift and produce the 405 / wrong-shape bugs.
- Templates (in this skill's directory): `TRD-hub-template.md` for the hub, `TRD-spoke-template.md` for each spoke. Read the relevant one first.

## Rules

- **Output path**: hub → `docs/development/<feature-name>/TRD.md`; spoke → `docs/development/<feature-name>/TRD-<platform>.md` (slugify feature name to kebab-case; create the dir if needed; append if the file exists). The file being groomed IS the state — if interrupted, re-running resumes from what's written.
- **One approval gate per section.** Never write a section's prose to the TRD file until the user approves that section's *decisions*. Do not batch-write the whole doc.
- The gate is on the **decisions**, not the wording. After approval, expanding to prose is mechanical — no second gate.
- Technical design sections use **Mermaid** code blocks (```mermaid), never images. UI design is product-owned — carry a Figma/link reference only, do not generate UI.
- **The API contract must be machine-checkable — not just a prose table.** The hub's API contract is the single truth every spoke consumes; a prose table lets each side *guess* the shape and drift (this is the root of 405s and "`Objects are not valid as a React child {en,id}`"-class crashes). So the contract must be, or point to, a **machine-checkable spec** (OpenAPI/Swagger preferred; a shared schema/types file otherwise) — living authoritatively in one repo (backend/contract), referenced by the others. Specify **every field precisely**: exact type, **nullability**, **enum values**, and **localized fields as objects** (e.g. `name: { en: string; id: string }`, *not* `string`) — vague types are what let a client render an object as a string. Ladder-check reuse: if an OpenAPI spec already exists, point to it (rung 2); only introduce one when the contract is prose-only today. This spec is what downstream derives from: clients generate a **typed client** and **test fixtures** from it (see `do-development`/`do-testing`) instead of hand-authoring shapes that drift. Record the spec's location in the hub's *API contracts* section and in `docs/basics/api-reference.md`.
- **Capture design the moment the user shares it (client grooming).** Users typically give the design here, not at planning — so save it now and don't make them re-provide it later: **image(s) → save to `docs/development/<feature-name>/design/<screen>.png`** (create `design/`); **Figma → record the frame link.** Record the reference in the screen's **widget-spec `Design` field** (the per-screen UI contract). `do-planning` reads these forward into its *Design references* for the visual-parity loop — it should not re-ask for anything grooming already captured.
- **Create a widget spec per screen (client spoke grooming).** For Android/iOS/Web features, write one **widget-spec doc per screen** at `docs/development/<feature-name>/widget-spec/<screen-name>.md` using `widget-spec-template.md`. List every **interactive or asserted** UI element (skip decorative) with a stable **Test ID** (convention `<feature>_<screen>_<element>`, snake_case, never renamed once shipped) and a **content description** that doubles as the accessibility label. The Test ID is one shared value across platforms, applied via the native attribute — Android `resource-id` (`android:id` for Views, or Compose `testTag` + `testTagsAsResourceId=true` so QA tools see it), iOS `accessibilityIdentifier`, Web `data-testid`. This is the **QA locator contract** — `do-development` implements these exact IDs and `do-testing` locates by them. It's a living spec: elements found later get added. (Backend spokes have no widget spec.) Also fill the widget-spec's **Container sizing & overflow** table for any variable-content container on the screen (dialog, sheet, list, form, multi-line text): sizing, overflow behavior, and that it must **fit content or scroll, never clip** — this is what prevents "dialog doesn't fit its content" downstream.
- **Resolve assets via the asset search flow (spoke grooming).** When grooming a platform spoke, identify the icons/images/drawables/SF Symbols/SVGs/fonts/colors the feature needs. For each one, search in this order and **stop at the first hit** (create-new is the last resort — ladder rung 2, reuse before build):
  1. **Registry** — search `docs/basics/asset-registry.md` (from `do-project-setup`) by name and tags.
  2. **Assets module** — if there's no registry, or no match in it, check the actual asset-providing module/package. Find *where assets live* from `docs/basics/ui-architecture.md` (asset locations / design-system module), then search there directly (Android `res/drawable`·`mipmap`, iOS asset catalogs/SF Symbols, web `assets`/icon set).
  3. **Ask the user** — if still no match: ask whether to **(a) scan the whole project** for it, or **(b) create a new asset**. Don't silently full-scan (expensive) or silently create.
  - At each level: **exact match → reuse** (cite its path); **similar (not exact) → adapt + flag for user re-validation** (state why it fits; "similar enough" is a judgment call — wrong size/state/brand variant slips through), confirm before treating as resolved; **create-new** only after step 3.
  - Record the outcome in the spoke's **Assets** section. Only create-new assets become work slices.

- **Surface gaps as Open Decisions (don't over-deliver).** Whenever the design/PRD is silent or ambiguous about something an implementation would need (a missing state, unspecified behavior, an edge case, an interaction the mockup doesn't show), **record it in the spoke's `Open Decisions` section** with 2–3 recommended options (mark one) — and **ask the user to decide, then update the design.** Never resolve a gap by adding scope yourself. Decided items get **re-groomed**: fold the decision into the relevant section, flip its status to *decided*. **Only *decided* scope flows downstream** — unresolved decisions block the affected slice.

## Flow

### Step 0 — Read inputs and propose the outline (GATE 0)

1. Confirm the **feature name** (slugify to kebab-case) and **what is being groomed**: the **hub**, or a **platform spoke** (which one)? Check `docs/development/<feature-name>/` for an existing hub.
   - Grooming the **hub** → use `TRD-hub-template.md`, also confirm which platforms are in scope (Backend / Android / iOS / Web) so the change manifest lists the right spokes.
   - Grooming a **spoke** → **check the hub first: if no hub exists, or its API-contract section isn't approved yet, STOP and groom the hub (through at least its approved API contract) before the spoke** — the spoke can't be groomed against a missing/unapproved contract. Only once the hub's contract is approved: read the approved hub (`TRD.md`) as primary context and use `TRD-spoke-template.md`.
2. Read the PRD/BRD source. Confluence URL → fetch via Atlassian MCP; file/PDF → read it; empty → ask.
3. Scan the repo for this platform/feature (structure, key modules, schema). If the existing structure allows **more than one viable approach** (e.g. extend an existing service vs. add a new one, reuse a pattern vs. introduce one), lay out the options with their tradeoffs and **ask the user which approach to use** before going further. Don't pick one silently.
4. **Summarize and confirm understanding.** Give the user a concise summary of what you took from the BRD/PRD and the code (problem, scope, key facts, constraints, what already exists to reuse). Ask them to confirm or correct it. If they correct anything, re-check the sources, re-summarize the delta, and re-confirm before continuing. Don't propose the outline on a stale or unconfirmed understanding.
5. **Anticipate evolution AND proactively surface new-feature possibilities.** Two distinct things — always present both to the user, even when the BRD mentions neither:
   - **Evolution of this feature** — how it tends to grow over time so the chosen approach doesn't paint into a corner (e.g. single-tenant → multi-tenant, single-currency → multi-currency, one auth → SSO/MFA, one locale → i18n, sync → event-driven). Suggest 2–3 likely paths from how common global products in this domain evolve, and ask which are realistic.
   - **New/adjacent feature possibilities** — opportunities this work *unlocks* that the BRD did **not** ask for (e.g. "once the widget deep-links exist, the same mechanism enables a Transfer/Pulsa widget" or "this data feed could power a lock-screen balance complication"). **Inform the user explicitly** of these — name them as opportunities, not as scope.
   - Design only for the **confirmed** current scope. Record anticipated-but-unconfirmed evolution and any unlocked possibilities as notes (ladder rung 1: don't build for speculative needs, just don't block them, and make sure the user *knows* the option exists).
6. Read the relevant template and propose a **section outline** based on it. Drop sections that don't apply; add ones that do.
7. **Stop and ask the user to approve or edit the outline.** Do not draft any content yet.

If the PRD describes a tiny change, say so and offer to skip the TRD and go straight to planning (or tickets, if you use Jira) instead.

### Step 1 — Per-section loop

For each approved section, in order:

1. **Read needs**: the PRD + all already-approved sections (read the current TRD file) + the relevant repo code for this section.
2. **Ask first**: list the open questions for this section — anything the PRD and repo don't answer — and get the user's answers. Don't proceed on assumptions.
3. **Propose** the section as terse **decisions** — bullets of *what / why / tradeoff*. For design sections, the proposal includes the Mermaid diagram.
4. **Approve**: ask the user — approve as-is / approve with edits / regenerate with feedback. Apply their edits to the decisions — the edited version is what gets written and fed forward. One section at a time; never offer to approve the rest in a batch.
5. **Write**: expand the approved decisions into prose (+ Mermaid) and append the section to the TRD file, following the template's structure. No second approval. **Stamp the section with its approval date** — add `_Approved: YYYY-MM-DD_` right under the section heading, using today's date.

### Step 2 — Final section

The last section is **structured** (it feeds downstream ticket-slicing and monitoring):

- **Hub** → Change manifest: repos/modules per platform (with links to spokes), cross-platform release ordering, shared dependencies/risks, and a work-slice summary tagged by platform.
- **Spoke** → Work slices: this platform's candidate tickets with acceptance criteria. Mirror the summary line up into the hub's manifest.

When grooming a spoke, also update the hub's **Spokes** field to link the new spoke.

Then tell the user the TRD is complete and should be reviewed as a PR.
