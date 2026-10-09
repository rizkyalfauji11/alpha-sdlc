# Fix review — the reviewer's checklist

> Handed to the reviewer subagent by `do-fixing` (flow step 4) inside the review packet that
> `scripts/review-packet.js` writes: the fix diff, the bug row and the AC rows it names (verbatim;
> on the issue-TRD path, the audit-table row the author attached as a settled file), the review
> charter's path and currency, the principles rules this diff can violate (the withheld
> ones named by line range), the change → doc map, and `find-orphans.js --diff` marked settled.
> `SKILL.md` keeps the dispatch rule and what the author does with the findings; this file is the
> brief the reviewer works from — the same three parts as `do-development`'s, re-aimed at what
> actually goes wrong in fixing. Each dimension owns its item by number — (a) item 1 on
> `alpha-sdlc:sdlc-reviewer-deep`, re-running the regression test and the sabotage check; (b) item
> 2; (c) item 3 — and the light tier hands all three to one `alpha-sdlc:sdlc-reviewer`.

1. **Fix quality** — **root cause, not symptom**: the fix lands at the **shared source** every
   caller routes through, not on the one path the report named (the reviewer greps the sibling
   call-sites and says whether they're covered) · the **regression test genuinely reproduces the
   bug** — remove the fix and it fails, **the removal restored byte-identically before the
   reviewer reports**, and the finding says so (`do-fixing` commits on approval — a removal left
   in place ships the bug) — and it asserts the **AC**, not just the symptom string · the fix
   stays **inside the right layer** (a data-layer bug patched in a ViewModel is a symptom patch
   wearing a fix's clothes) · **same-feature siblings fixed here; a project-wide class flagged for
   `do-issue-grooming`** rather than quietly left behind.
2. **Scope discipline** — the diff contains the root-cause fix **and its regression test, and
   nothing else**. A diff that adds or changes an endpoint or a contract field, or changes code in
   another platform's repository, is not a fix but a **design gap** — a judgment finding that
   stops the fix, whatever the bug report called it. A fix that replaces a path deletes the old
   one with its tests and profile rows (`principles.md` → *Deregister on delete*). No
   opportunistic refactor, no drive-by rename, no "while I was in there". This is the review's
   sharpest job in fixing: a fix diff is where scope creep is easiest to justify and hardest to
   spot.
3. **Profile + principles conformance** — per doc the diff touches: layer/dependency rule
   (`02-architecture`) · error handling & logging, no swallowed catch (`10-conventions`) · **a
   style bug fixed at the token, never with a literal** (`18-design-tokens`) · canonical query
   keys/invalidation for a freshness fix (`08-data-cache`) · entity ownership + the decided
   on-delete edge (`06-domain-model`) · contract fixed at the source + client regenerated, and the
   machine-checkable contract spec updated when the shape changed (`15-api-reference`) · plus the
   principles: not over-simplified (validation/error/edge cases intact), choices
   valid/relevant/compatible, **zero comments** — a fix adds none (no "fixes B3", no explanation of
   the bug; the *why* goes in the commit message, the *what* into names), machine directives
   excepted, plus license headers or public-API doc comments when the Org settings' comment
   allowlist permits them — and **profile currency** (a changed recorded fact has its doc updated
   *and* re-stamped in the same change, its head still one stamp line with no update log and
   nothing struck through).

**Kinds.** An objective violation is one the author fixes within the bug: a symptom-level patch,
the wrong layer, a raw literal instead of a token, a local refetch hack instead of the sync
convention, a swallowed error, a missing profile-doc update, any comment the fix added. A judgment
or scope finding stops the fix for the user: scope beyond the bug, a fix that only works by changing
decided behavior, a bug that is really a design gap, a project-wide class.
