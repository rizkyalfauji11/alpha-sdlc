# The setup-run schema

Read this file when the consumer passes a setup-run schema (`--json-schema`, a StructuredOutput
tool) — at the start of every such run, before the first report. Everything in `SKILL.md` still
applies; this file maps it onto the schema's fields. The schema itself never changes, and every
existing field is filled exactly as before.

## Every question

`SKILL.md` → *Every question setup raises* holds the rules every question follows; with a schema
they land in these fields, and two more rules apply.

- **Evidence (rule 1).** In the setup-run schema that is `evidence`, **on every question**: the
  consumer renders nothing when it is absent, so an evidence-less question looks exactly like a
  well-grounded one. When there is genuinely nothing to show, say so in the evidence caption instead
  of omitting the block.
- **A way out (rule 2)** is its own `options[]` or `actions[]` entry.
- **A refusal's reason (rule 3).** An option or action that skips, declines or refuses carries
  `requiresReason: true`; every other one leaves it false.
- **It says when it was asked — as an instant, never a phrase.** `askedAt` is an RFC 3339
  timestamp read from the clock (`date -u +%Y-%m-%dT%H:%M:%SZ`), never estimated and never
  *"2 days"*: a phrase is computed when the report is written and is wrong an hour later, while the
  consumer renders the age from the instant and keeps it current. Set it **once, when the question
  is first raised**, and carry it unchanged in every later report of the same question (same `id`)
  — a timestamp refreshed on each report resets the age to zero and hides the only signal that a
  question is going stale.
- **What the reader should simply see, and nothing the app must act on, goes in `notes`** — an
  array of `{ label, text, engineer? }` blocks, the step summary's shape, rendered in order. Fill it
  on every question, and on a document row wherever something is worth saying that no field
  carries; never fill it with filler. Sorting, colour, blocking and requiring a reason stay in their
  typed fields, because the app cannot act on a string it does not understand.

`notes` and `askedAt` are optional in the setup-run schema: when the consumer's schema lacks them,
they are simply not emitted. This adds to the report; every existing field is filled exactly as
before.

Each question carries its subject's one key from `SKILL.md` → Flow step 1 (`profile-tier`, a
document's file stem …), unchanged in every run and every report. **A question's `id` is that key
only for the subject's first question.** A different question about the same subject gets
`<key>:<what it asks>`, for example `12-security-compliance:signer`, and keeps that `id` in every
report and every session. The consumer holds one answer per `id` for the whole run. It hides a
question whose `id` already has an answer, and it refuses a second answer to that `id`. A new
question that reuses an answered `id` is therefore never shown, and the run waits on a question
nobody can see. **A document is gated once per run, too.** The consumer holds one decision per
document and hides a `gate` on a document that already has one. A change found after the decision,
such as a correction to a document already approved or signed, is asked as a question instead:
`id` `<key>:correction`, `documentKey` the document, `options[]` *apply the correction* and *keep
it as written*, `evidence` the lines it changes, and `blocks` that document. A second correction
to the same document is `<key>:correction-2`.

## Only what changed

When the consumer's schema has `onlyWhatChanged`, the first report of a session is whole. Every
later report in that session sets `onlyWhatChanged: true`, sends `states: []`, and lists in
`documents` only the rows whose state, notes or description changed since the report before it.
`questions` and `gate` stay whole, because they are what is open now. A consumer's reconnect line
is answered the same way: when nothing changed, `documents` is empty. The consumer keeps every row
the report does not name. Re-sending every row to change one spent most of a measured run's output
on rows nothing had touched. When the schema lacks the field, every report stays whole.

## Doc-12 candidates

The `12-security-compliance.md` template's setup instructions say who may be proposed to close a
gap. **Reported through the setup-run schema** (when the consumer passes one as `--json-schema`),
the question travels inside the existing shapes, with the schema unchanged: `id`
`12-security-compliance:signer`, because the document's own key belongs to its first question; one
`options[]` entry per person — `label` their name, `why` their role, `trade` the prior sign-off note
when there is one; `evidence.caption` says where the names came from (e.g. *"From the three log
calls' authors"*) and `evidence.groups[]` holds one row per gap; `actions[]` carries *Pick someone*
and *Change*; `blocks: []`, because the run carries on; and `notes` says where each gap stands —
e.g. `{ label: "Standing", text: "One is with <name> · the other has nobody named" }` — with names
under the same candidate rule.
