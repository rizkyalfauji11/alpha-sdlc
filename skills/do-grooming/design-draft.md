# The design draft — a screen Claude draws

Read when a screen's design question is answered `draft` (`client-spoke.md` → *Capture design*),
before the first drawing and again after a compaction. It is the one exception to "never generate
UI": the member asked for it, at that screen, and approves only a drawing they have seen.

## Contents

- **When** — after the widget spec, before the slicing
- **Drawing** — sources, size, frames, Test IDs
- **The file** — the rules the platform's sandbox sets
- **Recording and committing** — before the gate
- **The draft's gate** — approve, approve with edits, regenerate
- **Sections of a draft**

## When

Step 3, after the screen's widget spec is approved and committed, before its section slicing. At
the widget spec's gate its `Design` field reads `Claude draft, drawn once this spec is approved`,
with no path, so nothing lists a file that does not exist yet.

## Drawing

- **From what is approved, nothing else**: the hub (its feature flow and the frames and states it
  names), the screen's widget spec (elements, types, content descriptions, *Style bindings*,
  *Scaffold · slicing*, *Container sizing & overflow*) and the profile it binds to —
  `03-ui-architecture.md`'s components and scaffolds, `18-design-tokens.md`'s values,
  `04-ux-conventions.md`. An element, text or state none of them names is not drawn; a gap found
  while drawing is an Open Decision, as any other.
- **At the platform's screen size**: the size the app renders, as the profile or the feature's
  other frames record it; none recorded → web 1440×900, Android 360×800, iOS 393×852 (CSS px for
  dp and pt), named on the gate.
- **Frames**: the full screen is one element, `data-frame="<screen>"`, exactly that size. Each
  state the widget spec or hub specs that looks different — empty, loading, error, largest content
  — is its own frame after it, `data-frame="<screen>--<case>"`, so the states are designed too.
  The content drawn is realistic and counted (20 documents, 3 waiting): the assembly's fixture
  mirrors it.
- **Test IDs**: every widget-spec element carries its Test ID as `data-testid` (or `id`) in every
  frame it shows in, the containers that own a padding included — the HTML-canvas rule, so the
  boxes are measured, never estimated.

## The file

The web shows a draft in an `iframe` with `sandbox` and no `allow-*` token, through `srcdoc`, under
a Content-Security-Policy of `default-src 'self'; style-src 'self' 'unsafe-inline'`. A draft is
drawn to it:
- **One file**: `docs/development/<feature>/design/<screen>.html`, the name matching
  `^[A-Za-z0-9._-]+\.html$`, under 1 MiB.
- **Inline CSS only** — a `<style>` element or `style` attributes — and every picture (icon,
  illustration, avatar, chart) as inline `<svg>`. Text in the platform's system font stack.
- **Never** a `<script>`, an event-handler attribute (`on…=`), a `javascript:` or `data:` URL, or
  an outside URL — no `<img>`, `<link>`, `<iframe>`, `<object>`, `<embed>`, `<base>`, `@import`,
  `@font-face` or `url()` to a file. The sandbox would block each one, and the member would approve
  a drawing that is not what they saw.
- **The proof**, before every commit of the draft:
  `node <plugin root>/scripts/check-draft.js docs/development/<feature>/design/<screen>.html
  --spec docs/development/<feature>/widget-spec/<screen>.md` exits 0. It checks each rule above,
  a `data-frame`, and every Test ID of the widget spec on an element. A failure is fixed in the
  drawing, never in the check.

## Recording and committing

- The widget spec's `Design` field becomes, on one line:
  ```
  | **Design** | Claude draft, awaiting approval — [../design/<screen>.html](../design/<screen>.html) · frame `[data-frame="<screen>"]` · <W>×<H> |
  ```
  The link comes first in the cell: it is what the platform's web reads. This edit is the draft's,
  approved at the draft's gate; the widget spec's `Approved` stamp stands.
- **Commit both files before the gate**, by explicit path, to `feat/<feature>`: the draft and the
  widget spec. The platform's web reads the draft from the clone's `HEAD` (the bridge's
  `GET /v1/repos/design`), so a gate shown before the commit opens nothing, or the drawing before.
  The draft is the one unit committed before its approval, because the member must see it to
  approve it.

## The draft's gate

One gate per drawing. A terminal shows it as any other gate, with the file to open in a browser and
the frame size; a platform run reports it as `grooming-run-schema.md` → *The design draft* says.
The proposal is the drawing's notes: the frame size, the regions top to bottom, each element with
its Test ID, the states drawn.
- **Approve** — the draft is the screen's design. The `Design` field's opening words become
  `Claude draft · commit <hash> · approved <YYYY-MM-DD>`, the hash `HEAD` before that commit, the
  link, frame and size kept, and the widget spec is committed. The section slicing and
  `do-planning` cite this draft from then on.
- **Approve with edits** — the edited notes are the brief. Redraw over the **same file**, run the
  proof, commit both, and show the **same gate again** with the new drawing: approving notes never
  approves a drawing nobody has seen.
- **Regenerate with feedback** — the same, drawn from the feedback.

## Sections of a draft

Section slicing reads the draft as an HTML canvas: each section's container carries its Test ID,
so its crop box is that element's box on the draft, measured (`collect-boxes.mjs --frame
'[data-frame="<screen>"]'`), never typed by eye. The crop is the draft rendered at the frame size
and clipped to that box where a browser is at hand — the project's own Playwright. A run that
cannot render one, a platform run among them, writes the section's `Crop` as
`../design/<screen>.html` · `[data-testid="<container>"]` · `pending export`: a gap, exported from a
terminal before development, never a case left without a crop.
