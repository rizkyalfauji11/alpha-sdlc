# Widget Spec — <screen name> (<feature name>)

| | |
|---|---|
| **Screen** | <screen / page name> |
| **Platforms** | <Android / iOS / Web — those in scope> |
| **TRD** | [spoke](../TRD-<platform>.md) |
| **Date** | <YYYY-MM-DD> |

> The QA locator contract for this screen. Every **interactive or asserted** element gets a
> stable **Test ID** and a **content description**. Decorative-only elements are skipped.
> The Test ID is **one value reused across platforms**, applied via the native attribute:
> Android `testTag` (or `resource-id`), iOS `accessibilityIdentifier`, Web `data-testid`.
> The **content description doubles as the accessibility label** (serves screen readers + QA).
> **ID convention:** `<feature>_<screen>_<element>`, snake_case, stable — never renamed once shipped.

## Elements

| Element | Test ID | Content description (a11y label) | State(s) | Notes |
|---------|---------|----------------------------------|----------|-------|
| <Scan button> | `qris_widget_scan_button` | "Scan QRIS to pay" | default / pressed / disabled | deep-links to scanner |
| <Balance text> | `qris_widget_balance_text` | "Active balance" | masked / revealed | masked by default |
| <Offline banner> | `qris_widget_offline_banner` | "You are offline" | shown / hidden | |

## Per-platform attribute notes

- **Android:** apply Test ID as `Modifier.testTag("<id>")` (Compose) or `android:id`/`resource-id` (XML); content description as `contentDescription`.
- **iOS:** apply Test ID as `.accessibilityIdentifier("<id>")`; content description as `.accessibilityLabel(...)`.
- **Web:** apply Test ID as `data-testid="<id>"`; content description as `aria-label`.
- <Any element whose ID must differ on a platform — note it here; default is one shared ID.>
