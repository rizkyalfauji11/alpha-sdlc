Generated from `principles.md` by `scripts/build-rules.js` for: read when the platform is a client one: web, android or ios. Edit `principles.md`, never this file.

# SDLC plugin — shared principles

Every skill in this plugin applies these. Skill-specific mechanics live in each `SKILL.md`.

## Working agreements

- **UI containers must never clip — verify at content + viewport extremes.** Any **variable-content
  container** (dialog, bottom sheet, list, form, multi-line text) must **fit its content or scroll —
  never clip or cut off content**. Verify it not just at the design's ideal content but at the
  extremes: **longest realistic content · largest dynamic-type / font scale · smallest supported
  screen**. Scoped to variable-content containers (a fixed-size icon doesn't need it). Enforced when
  building (`do-development`) and testing (`do-testing`) — this is the class of bug where a dialog
  looks right in the mockup but clips real content.
- **Component fidelity — build exactly the component the design specifies, every element no matter how small.**
  The design's choice of element is intent, not decoration: match its **type and the behavior that
  type implies**, and never substitute something that merely looks close (a toggle built as a
  checkbox looks almost right but breaks the behavior). This holds for the smallest control as much
  as the largest layout — be aware of *every* component. **If you have a recommendation to deviate**
  — a different component, an "improvement", anything not in the design — **ask the user first;
  never apply your own preference silently.** When the design is ambiguous about an element, surface
  it (Open Decision), don't guess. Recorded in the widget spec, built in `do-development`, asserted
  in `do-testing` — like any other spec.
- **Visual values are tokens — zero raw literals.** On client UI every spacing, font
  size/weight/family/line-height, color, border thickness, radius, elevation, icon and control size
  comes from the project's **design-token contract** (`docs/basics/18-design-tokens.md`) by
  **name**. Never read a value off a mockup — eyeballing a raster is why padding, text size, fonts
  and hairlines differ screen to screen. Emphasis is a weight token (never a size bump), lines take
  their thickness/inset/length from tokens and their container, and a value the scale lacks is
  **snapped and reported** or raised as an Open Decision (new scale step vs approved deviation) —
  never a stray literal. A wrong token is a defect **even when a pixel-diff passes**.

This bundle adds to the reading skill's own bundle; every other rule binds through that bundle.
