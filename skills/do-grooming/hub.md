# Hub grooming — evolution, dependencies, entities, the contract

Read at Step 0.1 when grooming the **hub**, with `TRD-hub-template.md` — once per session, again
after a compaction. It holds what only the hub decides. `SKILL.md` keeps the flow, every gate and
the two hard rules this file applies — a dependency on a feature not built yet, and a need that
contradicts the domain model.

## Contents

- **Evolution and possibilities** — Step 0.5, recorded in §1's *Gate-0 notes*
- **Identify feature dependencies** — Step 0.4 and §2
- **Resolve every entity against the domain model** — §2
- **The API contract must be machine-checkable** — §5

## Evolution and possibilities

**Anticipate evolution AND proactively surface new-feature possibilities.** Two distinct things —
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

The notes go into §1's **Gate-0 notes** when the skeleton is written, with the user's answers:
every spoke cites them instead of regenerating them, and adds only the evolution specific to its
platform.

## Identify feature dependencies

**Identify feature dependencies — notice what this feature depends on, extends, or could break.**
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
(seed in source → appears in the consumer, within the decided freshness). A prerequisite that
isn't built yet falls under the phantom-dependency hard rule in `SKILL.md`.
**Register-on-create:** when the hub is groomed, add this feature to
`docs/basics/16-feature-map.md` (purpose, entry points, owned endpoints/tables, depends-on,
status) — an unregistered feature breaks the next feature's dependency discovery.

## Resolve every entity against the domain model

**Resolve every entity against the domain model (`docs/basics/06-domain-model.md`).** For each
entity the feature touches, decide: **owns** it (a new entity/relationship → decide its
**lifecycle states**, **consumer visibility**, and **on-delete behavior per edge** at grooming —
then **register it in the domain model**, register-on-create) or **consumes** it (bind to the
**owner's source-of-truth endpoint** — never a private copy — and honor its recorded **visibility
rule** (e.g. consumers list *active* only) and **on-delete edge** (what this feature shows when a
referenced entity is deleted/archived)). Record the outcome in the hub's **Entities touched**
sub-table (§2). Each visibility/on-delete rule becomes **testable AC**. A need that contradicts the
domain model, or code that does, falls under the contradiction hard rule in `SKILL.md`.

## The API contract must be machine-checkable

**The API contract must be machine-checkable — not just a prose table.** The hub's API contract is
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
