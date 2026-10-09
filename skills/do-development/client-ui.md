# Client UI — the mechanics

> Read by `do-development` when the plan's **Platform** is a client — Android, iOS or Web — with
> `client-ui-rules.md`: in full before stage 1, once per session, and after a compaction again
> before the next UI stage. A Backend plan never reads this file. `do-testing` and `do-fixing` read
> it for their captures, trail and layout pass.
>
> **Mechanics only.** Where captures go, which attribute carries a Test ID, which comparison each
> stage kind runs, what the packet reports. **Every prohibition lives in `client-ui-rules.md`
> (R1–R7), in the one-line digest `SKILL.md` keeps and in `../../rules/ui.md`, and every one of
> them binds here unchanged.** Nothing in this file relaxes or replaces one — where two of these
> texts ever seem to disagree, the stricter reading binds.

## Contents

§1 Full-scroll capture, per platform · §2 The review trail · §3 Test IDs, per platform ·
§4 Scaffold composition · §5 The parity loop by stage kind, and what the packet reports ·
§6 Measuring boxes, per platform

## 1. Full-scroll capture, per platform

- **Capture the full scrollable extent, per platform** — load the lazy/deferred content first, then:
  **web** → Playwright screenshot with `fullPage: true`; **Android** → emulator +
  **scroll-and-stitch** (`adb exec-out screencap -p` at each scroll anchor top→bottom, stitched);
  **iOS** → simulator + **scroll-and-stitch** (`xcrun simctl io booted screenshot` per scroll
  anchor). Where `09-environment.md` records a mobile driver, take the per-anchor shot **through
  it** — one command for both platforms, and the capture is then repeatable by anyone — and stitch
  the same way. Any other platform — e.g. a webview desktop app — uses its own full-scroll-capture
  equivalent. The pixel-diff half of the comparison runs through a tool like `pixelmatch`/`odiff`.
- **With the `mobile-mcp` server, trail captures go to files, not into the conversation.** A capture
  that feeds a script or the trail — each per-anchor shot, the stitched page, the pixel-diff input,
  every `compared-ui/` file — is taken with `mobile_save_screenshot`, which writes the file and
  returns no image. Call `mobile_take_screenshot` only when you must judge the image yourself — the
  AI visual checklist of an iteration, the final capture beside the design. Driving and state
  assertions read `mobile_list_elements_on_screen` (identity, never position).

## 2. The review trail

- **Every iteration lands in `docs/development/<feature-name>/design/compared-ui/`** — the actual
  screenshot as `<screen>-<platform>-v<N>.png` and the diff overlay as
  `<screen>-<platform>-v<N>-diff.png` (`N` = iteration; keep every one — that set *is* the trail a
  reviewer reads). These are local review artifacts: gitignored and never committed
  (`client-ui-rules.md` R1). A section or case capture names its screen too —
  `<screen>.<section-id>[--<case>]-<platform>-v<N>.png` (`run.hdr-web-v3.png`) — because every
  screen has an `hdr`, and a capture that doesn't say whose is compared against nobody's crop.
- **A capture without its diff overlay is not a comparison, and a capture older than its design
  reference is not parity.** `scripts/check-parity-trail.js <feature-dir> <platform> [--screen
  <screen>]` (in this plugin) reads the trail and reports each latest capture with no `-diff.png`,
  each design reference changed after the capture that claims to match it (a re-groomed design
  makes the parity stale — the comparison re-runs), each screen an assembly stage owns with no
  full-screen reference, and — with `--screen` — a screen with no full-screen capture. Its output
  goes in the packet; a parity claim over a trail it rejects is not verified.

## 3. Test IDs, per platform

- **The ID comes from the screen's widget spec**
  (`docs/development/<feature-name>/widget-spec/<screen>.md`) and goes on the element through that
  platform's native attribute — **Android** `resource-id` (`android:id`, or Compose `testTag` with
  `testTagsAsResourceId=true`) · **iOS** `accessibilityIdentifier` · **Web** `data-testid` — with
  the spec's content description set as the element's **accessibility label**.

## 4. Scaffold composition

- **The screen composes from the widget spec's `Scaffold · slicing` field** — header anatomy, action
  placement, dividers and body slicing all come from the named scaffold; when the table names a
  **code component** for that scaffold, that component is what you reuse (rung 2 — reuse).

## 5. The parity loop by stage kind, and what the packet reports

- **Dispatch on the plan's *Stage kind*** — a **`shell`** stage checks the skeleton against the
  scaffold (regions present, slicing ratio, dividers), no case crops yet · a **`section`** stage
  renders **every case it claims** and compares each against that case's own crop, presenting the
  case-coverage table · an **`assembly`** stage owns the **screen**: capture the full scroll extent
  (§1) and compare **per section** (AI checklist + pixel-diff), every design section incl.
  below-the-fold, reporting spacing/type/border findings as *measured value → token name* against
  the widget spec's *Style bindings*, re-rendering until parity within platform-best-practice
  tolerance — **and then the layout pass below**, because the section crops already proved each
  section's inside and what only the whole screen shows is the layout *between* sections: where
  each one sits, its padding inside its container, the gap to its neighbour, how many columns and
  rows. Per-section comparison passes a screen whose header sits 30px low and whose rows are 36px
  short; so does an eye reading two full-page images side by side. A `section` stage compares its
  own crops only — full-screen parity is **not** this stage's job (the screen is knowingly
  incomplete, so don't diff it and don't wave a failing diff through).
- **The layout pass (assembly) — same content, measured boxes, a saved diff.**
  1. **Render the design's own content at the design frame's size.** The parity render uses a
     fixture that mirrors the design frame — the same number of rows, the same text lengths, the
     same states — at the frame's viewport (the plan's *Design references* row records it). A list
     of 6 rows against a design of 20 moves every section below it, and the diff then measures the
     fixture, not the layout. The content extremes (next bullet) are a separate render, never the
     parity render.
  2. **Compare the geometry as numbers.** Collect the box of every widget-spec Test ID on both
     sides (§6) and run `scripts/compare-geometry.js <design-boxes.json> <app-boxes.json>
     --tolerance 2 --tokens <the token stylesheet>`. It reports, per Test ID, every x / y / width /
     height difference, the inset inside its container, the gap to the neighbour below and to the
     right, and the column count of each container, beyond the tolerance (±2 in the platform's
     layout unit — px, dp, pt), with the token each value resolves to. Every finding is fixed at
     the token or named as an accepted platform deviation; `geometry: clean` or the named
     deviations go in the packet.
  3. **Save the full-screen diff overlay** as `<screen>-<platform>-v<N>-diff.png` with its mismatch
     percentage, and read the overlay — not two images side by side — for what the boxes can't
     carry (colour, icon, text).
  4. **Close with the trail check** (§2) for the screen: `check-parity-trail.js <feature-dir>
     <platform> --screen <screen>` clean.
  - **Nothing to measure is a missing input, not a reason to eyeball.** A design canvas whose
    elements don't carry the widget-spec Test IDs (as `id` or `data-testid`), or a screen with no
    full-screen reference, can't be laid out against — STOP and send it back to `do-grooming`
    (tag the canvas · export the full frame). In auto-run it is the *input that physically doesn't
    exist* halting case. Hand-typed coordinates in place of measured boxes are the defect this pass
    exists to remove.
- **An `assembly` stage also drives the extremes and the interactions** — render the **content
  extremes** (longest realistic content, largest dynamic-type/font scale, smallest supported screen)
  and confirm nothing clips (it fits or it scrolls), then walk the section-slicing doc's
  **Interactions (`X`) rows**, which only become observable once the sections are composed — each
  one: the combination, which case wins, what renders.
- **Save each iteration to the trail as it happens** (§2) — the screenshot *and* its diff overlay,
  every round, not one capture at the end.
- **Packet slot — *Section cases*** — the case-coverage table for **the cases this stage claims**:
  case ID → implemented · compared to its crop · verdict. State the totals against the stage's claim
  ("4 of 4 claimed cases done; 10 of 14 screen-wide so far"), and list any case blocked on a missing
  crop or raised as an Open Decision. On an **`assembly`** stage, also report the **Interactions
  (`X`) rows** and confirm **every** case in the doc is now accounted for across stages — that total
  is the missed-case check.
- **Packet slot — *Visual parity*** — the final actual screenshot next to the design, the
  AI-checklist + pixel-diff result, the iteration count, any accepted platform deviations, and
  **full-scroll coverage** (N sections captured, all compared — or the virtualized-list handling).
  On an **`assembly`** stage, also the layout pass: the fixture the render used and the frame size,
  the `compare-geometry.js` result (each finding → fixed / accepted deviation), the full-screen
  mismatch percentage with the overlay's path, and the `check-parity-trail.js` output.
  Plus the token findings from the render: any value snapped to the nearest token, any **new token
  registered** in `18-design-tokens.md`, any off-scale value raised as an Open Decision. Point to
  the saved trail in `design/compared-ui/`.

## 6. Measuring boxes, per platform

- **One shape on both sides** — `{ "boxes": { "<test-id>": [x, y, width, height] } }`, in the
  platform's layout unit, relative to the top of the frame (design) or of the full scrolled page
  (app), so `scripts/compare-geometry.js` reads either. Containers count: a card's padding is only
  measurable when the card carries a Test ID as well as its contents.
- **Design side** — an **HTML canvas**: from the project root (its own Playwright is used),
  `node <plugin>/scripts/collect-boxes.mjs --url <canvas.html> --viewport <W>x<H> --ids
  widget-spec/<screen>.md --frame <the frame's selector> --out design-boxes.json`; each Test ID is
  looked up as `#id`, then `[data-testid]`. **Figma**: the frame's inspected layer bounds, the
  layers named by Test ID. **An image only**: the section boxes recorded in the section-slicing doc
  — the section's own box, not its crop's gutter — which measures sections, not elements; say so in
  the packet.
- **App side** — **web**: the same script against the running app (`--url http://… --wait
  <a ready selector>`, no `--frame`), or — when the screen needs a sign-in or seeded data — from
  inside the project's own parity test: `getBoundingClientRect()` of each `[data-testid]`, plus
  `scrollX`/`scrollY`, written to the same JSON. **Android**: `adb shell uiautomator dump` → each
  node's `resource-id` and `bounds`, divided by the density (`adb shell wm density` ÷ 160) into dp.
  **iOS**: the UI test writes `element.frame` (points) for each `accessibilityIdentifier`. On a
  scroll-and-stitch capture, add each anchor's scroll offset so every box is page-relative.
  **Either platform, when the `mobile-mcp` server is active**: one read of the accessibility tree
  (`mobile_list_elements_on_screen`) returns every element with its identifier and box, which
  spares iOS a UI test written only to dump frames — the asymmetry that made iOS the expensive side.
  **Convert before you compare, and prove the conversion once**: the driver reports device pixels
  while the comparison is in dp (Android) or points (iOS), so divide by the density and **check one
  element whose size the design states** — a 48dp control that lands at 48 confirms the factor, and
  a mismatch means the units are not what you assumed. Recording that check in the packet costs a
  line and turns every later box into evidence rather than a guess.
