# Section Slicing — <screen name> (<feature name>)

| | |
|---|---|
| **Screen** | <screen / page name> |
| **Platforms** | <Android / iOS / Web — those in scope> |
| **TRD** | [spoke](../TRD-<platform>.md) |
| **Widget spec** | [<screen>.md](../widget-spec/<screen>.md) — every element there names the section it belongs to |
| **Scaffold** | <the scaffold this screen instantiates, from `docs/basics/03-ui-architecture.md` → *Screen scaffolds*. The header/body/footer sections below **are** that scaffold's anatomy — bind to it, don't re-invent it.> |
| **Design** | <Figma frame link *or* `../design/<screen>.png`> |
| **Section crops** | `../design/sections/<screen>/` — committed (spec input, unlike the gitignored `design/compared-ui/`) |
| **Approved (screen)** | <commit `<hash>` · approved <YYYY-MM-DD> — all sections gated; an edit after that **commit** makes it stale → re-approve (a bare date can't decide a same-day edit). Three stamps gate three units — screen, section, crop — never reconciled into one.> |
| **Date** | <YYYY-MM-DD> |

> The screen's **region + case contract**. It answers three questions the element-level widget spec
> can't: **what regions exist**, **which of them show under which conditions (and how many views each
> renders)**, and **what drives that logic**. Every case carries a **close-up crop** of its design so
> `do-development` compares case-by-case instead of eyeballing one full-screen mockup — a case with no
> crop and no explicit marker is where a whole case silently never gets built.

## Section tree

> IDs are **stable and dot-scoped** (`ftr.actions.primary`) — referenced by the widget spec, the plan's
> stages, `do-development`'s parity report and `do-testing`'s case tests. **Split a region only when
> it earns it:** it has its own visibility condition · more than one case · an independent data
> source · a repeating item template. **Stop** at a single element or a component from the inventory.
> **Never split for symmetry** (a header holding only a title stays one section). **Max depth 3.**

```
hdr                      <purpose>
body                     <purpose>
  body.<name>            <purpose>
    body.<name>.<name>   <purpose>
ftr                      <purpose>
  ftr.<name>             <purpose>
```

| Section ID | Purpose | Sub-sections | Crop |
|------------|---------|--------------|------|
| `hdr` | <title + back> | — | `sections/<screen>/hdr.png` |
| `body.summary` | <balance + status> | — | `sections/<screen>/body.summary.png` |
| `body.list` | <transaction list> | `body.list.item` | `sections/<screen>/body.list.png` |
| `ftr.actions` | <primary/secondary CTAs> | — | `sections/<screen>/ftr.actions.png` |

---

## `<section-id>` — <name>

**Approved:** <commit `<hash>` · approved <YYYY-MM-DD> — this section's gate>
**Purpose:** <what this region is for, in one line.>
**Crop:** `../design/sections/<screen>/<section-id>.png` — box `<x,y,w,h>` on `<design file>` · approved <YYYY-MM-DD>
<or `pending export` — Figma-only design, no local image to crop. **This is a gap, not a default**: record it and resolve before development.>
**Components:** <canonical components from `docs/basics/03-ui-architecture.md` this section is built from.>
**Elements:** <the widget-spec Test IDs living in this section.>

### Visibility

| | |
|---|---|
| **Shown when** | <the condition — e.g. `account.status == active`> |
| **Hidden when** | <condition — and whether it collapses (no space) or is merely invisible (space kept), because those look identical in a mockup and different in the build> |
| **Default before data arrives** | <hidden · skeleton · empty frame — never "undefined"> |

### Cases

> **Exhaustive for this section.** Each case = a condition and exactly what renders under it.
> *Views* is the count **and** identity of what's rendered, because "2 views" alone doesn't say which.
> Every case needs a **crop** or an explicit marker (`Open Decision` / `platform default per 04-ux-conventions`).

| # | Condition | Views rendered (count · which) | Data source | Crop | AC |
|---|-----------|-------------------------------|-------------|------|----|
| C1 | <loading> | <1 · 3 skeleton rows> | <query `<key>` pending> | `<section-id>--loading.png` | <assertable AC> |
| C2 | <loaded, non-empty> | <n · list of `body.list.item`> | <query `<key>` data> | `<section-id>--loaded.png` | |
| C3 | <loaded, empty> | <1 · illustration + CTA> | <query returns `[]`> | `<section-id>--empty.png` | |
| C4 | <error> | <1 · inline error + retry> | <query error> | `<section-id>--error.png` | |
| C5 | <role = viewer> | <1 · secondary action only> | <session role> | `<section-id>--viewer.png` | |

### How the logic runs

| | |
|---|---|
| **Condition source of truth** | <server field · session role · feature flag · cache state · local form state — name it exactly (per `08-data-cache.md` / `13-auth.md` / `09-environment.md`)> |
| **Evaluated when** | <on mount · on query settle · on flag fetch · on focus · on every keystroke — the trigger, not "reactively"> |
| **Transition between cases** | <replace in place · cross-fade · keep height to avoid layout jump — and whether scroll position survives> |
| **Unknown / missing data** | <which case wins when the condition can't be resolved (offline, flag fetch failed, null field). "Can't happen" is not an answer.> |
| **Precedence** | <when two conditions are true at once, which case wins — see *Interactions* below> |

---

## Interactions that matter

> Not the full cross-product (N conditions = 2^N rows, mostly impossible). **The combinations that
> genuinely interact**, chosen deliberately at grooming — these are the ones that ship broken.

| # | Combination | Which case wins | What renders | Crop / marker |
|---|-------------|-----------------|--------------|---------------|
| X1 | <role=admin + offline> | <C3 offline> | <primary hidden, banner shown> | <crop or marker> |
| X2 | <empty + error on refresh> | <C4 error> | <keeps last list, error banner above> | |

## Coverage checklist

> Filled at the last gate. **Each unchecked line blocks development**, not just this doc.

- [ ] Every section in the tree has a block above, and every block's ID appears in the tree.
- [ ] Every case has a **crop** or an explicit marker (`Open Decision` / `platform default`).
- [ ] Every widget-spec element names a section that exists here (and every section's elements exist there).
- [ ] Every section states its condition **source**, its **trigger**, and its **unknown-data** behavior.
- [ ] Every section's **Cases** table is filled — its rows are that section's only case count; an empty one means unenumerated, not zero cases.
- [ ] Interactions table filled (or explicitly "none interact").

## Open Decisions

> Where a chosen option names a **mechanism**, the decided status also names **the test that will prove it** — written downstream, never run here. **A mechanism amended twice stops being amended — escalate to the user.**

| # | Gap / ambiguity | Options (★ = recommended — always the product-quality / world-standard option, never the cheapest) | Status |
|---|-----------------|---------------------------|--------|
| D1 | <e.g. no design for the offline footer> | ★ <platform default per `04-ux-conventions`> / <design it> | pending / decided: <choice> · proven by <act → assert> / decided: auto ★<choice> (ratify) |
