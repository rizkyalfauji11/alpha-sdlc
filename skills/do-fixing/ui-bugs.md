# UI bugs — client platforms only

> Read by `do-fixing` at flow step 1 on web, Android or iOS — once per session, again after a
> compaction. `SKILL.md` holds the gates and `../../rules/ui.md` the UI-only rules; nothing here
> relaxes either.

- **Missed-case bugs (UI)** — when the bug is a **section case** that never shows or shows wrongly
  (empty state absent, footer visible offline, role variant missing), fix it at the **case** level:
  implement it driven by the case's **declared source and trigger** in
  `section-slicing/<screen>.md`, render it against that case's **crop**, and check the **sibling
  sections/screens for the same missing case** (it's rarely one screen — a class, per
  `do-issue-grooming`). If the case **isn't in the doc**, that's a grooming gap, not a
  fix: record it as an **Open Decision back to `do-grooming`** and do not author the case or
  estimate its crop here — the crop is an approved, stamped spec input, and a guessed box is
  the design invention this skill's own rules forbid. Fix what the doc does specify; the
  missing case returns through grooming's gate.
- **Visual bugs** — for UI parity bugs, re-run the visual-parity loop (render → compare → fix), save
  to `design/compared-ui/` — capture commands and the `<screen>-<platform>-v<N>.png` / `-diff.png`
  naming are in `../do-development/client-ui.md`, read it now if you have not; **never skip the
  comparison** — if tooling fails, stop, report + fix it. A **layout** bug (padding, gap, position,
  column or row) is verified by the geometry comparison (`client-ui.md` §5): the
  `compare-geometry.js` output before and after the fix is its evidence, not a second look. **Fix a
  style bug at the token, never with a literal:** the correction is the right token name from
  `docs/basics/18-design-tokens.md` (per the screen's widget-spec *Style bindings*) — nudging a raw
  value until it *looks* right re-creates the exact drift class the bug came from. If the same wrong
  value appears on sibling screens, say so: that's a **class**, and patching only the reported
  screen leaves the app inconsistent (migrating the rest is `do-tech-debt-grooming` work, tracked in
  the doc's *Contradictions found*). If the standard genuinely lacks the value, it's an Open
  Decision (new scale step vs approved deviation), not a local literal.
