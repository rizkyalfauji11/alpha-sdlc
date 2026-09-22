# Client UI — the mechanics

> Loaded by `do-development` when the plan's **Platform** is a client — Android, iOS or Web. A Backend
> plan never reads this file.
>
> **Mechanics only.** Where captures go, which attribute carries a Test ID, which comparison each stage
> kind runs, what the packet reports.
> **Every prohibition still lives in `SKILL.md` and `../../principles.md`, and every one of them binds
> here unchanged.** Nothing in this file relaxes or replaces one: don't trust code-from-image · never
> read a value off the mockup, zero raw literals · never substitute a component that merely looks close
> · a wrong token is a defect inside pixel tolerance · parity is not passed while any section is
> uncompared · never skip or auto-continue past a failed comparison, and never claim parity you didn't
> verify.
> If this file and `SKILL.md` ever seem to disagree, `SKILL.md` wins.

## 1. Full-scroll capture, per platform

- **Capture the full scrollable extent, per platform** — load the lazy/deferred content first, then: **web** → Playwright screenshot with `fullPage: true`; **Android** → emulator + **scroll-and-stitch** (`adb exec-out screencap -p` at each scroll anchor top→bottom, stitched); **iOS** → simulator + **scroll-and-stitch** (`xcrun simctl io booted screenshot` per scroll anchor). Any other platform — e.g. a webview desktop app — uses its own full-scroll-capture equivalent. The pixel-diff half of the comparison runs through a tool like `pixelmatch`/`odiff`.

## 2. The review trail

- **Every iteration lands in `docs/development/<feature-name>/design/compared-ui/`** — the actual screenshot as `<screen>-<platform>-v<N>.png` and the diff overlay as `<screen>-<platform>-v<N>-diff.png` (`N` = iteration; keep every one — that set *is* the trail a reviewer reads). These are local review artifacts: the `.gitignore` requirement and the never-commit rule are in `SKILL.md`.

## 3. Test IDs, per platform

- **The ID comes from the screen's widget spec** (`docs/development/<feature-name>/widget-spec/<screen>.md`) and goes on the element through that platform's native attribute — **Android** `resource-id` (`android:id`, or Compose `testTag` with `testTagsAsResourceId=true`) · **iOS** `accessibilityIdentifier` · **Web** `data-testid` — with the spec's content description set as the element's **accessibility label**.

## 4. Scaffold composition

- **The screen composes from the widget spec's `Scaffold · slicing` field** — header anatomy, action placement, dividers and body slicing all come from the named scaffold; when the table names a **code component** for that scaffold, that component is what you reuse (rung 2 — reuse).

## 5. The parity loop by stage kind, and what the packet reports

- **Dispatch on the plan's *Stage kind*** — a **`shell`** stage checks the skeleton against the scaffold (regions present, slicing ratio, dividers), no case crops yet · a **`section`** stage renders **every case it claims** and compares each against that case's own crop, presenting the case-coverage table · an **`assembly`** stage owns the **screen**: capture the full scroll extent (§1) and compare **per section** (AI checklist + pixel-diff), every design section incl. below-the-fold, reporting spacing/type/border findings as *measured value → token name* against the widget spec's *Style bindings*, re-rendering until parity within platform-best-practice tolerance.
- **An `assembly` stage also drives the extremes and the interactions** — render the **content extremes** (longest realistic content, largest dynamic-type/font scale, smallest supported screen) and confirm nothing clips (it fits or it scrolls), then walk the section-slicing doc's **Interactions (`X`) rows**, which only become observable once the sections are composed — each one: the combination, which case wins, what renders.
- **Save each iteration to the trail as it happens** (§2) — the screenshot *and* its diff overlay, every round, not one capture at the end.
- **Packet slot — *Section cases*** — the case-coverage table for **the cases this stage claims**: case ID → implemented · compared to its crop · verdict. State the totals against the stage's claim ("4 of 4 claimed cases done; 10 of 14 screen-wide so far"), and list any case blocked on a missing crop or raised as an Open Decision. On an **`assembly`** stage, also report the **Interactions (`X`) rows** and confirm **every** case in the doc is now accounted for across stages — that total is the missed-case check.
- **Packet slot — *Visual parity*** — the final actual screenshot next to the design, the AI-checklist + pixel-diff result, the iteration count, any accepted platform deviations, and **full-scroll coverage** (N sections captured, all compared — or the virtualized-list handling). Plus the token findings from the render: any value snapped to the nearest token, any **new token registered** in `18-design-tokens.md`, any off-scale value raised as an Open Decision. Point to the saved trail in `design/compared-ui/`.
