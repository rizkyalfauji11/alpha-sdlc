# Client spoke grooming — design, widget specs, section slicing

Read at Step 0.1 when grooming an **Android, iOS or Web spoke**, with `TRD-spoke-template.md` —
once per session, again after a compaction. Step 3 works through it with `widget-spec-template.md`
and `section-slicing-template.md`: the templates carry each field's rules, this file says what to
decide and when to ask. `SKILL.md` keeps the flow and every gate.

## Contents

- **Capture design** — the moment the user shares it
- **Widget spec per screen** — Step 3.1
- **Section slicing per screen** — Step 3.2
- **Multi-step flows** — §2 Design
- **Assets** — §3, per the spoke template
- **An unfinished spoke**

## Capture design

**Capture design the moment the user shares it (client grooming).** Users typically give the
design here, not at planning — so save it now and don't make them re-provide it later: **image(s)
→ save to `docs/development/<feature-name>/design/<screen>.png`** (create `design/`); **Figma →
record the frame link.** Record the reference in the screen's **widget-spec `Design` field**.
**Capture refs per step and per state, not just the main screen:** a stepped flow needs a ref for
**each step**, and each specced state (empty / loading / error / largest-content) either has a
design ref or is **explicitly flagged** (Open Decision, or "platform default per
`04-ux-conventions`") — an unreferenced state is where built UI silently diverges on "specific
tests". **Every screen keeps its full frame, not only its crops** — the whole screen at the size
the app renders, with that size recorded: the crops show each section's inside, and only the full
frame shows the layout between sections, which is what `do-development`'s assembly compares.
**An HTML design canvas carries the widget-spec Test IDs on its elements** (`id` or
`data-testid`, written in when the widget spec is approved), so its boxes are measured rather
than estimated — and a section's crop box is then that section's measured box, not one typed by
eye. `do-planning` reads these forward into its *Design references* for the visual-parity loop
— it should not re-ask for anything grooming already captured.

## Widget spec per screen

**Create a widget spec per screen (client spoke grooming).** For Android/iOS/Web features, write
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
fit its content" downstream.

- **Interaction conventions.** **Common interaction behavior** (submit enable/disable,
  mandatory-field marking, empty/loading/error states, snackbars, confirmations) follows
  `docs/basics/04-ux-conventions.md` — reference the convention rather than re-deciding per screen.
  When the feature needs a UX pattern the doc **already covers**, reuse it; a design that
  **deviates** from an existing convention is an **Open Decision**, not a silent one-off. When it
  needs a pattern **not covered yet** (a new UX), **ask the user: add a new convention, or
  reuse/adapt an existing one** — never silently invent a one-off. If a **new** convention is
  chosen, **add it to `04-ux-conventions.md`** (register-on-create) so the next feature reuses it.
- **Components.** **Resolve each UI component against the component inventory**
  (`docs/basics/03-ui-architecture.md` → *Design system & component inventory*) the same way assets
  resolve against the registry: the design shows a button/card/dialog/stepper → bind the
  widget-spec element to the **canonical component** (name it in the element's Notes); no match →
  ask the user (reuse/adapt vs create), and a new **reusable** component is registered into the
  inventory on create — a hand-rolled look-alike is how built UI drifts from the design.
- **Scaffold.** **Bind each screen to a scaffold** (`03-ui-architecture.md` → *Screen scaffolds &
  layout patterns*): fill the widget-spec's `Scaffold · slicing` field — which scaffold the screen
  instantiates. Design matches a scaffold → reuse it; design **deviates** → Open Decision; a
  genuinely **new** layout pattern → **ask the user (add vs reuse/adapt)** and register it in the
  scaffolds table on create. This is also the **fallback for anything the design doesn't show** (a
  missing state or screen follows the house scaffold, not an invention).
- **Style bindings.** **Fill the widget-spec's *Style bindings* table — resolve every region
  against `docs/basics/18-design-tokens.md` by token *name***. Where the design is a **Figma link,
  read its inspected values** (dev mode) and map them to token names — don't estimate from a
  picture; where it's only a PNG, map what the standard says the region uses and flag anything the
  image contradicts. A value off the scale, its systematic use, and a typography role or token the
  standard lacks follow the template's *Style bindings* rules — snapped and recorded, an Open
  Decision, asked and registered.

## Section slicing per screen

**Slice every screen into sections, with a crop and a case list per section (client spoke
grooming).** Write one **`docs/development/<feature-name>/section-slicing/<screen>.md`** per screen
using `section-slicing-template.md`.
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
- **Every section states how its logic runs** — the template's *Visibility* and *How the logic
  runs* tables, every row filled: the condition's source of truth named exactly, the trigger that
  evaluates it, the transition between cases, what wins when the condition can't be resolved
  ("can't happen" is not an answer), and whether hiding collapses or keeps space.
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

## Multi-step flows

**Spec multi-step flows at the flow level (client spoke grooming).** When the feature contains a
**stepped flow / wizard**, the per-screen widget specs aren't enough — fill the spoke's
**Multi-step flows** spec (§2 Design) — grounded in `docs/basics/04-ux-conventions.md` →
*Multi-step / wizard flows* (deviation → Open Decision). Grooming steps in isolation is how
stepped flows accumulate bugs.

## Assets

Resolve every asset the spoke needs by the asset search flow in `TRD-spoke-template.md` §3 —
registry, then the assets module, then ask; create-new is the last resort.

## An unfinished spoke

A screen with no widget spec, or with sections but uncropped/unenumerated cases, is an **unfinished
spoke** — not a detail for `do-development` to discover.
