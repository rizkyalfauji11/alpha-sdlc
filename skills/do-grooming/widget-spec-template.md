# Widget Spec — <screen name> (<feature name>)

| | |
|---|---|
| **Screen** | <screen / page name> |
| **Platforms** | <Android / iOS / Web — those in scope> |
| **TRD** | [spoke](../TRD-<platform>.md) |
| **Design** | <Figma frame link *or* `../design/<screen>.png` — the design this screen must match> |
| **Date** | <YYYY-MM-DD> |

> The QA locator contract for this screen. Every **interactive or asserted** element gets a
> stable **Test ID**, its **type**, and a **content description**. Decorative-only elements are skipped.
> The Test ID is **one value reused across platforms**, applied via the native attribute:
> Android `resource-id` (`android:id`, or Compose `testTag` exposed via `testTagsAsResourceId`), iOS `accessibilityIdentifier`, Web `data-testid`.
> The **content description doubles as the accessibility label** (serves screen readers + QA).
> **ID convention:** `<feature>_<screen>_<element>`, snake_case, stable — never renamed once shipped.
> **Type** = what the element actually is (button · toggle/switch · radio · checkbox · dropdown · text field · …). Build it as specified — the type is intent, not decoration, and a look-alike (e.g. a toggle built as a checkbox) breaks the behavior. Put any behavior the type implies (e.g. "exactly one selected") in *Notes* so it becomes testable AC; `do-testing` asserts the rendered a11y role matches the type.

## Elements

| Element | Type | Test ID | Content description (a11y label) | State(s) | Notes |
|---------|------|---------|----------------------------------|----------|-------|
| <Scan button> | Button | `qris_widget_scan_button` | "Scan QRIS to pay" | default / pressed / disabled | deep-links to scanner |
| <Status toggle> | Switch | `qris_widget_status_toggle` | "Notifications on" | on / off / disabled | flips immediately, no submit |
| <Balance text> | Text | `qris_widget_balance_text` | "Active balance" | masked / revealed | masked by default |

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
