# Dev Plan (<Platform>): <feature name>

| | |
|---|---|
| **Platform** | <Backend / Android / iOS / Web> |
| **TRD** | [hub](./TRD.md) · [spoke](./TRD-<platform>.md) |
| **Tasks** | <task-list.md / Jira keys covered> |
| **Author** | <engineer> |
| **Date** | <YYYY-MM-DD> |
| **Scope confirmed** | <YYYY-MM-DD — the Step 1 gate> |

> Stages are small and ordered for **incremental review**. Implement one stage, stop at its
> ⏸ checkpoint, review, then continue. You can stop after any stage marked **safe to stop**.

## Carry-forward answers

> Only while an answer from an earlier gate waits for a stage not written yet:
> `- <the stage it shapes>: <the answer> (<date>)`. That stage's draft folds it in; writing
> the approved stage moves it to the stage's `Carry-forward:` line. Drop this section once empty.

## Design references *(UI platforms)*

> The design each screen must match 1:1 (within platform-best-practice tolerance). Figma → paste
> the frame link; image → commit it to `docs/development/<feature-name>/design/<screen>.png`.
> **One row per screen, per flow step, and per specced state** — carry everything grooming
> captured; a state with no ref carries its explicit marker (Open Decision / platform default per
> `04-ux-conventions`). **The reference is what to build, not where the numbers come from:**
> spacing, type, color and border **values come from the screen's widget-spec *Style bindings* →
> `docs/basics/18-design-tokens.md`** — never measured off the image. The assembly does measure
> the design's boxes, to find where the layout differs; the fix still comes from the token, never
> from the measured number.

| Screen / step / state | Design (Figma link / image path) | Specific needs |
|-----------------------|----------------------------------|----------------|
| <screen> — full frame | `docs/development/<feature-name>/design/<screen>.png` *or* `<figma-frame-url>` | <frame size, e.g. `1768×1020` · the content it shows (e.g. 20 documents, 3 waiting) — the assembly's fixture mirrors it · breakpoints, motion, dark mode — spacing/type by **token name**, e.g. edge `space.lg`> |
| <flow step 2 of 3> | <ref> | |
| <screen · empty state> | <ref — or "flagged: platform default"> | |

## Architecture & package layout

> Where each piece of this work **lands in the real repo** — the map the stages slot into; not a
> re-statement of the TRD design (link to it). Reuse the existing package structure; propose new
> packages only where needed.

_Approved: <YYYY-MM-DD — the layout gate>_

**Approach (ladder rung · world-wide standard):** <required — name the rung AND the
industry-standard way today, e.g. "rung 2: reuse existing package structure; no new modules ·
standard: agrees" — conflicts surfaced per the tiered rule>

| Concern | Package / directory | New or existing? | Notes |
|---------|---------------------|------------------|-------|
| <e.g. widget entry + deep link> | `app/qris/widget/` | new (under existing `qris`) | reuses `ScannerActivity` |
| <e.g. balance fetch> | `data/balance/` | existing | reuse `BalanceRepository` |

<Optional: a small module/dependency diagram if the layout isn't obvious.>

## Debt in the footprint

> Every open `tech-debt-register` row naming a file this plan edits — `node
> ../../scripts/debt-balance.js <repo> --files <the layout's paths>` — and the user's answer at
> the layout gate (`stage-rules.md` → *Footprint debt*): paid by a stage, or kept as `accepted —
> <why + revisit trigger>` in the register. `none` when the output lists no row.

| Row | File it names | Decision |
|-----|---------------|----------|
| <`TD-<n>` — what it is> | <path> | <paid by Stage N · kept: why, decided <YYYY-MM-DD> · not edited> |

## Screen stage map *(UI platforms)*

> Each screen's presentation work: **shell → section stages → assembly** (`stage-rules.md` →
> *Presentation*). Every section and case is claimed by **exactly one** section stage; every
> interaction (`X`) row by the assembly stage. This table is the coverage check — an unclaimed case
> is the missed case.

| Screen | Shell | Section stages (top-down) | Assembly | Cases claimed |
|--------|-------|---------------------------|----------|---------------|
| <qris-home> | <Stage 4> | <5: `hdr`+static · 6: `body.summary` (C1–C4) · 7: `body.list`+`.item` (C1–C4) · 8: `ftr.actions` (C1–C3)> | <Stage 9 — full screen + `X1`,`X2`> | <14 of 14> |

## Stage breakdown — approved <YYYY-MM-DD>

> Written at the Step 3 gate with every row `pending`; a row turns `written` when its stage is
> approved and written at Step 4.

| Stage | Layer | Slice | Goal | Detail |
|-------|-------|-------|------|--------|
| 1 | [<layer>] | `<slice id>` | <one-line goal> | pending |

## Stages

> One stage per architecture layer the slice touches (`stage-rules.md` → *Layers*). Every field
> is filled — `n/a` where it does not apply.

### Stage 1 — [<layer>] `<slice id>` — <goal>
- **Covers:** <task IDs / Jira keys / the TRD's numbered AC IDs (e.g. `AC-3, AC-7` — the spoke's §8
  registry on a hub/spoke feature; `A1`…`A6` on a foundation TRD) / the contract-delta entries this
  stage merges (the `TIGHTENS`/`REMOVES` ones held back from the `[contract]` stage). Each AC is
  provable in this stage — its test is named under *Test first*>
- **Removes:** <what this stage deletes because it replaces it — the old path, its tests, its
  profile rows — or "nothing". A stage that replaces a behavior names the removal here or names the
  later stage that carries it>
- **Pays debt:** <the `TD-<n>` rows this stage pays, behaviour-preserving, its characterization
  test named under *Test first* — or "nothing">
- **Built with:** <only when this stage lands in the same change as another: `Stage N` — each of
  them names the others, and each keeps its own review round and checkpoint verdict>
- **Moved in:** <only when this stage claims an AC that §9 gives another slice: `AC-n` from
  `<slice>` — why it is provable only here · who decided and when. `scripts/check-coverage.js`
  fails a cross-slice claim without this line>
- **Layer:** <contract / domain / data / presentation — or UI / data-integration if the project
  isn't layered. The diff **stays inside this layer**; `do-development`'s conformance review checks
  the diff against this declaration>
- **Files / modules:** <paths>
- **Approach:** <what / ladder rung · world-wide standard (agrees, or the surfaced conflict) — reuse
  X, native Y, etc.>
- **Changes (shape, not full code):** <per file, what changes; new/changed **signatures, data
  shapes, endpoints, or props**; **pseudocode or notes only for tricky logic** (races, money caps,
  retries, edge cases); the contract merge + typed-client regeneration, and the **query keys read
  + invalidations/events fired**, where `stage-rules.md` → *Order* and *Shape* ask. Never full
  method bodies or boilerplate>
- **Design ref (UI stages):** <which screen + design (from *Design references* above) and the
  states to match — the parity target for this stage. `n/a` for non-UI stages>
- **Stage kind (UI presentation):** <`shell` (scaffold + route + screen state + empty slots) ·
  `section` · `assembly` (full screen + interactions; rendered with the design-content fixture at
  the frame's size, box geometry measured) — from the *Screen stage map*. `n/a` for non-UI stages>
- **Section(s) + element scope (UI section stages):** <the section ID(s) this stage builds (e.g.
  `body.list` + `body.list.item`) and the widget-spec rows whose `Section` column matches — that's
  this stage's element scope>
- **Section cases (UI stages):** <the case IDs from `section-slicing/<screen>.md` this stage
  implements (e.g. `body.summary/C1–C4` · `ftr.actions/C5`), each with its crop. A **section**
  stage compares against its **crops only**; the **assembly** stage owns full-screen parity + the
  interaction (`X`) rows. `n/a` for non-UI stages>
- **Test first (TDD red):** <the failing test(s) that prove this stage, derived from the AC — what
  they assert. If the stage can't be unit-tested (native widget render, pure UI), say so and give
  the manual/observed check instead>
- **Crosses the FE↔BE seam:** <yes / no — yes when the stage adds, changes or **removes** a call the
  app really makes, or renders a real response. Never left blank (`stage-rules.md` → *Seam and
  rung*)>
- **Verify — instrument:** <the literal commands that confirm this stage green>
- **Verify — rung:** <the verification-ladder rung (`principles.md`), number + name: `rung 1
  (compiler)` · `rung 2 (unit test)` · `rung 3 (instrumented, on the runner `09-environment.md`
  records)` · `rung 4 (a person watches)`. **From rung 3 up, state in the same line what the rung
  below cannot see** — "a measure pass at real density", "class-load across a dynamic-feature
  boundary">
- **Conformance review — docs this stage must be checked against:** <the `docs/basics/` docs the
  stage's changes touch, e.g. `02-architecture` (layer placement) · `10-conventions` (error
  handling/logging) · `08-data-cache` (query keys + invalidation) · `18-design-tokens` (zero raw
  literals) — so the reviewer audits the right ones instead of guessing. Principles + plan/AC
  conformance are always checked>
- **Approved (plan gate):** <commit `<hash>` · approved <YYYY-MM-DD> — set by do-planning when this
  stage's draft passes its gate; `do-development` reads it before building the stage>
- **Status:** <pending / done <YYYY-MM-DD> — set by `do-development` at step 9; this is what a
  resumed run reads to find the first unfinished stage>
- **Checkpoint verdict:** <pending — set by do-development when the built stage passes review:
  `approved <date>` or `auto <date>`; separate from *done*>
- **Carry-forward:** <only when an earlier gate or checkpoint left a remark this stage must honor —
  one line each, with its date: do-planning moves it here from *Carry-forward answers*;
  `do-development` adds a checkpoint remark here>
- **⏸ Checkpoint — review here.** **Safe to stop after?** <yes — compiles & tests pass / no — leaves
  X half-done until Stage N. **Safe ≠ complete** — note when the slice isn't user-visible yet (e.g.
  "safe: green; but nothing on screen until Stage 4 [presentation]"). **A partially-sectioned screen
  is *not* safe** — green but visually broken (e.g. "no: 2 of 4 sections built; screen is broken
  until Stage 9 assembly").>

### Stage 2 — [<layer>] `<slice id>` — <goal>
- **Covers:** <…>
- **Removes:** <…>
- **Pays debt:** <…>
- **Layer:** <…>
- **Files / modules:** <…>
- **Approach:** <…>
- **Changes:** <…>
- **Design ref (UI stages):** <…>
- **Stage kind (UI presentation):** <…>
- **Section(s) + element scope (UI section stages):** <…>
- **Section cases (UI stages):** <…>
- **Test first (TDD red):** <…>
- **Crosses the FE↔BE seam:** <yes / no — never blank>
- **Verify — instrument:** <…>
- **Verify — rung:** <rung + what the rung below cannot see, from rung 3 up>
- **Conformance review — docs:** <…>
- **Approved (plan gate):** <…>
- **Status:** <…>
- **Checkpoint verdict:** <…>
- **⏸ Checkpoint — review here.** **Safe to stop after?** <…>

<!-- repeat; prefer many small stages over few big ones -->

## Sequencing & stop points

- **Order / dependencies:** <which stage must precede which, and why>
- **Safe stop points:** <list the checkpoints where the codebase is in a working/shippable state>
- **Uncovered tasks / AC:** <the output of `node ../../scripts/check-coverage.js
  docs/development/<feature-name> <platform>` pasted as it prints — never a hand-written table. Then
  any **feature-flow step** or **flow binding** not yet mapped to a stage, which the checker cannot
  see — or "none">
