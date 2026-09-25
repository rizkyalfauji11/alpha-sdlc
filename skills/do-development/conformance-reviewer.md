# Conformance review — the reviewer's checklist

> Handed to the reviewer subagent by `do-development` (flow step 5) together with the stage diff,
> the stage's plan/AC, `../../principles.md`, and the `docs/basics/` docs the diff touches.
> `SKILL.md` keeps the dispatch rule and what the author does with the findings; this file is the
> brief the reviewer works from.

1. **Profile conformance** — per doc the diff actually touches (map it, don't recite all 20): **the
   diff stayed inside the stage's declared `Layer`** (the plan's per-stage field) and honors the
   dependency rule — business logic in a ViewModel, a presentation stage reaching into data, or a
   data stage carrying UI is an **objective violation**, checked against the declaration rather than
   judged (`02-architecture`) · conventions, naming, folder rules, **error handling & logging** — no
   swallowed catch, every caught error logged *and* surfaced, server errors mapped per the
   convention, no stray `console.log`/`print`, nothing sensitive logged (`10-conventions`) ·
   canonical component + scaffold reused, new reusables registered (`03-ui-architecture`) ·
   interaction behavior matches the standard (`04-ux-conventions`) · **every visual value resolves
   to a token, zero raw literals** (`18-design-tokens`) · entity ownership respected, consumers read
   via the owner (`06-domain-model`) · schema/on-delete honored (`07-database`) · canonical query
   keys + the decided invalidations, no private key for a shared entity (`08-data-cache`) · typed
   client/fixtures derived from the contract, every field handled as typed (`15-api-reference`) ·
   token attach/refresh/401 via the existing interceptor (`13-auth`) · asset search ran, new assets
   registered (`17-asset-registry`) · env vars/flags recorded (`09-environment`) · feature
   registered (`16-feature-map`) · PII/secret handling (`12-security-compliance` — unsigned, i.e. no
   human sign-off, makes that conformance a **recorded GAP** named in the step report, never a
   silent trust).

2. **Principles conformance** — the ladder rung was actually climbed (reuse before build, not just
   named) · the **world-wide standard** named beside it and honored per the tiered rule
   (security-grade standards override local reuse; style conflicts surfaced, never silently
   entrenched) · no speculative scaffolding · **not over-simplified** (the validation,
   error/timeout/offline/empty states, and edge cases the AC needs are present) ·
   **build-only-specified** — no behavior, UI, or scope the design didn't ask for · choices **valid,
   relevant, compatible, current** (no hallucinated, incompatible, or deprecated/superseded dep) ·
   project architecture respected · **zero comments** — the diff adds none at all (no prose, no doc
   comments/docstrings, no license header, no banner, no provenance); only machine directives
   (lint/type/coverage pragmas, build tags, shebang) are allowed, and **names carry the meaning**
   (unit/currency in the name, named constant instead of a magic number, named predicate instead of
   an explained branch) · **profile currency** — a changed recorded fact has its doc updated *and*
   re-stamped in the same change · **nothing left orphaned** — run the packet's `find-orphans.js
   --diff` command: a unit that lost its last production caller in this diff, or a path the stage
   replaced, is deleted with its tests, and every profile row naming something the diff removed is
   deregistered (a *measured* stale row is a violation; an *inferred* candidate is a question). Dead
   code this diff did not make dead is not deleted here — it is a tech-debt row.

3. **Plan/AC conformance** — the stage did what the plan said, the AC it claims are genuinely
   covered by the tests written, and **nothing extra rode along**.
