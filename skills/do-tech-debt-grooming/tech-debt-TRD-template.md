# Tech-Debt TRD: <improvement name>

| | |
|---|---|
| **Status** | Draft |
| **Author** | <engineer> |
| **Platforms** | <Backend / Android / iOS / Web — those affected> |
| **Behavior change?** | <No — behavior-preserving / Yes — describe> |
| **Spokes** | <only if the work spans platforms: links to per-platform spokes, each with its **hub alignment** stamp (`✅ reviewed YYYY-MM-DD · hub rev <hash/date>` / ⚠️ stale / ❌ not reviewed). Editing a hub section makes every ✅ stale.> |
| **Date** | <YYYY-MM-DD> |

## 1. Condition (what's wrong today)
_Approved: <YYYY-MM-DD>_

<The problem, where it lives, and the evidence — a metric, incident, or painful change. Ground in the real code.>

## 2. Cost of delay vs cost to fix
_Approved: <YYYY-MM-DD>_

<Why fix now: what the debt costs if left (incidents, slow delivery, risk) vs the rough cost to fix. If speculative with no real cost → recommend deferring.>

## 3. Current state (as-is)
_Approved: <YYYY-MM-DD>_

<How it works now — the structure/flow being changed.>

```mermaid
graph TD
  A --> B
```

## 4. Target state
_Approved: <YYYY-MM-DD>_

**Approach (ladder rung · world-wide standard):** <required — name the rung AND the industry-standard way today, e.g. "rung 2 (reuse): extract shared logic into existing util · standard: agrees" — conflicts surfaced per the tiered rule>

<How it works after. What changes, what stays. Keep the smallest change that fixes the condition.>

```mermaid
graph TD
  A --> B
```

## 5. Measurable success
_Approved: <YYYY-MM-DD>_

| Metric | Baseline (now) | Target | How measured |
|--------|----------------|--------|--------------|
| <e.g. p95 latency> | | | |
| <e.g. crash rate / build time / coverage> | | | |

## 6. Regression safety & acceptance criteria
_Approved: <YYYY-MM-DD>_

<Behavior-preserving proof: characterization tests to add **first** (pin current behavior), existing tests that must stay green, risky areas to guard. Any intended behavior change stated explicitly. **If shared entities/contracts/cache wiring are touched:** the consuming features (blast radius, from `16-feature-map.md` impact analysis) and their **flow-binding tests (create + destructive)** that must stay green.>

> **The canonical, numbered AC registry for this improvement** — the single list every later phase keys on: §8's slices and `do-slicing`'s tasks carry these IDs, `do-planning` stages declare `Covers: AC-2, AC-5`, `do-development` writes each stage's failing test from them, `do-testing`'s coverage table proves each one. **IDs are stable — never renumbered once approved** (a retired AC keeps its row, ~~struck through~~ with a note). One sentence per AC, **assertable** (an observable behavior, not a vibe). **Source makes the behavior-preserving claim enumerated, not implied:** each §5 metric target, each consuming feature's flow binding, and any intended behavior change lands here as its own numbered AC.

| ID | Acceptance criterion (assertable, one sentence) | Source |
|----|--------------------------------------------------|--------|
| AC-1 | <`<module>` behaves identically — the characterization suite for <behavior> stays green> | §3 current state |
| AC-2 | <p95 latency of `<endpoint>` is ≤ <target> under <load>> | §5 metric |
| AC-3 | <consuming feature <name>'s create + destructive flow-binding tests stay green> | `16-feature-map.md` blast radius |
| AC-4 | <the one intended behavior change: <what changes, observably>> | §4 target state |

## 7. Rollback
_Approved: <YYYY-MM-DD>_

<How to revert safely — feature flag, phased rollout, revert plan. Especially for shared/hot-path changes.>

## 8. Change manifest
_Approved: <YYYY-MM-DD>_

> Structured handoff. Feeds ticket-slicing.

**Modules / files touched**
- <path>

**Cross-feature blast radius** (features consuming what's refactored — from `16-feature-map.md`)
- <feature → the binding/flow that must stay green — or "none">


**Regression-safety plan (tests first)**
- <characterization test to add>

**Measurable success + check**
- <metric → target → how verified>

**Dependencies & risks**
- <item>

**Implied work slices** (candidate tickets) — **reference AC by ID from §6, never restate the criterion's prose here** (one source of truth; a restated AC forks and drifts). Every AC in §6 is claimed by ≥ 1 slice and every slice claims ≥ 1 AC — an unclaimed AC is unproven work, an AC-less slice is untestable work.
- [ ] <slice> — AC: <AC-1, AC-2>
- [ ] <slice> — AC: <AC-3, AC-4>

## Open Decisions
_Status: <open / decided: <choice> · proven by <act → assert>>_

<Gaps the grooming surfaced that need a human call (2–3 options, mark one — the ★ always the quality/world-standard option, never the cheapest). **Where the chosen option names a mechanism, the decision also names the test that will prove it** — specified, not run; a mechanism amended twice stops being amended — escalate to the user. Undecided items block the affected slice.>
