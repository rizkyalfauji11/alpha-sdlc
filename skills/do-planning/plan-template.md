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

### Stage 1 — <goal>
- **Covers:** <task IDs / Jira keys / AC>
- **Files / modules:** <paths>
- **Approach:** <what / ladder rung — reuse X, native Y, etc.>
- **Changes (shape, not full code):** per file, what changes; new/changed **signatures, data shapes, endpoints, or props**; **pseudocode or notes only for tricky logic** (races, money caps, retries, edge cases). Detail scales with risk — trivial changes stay a line, risky ones get the interface + edge cases. Do *not* paste full method bodies/boilerplate.
- **Test first (TDD red):** the failing test(s) that prove this stage, derived from the AC — what they assert. If the stage can't be unit-tested (native widget render, pure UI), say so and give the manual/observed check instead.
- **Verify:** <how to confirm green — run the test(s) + build/observe>
- **⏸ Checkpoint — review here.** **Safe to stop after?** <yes — compiles & tests pass / no — leaves X half-done until Stage N>

### Stage 2 — <goal>
- **Covers:** <…>
- **Files / modules:** <…>
- **Approach:** <…>
- **Changes:** <…>
- **Verify:** <…>
- **⏸ Checkpoint — review here.** **Safe to stop after?** <…>

<!-- repeat; prefer many small stages over few big ones -->

## Sequencing & stop points

- **Order / dependencies:** <which stage must precede which, and why>
- **Safe stop points:** <list the checkpoints where the codebase is in a working/shippable state>
- **Uncovered tasks:** <any task/AC not yet mapped to a stage — or "none">
