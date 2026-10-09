# Client UI — the rules

> Read by `do-development` when the plan's **Platform** is a client — Android, iOS or Web — with
> `client-ui.md`, the mechanics these rules run on: in full before stage 1, once per session, and
> after a compaction again before the next UI stage. A Backend plan never reads this file.
>
> **Every UI rule of a client stage is stated here in full.** **Precedence:** nothing in
> `SKILL.md`, `client-ui.md`, `../../rules/ui.md` or the skill's bundle relaxes a rule here, and
> nothing here relaxes one of theirs — where two of these texts ever seem to disagree, the stricter
> reading binds.

## Contents

R1. Visual parity · R2. Tokens · R3. Section cases · R4. Common interactions · R5. Content-fit ·
R6. Test IDs · R7. Specced types and components

## R1. Visual parity

- **Visual parity for UI (frontend/mobile) — render, compare, fix; don't trust code-from-image.**
  For a UI stage with **design reference(s)** (Figma links or
  `docs/development/<feature-name>/design/<screen>.png`, from the plan — which lists them **per
  screen, per flow step, and per specced state**): after it's green, **render and compare every ref
  row the stage covers** — the main screen alone is not parity when the plan also carries step/state
  refs (a "flagged: platform default" state is checked against the `04-ux-conventions` standard
  instead). What each stage kind compares is `client-ui.md` §5.
- Render the screen and screenshot it, then compare to the design **two ways — (a) an AI visual
  checklist** (layout, spacing, colors, typography, component fidelity (**each element is the type
  the widget spec declares**), and *every* state: default/loading/error/empty/pressed) — **report
  spacing/type/border findings as *measured value → token name*, never "looks close"** (e.g. "card
  inner padding measured 12, bound to `space.lg` = 16 → fixed"); a mismatch against the widget-spec
  *Style bindings* is a defect **even when the pixel-diff is inside tolerance** — tolerance forgives
  rendering differences, never a wrong token — **and (b) a pixel-diff**. List every mismatch, fix,
  and **re-render until parity**.
- **When the screen is taller than the viewport, full-scroll coverage is mandatory:** map every
  design section top→bottom (including **below-the-fold**) to a captured region and **compare per
  section** — parity is **not passed while any section is uncompared** (a viewport-only screenshot
  silently skips scrolled content — the exact bug this prevents). Capture the **full scrollable
  extent, not just the viewport** (load lazy/deferred content first) — the per-platform capture
  commands and the pixel-diff tooling are in `client-ui.md` §1.
- **At the `assembly` stage the layout between sections is measured, never eyeballed:** render the
  design's own content at the frame's size, compare every Test ID's box with the design's
  (`scripts/compare-geometry.js`), and save the full-screen diff — a padding, gap, column or row
  difference is a finding with a number, and a parity claim with no geometry result, no saved diff
  overlay, or a capture older than its design reference is **not verified** (`client-ui.md` §5).
- For **virtualized / infinite lists**, compare the item template + representative sections + key
  states, and say so — don't claim to capture an unbounded page.
- **Tolerance follows platform best-practice** — don't force pixel-identical where iOS/Android/web
  norms dictate otherwise; **flag intentional platform deviations** instead of "fixing" them wrong.
- **Save every iteration** as a review trail — the actual screenshot and its diff overlay, named and
  filed per `client-ui.md` §2. These are **local review artifacts** — ensure
  `docs/development/<feature-name>/design/compared-ui/` is in the project's `.gitignore` (add the
  line if missing); never commit them.
- **If you must install tooling (browser driver, emulator/simulator, pixel-diff lib) or boot a
  device, tell the user what and why and get the OK first.** Render/screenshot tooling that fails
  is a STOP (`SKILL.md` step 6). The UI comparison must still happen — either fix the tool, or the
  user does a manual visual compare — but it is **never skipped or auto-continued**, and never claim
  parity you didn't verify.

## R2. Tokens

**Every visual value resolves to a token — zero raw literals.** On client UI, spacing, font
size/weight/family/line-height, color, border thickness, radius, elevation, icon and control sizes
come from **`docs/basics/18-design-tokens.md`** by **name**, via the screen's widget-spec *Style
bindings*. **Never read a value off the mockup** — eyeballing a raster is exactly why padding, text
size, font and hairlines differ from screen to screen. Concretely: no `padding: 13`, no
`fontSize: 15`, no `fontWeight: 600` written inline, no `#EEE`, no `borderWidth: 1.5`, no fractional
dp/pt/px. **Emphasis is a weight token** (never a size bump or a family swap), **underline only
where the standard allows it**, **case comes from the typography role** — no ad-hoc transforms.
**Lines are tokens too:** thickness from the token, inset-vs-full-bleed as declared, length derived
from the container (never a fixed width), one line per boundary. If the stage needs a value the
scale doesn't have: **snap to the nearest token and report it**, or — if the design uses it
systematically — **stop and raise an Open Decision** (new scale step vs approved deviation) back to
`do-grooming`; a genuinely **new token** is **registered in `18-design-tokens.md` on create**, like
an asset. The **conformance review (step 5)** audits this: it runs the project's no-raw-literals
check from the doc's *Enforcement* table, or greps the diff for numeric/hex literals in UI code — a
literal that slipped through is an objective violation, fixed in the stage before it's presented.

## R3. Section cases

**Every section case gets built and compared — a missed case is a blocker, not a detail.** For any
screen with a **`docs/development/<feature-name>/section-slicing/<screen>.md`**, that doc is the
case contract: read it **before** writing the screen and **enumerate every case ID**
(`body.summary/C3`, `ftr.actions/C5`) plus every row of its *Interactions that matter*. Then:

- **Implement every case**, with its visibility driven by the **declared source and trigger**
  (server field · role · flag · cache state; on mount · on query settle · on flag fetch · on focus)
  — not a convenient local boolean that happens to look right. Honor the declared
  **collapse-vs-keep-space** behavior and the **precedence** rule when two conditions are true at
  once, and implement the declared **unknown/missing-data** case (offline, null field, failed flag
  fetch) rather than letting it fall through to a blank region.
- **Render each case and compare it to that case's crop**
  (`design/sections/<screen>/<section-id>[--<case>].png`) — the same AI-checklist + pixel-diff loop
  as full-screen parity, but **per case**, which is the point: a full-screen mockup only ever shows
  one case, so comparing against it passes a screen whose other four cases were never built.
- **Report case coverage as a table** — case ID → implemented? → compared? → verdict. **Every case
  must be accounted for.** A case that is *not implemented*, or implemented but *never rendered*, is
  an **objective violation** → fix it in this stage. A case whose crop is **`pending export`** or
  missing with no explicit marker → **STOP and report**; don't guess the design and don't quietly
  skip it (that's the missed-case bug arriving anyway, one phase later).
- **A case the design never covered** is an **Open Decision back to `do-grooming`** — never invented
  here.
- **Views count is part of the spec:** if a case says *"3 skeleton rows"* or *"primary +
  secondary"*, assert the count and identity, not just "something rendered".

## R4. Common interactions

**Build common interactions per the UX conventions.** Implement submit enable/disable,
mandatory-field marking, empty/loading/error states, snackbars, and confirmations per
`docs/basics/04-ux-conventions.md` — consistent with the rest of the app, not ad-hoc. If a stage
needs a UX pattern the conventions don't cover, that's an undecided gap → **Open Decision back to
`do-grooming`** (which asks the user add-new-vs-reuse and registers the choice) — don't invent a
one-off.

## R5. Content-fit

**Content-fit for variable-content containers.** When building a dialog / bottom sheet / list /
form / multi-line text, it must **fit its content or scroll — never clip**. Verify at content +
viewport **extremes**, not just the mockup's ideal content: **longest realistic content, largest
dynamic-type/font scale, smallest supported screen** (render those cases in the visual-parity
step). Follow the widget-spec's *Container sizing & overflow* entry. This is the "dialog doesn't fit
its content" bug — catch it here.

## R6. Test IDs

**Apply the widget-spec Test IDs (client UI).** When implementing UI on Android/iOS/Web, set each
element's **exact Test ID** from the screen's widget-spec doc via that platform's native attribute
(`client-ui.md` §3), and its content description as the accessibility label. If you add a UI
element the spec doesn't list, **add it to the widget spec** (with a convention-following ID) —
don't ship an unaddressable element. These IDs are the contract `do-testing` locates by; a
missing/renamed ID breaks QA's UI tests.

## R7. Specced types and components

**Build each element as its specced type — don't substitute.** Implement every interactive element
as the **type** the widget spec declares (button, toggle, radio, checkbox, dropdown, …); the type is
intent, not cosmetic — a toggle built as a checkbox looks close but breaks the behavior. **Use the
canonical component the widget spec bound it to** (from `docs/basics/03-ui-architecture.md` →
component inventory) — never a hand-rolled look-alike; if the stage genuinely needs a **new
reusable** component, **register it in the inventory on create** (like assets). **Compose the
screen from its declared scaffold** (`client-ui.md` §4) — reuse the scaffold's **code component**
when one exists (rung 2 — reuse); if the pattern recurs across screens but no component exists,
**propose extracting one and ask first** (don't force the abstraction, don't hand-build the layout
differently per screen either). **Never swap in a different or "better" component on your own — if
you have a recommendation to deviate, ask the user first** (or raise it as an Open Decision back to
`do-grooming`); silently substituting is drift. `do-testing` asserts the rendered a11y role matches
the spec, so a mismatch will fail.
