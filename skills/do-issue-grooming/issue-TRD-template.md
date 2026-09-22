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
| **Spokes** | <links to per-platform spokes, if any — each with its **hub alignment** stamp: `✅ reviewed YYYY-MM-DD · hub rev <hash/date>` / ⚠️ stale / ❌ not reviewed. Editing a hub section makes every ✅ stale.> |
| **Date** | <YYYY-MM-DD> |

## 1. Issue & reproduction
_Approved: <YYYY-MM-DD>_

<The symptom as reported: exact error/log text, repro steps, where seen (screen/endpoint,
environment, build). What the correct behavior should be.>

## 2. Audit findings (whole-project)
_Approved: <YYYY-MM-DD>_

**Issue class:** <the underlying pattern, generalized from the symptom — e.g. "localized `{en,id}`
object rendered raw in JSX", not "the category name crashed">

**All affected sites** (searched the whole project — the reported one is just row 1):

| # | Site (file · symbol) | Feature (feature-map) | How it manifests | Severity |
|---|----------------------|-----------------------|------------------|----------|
| 1 | <src/menu/CategoryRow.tsx:107> | menu-categories | reported crash | blocker |
| 2 | <src/menu/ItemRow.tsx:88> | menu-items | same class, latent | major |

**Root cause:** <why the class exists — the missing guard / convention / contract (no typed client,
no locale helper, no a11y-role assertion, no canonical cache key / invalidation, an undecided
on-delete edge, no flow-level state store, …).>

**Search coverage:** <what was scanned and how; any area not covered (say so — don't imply
completeness you didn't verify).>

## 3. Fix scope & approach
_Approved: <YYYY-MM-DD>_

**Approach (ladder rung · world-wide standard):** <required — name the rung AND the
industry-standard way today (security-grade standards override local reuse outright); prefer a
**systemic** root fix that eliminates the class (e.g. "rung 2: reuse existing `localize()` helper at
every site + add a lint rule") over N per-site patches. If per-site is unavoidable, say why and list
every site.>

<What's in scope (the root fix + every site it covers) and explicitly out of scope. Mermaid if it
helps.>

## 4. Regression safety & acceptance criteria
_Approved: <YYYY-MM-DD>_

<The **reproduce-first** tests to add so a fix that misses a site fails a test: a failing test that
reproduces the reported bug, plus coverage for the other audited sites / the class. Characterization
tests where behavior must be pinned before changing. These are written downstream
(`do-fixing`/`do-development`) — here they're specified as testable AC.>

> **The canonical, numbered AC registry for this issue** — the single list every later phase keys
> on: §6's slices and `do-slicing`'s tasks carry these IDs, `do-planning` stages declare `Covers:
> AC-2, AC-5`, `do-fixing`/`do-development` write each failing test from them, `do-testing`'s
> coverage table proves each one. **IDs are stable — never renumbered once approved** (a retired AC
> keeps its row, ~~struck through~~ with a note). One sentence per AC, **assertable** (an observable
> behavior, not a vibe). **Source makes §2's audit enumerated, not implied:** every affected-site
> row, the root cause, and every blast-radius feature that must not break lands here as its own
> numbered AC — an audited site with no AC is a site the fix can silently miss.

| ID | Acceptance criterion (assertable, one sentence) | Source |
|----|--------------------------------------------------|--------|
| AC-1 | <the reported repro no longer reproduces — `<exact error>` is gone at <site>> | §2 site 1 (reported) |
| AC-2 | <the same class at <site 2> renders localized text, never the raw object> | §2 site 2 |
| AC-3 | <the class cannot come back — <the lint rule / typed client> fails the build on a new raw render> | §2 root cause |
| AC-4 | <consuming feature <name> still <behavior> — unchanged by the fix> | §5 blast radius |

## 5. Blast radius & feature dependencies
_Approved: <YYYY-MM-DD>_

<Which features the fix touches or risks (grounded in `16-feature-map.md`), what must **not** break,
and any cross-feature coordination/ordering. A systemic fix can ripple — name the ripple.>

## 6. Change manifest
_Approved: <YYYY-MM-DD>_

> Structured handoff. Feeds `do-planning` / `do-slicing`.

**Repos / modules touched** (per platform)
- <Backend / Web / … → see spoke if any>

**Fix ordering**
- <e.g. add the shared helper + lint rule first, then migrate each site, then remove the raw-render
  path>

**Regression-safety plan**
- <the reproduce-first / characterization tests from §4, mapped to sites>

**Dependencies & risks**
- <item>

**Work slices** — **reference AC by ID from §4, never restate the criterion's prose here** (one
source of truth; a restated AC forks and drifts). Every AC in §4 is claimed by ≥ 1 slice and every
slice claims ≥ 1 AC — an unclaimed AC is an audited site the fix can miss, an AC-less slice is
untestable work. Every audited site is covered or deferred as an Open Decision.
- [ ] <slice> — AC: <AC-1, AC-3>

## Open Decisions
_Status: <open / decided: <choice> · proven by <act → assert>>_

<Gaps the audit surfaced that need a human call (2–3 options, mark one — the ★ always the
quality/world-standard option, never the cheapest). **Where the chosen option names a mechanism, the
decision also names the test that will prove it** — specified, not run; a mechanism amended twice
stops being amended — escalate to the user. Undecided items block the affected slice.>
