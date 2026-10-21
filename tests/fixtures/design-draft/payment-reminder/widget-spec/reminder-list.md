# Widget Spec — Reminder list (payment-reminder)

| | |
|---|---|
| **Screen** | Reminder list |
| **Platforms** | Web |
| **TRD** | [spoke](../TRD-web.md) |
| **Design** | Claude draft, awaiting approval — [../design/reminder-list.html](../design/reminder-list.html) · frame `[data-frame="reminder-list"]` · 1440×900 |
| **Scaffold · slicing** | `feature-page · 1:2:1` |
| **Approved** | commit `3f8a6d0` · approved 2026-10-21 |
| **Date** | 2026-10-21 |

## Elements

| Element | Section | Type | Test ID | Content description (a11y label) | State(s) | Notes |
|---------|---------|------|---------|----------------------------------|----------|-------|
| Header | `hdr` | Container | `reminders_list_header` | "Payment reminders" | — | |
| Title | `hdr` | Text | `reminders_list_title` | "Payment reminders" | — | |
| Add reminder | `hdr` | Button | `reminders_list_add_button` | "Add a reminder" | default / disabled | opens the add dialog |
| List | `body.list` | Container | `reminders_list_list` | "Reminders" | loaded / empty | |
| Reminder row | `body.list.item` | Container | `reminders_list_item` | "{payee}, due {date}" | due / overdue | repeats per reminder |
| Empty text | `body.list` | Text | `reminders_list_empty_text` | "No reminders yet" | empty | |
