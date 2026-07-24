---
name: do-project-setup
description: Generate the project profile — the baseline "basics" docs (architecture, tech stack, database, environment, API map, security, CI/CD, assets, etc.) that grooming and every downstream skill ground in. Drafts the docs one at a time with your approval; has a refresh/reconcile mode to keep them current. Use to set up a project, bootstrap project docs, generate the project profile, or before the first grooming. Triggers on "project setup", "generate project docs", "project profile", "set up the basics", "/do-project-setup", "onboard this repo".
---

You are generating the **project profile** — the baseline reference every other skill grounds in, so grooming/planning/testing don't re-derive the same orientation each run. Output goes to **`./docs/basics/`**. Run once per repo to bootstrap; re-run in **refresh mode** to keep it current.

**First, read `../../principles.md` in full now, then apply it** — especially: **ground in real code (never fabricate — mark anything you can't determine as `UNKNOWN — needs human input`, don't guess)**, draft + human-approve, and never over-simplify.

## Rules

- **Full-project scan — no sampling.** Learn the **whole** project, not a representative subset. Walk every module/package/directory, every manifest and config, all migrations, the entire asset tree — don't infer the architecture from a few modules or stop at the first pattern you recognize. This is the one skill where completeness outranks laziness: the profile is grounding truth for every later phase, so a partial scan quietly corrupts everything downstream. If the repo is too large for one pass, scan it **systematically in parts until fully covered** (module by module, optionally fanning out with parallel/Explore sub-agents) — never mark a doc complete from a partial view. If a section is unavoidably based on incomplete coverage, **say so explicitly** rather than guessing.
- **One doc at a time, with approval.** Draft a doc → present it → user **approves / edits / skips** → only then write it to `./docs/basics/<file>.md` → move to the next. Never batch-write all docs.
- **Tier — generate only what applies.** Skip docs that don't fit this repo (e.g. `ui-architecture` / `asset-registry` on a backend repo) and *say so*; never emit empty filler files. Confirm the applicable list with the user first.
- **Point, don't copy volatile detail.** Dependency versions, full DB DDL, pipeline YAML, env values → summarize + link the authoritative file. Cache the slow-changing orientation (architecture, conventions, base-URL matrix).
- **Never write secrets.** Record where/what-name (config file, env-var name), never values, tokens, or keys.
- **Stamp each doc** with the git commit it was generated at (in the doc header) — so refresh can tell which docs are stale without regenerating all 17.
- **12-security-compliance.md is stricter:** document only *observed* controls; never assert a compliance status you can't verify; flag every unconfirmed item as a gap for a human/security to fill; require an explicit human sign-off before writing it.

## The docs (`./docs/basics/`)

Each doc has a starter template in this skill's `templates/` directory (`templates/<file>`) — read the relevant one and fill it from the real project. Keep the header commit-stamp; drop template sections that don't apply.

| File | Contents | Cache vs point |
|------|----------|----------------|
| `01-overview.md` | Project summary, the profile index (links), per-doc freshness/commit stamps | cache |
| `02-architecture.md` | Architecture style + layering + dependency rule, **full code structure (complete directory tree — every dir annotated + significant files + feature boundaries, not sampled/elided)**, module/package map (module · feature · deps), key components (Mermaid) | cache |
| `03-ui-architecture.md` *(clients)* | Navigation, UI-state management (server state → `data-cache`), **design-system component inventory (search-before-build, register-on-create)**, theming, screen inventory (flows grouped) | cache |
| `04-ux-conventions.md` *(clients)* | App-wide **interaction behavior** — form validation & submit enable/disable, mandatory marking, empty/loading/error states, snackbars, confirmations, disabled affordance, a11y | cache; cross-links `ui-architecture` |
| `05-tech-stack.md` | Languages, frameworks, **approved library per concern** (reuse-before-add lookup), **code generation** (typed-client command), build tooling + build/run/test commands | stack cached; **versions → manifest** |
| `06-domain-model.md` | **Logical entities + relationships + cross-feature ownership** (owner = source of truth; consumers read via owner) — the shared truth interdependent features bind to; flags cross-feature contradictions | cache; cross-links `database`/`api-reference`/`feature-map` |
| `07-database.md` | Engine(s), **complete schema — every table/column/FK with on-delete actions (must match domain-model edges), indexes — no sampling**, migrations, **seed/test data** | full mirror cached; **migrations = executable truth** |
| `08-data-cache.md` | Local persistence (incl. flow drafts), caching strategy, **shared server-state sync** (query keys · mutation→invalidation · real-time events), offline behavior | cache |
| `09-environment.md` | Environments, config & secrets *approach* (names/locations), **full-stack run recipe** (per-service start command, ready-check, FE→BE wiring, CORS — feeds the integrated Boot & Smoke gate), feature flags, build variants | approach cached; **values → config files** |
| `10-conventions.md` | Coding conventions, naming, folder rules, **error handling & logging**, data contract & localized rendering, testing conventions | cache |
| `11-git-management.md` | Branching, commit/PR/merge conventions, protected branches, tags/releases, hooks | cache; **release/version → cicd-deployment** |
| `12-security-compliance.md` | Auth/authz, PII/data classification, encryption, compliance regimes, secret mgmt, security testing, audit logging | controls cached; **policy → policy docs**; strict sign-off |
| `13-auth.md` *(if it authenticates)* | **Runtime token handling** — scheme, tokens (type/lifetime/storage/attach), **refresh flow** (rotation, single-flight), **401/expiry** (refresh-and-retry, no loop), logout/revocation, multi-tab/device | mechanics cached (no secrets); cross-links security-compliance/api-reference/environment |
| `14-cicd-deployment.md` | CI/CD tool + pipeline stages, environment promotion, release process, versioning, rollback | shape cached; **config → pipeline files** |
| `15-api-reference.md` | **Base-URL matrix (service × environment)**, **machine-checkable contract** (OpenAPI/schema location + owner + whether clients derive typed client/fixtures from it), API catalog (consumed/exposed, auth, owner, version), gotchas, error/retry conventions | matrix cached (no secrets); **defined-in → config** |
| `16-feature-map.md` | Catalog of the app's **features** — purpose, entry points, owned endpoints/tables, **depends-on**, status, dependency graph | inventory cached; **detail → each feature's TRD** |
| `17-asset-registry.md` *(clients)* | Searchable inventory of registered assets (name · description · path per platform · tags), naming conventions, icon set, design tokens (→ Figma) | inventory cached; **tokens/pixels → Figma** |

## Flow

> Present every gate below in the shared **step-summary format** (`principles.md`): *Where we are* + status · *In plain terms* · *What this step did* · *What I need from you* · engineer detail last.

1. **Full scan & confirm.** Scan the **entire** project (per the full-scan rule — every module, not a sample) to identify the repo type/platform and which docs apply (tier). Present the applicable doc list and get the user to confirm before drafting.
2. **Per doc, in order:** scan the relevant real sources → draft the doc (mark `UNKNOWN` where undetermined; point to authoritative files for volatile detail) → **present for approval** (approve / edit / skip) → write to `./docs/basics/<file>.md` with the commit stamp → next doc. `12-security-compliance.md` needs explicit human sign-off. Seed `17-asset-registry.md` by scanning the actual asset directories. Seed `16-feature-map.md` from any existing `docs/development/*/TRD.md` (each is a feature) plus the code's feature modules/routes — capture their depends-on edges; if the app has no discernible features yet, start it minimal and note it. Seed `06-domain-model.md` by extracting the core **entities, relationships, and which feature owns each** from the real schema/models/API — and per the codebase-state-agnostic principle: **describe** what exists, **establish** missing entities/relationships with the user, and **flag contradictions** (the same entity modelled two ways across features) in its *Contradictions* section rather than smoothing them over.
3. **Finish.** Write/refresh `01-overview.md` as the index with each doc's stamp. Report what was generated and what was skipped (and why).

## Refresh / reconcile mode

This is also the **end-of-feature reconcile** the pipeline calls after a feature's SDLC completes (`do-testing` green): run it whenever a feature ships so `docs/basics/` reflects what was built before the next feature grooms against it. Pay special attention to `feature-map` (register the new feature + its dependencies), `api-reference`, `ui-architecture`/`ux-conventions`, and `auth`.

Re-running on an existing profile: per-doc, compare the repo against the doc's commit stamp; refresh only the **stale** docs (with approval). For `17-asset-registry.md`, **reconcile** — diff the registry against the actual asset directories and flag **unregistered assets** (added without registering). Fast-rot docs (tech-stack, database, cicd, api-reference) warrant aggressive checks; slow-rot docs (architecture, conventions, security) rarely change.
