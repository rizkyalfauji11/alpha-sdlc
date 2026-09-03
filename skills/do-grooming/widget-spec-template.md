# Widget Spec — <screen name> (<feature name>)

| | |
|---|---|
| **Screen** | <screen / page name> |
| **Platforms** | <Android / iOS / Web — those in scope> |
| **TRD** | [spoke](../TRD-<platform>.md) |
| **Design** | <Figma frame link *or* `../design/<screen>.png` — the design this screen must match> |
| **Scaffold · slicing** | <which scaffold from `docs/basics/03-ui-architecture.md` → *Screen scaffolds* this screen instantiates, + its body slicing — e.g. `feature-page · 1:2:1`. Deviation from the scaffold → Open Decision; a new pattern → ask, then register it there.> |
| **Approved** | <YYYY-MM-DD — set when this screen's gate passes; an edit after this date makes it stale → re-approve> |
| **Date** | <YYYY-MM-DD> |

> The QA locator contract for this screen. Every **interactive or asserted** element gets a
> stable **Test ID**, its **type**, and a **content description**. Decorative-only elements are skipped.
> The Test ID is **one value reused across platforms**, applied via the native attribute:
> Android `resource-id` (`android:id`, or Compose `testTag` exposed via `testTagsAsResourceId`), iOS `accessibilityIdentifier`, Web `data-testid`.
> The **content description doubles as the accessibility label** (serves screen readers + QA).
> **ID convention:** the project's recorded style (`docs/basics/03-ui-architecture.md` → *Test-ID & widget-spec conventions*); plugin default `<feature>_<screen>_<element>` snake_case only when none is recorded. Stable — never renamed once shipped; shared elements use their canonical ID from the profile.
> **Type** = what the element actually is (button · toggle/switch · radio · checkbox · dropdown · text field · …). Build it as specified — the type is intent, not decoration, and a look-alike (e.g. a toggle built as a checkbox) breaks the behavior. Put any behavior the type implies (e.g. "exactly one selected") in *Notes* so it becomes testable AC; `do-testing` asserts the rendered a11y role matches the type.

## Elements

| Element | Section | Type | Test ID | Content description (a11y label) | State(s) | Notes |
|---------|---------|------|---------|----------------------------------|----------|-------|
| <Scan button> | `ftr.actions` | Button | `qris_widget_scan_button` | "Scan QRIS to pay" | default / pressed / disabled | deep-links to scanner |
| <Status toggle> | `hdr` | Switch | `qris_widget_status_toggle` | "Notifications on" | on / off / disabled | flips immediately, no submit |
| <Balance text> | `body.summary` | Text | `qris_widget_balance_text` | "Active balance" | masked / revealed | masked by default |

> **Section** is the region ID from [`../section-slicing/<screen>.md`](../section-slicing/<screen>.md) — the
> doc that owns *when* the region shows and how many views it renders. Every element names a section that
> exists there; an element in no section is a gap.

## Style bindings

> **What each region/element is styled *with*** — resolved by **name** against
> `docs/basics/18-design-tokens.md`, so the builder looks values up instead of eyeballing the mockup
> (that eyeballing is what makes padding / text size / font / hairlines differ screen to screen).
> Bind the **regions** plus any element that deviates from its component's default — not every element.
> Rules: a value **not on the scale** → snap to nearest **and say so here**; if the design uses it
> systematically → **Open Decision** (new scale step vs approved deviation), never a raw literal. A role
> the ramp doesn't have → **ask the user**, then register it in `18-design-tokens.md`.

| Region / element | Typography role | Spacing tokens | Divider / border | Component + variant | Deviation? |
|------------------|-----------------|----------------|------------------|---------------------|------------|
| <Screen (page frame)> | — | <edge `space.lg` · section gap `space.xl`> | — | <`PageScaffold` (feature-page)> | no |
| <Header> | <title `title.screen` · desc `body.sm`> | <header→body `space.lg`> | <`divider.hairline`, full-bleed> | — | no |
| <Balance card> | <amount `amount.lg` · label `caption`> | <inner `space.lg`> | <`radius.md` · `elevation.card`> | <`AppCard` (elevated)> | no |
| <Scan button> | <`button.md`> | <`space.md`/`space.lg`> | <`radius.md`> | <`AppButton` (primary)> | no |

**Screen frame:** <edge padding · scaffold + slicing (mirrors the `Scaffold · slicing` field above) · grid/breakpoint behavior if the screen is responsive.>

## Container sizing & overflow

> For **variable-content containers** on this screen (dialog, bottom sheet, list, form, multi-line text) —
> how they size and what happens when content grows. They must **fit content or scroll, never clip.**

| Container | Sizing | Overflow behavior | Extremes to verify |
|-----------|--------|-------------------|--------------------|
| <e.g. QRIS confirm dialog> | wrap-to-content, capped at <max-height> | scrolls past the cap | longest content · largest dynamic-type · smallest screen |

## Per-platform attribute notes

- **Android:** the QA locator is **`resource-id`**. Views/XML → `android:id="@+id/<id>"`. Compose → `Modifier.testTag("<id>")` **plus** `Modifier.semantics { testTagsAsResourceId = true }` (usually set once at the app/root) so the tag is exposed as `resource-id` to cross-app tools (Appium/UiAutomator); without it, in-process Espresso can find `testTag` via `onNodeWithTag` but black-box QA tools cannot. Content description → `contentDescription`.
- **iOS:** apply Test ID as `.accessibilityIdentifier("<id>")`; content description as `.accessibilityLabel(...)`.
- **Web:** apply Test ID as `data-testid="<id>"`; content description as `aria-label`.
- <Any element whose ID must differ on a platform — note it here; default is one shared ID.>
