---
name: do-grooming
description: Groom a PRD/BRD into a Technical Requirements Document (TRD.md) section-by-section, with one approval gate per section. Use when the user wants to groom a requirement, turn a PRD/BRD into a TRD, do technical grooming, or kick off SDLC grooming. Triggers on "groom", "do grooming", "/do-grooming", "create a TRD", "technical grooming".
---

You are grooming a product requirement into a **Technical Requirements Document**.
Identify the PRD/BRD source from the user's request (a URL, a file path). If none is given, ask for it.

**Apply the shared principles in `../../principles.md`** (lazy-senior-engineer mindset, never over-simplify, the ladder, ground-in-real-code, ask-don't-assume, 2–3 best-practice options, living understanding summary, draft+human-approve). The rules below are grooming-specific additions.

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
- **The hub is groomed first.** A spoke can't be groomed until the hub's API contract exists, because the spoke depends on it. If a user asks to groom a spoke and no hub exists, groom the hub first.
- Templates (in this skill's directory): `TRD-hub-template.md` for the hub, `TRD-spoke-template.md` for each spoke. Read the relevant one first.

## Rules

- **Output path**: hub → `docs/development/<feature-name>/TRD.md`; spoke → `docs/development/<feature-name>/TRD-<platform>.md` (slugify feature name to kebab-case; create the dir if needed; append if the file exists). The file being groomed IS the state — if interrupted, re-running resumes from what's written.
- **One approval gate per section.** Never write a section's prose to the TRD file until the user approves that section's *decisions*. Do not batch-write the whole doc.
- The gate is on the **decisions**, not the wording. After approval, expanding to prose is mechanical — no second gate.
- Technical design sections use **Mermaid** code blocks (```mermaid), never images. UI design is product-owned — carry a Figma/link reference only, do not generate UI.
- **Create a widget spec per screen (client spoke grooming).** For Android/iOS/Web features, write one **widget-spec doc per screen** at `docs/development/<feature-name>/widget-spec/<screen-name>.md` using `widget-spec-template.md`. List every **interactive or asserted** UI element (skip decorative) with a stable **Test ID** (convention `<feature>_<screen>_<element>`, snake_case, never renamed once shipped) and a **content description** that doubles as the accessibility label. The Test ID is one shared value across platforms, applied via the native attribute (Android `testTag`, iOS `accessibilityIdentifier`, Web `data-testid`). This is the **QA locator contract** — `do-development` implements these exact IDs and `do-testing` locates by them. It's a living spec: elements found later get added. (Backend spokes have no widget spec.)
- **Resolve assets via the asset ladder (spoke grooming).** When grooming a platform spoke, identify the icons/images/drawables/SF Symbols/SVGs/fonts/colors the feature needs, and for each one **search the real project** (Android `res/drawable`/`mipmap`, iOS asset catalogs/SF Symbols, web `assets`/icon set): (1) **exact match → reuse it** (cite its path); (2) **no exact but a similar asset exists → reuse or adapt it**, name the closest match — and **flag it for user re-validation**, because "similar enough" is a judgment call (wrong size/state/brand variant slips through silently); state *why* you think it fits and ask the user to confirm before it's treated as resolved; (3) **none → mark it create-new**. Record the result in the spoke's **Assets** section. Only create-new assets become work slices. This is ladder rung 2 (reuse) applied to assets — don't spec a new icon when one already ships.

## Flow

### Step 0 — Read inputs and propose the outline (GATE 0)

1. Confirm the **feature name** (slugify to kebab-case) and **what is being groomed**: the **hub**, or a **platform spoke** (which one)? Check `docs/development/<feature-name>/` for an existing hub.
   - Grooming the **hub** → use `TRD-hub-template.md`, also confirm which platforms are in scope (Backend / Android / iOS / Web) so the change manifest lists the right spokes.
   - Grooming a **spoke** → if no hub exists yet, groom the hub first. Otherwise read the approved hub (`TRD.md`) as primary context and use `TRD-spoke-template.md`.
2. Read the PRD/BRD source. Confluence URL → fetch via Atlassian MCP; file/PDF → read it; empty → ask.
3. Scan the repo for this platform/feature (structure, key modules, schema). If the existing structure allows **more than one viable approach** (e.g. extend an existing service vs. add a new one, reuse a pattern vs. introduce one), lay out the options with their tradeoffs and **ask the user which approach to use** before going further. Don't pick one silently.
4. **Summarize and confirm understanding.** Give the user a concise summary of what you took from the BRD/PRD and the code (problem, scope, key facts, constraints, what already exists to reuse). Ask them to confirm or correct it. If they correct anything, re-check the sources, re-summarize the delta, and re-confirm before continuing. Don't propose the outline on a stale or unconfirmed understanding.
5. **Anticipate evolution AND proactively surface new-feature possibilities.** Two distinct things — always present both to the user, even when the BRD mentions neither:
   - **Evolution of this feature** — how it tends to grow over time so the chosen approach doesn't paint into a corner (e.g. single-tenant → multi-tenant, single-currency → multi-currency, one auth → SSO/MFA, one locale → i18n, sync → event-driven). Suggest 2–3 likely paths from how common global products in this domain evolve, and ask which are realistic.
   - **New/adjacent feature possibilities** — opportunities this work *unlocks* that the BRD did **not** ask for (e.g. "once the widget deep-links exist, the same mechanism enables a Transfer/Pulsa widget" or "this data feed could power a lock-screen balance complication"). **Inform the user explicitly** of these — name them as opportunities, not as scope.
   - Design only for the **confirmed** current scope. Record anticipated-but-unconfirmed evolution and any unlocked possibilities as notes (ladder rung 1: don't build for speculative needs, just don't block them, and make sure the user *knows* the option exists).
6. Read the relevant template and propose a **section outline** based on it. Drop sections that don't apply; add ones that do.
7. **Stop and ask the user to approve or edit the outline.** Do not draft any content yet.

If the PRD describes a tiny change, say so and offer to skip the TRD and go straight to tickets instead.

### Step 1 — Per-section loop

For each approved section, in order:

1. **Read needs**: the PRD + all already-approved sections (read the current TRD file) + the relevant repo code for this section.
2. **Ask first**: list the open questions for this section — anything the PRD and repo don't answer — and get the user's answers. Don't proceed on assumptions.
3. **Propose** the section as terse **decisions** — bullets of *what / why / tradeoff*. For design sections, the proposal includes the Mermaid diagram.
4. **Approve**: ask the user — approve as-is / approve with edits / regenerate with feedback. Apply their edits to the decisions — the edited version is what gets written and fed forward.
   - Offer **"approve all remaining"** once they seem satisfied, so small TRDs aren't death-by-gates.
5. **Write**: expand the approved decisions into prose (+ Mermaid) and append the section to the TRD file, following the template's structure. No second approval. **Stamp the section with its approval date** — add `_Approved: YYYY-MM-DD_` right under the section heading, using today's date.

### Step 2 — Final section

The last section is **structured** (it feeds downstream ticket-slicing and monitoring):

- **Hub** → Change manifest: repos/modules per platform (with links to spokes), cross-platform release ordering, shared dependencies/risks, and a work-slice summary tagged by platform.
- **Spoke** → Work slices: this platform's candidate tickets with acceptance criteria. Mirror the summary line up into the hub's manifest.

When grooming a spoke, also update the hub's **Spokes** field to link the new spoke.

Then tell the user the TRD is complete and should be reviewed as a PR.
