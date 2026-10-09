# UI levels — client platforms only

> Read by `do-testing` at flow step 1 on web, Android or iOS — once per session, again after a
> compaction. `SKILL.md` holds the gates and `../../rules/ui.md` the UI-only rules; nothing here
> relaxes either.

Contents: The UI level · Tooling · Mobile captures · Boot & Smoke on a mobile client

## The UI level

**UI** *(clients — appearance + composition)*. Locate elements by their **widget-spec Test IDs**
(`docs/development/<feature-name>/widget-spec/<screen>.md`) — Android `resource-id` (`android:id`
/ Compose `testTag` via `testTagsAsResourceId`), iOS `accessibilityIdentifier`, Web `data-testid`
— never brittle text/xpath; if an element isn't specced, flag it.

- **Visual parity** vs the design (`design/<screen>.png` / Figma) — icons, colors, spacing,
  typography, **and each element's type** — AI checklist + pixel-diff, **within
  platform-best-practice tolerance** (not literal pixel-identical; flag intentional platform
  deviations). **Capture the full scroll extent** (web `fullPage`; mobile scroll-and-stitch —
  load lazy content first) and **compare per section**: every design section incl. below-the-fold
  must be covered — an **uncovered / below-the-fold section is a bug**, never a silent pass.
  Virtualized/infinite lists → compare the item template + representative sections. Save actual +
  diff to `design/compared-ui/`. **The full screen also runs the layout pass**
  (`../do-development/client-ui.md` §5 — the design's own content at the frame's size, every Test
  ID's box against the design's via `scripts/compare-geometry.js`): a padding, gap, column or row
  difference beyond tolerance is a bug with its numbers. Development's parity is not reused when
  `scripts/check-parity-trail.js` calls it stale — a design changed after the capture is
  compared again.
- **View composition + type** — element presence, hierarchy, arrangement, layout, **and each
  element's type: assert its rendered a11y role matches the widget spec** (`switch` / `radio` /
  `checkbox` / `button` / …) — machine-checkable and non-flaky. Also assert any behavior the type
  implies where it's an AC. **A type mismatch is always logged as a bug** (severity judged by
  behavioral impact — behavior-changing is major/blocker, a cosmetic swap is lower), never waved
  through on visual tolerance.
- **Scaffold conformance** — the screen matches its declared scaffold (widget-spec `Scaffold ·
  slicing` ↔ `03-ui-architecture.md`): header anatomy present (title/description/actions **in the
  declared region**, e.g. top-right), divider between header and body, **body slicing ratio** as
  declared (assert region proportions, within tolerance). This catches **cross-screen drift**
  that per-screen pixel-tolerance lets slide — two screens each "close enough" to their own
  mockup but composed differently from each other. A scaffold deviation not recorded as an
  approved Open Decision is a bug.
- **Token & style conformance** — the screen's visual *values* match the standard
  (`docs/basics/18-design-tokens.md` ↔ widget-spec *Style bindings*). Two checks, and the first
  is mandatory on every platform: **(a) static — no raw literals**
  (spacing/font-size/weight/family/hex/border values written inline instead of tokens), run via
  the doc's *Enforcement* command; **(b) rendered — assert computed styles** where the framework
  exposes them: font-family/size/weight per typography role, divider thickness + inset, padding
  on the screen frame and key containers, control heights and tap-target minimum. **Web is
  strongest here** (`getComputedStyle`); **Android/iOS assertion coverage is weaker** — say which
  checks actually ran rather than implying parity, lean on the static check, and reuse the repo's
  existing screenshot-baseline tool if it has one (don't add a dependency for this). Also
  **compare across screens**: the feature's screens must agree with each other *and* with sibling
  screens of the same scaffold — a body text size or card padding that differs from the house
  value is a bug even when both screens match their own mockup (this is the drift
  pixel-tolerance-per-screen lets through, and the reason "each screen looked fine" ships an
  inconsistent app). **A deviation that isn't in the doc's *Approved deviations* table is a
  bug**; anything already listed there is not re-flagged.
- **Section cases** — drive each case in the screen's `section-slicing/<screen>.md` and assert
  what it declares: the section is **shown/hidden** per its condition (and **collapses vs keeps
  space** as declared), the **count *and* identity of views rendered** matches (3 skeleton rows,
  primary + secondary — not merely "something rendered"), the declared **precedence** holds for
  each *Interactions* row, and the **unknown/missing-data** case behaves as specced (offline,
  null field, failed flag fetch). Locate by widget-spec Test IDs, and set up each case through
  its **declared source** (real role, real flag, real query state) rather than forcing the
  component's internal state. Track it as **case → test** in the test plan: an unasserted case is
  a coverage gap, and a case that renders differently from its crop is a bug.
- **States & UX conventions** — loading / error / empty / offline; theming; a11y labels —
  **asserted against `docs/basics/04-ux-conventions.md`**: the submit/CTA stays disabled until
  mandatory fields are valid, mandatory fields are marked per the convention, snackbars fire on
  the right events with the right style, and empty/error states match the standard. A deviation
  from the documented convention is a bug (unless the design deliberately overrode it).
- **Content-fit** — variable-content containers (dialog / sheet / list / form / multi-line text)
  must **fit content or scroll, never clip**. Test at extremes: longest content, largest
  dynamic-type/font, smallest supported screen. (This is the "dialog doesn't cover its content"
  class of bug.)
- **Stepped flows (wizard)** — when the spoke has a *Multi-step flows* spec, derive its test set
  from it (this is where "step-by-step configuration has many bugs" is caught): **per-step
  validation** blocks Next until valid; **Back preserves entered data**; **cross-step
  dependency** — changing an earlier choice refetches the dependent later step's options;
  **partial save/resume** works as specced; **abort mid-flow → nothing persisted**; **complete →
  atomic commit** (all-or-nothing — a mid-flow server error leaves no half-written data and
  recovers without losing input). The persistence/commit assertions run at the Integration level
  against the real backend.

## Tooling

Render/screenshot + pixel-diff tooling for visual parity (capture commands and the
`design/compared-ui/` naming are in `../do-development/client-ui.md`); for token conformance, the
project's existing lint/static check plus computed-style assertions in the UI framework already in
use (and its existing screenshot-baseline tool if it has one — don't add a new dependency for
this).

## Mobile captures

On Android and iOS, every capture that feeds a script or the trail — the pixel diff,
`compare-geometry.js`, `design/compared-ui/`, a Boot & Smoke journey's evidence — goes through
`mobile_save_screenshot`, which writes the file and puts no image into the context. Drive the app
and read its state through `mobile_list_elements_on_screen` — by identity, never by position
(`principles.md` → *A driven app is addressed by identity*). Call `mobile_take_screenshot` only
when you must judge the image yourself, such as the visual checklist on the final capture, and save
that capture too, so the trail and `check-parity-trail.js` see every one.

## Boot & Smoke on a mobile client

On a **mobile client** (Android or iOS) it does not reduce — it **translates**: the build
under test is installed on a real emulator, simulator or device and launched into the foreground
(per `09-environment.md`'s *Mobile app under test*), the journeys are driven through the app's
own UI against the real backend, and the three web failure signals map one-for-one — a
**browser console error** becomes an **error or fatal line in the device log attributable to the
app under test**, a **failed network request** stays itself, and an **error-boundary activation**
becomes a **crash report**, which is stronger evidence, not weaker: a process that died leaves a
record a screenshot never shows. Collect the log for the whole run and the crash list **after**
it, and attach both — a journey that "passed" while the log carried a fatal is a failed gate that
nobody read. Its screen evidence is saved per *Mobile captures*. Everything else in `boot-smoke.md`
— real backend, critical journeys, domain-realistic data, real auth, runtime vs. contract,
cross-feature and flow-dependency journeys — holds unchanged.
