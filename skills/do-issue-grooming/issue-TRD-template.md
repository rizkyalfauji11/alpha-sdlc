# Issue TRD: <issue name>

> A **user-reported issue** groomed by `do-issue-grooming`. The defining section is the
> **whole-project audit** (§2) — every site of the issue *class*, not just the reported one.
> This grooms and scopes the fix; the fixing itself happens in `do-fixing`. Multi-platform issues
> get `TRD-<platform>.md` spokes that link here.

| | |
|---|---|
| **Status** | Draft |
| **Reported by** | <who / when> |
| **Severity** | <blocker / major / minor> |
| **Platforms affected** | <Backend / Android / iOS / Web> |
| **Spokes** | <links to per-platform spokes, if any> |
| **Date** | <YYYY-MM-DD> |

## 1. Issue & reproduction
_Approved: <YYYY-MM-DD>_

<The symptom as reported: exact error/log text, repro steps, where seen (screen/endpoint, environment, build). What the correct behavior should be.>

## 2. Audit findings (whole-project)
_Approved: <YYYY-MM-DD>_

**Issue class:** <the underlying pattern, generalized from the symptom — e.g. "localized `{en,id}` object rendered raw in JSX", not "the category name crashed">

**All affected sites** (searched the whole project — the reported one is just row 1):

| # | Site (file · symbol) | Feature (feature-map) | How it manifests | Severity |
|---|----------------------|-----------------------|------------------|----------|
| 1 | <src/menu/CategoryRow.tsx:107> | menu-categories | reported crash | blocker |
| 2 | <src/menu/ItemRow.tsx:88> | menu-items | same class, latent | major |

**Root cause:** <why the class exists — the missing guard / convention / contract (no typed client, no locale helper, no a11y-role assertion, …).>

**Search coverage:** <what was scanned and how; any area not covered (say so — don't imply completeness you didn't verify).>

## 3. Fix scope & approach
_Approved: <YYYY-MM-DD>_

**Approach (ladder rung):** <required — name the rung; prefer a **systemic** root fix that eliminates the class (e.g. "rung 2: reuse existing `localize()` helper at every site + add a lint rule") over N per-site patches. If per-site is unavoidable, say why and list every site.>

<What's in scope (the root fix + every site it covers) and explicitly out of scope. Mermaid if it helps.>

## 4. Regression safety
_Approved: <YYYY-MM-DD>_

<The **reproduce-first** tests to add so a fix that misses a site fails a test: a failing test that reproduces the reported bug, plus coverage for the other audited sites / the class. Characterization tests where behavior must be pinned before changing. These are written downstream (`do-fixing`/`do-development`) — here they're specified as testable AC.>

## 5. Blast radius & feature dependencies
_Approved: <YYYY-MM-DD>_

<Which features the fix touches or risks (grounded in `feature-map.md`), what must **not** break, and any cross-feature coordination/ordering. A systemic fix can ripple — name the ripple.>

## 6. Change manifest
_Approved: <YYYY-MM-DD>_

> Structured handoff. Feeds `do-planning` / `do-slicing`.

**Repos / modules touched** (per platform)
- <Backend / Web / … → see spoke if any>

**Fix ordering**
- <e.g. add the shared helper + lint rule first, then migrate each site, then remove the raw-render path>

**Regression-safety plan**
- <the reproduce-first / characterization tests from §4, mapped to sites>

**Dependencies & risks**
- <item>

**Work slices** (each with technical AC; every audited site covered or deferred as an Open Decision)
- [ ] <slice> — AC: <assertable behavior>

## Open Decisions
_Status: <open / decided>_

<Gaps the audit surfaced that need a human call (2–3 options, mark one). Undecided items block the affected slice.>
