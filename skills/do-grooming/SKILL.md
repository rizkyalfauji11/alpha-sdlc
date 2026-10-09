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

**Read `../../rules/groom.md` in full now** — these are this skill's binding rules, generated from
`principles.md`, and each `principles.md` reference below names a rule in them. After a compaction,
re-read it and the reference file of your current step before the next gate. If the read is denied
(headless runs), say so in the step report — rules never loaded cannot bind. Especially:
lazy-senior-engineer mindset, never over-simplify, the ladder, ground-in-real-code,
ask-don't-assume, 2–3 best-practice options, living understanding summary, draft+human-approve.

**Auto-run/auto-decide NEVER applies in this skill** — this is a decision phase. If the user asks
for auto mode here, decline in one line ("this phase decides — gates apply; auto-run starts at
`do-development`") and proceed gated: every gate blocks as normal, nothing auto-decides.

Every gate you present: header `<development> · <phase> · <step> · ✅/⏸/⚠️`, then Bottom line →
Why it matters → Options ★ → Context → Details (for engineers) → Next as the last paragraph, the
plain layer in the org's language per its `../../plain-language/` guide (`principles.md` →
*Present every step bottom line first*).

## Gates

- No `docs/basics/` → **STOP**: ask for `do-project-setup` first; groom without it only on the
  user's explicit choice, noting that decisions are ungrounded.
- A spoke with no hub, an unapproved hub contract or a Hub review row not ✅ → **STOP**: finish the
  hub and its review first.
- Gate 0 → **STOP** for the outline, no content before it; then write the skeleton.
- Each section → ask first, propose, **STOP** for approve / edit / regenerate — one at a time, never
  a batch; only then write it, stamped `_Approved: <YYYY-MM-DD> · <commit>_`.
- A depended-on feature not built → Open Decision, its slice blocked. A domain-model contradiction →
  Open Decision + a Contradictions entry.
- Step 2a → the hub-review verdict, **STOP**; only a clean pass stamps ✅ and opens the first spoke.
- Step 3, client spokes → one gate per widget spec, one per slicing section with its crop.
- Step 4 → a screen missing either doc or its checked Coverage checklist → **STOP**, back to Step 3;
  the alignment verdict, **STOP**; only a clean pass is stamped.
- Each review round records its count; **flat or rising across three rounds is a STOP** — escalate
  to the user with the trend instead of launching another round.
- A hub-wrong finding is its own decision: the hub changes once, on a yes to that change.

## Flow

### Step 0 — Read inputs and propose the outline (GATE 0)

**Read the project profile first** (`docs/basics/` from `do-project-setup`) — **start with
`06-domain-model.md` (the shared entities) and `16-feature-map.md` (how features depend on each
other)**, then architecture (incl. its **wiring patterns** — spoke designs describe boundaries in
those terms), `19-code-inventory.md` (**reuse existing units before proposing new logic** — a slice
that re-implements a registered job is a duplicate, not work), tech-stack, database, api-reference,
data-cache, conventions, ux-conventions as the section needs them — as your grounding reference
before scanning code from scratch. If a section looks stale (repo moved past its commit stamp), note
it and suggest a refresh. **If there's no `docs/basics/` (project not set up yet), STOP and ask the
user to run `do-project-setup` first** — grooming grounds in that profile, and skipping it means
grooming on an ungrounded view. Wait for their answer: recommend setting up first; proceed to groom
without it only if the user explicitly chooses to (then fall back to scanning the repo, and note
that decisions are ungrounded).

1. Confirm the **feature name** (slugify to kebab-case) and **what is being groomed**: the **hub**,
   or a **platform spoke** (which one)? Check `docs/development/<feature-name>/` for an existing
   hub; when the file you groom already exists, *Resume* below — never a second Gate 0. Read the
   template and branch file named here once per session, again after a compaction.
   - Grooming the **hub** → use `TRD-hub-template.md` and read `hub.md`; also confirm which
     platforms are in scope (Backend / Android / iOS / Web) so the change manifest lists the right
     spokes.
   - Grooming a **spoke** → **check the hub first: if no hub exists, or its API-contract section
     isn't approved yet, STOP and groom the hub (through at least its approved API contract) before
     the spoke** — the spoke can't be groomed against a missing/unapproved contract. Only once the
     hub's contract is approved: read the approved hub (`TRD.md`) as primary context and use
     `TRD-spoke-template.md` (its §3 holds the asset search flow); an Android, iOS or Web spoke
     also reads `client-spoke.md`.
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
   and flag any prerequisite that isn't built yet. A spoke takes them from hub §2; one §2 lacks
   is a hub matter, never invented in the spoke. Get it confirmed or corrected
   (`principles.md` → *Keep a living understanding summary*). Don't propose the outline on a stale
   or unconfirmed understanding.
5. **Evolution and possibilities.** Hub → present both, per `hub.md` → *Evolution and
   possibilities*, even when the BRD mentions neither. Spoke → cite the hub §1 *Gate-0 notes* and
   add only the evolution specific to this platform (a hub without those notes: as for a hub,
   reading `hub.md`).
6. Read the relevant template and propose a **section outline** based on it. Drop sections that
   don't apply; add ones that do.
7. **Stop and ask the user to approve or edit the outline.** Do not draft any content yet.
8. **Write the skeleton** once the outline is approved, as the template's opening note lays out:
   §1's **Gate-0 notes** (understanding, approach, evolution answers) and every approved heading
   marked `_Pending_`. They are Gate 0's record, not section prose. Then a session boundary.

If the PRD describes a tiny change, say so and offer to skip the TRD and go straight to planning (or
tickets, if you use Jira) instead.

### Step 1 — Per-section loop

For each `_Pending_` section, in order:

1. **Read needs**: the PRD + all already-approved sections (read the current TRD file) + the
   relevant repo code for this section + the *Carry-forward answers* addressed to it + the branch
   file's rules for it.
2. **Ask first**: list the open questions for this section — anything the PRD and repo don't answer
   — and get the user's answers. Don't proceed on assumptions. If nothing is open, say so in one
   line and present the proposal (step 3) in the same turn. An answer that belongs to a later
   section goes into *Carry-forward answers* at once, as `- §<n>: <the answer>`.
3. **Propose** the section as terse **decisions** — bullets of *what / why / tradeoff*, each naming
   its **ladder rung and the world-wide standard** (agreement, or the surfaced conflict per the
   tiered rule). For design sections, the proposal includes the Mermaid diagram and an
   **Approach** field naming its rung.
4. **Approve**: ask the user — approve as-is / approve with edits / regenerate with feedback. Apply
   their edits to the decisions — the edited version is what gets written and fed forward. One
   section at a time; never offer to approve the rest in a batch. **While the user reviews, gather
   the next section's facts:** a background read-only subagent collects what the next section
   needs from the code — the modules, schema, endpoints and conventions it touches, with
   `file:line` — and drafts nothing, because the next section's decisions build on this one's. Use
   its report at the next step 1, re-checked against what this gate approved.
5. **Write**: expand the approved decisions into prose (+ Mermaid) under the section's heading,
   following the template's structure. No second approval. **Stamp the section with its
   approval** — its `_Pending_` becomes `_Approved: <YYYY-MM-DD> · <commit>_` (today's date and
   `git rev-parse --short HEAD`) — and delete the carry-forward lines it folded in with a second
   Edit in the same message. No template `<…>` placeholder survives into a TRD; the hook blocks one.

### Step 2 — Final section

The last section is **structured** (it feeds downstream ticket-slicing and monitoring):

- **Hub** → the §7 change manifest the template lays out, **what the change retires** included.
- **Spoke** → two structured finals: **§8 Acceptance criteria**, the canonical numbered registry
  built to the template's §8 note, then **§9 Work slices**, each claiming its AC by ID (never
  restating the prose). Mirror the summary line up into the hub's manifest.

When grooming a spoke, also update the hub's **Spokes** field to link the new spoke — and when it
lives in a sibling repository, its `Repo` cell names that repo (same repo is the default: a dash).

### Step 2a — Hub review (hub only) — the gate before any spoke

Once the hub's last section is written, read `grooming-review.md` and run its *Hub review* —
points 1–5 in two dimensions, the gaps check and the critic, fixes closed on their proofs. Every
round appends its objective-violation count to the **Hub review** row. On a clean pass stamp the
hub's **Hub review** row (`reviewed <date> · rev <commit>` plus its round counts), and only then
offer the first spoke. Present the verdict and STOP. Then a session boundary.

### Step 3 — Per-screen artifacts (client spokes only)

The **per-screen contracts** are separate artifacts, and a spoke is not finished without them —
their rules are in `client-spoke.md`. For **each screen** in the spoke, in order:

1. **Widget spec** → `widget-spec/<screen>.md`, per `widget-spec-template.md` — one gate per screen.
2. **Section slicing** → `section-slicing/<screen>.md`, per `section-slicing-template.md` — the
   section tree, then **one gate per section**: its cases, how the logic runs, and its **approved
   crop**. Never batch sections.
3. **Close the loop per screen** — set both docs' **`Approved` fields** (widget-spec header ·
   section-slicing screen + per-section stamps), then run the doc's *Coverage checklist* in full.
   Unchecked lines block development, so resolve them here. Then a session boundary.

### Step 4 — Hub-alignment review (spokes only) — the completion gate

A spoke's last approved section does **not** finish it. **First, the mechanical precondition —
per-screen artifacts complete:** every screen in the spoke has BOTH `widget-spec/<screen>.md` AND
`section-slicing/<screen>.md` with the slicing doc's *Coverage checklist* fully checked. Any screen
missing either doc → **STOP, back to Step 3** — do not run the review, do not call the spoke
complete (this is the hole where a run that drifts after the widget-spec gates used to sail
through). **The artifacts are frozen once the review starts:** a new screen frame, crop, case or
state during alignment is a design change, not a fix — it goes back to its Step 3 gate first.

1. Read `grooming-review.md` and run its *Hub-alignment review* — the 11-point checklist in the
   packet's dimensions, the gaps check and the critic — never beside another spoke's review.
2. **Resolve by direction** and close each finding on its proof, per that file — a hub-wrong finding
   is its own decision, gathered with every awaiting spoke's into one hub Open Decision `pending hub
   change` and fixed once, on a yes. Only needs-eyes findings go to a next round.
3. **Present the verdict and STOP** — what was checked, findings by direction, what you fixed, what
   needs the user's decision. A spoke with unresolved objective misalignment is **not done**, and
   nothing downstream should plan against it.
4. **Every** round, clean or dirty, appends its objective-violation count to the spoke's `Alignment
   rounds` row; only a clean pass stamps both sides (`grooming-review.md` → *Stamps*) — a user who
   chooses to proceed anyway is taking `principles.md`'s recorded override at that downstream STOP,
   with the gap named and recorded there — the spoke is still not stamped. Then a session boundary.

Then tell the user the TRD is complete and should be reviewed as a PR.

## Resume (fresh session)

**Session boundaries** fall after the Gate-0 skeleton, the hub review ✅, each spoke's alignment ✅,
each closed screen and the phase end (every spoke aligned): persist first, then write
`.alpha-sdlc/next/<feature>--<platform>.json` (`<feature>--hub` at a hub boundary) and, for
session-only facts, its handoff, and offer the fresh session in the Next paragraph — "/clear, then
'lanjut'" or `/alpha-sdlc:do-grooming <feature> [<platform>]`; at the phase end both name
`do-planning <feature> <platform>`, or `do-slicing <feature>` when the work is tracked — never
mid-section, nor anywhere else `principles.md` → *The session is disposable* forbids.

**The file being groomed IS the state** — its `_Pending_` and `_Approved:` headings, *Carry-forward
answers*, Open Decisions and review rows, with the per-screen docs. To resume, first run:

`node ../../scripts/next-step.js docs/development/<feature-name> [<platform>] --phase grooming`

Exit 0 names the next unit, 1 a STOP to present, 2 an older or unknown format — read the files it
lists. Then read the next-file and its handoff, set its `status` to `"consumed"`, state the
recorded understanding (§1's *Gate-0 notes*) in one line, and re-read what the next unit needs: its
template and branch file, `grooming-review.md` at Step 2a or 4, the approved sections it builds on.
Never re-run Gate 0 or a stamped step — an answered question is not asked again (`principles.md` →
*Ask, don't assume*).

## Hub + spokes

A feature's TRD is a **hub** — `TRD.md`, the shared single source of truth: context, dependencies
(+ entities/flows), feature flow, system design, API contract, cross-cutting, change manifest — and
one **spoke per platform** that teams groom independently — `TRD-<platform>.md` (backend, android,
ios, web), each only for platforms in scope. **Output path**: hub →
`docs/development/<feature-name>/TRD.md`; spoke →
`docs/development/<feature-name>/TRD-<platform>.md` (slugify feature name to kebab-case; create the
dir if needed; an existing file → *Resume* above).

- **The hub is the single source of truth.** The API contract, system design, and cross-cutting
  decisions live there once. Spokes **link** to the hub — never copy the contract into a spoke, or
  it drifts.
- **Groom the spoke that owns the contract and the data first** — normally backend — because the
  schema, its foreign keys and the contract's real form surface there; client spokes follow.
- **The hub is groomed first — hard gate, no spoke without an approved hub contract.** If a user
  asks to groom a spoke and there's no hub — or its contract isn't approved, or the hub review
  hasn't passed — **STOP and finish the hub and its review first.** Never start a spoke on a
  missing, unapproved or unreviewed hub; that's exactly how spokes drift and produce the 405 /
  wrong-shape bugs.

## Rules

- **Stay inside the hub, and show the growth.** Every AC, case, state, screen frame and Open
  Decision a spoke adds cites its hub anchor (`principles.md` → *Build only what's specified*); one
  without an anchor is asked as a scope question whose ★ is *not in this feature, recorded as a
  follow-up*. Every gate after the spoke's first approval, and every alignment verdict, carries one
  line of growth against the last approved version — AC, Open Decisions, cases and frames, then and
  now, with the additions split into behavior and bookkeeping — so a widening is seen at the gate,
  not discovered three phases later.
- **A hub edit after any spoke exists stales every spoke's stamp** — each spoke is re-reviewed,
  scoped to what moved (`grooming-review.md` → *The hub moving*); announce that at the hub edit,
  don't leave it for someone to discover in development.
- **One approval gate per section.** Never write a section's prose to the TRD file until the user
  approves that section's *decisions*. The gate is on the **decisions**, not the wording. After
  approval, expanding to prose is mechanical — no second gate.
- Technical design sections use **Mermaid** code blocks (```mermaid), never images. UI design is
  product-owned — carry a Figma/link reference only, do not generate UI.
- **Design the user shares is saved the moment they share it**, in any run — image(s) →
  `design/<screen>.png`, Figma → the frame link (`client-spoke.md` → *Capture design*).
- **Hard rule: if this feature depends on a feature that isn't built yet, that's an Open Decision →
  the prerequisite must be built/decided first and the dependent slice is blocked** — never design
  around a phantom.
- If the feature's need **contradicts** the domain model (or the code contradicts it), that's an
  **Open Decision + a Contradictions entry** — never silently model around it.
- **Surface gaps as Open Decisions (don't over-deliver).** Whatever the design/PRD leaves silent or
  ambiguous that an implementation would need — a missing state, unspecified behavior, an edge
  case, an interaction the mockup doesn't show — goes into the spoke's `Open Decisions` with 2–3
  options, **the ★ always on the product-quality / world-standard option, never the cheapest**, for
  the user to decide; then the design is updated and the item re-groomed. Never resolve a gap by
  adding scope yourself. **Only *decided* scope flows downstream** — unresolved decisions block the
  affected slice (`principles.md` → *Build only what's specified*).
