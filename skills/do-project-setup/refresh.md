# Refresh / reconcile mode

Read this file when step 1 finds an existing profile (approved stamps in `docs/basics/`), when a
feature's SDLC ends with its reconcile, or when the user asks for a refresh. Everything in
`SKILL.md` still applies — its gates, the record, one doc at a time, the stamps.

**The done-gate comes first** (`SKILL.md` → Flow step 1): a feature's reconcile starts only after
`node ../../scripts/check-feature-done.js docs/development/<feature-name> <platform>` exits 0 for
every platform the feature built — anything else is a **STOP**, never waived.

**Every refresh looks for rows naming what is gone.** Run `node ../../scripts/find-orphans.js
<repo-root> --registry`: each *measured* line is a `19-code-inventory` or `18-design-tokens` row
naming a unit or token the source no longer has. Offer their removal with the doc they sit in (the
same one-doc-at-a-time gate), and check `17-asset-registry` and `03-ui-architecture` the same way
by hand. Registering on create was always the rule; this is the other half.

**Profile migration first:** compare the profile's recorded **plugin version** (Org settings)
against the running plugin; if older, diff the current template set + each template's section
headings against the existing docs — **missing docs/sections are migration candidates, offered one
at a time** (gated, like any doc), then re-stamp the version. A lite-tier profile also lists its
lazy GAPs here — generate any the team now wants. An Org settings row the current
`templates/01-overview.md` has and the profile lacks (such as *Session boundaries*) is a candidate
too: ask it at the Org settings gate with its default as ★, then add its key to the mirror.

This is also the **end-of-feature reconcile** the pipeline calls after a feature's SDLC completes
(`do-testing` green): run it whenever a feature ships so `docs/basics/` reflects what was built
before the next feature grooms against it. Pay special attention to `feature-map` (register the new
feature + its dependencies), `api-reference`, `ui-architecture`/`ux-conventions`, `auth`, and
`20-tech-debt-register` (groomed debt that shipped → its row deleted; new deferrals from the run →
open rows under its **Next ID**).

Re-running on an existing profile: per-doc, compare the repo against the doc's commit stamp; refresh
only the **stale** docs (with approval). **A doc whose head logs its own history counts as stale:**
update lines, *refreshed / reconciled / verified* chains or struck items above its first section
(written before 0.35.0) are folded out at that doc's gate — a fact the history holds that the body
lacks moves into its section, the rest is deleted, and one stamp line remains. **Every section's
body goes the same way** — dated *corrected / amended / withdrawn / retired / added at* notes,
*+ <feature> stage · <date>* entries and struck or retired rows: keep the current fact, delete the
note (principles → *A document states the current truth*). A tech-debt register's paid rows are
deleted, and its head gains ``**Next ID:** `TD-<n>` — paid rows are deleted (git keeps them); an
ID is never reused.`` with `<n>` one past the highest ID it ever used (a prefixed register keeps
its prefix: `TD-BE-<n>`). `validate-doc-tables` blocks
any edit to such a head, and any edited line that still carries such a note, so never defer it.

For `17-asset-registry.md`, **reconcile** — diff the registry against the actual asset directories
and flag **unregistered assets** (added without registering). For `18-design-tokens.md`,
**reconcile** too — diff the doc against the theme file
*and* sweep the code for **raw literals** (spacing/size/weight/hex/border values written outside the
tokens): each one is either a token that was never registered or drift to report, and any new
contradiction goes back into *Contradictions found*. A token doc that silently disagrees with the
code is worse than none — the builder trusts it. For `19-code-inventory.md`, **reconcile** — sweep
for reusable units created since the stamp but never registered, and for new duplicates of an
already-registered job. For `20-tech-debt-register.md`, **reconcile** — every entry in any source
table (contradictions, duplicates, omissions, named simplifications in TRDs) without a `TD-<n>` row
is a gap; statuses checked against reality (a groomed TRD shipped means paid: delete the row). For
`03-ui-architecture.md`'s Test-ID conventions, **reconcile** — new locator IDs in code that break
the recorded convention are flagged (new IDs must follow it; old ones are grandfathered). Fast-rot
docs (tech-stack, database, cicd, api-reference) warrant aggressive checks; slow-rot docs
(architecture, conventions, security) rarely change.

A stale doc is regenerated from its template like a new one: its *Setup instructions — do not copy*
block (seeds and checks) applies to the refresh too.
