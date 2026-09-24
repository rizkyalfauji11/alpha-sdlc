---
name: do-grooming
description: Groom a PRD/BRD into a Technical Requirements Document (TRD.md) section-by-section, with one approval gate per section. Use when the user wants to groom a requirement, turn a PRD/BRD into a TRD, do technical grooming, or kick off SDLC grooming. For a PRODUCT FEATURE on a codebase that already exists — not the scaffold of a brand-new app (that's do-foundation-grooming, after do-project-setup decides the stack), not behavior-preserving refactor/performance/cleanup (do-tech-debt-grooming), not a reported bug or production issue (do-issue-grooming). Triggers on "groom", "do grooming", "/do-grooming", "create a TRD", "technical grooming".
---

You are grooming a product requirement into a **Technical Requirements Document**.
Identify the PRD/BRD source from the user's request (a URL, a file path). If none is given, ask for
it.

**Wrong skill for a project from zero.** If nothing is built yet and the ask is the **base** of a
new app/service (framework scaffold, folder structure, architecture skeleton), that's
`do-project-setup` in **greenfield mode** to decide the stack, then **`do-foundation-grooming`** for
the base — come back here for the **first product feature**, once a real profile exists to ground
in.

**Read `../../principles.md` in full now, then apply it** — the `SessionStart` hook injects only the
INDEX of these rules, never their text, so the file is the only place they actually bind
(lazy-senior-engineer mindset, never over-simplify, the ladder, ground-in-real-code,
ask-don't-assume, 2–3 best-practice options, living understanding summary, draft+human-approve). The
rules below are grooming-specific additions.


**Auto-run/auto-decide NEVER applies in this skill** — this is a decision phase. If the user asks
for auto mode here, decline in one line ("this phase decides — gates apply; auto-run starts at
`do-development`") and proceed gated: every gate blocks as normal, nothing auto-decides.

**Read the project profile first** (`docs/basics/` from `do-project-setup`) — **start with
`06-domain-model.md` (the shared entities) and `16-feature-map.md` (how features depend on each
other)**, then architecture (incl. its **wiring patterns** — spoke designs describe boundaries in
those terms), `19-code-inventory.md` (**reuse existing units before proposing new logic** — a slice
that re-implements a registered job is a duplicate, not work), tech-stack, database, api-reference,
data-cache, conventions, ux-conventions as the section needs them — as your grounding reference
before scanning code from scratch. If a section looks stale (repo moved past its commit stamp), note
it and suggest a refresh.

**If there's no `docs/basics/` (project not set up yet), STOP and ask the user to run `do-project-setup` first**
— grooming grounds in that profile, and skipping it means grooming on an ungrounded view. Wait for
their answer: recommend setting up first; proceed to groom without it only if the user explicitly
chooses to (then fall back to scanning the repo, and note that decisions are ungrounded).

## Hub + spokes model

A feature's TRD is split into a **hub** (shared, single source of truth) and one **spoke per
platform** that teams groom independently:

```
docs/development/<feature-name>/
  TRD.md            ← hub: context, feature dependencies (+ entities/flows), feature flow (user journey + critical journeys), system design, API contract, cross-cutting, change manifest
  TRD-backend.md    ← spoke (only for platforms in scope)
  TRD-android.md
  TRD-ios.md
  TRD-web.md
```

- **The hub is the single source of truth.** The API contract, system design, and cross-cutting
  decisions live there once. Spokes **link** to the hub — never copy the contract into a spoke, or
  it drifts.
- **The hub is reviewed before any spoke is groomed** — Step 2a below. Spokes are not the hub's
  reviewers: every hub defect a spoke finds re-stales every other spoke, so the hub's own errors are
  caught once, up front, while nothing depends on it yet.
- **Groom the spoke that owns the contract and the data first** — normally backend — because the
  schema, its foreign keys and the contract's real form surface there; client spokes follow. Spokes
  may also be groomed in parallel sessions, one per platform, each owning its `TRD-<platform>.md`
  (per `principles.md` → *Parallel work*) — but then **no spoke is stamped until every spoke in
  scope has finished its first alignment round**, so the hub-wrong findings of all of them are
  gathered and fixed once. A stamp given early is the one the next spoke's hub fix breaks.
- **The hub is groomed first — hard gate, no spoke without an approved hub contract.** A spoke
  depends on the hub's **API contract** (it derives its typed client + fixtures from that
  machine-checkable contract), so a spoke **cannot** be groomed until the hub exists, **its
  API-contract section is approved, and its Hub review row is ✅** (Step 2a). If a user asks to
  groom a spoke and there's no hub — or its contract isn't approved, or the hub review hasn't passed
  — **STOP and finish the hub and its review first.** Never start a spoke on a missing, unapproved
  or unreviewed hub; that's exactly how spokes drift and produce the 405 / wrong-shape bugs.
- Templates (in this skill's directory): `TRD-hub-template.md` for the hub, `TRD-spoke-template.md`
  for each spoke. Read the relevant one first.

## Rules

- **Output path**: hub → `docs/development/<feature-name>/TRD.md`; spoke →
  `docs/development/<feature-name>/TRD-<platform>.md` (slugify feature name to kebab-case; create
  the dir if needed; append if the file exists). The file being groomed IS the state — if
  interrupted, re-running resumes from what's written.
- **Hub-alignment review — every spoke, before it's done, and again whenever the hub moves.** The
  hub is the single source of truth; a spoke that quietly disagrees with it is the drift the
  hub/spoke split exists to prevent, and it surfaces as a bug three phases later. So a spoke is
  **not complete** until it passes an alignment review against the hub. Run it with the **reviewer
  subagent** (`alpha-sdlc:sdlc-reviewer`) handed the **hub, the spoke, and the profile docs both
  reference** — not your grooming reasoning. Every finding is labeled **measured** or **inferred** —
  measured names the file and line, the command, test or grep that produced it, and **which copy was
  read** (committed `HEAD` or the working tree, and which files were already modified when the
  review started); **inferred is a question, not a defect.** The reviewer **leaves the working tree
  exactly as it found it.** And the author **verifies before acting** — open the cited file at the
  cited line before editing anything on a report's authority: a review that is wrong in one finding
  is not wrong in all of them, and acting on the wrong one costs a whole round. The checklist:
  1. **Contract fidelity** — every endpoint/field the spoke consumes or exposes exists in the hub's
     §5 contract with the **same method, path, shape, nullability, enum values, and localized-object
     typing**; the spoke **links** the contract and never copies it; typed client/fixtures derive
     from it.
  2. **No divergent restatement** — anything the hub owns (context, system design, contract,
     cross-cutting) is *linked* from the spoke, not re-described. A restated fact is a fork waiting
     to drift.
  3. **Manifest ↔ work slices, both directions** — every spoke work slice appears in the hub's §7
     change manifest, and every manifest row for this platform has a spoke slice. A slice on one
     side only is a gap, not a detail.
  4. **Entities & ownership** — entities the spoke touches match the hub's *Entities touched* +
     `06-domain-model.md` ownership; the **decided on-delete edge** is implemented (FK action for
     backend, consumer behavior for clients); no private copy of an entity another feature owns.
  5. **Dependencies & flow bindings** — every hub §2 dependency and flow binding that concerns this
     platform is represented in the spoke **with its decided freshness**, and the spoke invents no
     dependency the hub doesn't list.
  6. **Cross-cutting** — auth, error handling, logging, i18n, and the freshness mechanism follow hub
     §6; no local variant of a decision the hub already made.
  7. **Feature flow covered** — every step and alternate path in the hub's §3 *Feature flow* that
     this platform participates in is present in the spoke (as a screen/step or a work slice), and
     the spoke adds no step the flow doesn't have. A hub journey step no spoke implements is the gap
     this catches.
  8. **Hub rules enumerated as numbered AC** — every hub decision touching this platform (each
     integrity cell — visibility · on-delete · freshness — each feature-flow step, each flow
     binding) appears as **its own numbered row in the spoke's §8 Acceptance criteria** with the hub
     decision named in its Source column — a mechanical lookup, not "the spirit was carried". And
     every AC is claimed by ≥ 1 slice (§9), every slice claims ≥ 1 AC.
  9. **Sequencing** — the spoke's release considerations don't contradict the hub's release
     ordering.
  10. **Open Decisions placed correctly** — a **pending hub decision blocks** the spoke sections
      that depend on it (the spoke must never silently decide it), and a spoke Open Decision that's
      really hub-level is **escalated to the hub**.
  11. **Cross-spoke consistency** (2+ spokes) — the spokes agree with **each other** on shared
      behavior (freshness, error semantics, enum handling, validation rules). Two spokes disagreeing
      is a **hub gap**, not a spoke preference.

  **Findings resolve by direction, and the direction matters:**
  - **Spoke is wrong** → fix the spoke, re-present the affected section for approval (it's a
    decision change, so it re-gates).
  - **Hub is wrong** (the spoke exposed a real hub error) → **fix it in the hub, once for all
    spokes — never spoke by spoke — and only on a yes to the hub change itself.** Present it as its
    own decision, never folded into "apply all recommendations": the hub sections it moves, the
    spokes whose stamps it stales, and the re-review each of them then needs. A blanket approval —
    "all recommendations", "continue" — covers spoke fixes only. If other existing spokes are
    awaiting alignment, run theirs against the current hub first and gather every hub-wrong finding;
    take them to the user as **one** hub change, fix the hub once, then re-run alignment once per
    spoke (scoped, per *The hub moving* below). The spokes are independent, so their reviews run
    **in parallel** — one reviewer subagent per spoke, launched in one message; the stamps are
    written after every review is back. A hub fixed after each spoke's review re-stales the spokes
    already re-stamped, so rounds multiply — spokes × hub edits. Never patch a spoke to match a hub
    you know is wrong.
  - **Deliberate divergence** (this platform genuinely must differ) → it's an **Open Decision**, and
    once decided it's recorded **in the hub** as a platform exception, so the next spoke and
    `do-development` both see it. Silent divergence is never acceptable.

  **Rounds converge, or they stop.** Each round records its **objective-violation count** (per
  `principles.md`); **flat or rising across three rounds is a STOP** — escalate to the user with the
  trend instead of launching another round. A finding **only a code change can close is not a
  grooming finding** — record it as a numbered AC (§8) and hand it to `do-development`.

  **Stamp the result.** The spoke header records `Hub alignment: reviewed <date> · hub rev <commit /
  hub's last approval date>`, and the hub's *Spokes* table records the same per spoke — those two
  segments only; each round appends its objective-violation count to the spoke's separate `Alignment
  rounds` row instead — a **foundation** spoke, which has no header table of its own, carries the
  count in the hub's *Spokes* cell beside its stamp. **The hub moving makes every stamp stale — and
  the re-review is scoped to what moved.** When a hub section is edited after any spoke exists,
  re-run this review for each spoke and re-stamp, handing the reviewer the hub diff since that
  spoke's stamp and only the checklist items the changed sections feed: §1 context or §4 system
  design → 2 · §2 dependencies and entities → 4, 5, 8 · §3 feature flow → 7, 8 · §5 contract → 1, 2
  · §6 cross-cutting → 6 · §7 change manifest and release ordering → 3, 9 — plus 10 always, and 11
  when two or more spokes exist. A hub edit that adds, removes, or renumbers a section gets the full
  checklist. The reviewer names the items it ran; an item it judges the change also reaches, it
  runs and says why. `do-planning` refuses to plan a spoke whose stamp is missing or older than the
  hub's last change. **The exit is never a dirty stamp** — the stamp keeps meaning *aligned*, so it
  lands only on a clean pass; a user who chooses to proceed anyway is taking `principles.md`'s
  recorded override at that downstream STOP, with the gap named and recorded there — the spoke is
  still not stamped.
- **One approval gate per section.** Never write a section's prose to the TRD file until the user
  approves that section's *decisions*.
- The gate is on the **decisions**, not the wording. After approval, expanding to prose is
  mechanical — no second gate.
- Technical design sections use **Mermaid** code blocks (```mermaid), never images. UI design is
  product-owned — carry a Figma/link reference only, do not generate UI.
- **The API contract must be machine-checkable — not just a prose table.** The hub's API contract is
  the single truth every spoke consumes; a prose table lets each side *guess* the shape and drift
  (this is the root of 405s and "`Objects are not valid as a React child {en,id}`"-class crashes).
  So the contract must be, or point to, a **machine-checkable spec** (OpenAPI/Swagger preferred; a
  shared schema/types file otherwise) — living authoritatively in one repo (backend/contract),
  referenced by the others. Specify **every field precisely**: exact type, **nullability**, **enum
  values**, and **localized fields as objects** (e.g. `name: { en: string; id: string }`, *not*
  `string`) — vague types are what let a client render an object as a string. Ladder-check reuse: if
  an OpenAPI spec already exists, point to it (rung 2 — reuse); only introduce one when the contract
  is prose-only today. This spec is what downstream derives from: clients generate a **typed
  client** and **test fixtures** from it (see `do-development`/`do-testing`) instead of
  hand-authoring shapes that drift. **At the §5 gate, author the contract DELTA in machine-checkable
  form** — the OpenAPI/schema fragment for every new/changed endpoint, saved to
  `docs/development/<feature-name>/contract/` (e.g. `openapi-delta.yaml`) and **gated with the
  section**: what the user approves IS the machine-checkable shape, not only the summary table (the
  table stays as the human-readable view; the fragment is the truth spokes derive typed
  clients/fixtures from). Label every delta entry by **change kind** in the §5 table's **Notes**
  column: **ADDS** an optional field, **OPENS** a *request* enum, or fixes a **DESCRIPTION** — safe
  to merge ahead of the code that serves it; **TIGHTENS** (a new `required` member, a new route, a
  narrowed enum) or **REMOVES** anything — merges *with* the code that satisfies or performs it,
  because declare-and-mount (and un-declare-and-unmount) are **one change**. A `required` block may
  carry a different kind from the properties beside it: adding an optional field breaks nothing,
  *requiring* it reddens every response that does not serve it yet. Development's `[contract]` stage
  then **merges the approved fragment into the project's spec** and regenerates — it never
  re-translates the table. Record the spec's location in the hub's *API contracts* section and in
  `docs/basics/15-api-reference.md`.
- **Capture design the moment the user shares it (client grooming).** Users typically give the
  design here, not at planning — so save it now and don't make them re-provide it later: **image(s)
  → save to `docs/development/<feature-name>/design/<screen>.png`** (create `design/`); **Figma →
  record the frame link.** Record the reference in the screen's **widget-spec `Design` field**.
  **Capture refs per step and per state, not just the main screen:** a stepped flow needs a ref for
  **each step**, and each specced state (empty / loading / error / largest-content) either has a
  design ref or is **explicitly flagged** (Open Decision, or "platform default per
  `04-ux-conventions`") — an unreferenced state is where built UI silently diverges on "specific
  tests". `do-planning` reads these forward into its *Design references* for the visual-parity loop
  — it should not re-ask for anything grooming already captured.
- **Create a widget spec per screen (client spoke grooming).** For Android/iOS/Web features, write
  one **widget-spec doc per screen** at `docs/development/<feature-name>/widget-spec/<screen>.md`
  using `widget-spec-template.md`. List every **interactive or asserted** UI element (skip
  decorative) with a stable **Test ID** following the project's **recorded convention**
  (`docs/basics/03-ui-architecture.md` → *Test-ID & widget-spec conventions* — e.g. a `btnLogin`
  codebase gets `btnLoginSubmit`, not the plugin default; the default `<feature>_<screen>_<element>`
  snake_case applies only when the profile records none; **never renamed once shipped**), **looking
  up shared-element canonical IDs first** (bottom-nav/app-bar/global dialogs carry ONE ID registered
  there — search-before-create, never a second ID for a shared element), its **type** (read the
  design, don't guess) — type-implied behavior goes in *Notes* as **testable AC**, so a wrong
  element fails a test, not just a visual check — and a **content description**. This is the **QA
  locator contract** — `do-development` implements these exact IDs and `do-testing` locates by them.
  It's a living spec: elements found later get added. (Backend spokes have no widget spec.) Also
  fill the widget-spec's **Container sizing & overflow** table for any variable-content container on
  the screen — it must **fit content or scroll, never clip** — this is what prevents "dialog doesn't
  fit its content" downstream. **Common interaction behavior** (submit enable/disable,
  mandatory-field marking, empty/loading/error states, snackbars, confirmations) follows
  `docs/basics/04-ux-conventions.md` — reference the convention rather than re-deciding per screen.
  When the feature needs a UX pattern the doc **already covers**, reuse it; a design that
  **deviates** from an existing convention is an **Open Decision**, not a silent one-off. When it
  needs a pattern **not covered yet** (a new UX), **ask the user: add a new convention, or
  reuse/adapt an existing one** — never silently invent a one-off. If a **new** convention is
  chosen, **add it to `04-ux-conventions.md`** (register-on-create) so the next feature reuses it.
  **Resolve each UI component against the component inventory** (`docs/basics/03-ui-architecture.md`
  → *Design system & component inventory*) the same way assets resolve against the registry: the
  design shows a button/card/dialog/stepper → bind the widget-spec element to the **canonical
  component** (name it in the element's Notes); no match → ask the user (reuse/adapt vs create), and
  a new **reusable** component is registered into the inventory on create — a hand-rolled look-alike
  is how built UI drifts from the design. **Bind each screen to a scaffold**
  (`03-ui-architecture.md` → *Screen scaffolds & layout patterns*): fill the widget-spec's `Scaffold
  · slicing` field — which scaffold the screen instantiates. Design matches a scaffold → reuse it;
  design **deviates** → Open Decision; a genuinely **new** layout pattern → **ask the user (add vs
  reuse/adapt)** and register it in the scaffolds table on create. This is also the **fallback for
  anything the design doesn't show** (a missing state or screen follows the house scaffold, not an
  invention). **Fill the widget-spec's *Style bindings* table — resolve every region against
  `docs/basics/18-design-tokens.md` by token *name***. Where the design is a **Figma link, read its
  inspected values** (dev mode) and map them to token names — don't estimate from a picture; where
  it's only a PNG, map what the standard says the region uses and flag anything the image
  contradicts. **A value that isn't on the scale → snap to the nearest token and record it in the
  table; if the design uses that off-scale value systematically (≥2 places or explicitly annotated),
  it's an Open Decision — add a scale step or accept a documented deviation — never a raw literal
  and never a silent snap.** A typography role or token the standard doesn't have → **ask the user
  (add vs reuse)**, and a new one is **registered in `18-design-tokens.md` on create**.
- **Slice every screen into sections, with a crop and a case list per section (client spoke grooming).**
  Write one **`docs/development/<feature-name>/section-slicing/<screen>.md`** per screen using
  `section-slicing-template.md`.
  - **Start from the scaffold, don't re-invent it.** `hdr` / `body` / `ftr` **are** the scaffold's
    anatomy (`docs/basics/03-ui-architecture.md` → *Screen scaffolds*); the screen's sections
    instantiate it. A screen with no footer has no `ftr` — don't manufacture one for symmetry.
  - **Split a region only when it earns it:** its own visibility condition · more than one case · an
    independent data source · a repeating item template. **Stop** at a single element or a canonical
    component. **Max depth 3**, IDs stable and dot-scoped (`ftr.actions.primary`) because the plan,
    `do-development` and `do-testing` all reference them.
  - **Cases: exhaustive per section, plus the interactions that matter.** Every case of the section
    (loading · loaded · empty · error · offline · role/flag variants), each with **the condition,
    the count *and identity* of the views rendered, and its data source**. Then a short
    **Interactions** table for combinations that genuinely interact (admin + offline, empty +
    refresh-error) with **which case wins** — never the full 2^N cross-product, which is mostly
    impossible states and guarantees the doc rots.
  - **Every section states how its logic runs:** the condition's **source of truth** (server field ·
    role · feature flag · cache state · local state — named exactly, per `08-data-cache.md` /
    `13-auth.md`), **when it's evaluated** (on mount · on query settle · on flag fetch · on focus —
    the trigger, not "reactively"), the **transition** between cases (replace · fade · keep height
    so the layout doesn't jump), and **what wins when the condition can't be resolved** (offline,
    null field, flag fetch failed). "Can't happen" is not an answer. Also whether hiding **collapses
    or keeps space** — identical in a mockup, different in the build.
  - **Crop each section (and each case that looks different) from the design.** Propose the crop
    **box** on the design image, produce the crop with what's installed (`sips` on macOS,
    ImageMagick if present — **ask before installing anything**), and **show the crop inside that
    section's approval gate** so the box is human-checked, since it's estimated by eye. Approved
    crops go to
    **`docs/development/<feature-name>/design/sections/<screen>/<section-id>[--<case>].png`**. Never
    leave a case silently crop-less, and never invent a crop.
  - **A case with neither a crop nor an explicit marker** (`Open Decision` / `platform default per
    04-ux-conventions` / `pending export` for a Figma-only design — a gap, not a default) **is an
    unfinished spec** — `do-development` treats it as a blocker, so resolve it here.
  - **Bind it to the widget spec both ways:** every widget-spec element names its **`Section`**, and
    every section lists the elements it contains — either half missing is a gap the slicing doc's
    *Coverage checklist* catches.
  - **One approval gate per section** (its tree row, cases, logic, and crop together). Never batch
    sections.
- **Spec multi-step flows at the flow level (client spoke grooming).** When the feature contains a
  **stepped flow / wizard**, the per-screen widget specs aren't enough — fill the spoke's
  **Multi-step flows** spec (§2 Design) — grounded in `docs/basics/04-ux-conventions.md` →
  *Multi-step / wizard flows* (deviation → Open Decision). Grooming steps in isolation is how
  stepped flows accumulate bugs.
- **Resolve assets via the asset search flow (spoke grooming).** When grooming a platform spoke,
  identify the assets the feature needs. For each one, search in this order and **stop at the first
  hit** (create-new is the last resort — ladder rung 2, reuse before build):
  1. **Registry** — search `docs/basics/17-asset-registry.md` (from `do-project-setup`) by name and
     tags.
  2. **Assets module** — if there's no registry, or no match in it, check the actual asset-providing
     module/package. Find *where assets live* from `docs/basics/03-ui-architecture.md` (asset
     locations / design-system module), then search there directly (Android `res/drawable`·`mipmap`,
     iOS asset catalogs/SF Symbols, web `assets`/icon set).
  3. **Ask the user** — if still no match: ask whether to **(a) scan the whole project** for it, or
     **(b) create a new asset**. Don't silently full-scan (expensive) or silently create.
  - At each level: **exact match → reuse** (cite its path); **similar (not exact) → adapt + flag for
    user re-validation**; **create-new** only after step 3.
  - Record the outcome in the spoke's **Assets** section.

- **Identify feature dependencies — notice what this feature depends on, extends, or could break.**
  Before designing, determine how this feature relates to **other features**: scan
  `docs/basics/16-feature-map.md` (the feature registry) + sibling feature TRDs
  (`docs/development/*/TRD.md`) + `docs/basics/` (api-reference, database, architecture) + the real
  code, and **ask the user**. Classify each dependency: (a) **depends on an existing feature** —
  reuse its contract/data/components and don't break it (name the integration points); (b)
  **prerequisite not built yet** — a sequencing dependency; (c) **shares a contract/data model**
  owned by another feature — extend it deliberately, don't fork it. Record them in the hub's
  **Feature dependencies** section. **Also capture flow dependencies at the field/section grain** —
  a specific input whose options/values come from another feature (a "create" form field sourced
  from another feature's template), or a list/section populated by another feature's creations — in
  that section's **Flow-dependencies sub-table** (consuming element → direction → source
  feature/flow → data contract → **freshness** → the data-flow test that proves it). **Freshness is
  a decided requirement, not an implementation detail:** when the source's data changes, when must
  this consumer see it — and by which mechanism per `docs/basics/08-data-cache.md`'s *Shared
  server-state sync* (mutation → invalidation · real-time event · refetch-on-focus)? Undecided
  freshness is the "consumer's list not synchronized" bug; each freshness decision becomes
  **testable AC**. Each flow binding **must get a cross-feature data-flow test in `do-testing`**
  (seed in source → appears in the consumer, within the decided freshness). **Hard rule: if this
  feature depends on a feature that isn't built yet, that's an Open Decision → the prerequisite must
  be built/decided first and the dependent slice is blocked** — never design around a phantom.
  **Register-on-create:** when the hub is groomed, add this feature to
  `docs/basics/16-feature-map.md` (purpose, entry points, owned endpoints/tables, depends-on,
  status) — an unregistered feature breaks the next feature's dependency discovery.
- **Resolve every entity against the domain model (`docs/basics/06-domain-model.md`).** For each
  entity the feature touches, decide: **owns** it (a new entity/relationship → decide its
  **lifecycle states**, **consumer visibility**, and **on-delete behavior per edge** at grooming —
  then **register it in the domain model**, register-on-create) or **consumes** it (bind to the
  **owner's source-of-truth endpoint** — never a private copy — and honor its recorded **visibility
  rule** (e.g. consumers list *active* only) and **on-delete edge** (what this feature shows when a
  referenced entity is deleted/archived)). Record the outcome in the hub's **Entities touched**
  sub-table (§2). Each visibility/on-delete rule becomes **testable AC**. If the feature's need
  **contradicts** the domain model (or the code contradicts it), that's an **Open Decision + a
  Contradictions entry** — never silently model around it.
- **Surface gaps as Open Decisions (don't over-deliver).** Whenever the design/PRD is silent or
  ambiguous about something an implementation would need (a missing state, unspecified behavior, an
  edge case, an interaction the mockup doesn't show), **record it in the spoke's `Open Decisions`
  section** with 2–3 recommended options (mark one — **the ★ always goes to the product-quality /
  world-standard option, never the cheapest**) — and **ask the user to decide, then update the
  design.** Never resolve a gap by adding scope yourself. Decided items get **re-groomed**: fold the
  decision into the relevant section, flip its status to *decided*. **Only *decided* scope flows
  downstream** — unresolved decisions block the affected slice.

## Flow

> Present every gate below in the shared **step-summary format** (`principles.md`): header
> (development · phase · step · status) · **bottom line** (what happened + what I need from you) ·
> **why it matters** (never omitted when a question is asked) · options ★ · context only where it
> adds something · engineer detail last — so a product owner and an engineer both follow each
> section.
> The plain layer is in the org's language and follows its guide in `../../plain-language/`
> when one exists (`id.md` for Bahasa Indonesia) — at every gate, in every phase.

### Step 0 — Read inputs and propose the outline (GATE 0)

1. Confirm the **feature name** (slugify to kebab-case) and **what is being groomed**: the **hub**,
   or a **platform spoke** (which one)? Check `docs/development/<feature-name>/` for an existing
   hub.
   - Grooming the **hub** → use `TRD-hub-template.md`, also confirm which platforms are in scope
     (Backend / Android / iOS / Web) so the change manifest lists the right spokes.
   - Grooming a **spoke** → **check the hub first: if no hub exists, or its API-contract section
     isn't approved yet, STOP and groom the hub (through at least its approved API contract) before
     the spoke** — the spoke can't be groomed against a missing/unapproved contract. Only once the
     hub's contract is approved: read the approved hub (`TRD.md`) as primary context and use
     `TRD-spoke-template.md`.
2. Read the PRD/BRD source. Confluence URL → fetch via Atlassian MCP; file/PDF → read it; empty →
   ask.
3. Scan the repo for this platform/feature (structure, key modules, schema). If the existing
   structure allows **more than one viable approach** (e.g. extend an existing service vs. add a new
   one, reuse a pattern vs. introduce one), lay out the options with their tradeoffs and **ask the
   user which approach to use** before going further. Don't pick one silently.
4. **Summarize and confirm understanding.** Give the user a concise summary of what you took from
   the BRD/PRD and the code (problem, scope, key facts, constraints, what already exists to reuse).
   **Include the feature dependencies you found** — what this feature depends on / extends / could
   break (per the *Identify feature dependencies* rule) — so they're confirmed before any design,
   and flag any prerequisite that isn't built yet. Ask them to confirm or correct it. If they
   correct anything, re-check the sources, re-summarize the delta, and re-confirm before continuing.
   Don't propose the outline on a stale or unconfirmed understanding.
5. **Anticipate evolution AND proactively surface new-feature possibilities.** Two distinct things —
   always present both to the user, even when the BRD mentions neither:
   - **Evolution of this feature** — how it tends to grow over time so the chosen approach doesn't
     paint into a corner (e.g. single-tenant → multi-tenant, single-currency → multi-currency, one
     auth → SSO/MFA, one locale → i18n, sync → event-driven). Suggest 2–3 likely paths from how
     common global products in this domain evolve, and ask which are realistic.
   - **New/adjacent feature possibilities** — opportunities this work *unlocks* that the BRD did
     **not** ask for (e.g. "once the widget deep-links exist, the same mechanism enables a
     Transfer/Pulsa widget" or "this data feed could power a lock-screen balance complication").
     **Inform the user explicitly** of these — name them as opportunities, not as scope.
   - Design only for the **confirmed** current scope. Record anticipated-but-unconfirmed evolution
     and any unlocked possibilities as notes (ladder rung 1 — skip/YAGNI: don't build for
     speculative needs, just don't block them, and make sure the user *knows* the option exists).
6. Read the relevant template and propose a **section outline** based on it. Drop sections that
   don't apply; add ones that do.
7. **Stop and ask the user to approve or edit the outline.** Do not draft any content yet.

If the PRD describes a tiny change, say so and offer to skip the TRD and go straight to planning (or
tickets, if you use Jira) instead.

### Step 1 — Per-section loop

For each approved section, in order:

1. **Read needs**: the PRD + all already-approved sections (read the current TRD file) + the
   relevant repo code for this section.
2. **Ask first**: list the open questions for this section — anything the PRD and repo don't answer
   — and get the user's answers. Don't proceed on assumptions.
3. **Propose** the section as terse **decisions** — bullets of *what / why / tradeoff*, each naming
   its **ladder rung and the world-wide standard** (agreement, or the surfaced conflict per the
   tiered rule). For design sections, the proposal includes the Mermaid diagram.
4. **Approve**: ask the user — approve as-is / approve with edits / regenerate with feedback. Apply
   their edits to the decisions — the edited version is what gets written and fed forward. One
   section at a time; never offer to approve the rest in a batch. **While the user reviews, gather
   the next section's facts:** a background read-only subagent collects what the next section
   needs from the code — the modules, schema, endpoints and conventions it touches, with
   `file:line` — and drafts nothing, because the next section's decisions build on this one's. Use
   its report at the next step 1, re-checked against what this gate approved.
5. **Write**: expand the approved decisions into prose (+ Mermaid) and append the section to the TRD
   file, following the template's structure. No second approval. **Stamp the section with its
   approval date** — add `_Approved: YYYY-MM-DD_` right under the section heading, using today's
   date.

### Step 2 — Final section

The last section is **structured** (it feeds downstream ticket-slicing and monitoring):

- **Hub** → Change manifest: repos/modules per platform (with links to spokes), cross-platform
  release ordering, shared dependencies/risks, and a work-slice summary tagged by platform.
- **Spoke** → two structured finals: **§8 Acceptance criteria** — the canonical numbered registry
  (stable `AC-<n>` IDs, one assertable sentence each, Source column enumerating every hub rule/flow
  step/binding that touches this platform) — then **§9 Work slices**, each claiming its AC by ID
  (never restating the prose). Mirror the summary line up into the hub's manifest.

When grooming a spoke, also update the hub's **Spokes** field to link the new spoke — and when it
lives in a sibling repository, its `Repo` cell names that repo (same repo is the default: a dash).

### Step 2a — Hub review (hub only) — the gate before any spoke

Once the hub's last section is written, hand the **hub, its contract delta, and the profile docs it
references** to the **reviewer subagent** (`alpha-sdlc:sdlc-reviewer` — not your grooming context)
with this checklist:

1. **The contract passes the repo's own checks** — run the contract validation the profile records
   (`15-api-reference.md` / `10-conventions.md`, e.g. the contract test) against the delta. A form
   the checker cannot read — `nullable: true` in an OpenAPI 3.1 file whose checker reads only
   `type` — is an objective violation, because it is invisible downstream.
2. **Entities complete** — every table the design reads or writes, and every foreign key on those
   tables, has its row in §2 *Entities touched*, with owner and on-delete **read from the
   migrations**, not only the entities the PRD names.
3. **One statement per fact** — §2 freshness, §3 flow steps, §4 design, §5 contract and every table
   agree with each other and with their prose.
4. **Every flow step is served** — each system action in §3 maps to a contract endpoint or a stated
   client-only behavior.
5. **No spoke has to decide a hub matter** — anything a spoke would need decided to make the hub
   true is decided here or listed as a hub Open Decision.
6. **It renders** — tables parse and diagrams meet the Mermaid 9.x floor.

Fix objective violations and send the fixes back for another round (`principles.md` → *The fixes
are reviewed too*); judgment findings are the user's decision. On a clean pass stamp the hub's
**Hub review** row (`reviewed <date> · rev <commit>` plus its round counts), and only then offer the
first spoke. Present the verdict and STOP. If no subagent can run, run the identical checklist
inline and say so.

### Step 3 — Per-screen artifacts (client spokes only)

The spoke's sections describe the platform's design; the **per-screen contracts** are separate
artifacts and a spoke is not finished without them. For **each screen** in the spoke, in order:

1. **Widget spec** → `widget-spec/<screen>.md`, per `widget-spec-template.md` — one gate per screen.
2. **Section slicing** → `section-slicing/<screen>.md`, per `section-slicing-template.md` — the
   section tree, then **one gate per section**: its cases, how the logic runs, and its **approved
   crop**. Never batch sections.
3. **Close the loop per screen** — set both docs' **`Approved` fields** (widget-spec header ·
   section-slicing screen + per-section stamps), then run the doc's *Coverage checklist* in full.
   Unchecked lines block development, so resolve them here.

A screen with no widget spec, or with sections but uncropped/unenumerated cases, is an **unfinished
spoke** — not a detail for `do-development` to discover.

### Step 4 — Hub-alignment review (spokes only) — the completion gate

A spoke's last approved section does **not** finish it. **First, the mechanical precondition —
per-screen artifacts complete:** every screen in the spoke has BOTH `widget-spec/<screen>.md` AND
`section-slicing/<screen>.md` with the slicing doc's *Coverage checklist* fully checked. Any screen
missing either doc → **STOP, back to Step 3** — do not run the review, do not call the spoke
complete (this is the hole where a run that drifts after the widget-spec gates used to sail
through). Then run the **hub-alignment review** (per the rule above) before calling it complete:

1. Hand the **hub + this spoke + the profile docs they reference** to the **`sdlc-reviewer`**
   subagent (fresh eyes — not your grooming context) and run the 11-point checklist: contract
   fidelity · no divergent restatement · manifest ↔ slices both ways · entities & ownership ·
   dependencies + flow bindings with freshness · cross-cutting · feature flow covered · hub rules
   enumerated as numbered AC (every AC claimed by ≥ 1 slice, every slice claiming ≥ 1 AC) ·
   sequencing · Open Decisions placed correctly · cross-spoke consistency — handing it the reviewer
   output contract from the *Hub-alignment review* rule above (**measured** or **inferred** per
   finding, working tree left exactly as found, author verifies before acting).
2. **Resolve by direction** — spoke wrong → fix the spoke and **re-gate the affected section**; hub
   wrong → gather the hub-wrong findings of every spoke awaiting alignment first, then fix the
   **hub** once with the user's approval and **re-run alignment once per spoke, scoped to the
   sections that moved** (per the rule above); deliberate divergence → **Open Decision**, and once
   decided record it in the **hub** as a platform exception.
3. **Present the verdict and STOP** — what was checked, findings by direction, what you fixed, what
   needs the user's decision. A spoke with unresolved objective misalignment is **not done**, and
   nothing downstream should plan against it.
4. On a clean pass, **stamp both sides**: the spoke's `Hub alignment` row and the hub's *Spokes*
   table row (`reviewed <date> · hub rev <commit / hub's last approval date>` — those two segments
   only) — while **every** round, clean or dirty, appends its objective-violation count to the
   spoke's `Alignment rounds` row.

**When the hub changes later, every spoke's stamp is stale.** Editing a hub section while spokes
exist means re-running this review per spoke — scoped to the checklist items the changed sections
feed — and re-stamping; announce that at the hub edit, don't leave it for someone to discover in
development. If no subagent can run, run the identical checklist inline and say so; never skip the
gate.

Then tell the user the TRD is complete and should be reviewed as a PR.
