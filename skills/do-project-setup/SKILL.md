---
name: do-project-setup
description: Generate the project profile — the baseline "basics" docs (architecture, tech stack, database, environment, API map, security, CI/CD, assets, etc.) that grooming and every downstream skill ground in. Drafts the docs one at a time with your approval; has a refresh/reconcile mode to keep them current. Use to set up a project, bootstrap project docs, generate the project profile, or before the first grooming. Triggers on "project setup", "generate project docs", "project profile", "set up the basics", "/do-project-setup", "onboard this repo".
---

You are generating the **project profile** — the baseline reference every other skill grounds in, so grooming/planning/testing don't re-derive the same orientation each run. Output goes to **`./docs/basics/`**. Run once per repo to bootstrap; re-run in **refresh mode** to keep it current.

**Apply the shared principles in `../../principles.md`** — especially: **ground in real code (never fabricate — mark anything you can't determine as `UNKNOWN — needs human input`, don't guess)**, draft + human-approve, and never over-simplify.

## Rules

- **One doc at a time, with approval.** Draft a doc → present it → user **approves / edits / skips** → only then write it to `./docs/basics/<file>.md` → move to the next. Never batch-write all docs.
- **Tier — generate only what applies.** Skip docs that don't fit this repo (e.g. `ui-architecture` / `asset-registry` on a backend repo) and *say so*; never emit empty filler files. Confirm the applicable list with the user first.
- **Point, don't copy volatile detail.** Dependency versions, full DB DDL, pipeline YAML, env values → summarize + link the authoritative file. Cache the slow-changing orientation (architecture, conventions, base-URL matrix).
- **Never write secrets.** Record where/what-name (config file, env-var name), never values, tokens, or keys.
- **Stamp each doc** with the git commit it was generated at (in the doc header) — so refresh can tell which docs are stale without regenerating all 12.
- **security-compliance.md is stricter:** document only *observed* controls; never assert a compliance status you can't verify; flag every unconfirmed item as a gap for a human/security to fill; require an explicit human sign-off before writing it.

## The docs (`./docs/basics/`)

| File | Contents | Cache vs point |
|------|----------|----------------|
| `overview.md` | Project summary, the profile index (links), per-doc freshness/commit stamps | cache |
| `architecture.md` | Architecture style + layering + dependency rule, module/package map, key components (Mermaid) | cache |
| `ui-architecture.md` *(clients)* | Navigation, state management, design system, theming, screen inventory | cache |
| `tech-stack.md` | Languages, frameworks, key libs, build tooling + build/run/test commands | stack cached; **versions → manifest** |
| `database.md` | Engine(s), schema shape (Mermaid ER), migration approach | overview cached; **DDL → migrations** |
| `data-cache.md` | Local persistence, caching strategy, offline behavior, what's stored where | cache |
| `environment.md` | Environments, config & secrets *approach* (names/locations), feature flags, build variants | approach cached; **values → config files** |
| `conventions.md` | Coding conventions, naming, folder rules, testing conventions | cache |
| `security-compliance.md` | Auth/authz, PII/data classification, encryption, compliance regimes, secret mgmt, security testing, audit logging | controls cached; **policy → policy docs**; strict sign-off |
| `cicd-deployment.md` | CI/CD tool + pipeline stages, environment promotion, release process, versioning, rollback | shape cached; **config → pipeline files** |
| `api-reference.md` | **Base-URL matrix (service × environment)**, API catalog (consumed/exposed, auth, owner, version), gotchas, error/retry conventions | matrix cached (no secrets); **defined-in → config** |
| `asset-registry.md` *(clients)* | Searchable inventory of registered assets (name · description · path per platform · tags), naming conventions, icon set, design tokens (→ Figma) | inventory cached; **tokens/pixels → Figma** |

## Flow

1. **Detect & confirm.** Identify the repo type/platform and which docs apply (tier). Present the applicable doc list and get the user to confirm before drafting.
2. **Per doc, in order:** scan the relevant real sources → draft the doc (mark `UNKNOWN` where undetermined; point to authoritative files for volatile detail) → **present for approval** (approve / edit / skip) → write to `./docs/basics/<file>.md` with the commit stamp → next doc. `security-compliance.md` needs explicit human sign-off. Seed `asset-registry.md` by scanning the actual asset directories.
3. **Finish.** Write/refresh `overview.md` as the index with each doc's stamp. Report what was generated and what was skipped (and why).

## Refresh / reconcile mode

Re-running on an existing profile: per-doc, compare the repo against the doc's commit stamp; refresh only the **stale** docs (with approval). For `asset-registry.md`, **reconcile** — diff the registry against the actual asset directories and flag **unregistered assets** (added without registering). Fast-rot docs (tech-stack, database, cicd, api-reference) warrant aggressive checks; slow-rot docs (architecture, conventions, security) rarely change.
