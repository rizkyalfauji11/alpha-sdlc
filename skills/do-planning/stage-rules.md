# What makes a good stage (the core rule)

Read at `do-planning` Step 2, before the layout — once per session, and again after a compaction
before the next gate. The layout's layer map (Step 2), the stage breakdown (Step 3) and every stage
draft (Step 4) follow these rules; `plan-template.md` is the block each stage fills.

## Contents

- Size — one sitting
- Seam and rung — never blank
- Layers — one stage per layer the slice touches
- Presentation — shell → sections → assembly
- Order — by dependency, contract first
- Footprint debt — paid before the work that builds on it
- Stepped flows — from the flow spec
- Checkpoint — and whether it is safe to stop
- Coverage — traced to AC and work slices
- Shape — of the change, not the code
- Review docs — named per stage

## Size — one sitting

- **Small enough to review in one sitting** — roughly one concern / one coherent diff. If a stage
  would be a huge change, split it. Prefer many small stages over few big ones.

## Seam and rung — never blank

- **Every stage declares its seam and its rung — neither may be blank.** *Crosses the FE↔BE seam*
  is `yes` when the stage adds, changes or **removes** a call the app really makes, or renders a
  real response; `do-development` reads that line instead of re-deciding per stage, where guessing
  safely means running the expensive thing. *Verify — rung* names the verification-ladder rung
  (`principles.md`) and, **from rung 3 up, what the rung below cannot see**. Two failures this
  closes, both observed: a `[data]` stage that deleted a live, untested endpoint shipped on unit
  tests alone because nothing in its block mentioned runtime at all — silence read as exemption;
  and a plan that argued its case twice for *declining* a device run and never once for ordering
  twelve of them, which is a ratchet that only turns upward. A rung claimed with no such sentence
  is over-spend nobody agreed to, and the argument is owed for climbing, never for declining.
  **Before writing a rung 3 or 4 proof, read `09-environment.md` for the instruments this repo
  already has** — a CI instrumented job or a cloud device farm makes rung 3 nearly free, and
  reaching past a configured, paid-for runner to a watched human session is choosing the costly
  proof by oversight.

## Layers — one stage per layer the slice touches

- **One stage per architecture layer the slice touches — never one stage spanning layers.** A screen
  is not a stage; it's a **contract → domain → data → presentation** sequence. Read the repo's real
  layers from `docs/basics/02-architecture.md` and use *its* names:
  - **Layered / clean architecture** → `domain` (entities + use-cases, tested against a fake
    repository), `data` (repository/API/DB/3rd-party implementation), `presentation`
    (screen/UI/state). A **`contract`** stage comes first *only* when the feature changes the API
    contract (merge the approved hub-§5 delta into the spec → regenerate the typed client — **minus
    the entries §5 labeled `TIGHTENS`/`REMOVES`**, which merge with the stage carrying their code).
  - **Not layered** → still split, minimum two: **`UI`** and **`data-integration`** (API calls, DB
    access, 3rd-party SDKs). Split finer only when a stage's diff gets too big to review in one
    sitting — never to satisfy a template. Do **not** invent a domain layer the project doesn't have
    (`principles.md` forbids imposing layering).
  - **Backend spokes use the analogue** — route/controller (the API surface, the "presentation" of a
    backend) → service/use-case → repository/migration. "Presentation" never means "UI only".
  - **Only the layers the slice actually touches.** A screen that reuses an existing endpoint and
    adds no business rule is **one presentation stage** — not three. A ceremonial domain stage means
    an interface with one implementation: speculative scaffolding, which the ladder rejects.
  - **Shared lower-layer work is staged once.** Three screens over one repository = one domain
    stage + one data stage + **one presentation stage per screen** — not the same repository
    re-staged three times.
  - **Scaffolding is the exception.** A **foundation TRD** (`do-foundation-grooming`, greenfield
    base) has no domain/data/presentation split — its stages run **init the project → create the
    structure → wire the skeleton (entry point, config, dependency-rule enforcement) → harness
    (build/run/test/lint) → repo hygiene**, each marked `Layer: n/a (scaffolding)`. Don't force
    layer stages onto work that creates the layers.
  - **Every stage declares its `Layer`, and its diff must stay inside it.** That declaration is what
    lets `do-development`'s conformance review check layer placement mechanically (business logic in
    a ViewModel, or a presentation stage reaching into data, is a violation) instead of guessing.

## Presentation — shell → sections → assembly

- **Presentation splits again by section: shell → sections → assembly.** For a screen with a
  `section-slicing/<screen>.md`, one `[presentation]` stage per screen is still too big — a 14-case
  screen lands as one unreviewable diff and its cases get discovered missing at the end. So a
  screen's presentation work is:
  1. **Shell stage** — instantiate the scaffold (`03-ui-architecture.md`), register the route, wire
     screen-level state, leave **empty section slots**. This exists so section stages don't each
     race to create the same screen file, and it gives an early checkpoint where the skeleton is
     checkable against the scaffold.
  2. **Section stages — one per section that *earns* it**, using the same trigger the slicing itself
     uses: **more than one case · its own data source · a repeating item template**. **Trivial
     siblings group into one stage** (a 1-case header, a static row) — never a stage per leaf for
     symmetry, which is the ceremony the ladder rejects. Each section stage declares its **section
     ID(s)**, its **case IDs + crops**, and its **element scope — the widget-spec rows whose
     `Section` column matches** (that column is what makes "did this stage build its elements" a
     lookup rather than a judgment).
  3. **Assembly stage** — compose the sections and verify the **screen**: full-screen parity,
     full-scroll coverage, content-fit extremes, and the section-slicing doc's **Interactions (`X`)
     rows**. Those interactions span sections by definition, so they are **not verifiable before
     assembly** — this stage is where "compare by full screen" happens, while section stages compare
     only against their own crops.
  - **Order: top-down** — `hdr` → body sections in visual order → `ftr`, after whichever data/domain
    stages feed them. A planner may reorder to de-risk (an unknown third-party embed first) **as
    long as the plan states why**.
  - **Coverage is checkable:** every section and every case is claimed by **exactly one** section
    stage, and every `X` row is claimed by the assembly stage. An unclaimed case is the missed case;
    a case claimed twice means two stages will fight over the same view.
  - **Safe-to-stop has a third state here.** A screen with 2 of 4 sections built compiles and passes
    its tests but is **visually broken** — worse than "not user-visible yet". Mark those checkpoints
    explicitly as *not safe to stop*; the screen becomes safe again at assembly.

## Order — by dependency, contract first

- **Ordered by dependency** — contract, then domain, then data, then presentation/UI; match the
  hub's release ordering **and the hub's Feature dependencies** — a stage that relies on another
  feature comes only after that feature exists. If a depended-on feature is **missing or
  incomplete**, STOP and surface it (Open Decision) — never plan stages on a phantom prerequisite.
  **When the feature changes the API contract, "contract first" is a concrete early stage:** merge
  the **approved contract delta** (`docs/development/<feature>/contract/`, gated at hub §5) into the
  project's machine-checkable spec → **regenerate the typed client** (the command in
  `05-tech-stack.md` → Code generation) → every later stage builds against the regenerated types,
  never hand-rolled ones — and never re-translate the hub's summary table. **This stage merges only
  the entries §5's change-kind label marks safe ahead of the code**; a `TIGHTENS` or `REMOVES` entry
  merges in the stage that carries the code satisfying or performing it, named on that stage's
  `Covers:`.

## Footprint debt — paid before the work that builds on it

- **The debt in the files this plan edits is planned, not discovered** (`principles.md` → *A change
  adds no debt*). At the layout gate, `node ../../scripts/debt-balance.js <repo> --files <every
  path the layout names>` lists the open register rows that name those files; each is its own
  question, ★ *pay it in this feature* — unless paying changes behaviour or a contract (→
  `do-grooming`) or edits a file beyond the footprint, where ★ keeps it. A kept row's status is
  written in the register at this gate — `accepted — <why + revisit trigger>` — or the stage review
  measures it again. A row grooming already decided is not asked again: its answer is recorded. A
  `decided` row whose revisit trigger this plan meets is asked again. A row found only because a
  directory the layout names holds its file, which no stage will edit, is recorded *not edited*.
- **No register** (a `lite` profile) → offer the single-doc setup of `20-tech-debt-register`;
  declined, the plan says its footprint debt is unmeasured.
- **A paid row gets a stage, or rides one.** Small debt rides the stage that first edits its file,
  named on that stage's `Pays debt:` line; debt that would make the stage unreviewable gets its own
  stage, in the file's layer, ordered **before** the stage that builds on it — make the change easy,
  then make the easy change. Either way its *Test first* is a **characterization test** that pins
  today's behaviour and stays green across the payment, the stage's diff deletes the row, and its
  `Covers:` claims no AC: paying debt adds no behaviour. `debt-balance.js` reads `Pays debt:` lines,
  so a row a later stage claims is not charged to the stages before it.

## Stepped flows — from the flow spec

- **Stage a stepped flow from its flow spec.** If the spoke has a **Multi-step flows** spec, the
  stages follow it — the flow-level state store early, then per-step stages (each step's
  validation + cross-step refetch is that stage's AC), then the **atomic final commit** as its own
  verifiable stage — not one giant unreviewable "build the wizard" stage or arbitrary slices that
  ignore the flow's structure.

## Checkpoint — and whether it is safe to stop

- **Ends in a checkpoint**: how to verify it works, and an explicit **⏸ STOP — review** marker.
- **Marks whether it's safe to stop after** — ideally the codebase is in a working (compiles, tests
  pass, shippable-behind-flag) state at as many checkpoints as possible, so pausing leaves nothing
  half-broken. Call out the stages where stopping would leave things incomplete. **Safe ≠
  complete:** after a `contract`/`domain`/`data` stage the build is green and safe to stop, but
  **nothing is user-visible until the presentation stage lands** — say both, so nobody stops after
  the data stage thinking the slice shipped.

## Coverage — traced to AC and work slices

- **Traces to AC / work slices** — each stage lists the acceptance criteria / TRD work slices it
  satisfies (plus task IDs / Jira keys if the Jira phases were run). **Coverage is derived, not
  asserted:** read the TRD's numbered AC register (the spoke's §8, or its equivalent in an issue /
  tech-debt / foundation TRD) against the union of the stages' `Covers:` — every AC is claimed by
  **≥ 1** stage and every stage claims **≥ 1** AC or pays **≥ 1** debt row (`Pays debt:`), and
  every work slice lands in some stage. An unclaimed AC is unbuilt scope; an AC-less stage that pays
  no debt is untestable work. **Derived means computed:**
  run `node ../../scripts/check-coverage.js docs/development/<feature-name> <platform>` and paste
  its output into *Sequencing & stop points* — never a hand-written coverage table or prose that
  restates the `Covers:` lines, because a second copy is the one that drifts. Each stage heading
  names its slice (`` `W4a` `` for a stage of `W4`; a debt stage, the slice whose files it
  prepares); a stage that claims an AC §9 gives another slice carries a **`Moved in:`** line naming
  it, its source slice and why — the checker fails a cross-slice claim without one. **Every AC a stage claims is provable in that stage:** its *Test
  first* names the test that proves it here. An AC whose proof needs a later stage's code moves to
  that stage **now**, at planning, with its *Moved in* line — never split or moved during
  development.

## Shape — of the change, not the code

- **Detail the *shape* of the change, not the code.** A stage must be reviewable before it's built:
  give per-file change intent, new/changed signatures · data shapes · endpoints · props, and
  pseudocode/notes for genuinely tricky logic (races, money caps, retries, edge cases). **When a
  stage adds a mutation or consumes shared entities, name its cache wiring** — the canonical query
  keys it reads and the invalidations/events its mutations fire (per `08-data-cache.md`'s sync
  convention) — that's a reviewable design fact and what makes the freshness AC implementable.
  **Calibrate by risk** — a trivial change stays one line, a risky one gets the interface + edge
  cases. Never paste full method bodies or boilerplate — that turns the plan into a stale second
  copy of the diff (over-engineering). The plan describes the shape; the diff fills in the bodies.

## Review docs — named per stage

- **Per stage, also name the profile docs that stage must be reviewed against** (the plan
  template's *Conformance review* line) — `do-development` audits each stage's diff against them
  before presenting it, so naming them here is what makes that review targeted instead of a guess.
