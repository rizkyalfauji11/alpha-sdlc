# Dev Plan (<Platform>): <feature name>

| | |
|---|---|
| **Platform** | <Backend / Android / iOS / Web> |
| **TRD** | [hub](./TRD.md) · [spoke](./TRD-<platform>.md) |
| **Tasks** | <task-list.md / Jira keys covered> |
| **Author** | <engineer> |
| **Date** | <YYYY-MM-DD> |

> Stages are small and ordered for **incremental review**. Implement one stage, stop at its
> ⏸ checkpoint, review, then continue. You can stop after any stage marked **safe to stop**.

## Design references *(UI platforms)*

> The design each screen must match 1:1 (within platform-best-practice tolerance).
> Figma → paste the frame link; image → commit it to `docs/development/<feature-name>/design/<screen>.png`.
> **One row per screen, per flow step, and per specced state** — carry everything grooming captured;
> a state with no ref carries its explicit marker (Open Decision / platform default per `04-ux-conventions`).
> **The reference is what to build, not where the numbers come from:** spacing, type, color and border
> **values come from the screen's widget-spec *Style bindings* → `docs/basics/18-design-tokens.md`** —
> never measured off the image.

| Screen / step / state | Design (Figma link / image path) | Specific needs |
|-----------------------|----------------------------------|----------------|
| <screen> | `docs/development/<feature-name>/design/<screen>.png` *or* `<figma-frame-url>` | <breakpoints, motion, dark mode — spacing/type by **token name**, e.g. edge `space.lg`> |
| <flow step 2 of 3> | <ref> | |
| <screen · empty state> | <ref — or "flagged: platform default"> | |

## Architecture & package layout

> Where each piece of this work **lands in the real repo** — the map the stages slot into.
> This is *not* a re-statement of the TRD design (link to it); it's the concrete placement.
> Reuse the existing package structure; propose new packages only where needed.

**Approach (ladder rung):** <required — e.g. "rung 2: reuse existing `app/qris/` package structure; no new modules">

| Concern | Package / directory | New or existing? | Notes |
|---------|---------------------|------------------|-------|
| <e.g. widget entry + deep link> | `app/qris/widget/` | new (under existing `qris`) | reuses `ScannerActivity` |
| <e.g. balance fetch> | `data/balance/` | existing | reuse `BalanceRepository` |

<Optional: a small module/dependency diagram if the layout isn't obvious.>

## Stages

> **Stages split by architecture layer** — a screen is a sequence, not a stage: `[contract]` (only if the
> API contract changes) → `[domain]` → `[data]` → `[presentation]`, using the layer names in
> `docs/basics/02-architecture.md`. Unlayered project → minimum `[UI]` vs `[data-integration]`
> (API/DB/3rd-party). **Only the layers this slice actually touches** — reusing an existing endpoint with
> no new business rule is one `[presentation]` stage, not three. **Shared lower-layer work is staged once**
> (3 screens over 1 repository = domain + data + one presentation stage per screen).

### Stage 1 — [<layer>] <goal>
- **Covers:** <task IDs / Jira keys / AC>
- **Layer:** <contract / domain / data / presentation — or UI / data-integration if the project isn't layered. The diff **stays inside this layer**: business logic doesn't land in a ViewModel, a presentation stage doesn't reach into data. `do-development`'s conformance review checks the diff against this declaration.>
- **Files / modules:** <paths>
- **Approach:** <what / ladder rung — reuse X, native Y, etc.>
- **Changes (shape, not full code):** per file, what changes; new/changed **signatures, data shapes, endpoints, or props**; **pseudocode or notes only for tricky logic** (races, money caps, retries, edge cases). For stages touching the contract: the spec update + **typed-client regeneration** come first (per `05-tech-stack.md` → Code generation). For stages touching shared entities: name the **query keys read + invalidations/events fired** (per `08-data-cache.md`). Detail scales with risk — trivial changes stay a line, risky ones get the interface + edge cases. Do *not* paste full method bodies/boilerplate.
- **Design ref (UI stages):** which screen + design (from *Design references* above) and the states to match — the parity target for this stage. `n/a` for non-UI stages.
- **Section cases (UI stages):** the case IDs from `section-slicing/<screen>.md` this stage implements (e.g. `body.summary/C1–C4` · `ftr.actions/C5` · interaction `X1`), each with its crop. Every case in the doc must be claimed by some stage — an unclaimed case is the missed case. `n/a` for non-UI stages.
- **Test first (TDD red):** the failing test(s) that prove this stage, derived from the AC — what they assert. If the stage can't be unit-tested (native widget render, pure UI), say so and give the manual/observed check instead.
- **Verify:** <how to confirm green — run the test(s) + build/observe>
- **Conformance review — docs this stage must be checked against:** <the `docs/basics/` docs the stage's changes touch, e.g. `02-architecture` (layer placement) · `10-conventions` (error handling/logging) · `08-data-cache` (query keys + invalidation) · `18-design-tokens` (zero raw literals) — so the reviewer audits the right ones instead of guessing. Principles + plan/AC conformance are always checked.>
- **⏸ Checkpoint — review here.** **Safe to stop after?** <yes — compiles & tests pass / no — leaves X half-done until Stage N. **Safe ≠ complete** — note when the slice isn't user-visible yet (e.g. "safe: green; but nothing on screen until Stage 4 [presentation]").>

### Stage 2 — [<layer>] <goal>
- **Covers:** <…>
- **Layer:** <…>
- **Files / modules:** <…>
- **Approach:** <…>
- **Changes:** <…>
- **Verify:** <…>
- **Conformance review — docs:** <…>
- **⏸ Checkpoint — review here.** **Safe to stop after?** <…>

<!-- repeat; prefer many small stages over few big ones -->

## Sequencing & stop points

- **Order / dependencies:** <which stage must precede which, and why>
- **Safe stop points:** <list the checkpoints where the codebase is in a working/shippable state>
- **Uncovered tasks / AC:** <any task, **integrity AC** (visibility · on-delete · freshness), or **flow binding** not yet mapped to a stage — or "none">

