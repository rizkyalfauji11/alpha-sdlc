# Tech-Debt TRD: <improvement name>

| | |
|---|---|
| **Status** | Draft |
| **Author** | <engineer> |
| **Platforms** | <Backend / Android / iOS / Web — those affected> |
| **Behavior change?** | <No — behavior-preserving / Yes — describe> |
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

**Approach (ladder rung):** <required — e.g. "rung 2: extract shared logic into existing util, no new abstraction">

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

## 6. Regression safety
_Approved: <YYYY-MM-DD>_

<Behavior-preserving proof: characterization tests to add **first** (pin current behavior), existing tests that must stay green, risky areas to guard. Any intended behavior change stated explicitly. **If shared entities/contracts/cache wiring are touched:** the consuming features (blast radius, from `16-feature-map.md` impact analysis) and their **flow-binding tests (create + destructive)** that must stay green.>

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

**Implied work slices** (candidate tickets)
- [ ] <slice> — technical AC: <behaves identically + metric target>
- [ ] <slice> — technical AC: <…>
