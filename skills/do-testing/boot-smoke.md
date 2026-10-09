# Boot & Smoke — the full run

> Read by `do-testing` at flow step 1 on every platform — once per session, and again after a
> compaction before the next Boot & Smoke journey. `SKILL.md` holds the level's reductions and its
> hard gate; on Android and iOS the level translates per `ui-levels.md` → *Boot & Smoke on a mobile
> client*, and everything below still holds there.

## The integrated run

When no reduction applies, it runs in full — the gate that catches what every level above misses
because they run each side against its own mocks: the **real
frontend and real backend booted together and wired the way the user actually runs the app** (per
`docs/basics/09-environment.md`'s *Full-stack run recipe*: start each service, FE pointed at the
running BE), then the feature's **critical journeys driven through the real HTTP stack in a real
browser/client**, using **relevant, domain-realistic data — never randomized/placeholder** (fake
data hides the very bugs this catches). **Authenticate the journey the real way per
`docs/basics/13-auth.md`**; where auth applies, include a **token-refresh / 401-handling** check
(expired token → refresh-and-retry, no loop). It **fails on any of**: an unexpected **4xx/5xx**
on the feature's routes (→ 405/route/method drift); a **client/browser console error**; a
**failed network request**; or an **error-boundary / crash activation** — the last is critical,
because an error boundary hides a render crash (e.g. a localized `{en,id}` object rendered as a
string) behind a fallback that looks fine to a screenshot. It also **reconciles runtime vs.
contract**: capture the FE's actual outgoing requests (method · path · body) and confirm each
matches a **real registered backend route** and the machine-checkable contract — a runtime diff,
not doc-vs-doc.

## Cross-feature and flow-dependency journeys

**Cross-feature integration:** include at least one journey that exercises each
feature this one depends on (per the hub's *Feature dependencies*) — the new feature must work
with the depended-on feature end-to-end **and not break it** (a regression in the depended-on
feature is a bug). **And a mandatory per-binding data-flow test for each Flow dependency** (the
hub's Flow-dependencies sub-table), in **both directions**:
- **Create direction:** seed/create in the source feature → assert it flows into this feature's
  field/section with real data — **per the binding's decided Freshness** (without app restart ·
  on the real-time event · on refocus — assert the *mechanism the TRD chose*, or "eventually
  appears after reopening" passes as synchronized).
- **Destructive direction (never skip):** **delete/archive in the owner → the consumer behaves
  per the decided on-delete edge** (hub *Entities touched* / `06-domain-model.md`) — the restrict
  message shows, the row flags "unavailable", **never a dangling reference or crash**. This is
  the nastiest cross-feature integrity bug and the create-direction test cannot catch it.
- **Lifecycle visibility:** seed entities in **every lifecycle state** → the consumer shows
  **exactly the allowed subset** (archived doesn't appear, draft doesn't leak) per the decided
  visibility rule.

An uncovered binding/edge is a coverage gap; a broken one is a bug. (Never satisfy any of this
with a mocked source — that's the bug it exists to catch.) This level owns the FE↔BE **seam**;
unlike levels 1–4 it **cannot be marked manual or skipped for the feature's critical path**.
