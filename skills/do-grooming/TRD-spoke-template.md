# TRD (<Platform>): <feature name>

> Platform spoke. The shared context, system design, and API contract live in the
> **hub** (`./TRD.md`) — link to them, don't copy. This doc covers only what is
> specific to <Platform>.

| | |
|---|---|
| **Status** | Draft |
| **Platform** | <Backend / Android / iOS / Web> |
| **Author** | <engineer> |
| **Hub** | [./TRD.md](./TRD.md) |
| **Date** | <YYYY-MM-DD> |

## 1. Scope (this platform)
_Approved: <YYYY-MM-DD>_

<What this platform must build for the feature. Link to the hub for the why and the contract.>

## 2. Design
_Approved: <YYYY-MM-DD>_

<Clients (Android/iOS/Web): screens, navigation, state management, components.
Backend: services, modules, internal design.>

**Approach (ladder rung):** <required — e.g. "rung 2: reuse existing `ScannerActivity`" / "rung 7: new component, ruled out rungs 2–5 because …">


```mermaid
graph TD
  A --> B
```

## 3. Assets
_Approved: <YYYY-MM-DD>_

<Icons, images, drawables, SF Symbols, SVGs, fonts, colors this platform needs. For each asset climb the asset ladder (checked against the real project): **exact match exists → reuse it**; **no exact but a similar one exists → reuse/adapt it (name it)**; **none → create new**. Only "create new" rows become work slices.>

> ⚠️ Every **adapt / similar-match** row needs **user re-validation** — "similar enough" is a judgment call (wrong size/state/brand variant). The *Why it fits* note and the *Re-validated?* flag must be filled before the asset is treated as resolved.

| Asset needed | Exact match? | Closest similar (path) | Decision | Why it fits (for adapt) | Re-validated? | Where it lives |
|--------------|--------------|------------------------|----------|-------------------------|---------------|----------------|
| <e.g. QRIS scan icon> | <yes/no + path> | <path to similar> | reuse / adapt / **create** | <why the similar one works> | <user ✓ / pending> | <Android drawable / iOS asset catalog / web /assets> |

## 4. Data / persistence
_Approved: <YYYY-MM-DD>_

<Clients: local models, caching, offline storage (Room / CoreData / IndexedDB).
Backend: DB schema and migrations.>

```mermaid
erDiagram
  ENTITY ||--o{ CHILD : has
```

## 5. Performance impact
_Approved: <YYYY-MM-DD>_

<Performance implications of the chosen approach, and why it wins over the alternatives.>

**Backend** (use for the backend spoke)

| Aspect | Expected | Notes |
|--------|----------|-------|
| Latency (p50 / p95) | | |
| Throughput / load | | |
| Queries / N+1 risk | | |
| Caching | | |
| Scaling limit | | |

**Client** (use for Android / iOS / Web spokes)

| Aspect | Expected | Notes |
|--------|----------|-------|
| Screen load / render time | | |
| Jank / FPS (lists, animations) | | |
| App size / web bundle size | | |
| Memory footprint | | |
| Network payload / # calls | | |
| Battery / data usage (mobile) | | |
| Offline / cache behavior | | |

## 6. Release considerations
_Approved: <YYYY-MM-DD>_

<Clients: min OS/SDK version, permissions, store submission, forced update, feature-flag gating, backward compatibility with old app versions.
Backend: deploy steps, migration ordering, rollback.>

## 7. Risks / dependencies (this platform)
_Approved: <YYYY-MM-DD>_

- **Risk:** <what could go wrong> — *Mitigation:* <how>
- **Dependency:** <other team / hub item / ordering>

## 8. Work slices
_Approved: <YYYY-MM-DD>_

> This platform's candidate tickets. Mirror the summary up into the hub.

- [ ] <slice> — acceptance criteria: <AC>
- [ ] <slice> — acceptance criteria: <AC>
