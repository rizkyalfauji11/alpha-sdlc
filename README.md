# SDLC Plugin

A Claude Code plugin that supports the engineering lifecycle — **grooming → development → testing → deployment → monitoring** — as a set of skills an engineer drives from the terminal. It leans on the team's existing tools (Jira/Confluence, Datadog, Mixpanel) rather than replacing them.

**Philosophy:** every skill is opinionated, gated, and lazy-in-the-good-sense. It proposes, the human approves; it reuses before it builds; it never simplifies away the hard parts. The shared discipline lives in [`principles.md`](./principles.md) and every skill applies it.

---

## The pipeline

Each phase produces an artifact the next phase consumes. The **acceptance criteria (AC)** thread the whole way through — written in grooming, tested in development and testing.

**Three entry points**, each producing a TRD that flows into the same pipeline:
- **do-grooming** — product features, driven by a PRD/BRD.
- **do-tech-debt-grooming** — engineer-initiated improvements (refactor, performance, fragility, dependency upgrade, cleanup), no PRD.
- **do-issue-grooming** — a user-reported issue (production/ad-hoc); audits the **whole project for the issue class** (not just the reported symptom), root-causes it, maps blast radius, and grooms the scoped fix. Groom-and-hand-off — the fixing stays in do-fixing.

| # | Skill | Does | Output |
|---|-------|------|--------|
| 0 | **do-project-setup** | Generates the project profile (architecture, tech-stack, database, API map, security, CI/CD, assets…) one doc at a time; refresh/reconcile mode keeps it current | `docs/basics/*.md` (14-doc set) |
| 1a | **do-grooming** | PRD/BRD → Technical Requirements Doc, section-by-section with one gate per section | `TRD.md` (hub) + `TRD-<platform>.md` (spokes), `widget-spec/<screen>.md` |
| 1b | **do-tech-debt-grooming** | Engineer's improvement statement → behavior-preserving TRD (justify → target → regression safety), one gate per section | `TRD.md` + spokes (tech-debt template) |
| 1c | **do-issue-grooming** | User-reported issue → **whole-project audit** of the issue class (every affected site, root cause, blast radius) → scoped issue-TRD, one gate per section; grooms only, hands to do-fixing | `TRD.md` + spokes (issue template) |
| 2 | **do-slicing** *(optional — Jira)* | TRD work slices → task-list document scored by your Jira weighting scheme | `task-list.md` |
| 3 | **do-uploading** *(optional — Jira)* | task-list → Jira tasks (epic-linked, weighted), keys written back | Jira issues + updated docs |
| 4 | **do-planning** | TRD + tasks → staged dev plan: arch/package layout + small reviewable stages | `plan-<platform>.md` |
| 5 | **do-development** | Executes the plan stage-by-stage, TDD, visual parity for UI, stop at each checkpoint | code + passing tests |
| 6 | **do-testing** | Test pyramid — API · UI (visual parity + composition) · Integration (UI↔API) · System/E2E (risk-calibrated) · **Boot & Smoke (integrated — mandatory, non-skippable)**; verify-only, collects all bugs and reports before any fix | tests + `test-plan-<platform>.md` (incl. Boot & Smoke + Bugs found) |
| 7 | **do-fixing** | Fix the triaged bugs one at a time — reproduce-first regression test, root-cause not symptom — then hand back to testing to re-verify | fixes + updated bug status |

**Steps 2–3 are optional (Jira only).** Without Jira, the pipeline is: setup → grooming → **planning → development → testing**, working straight from the TRD's work slices + AC. The Jira phases are org-specific (adapt to your Jira, or skip).

**Roadmap (not yet built):** deployment, monitoring (Datadog + Mixpanel), multi-repo awareness.

---

## Core concepts

### Hub + spokes
A feature's TRD splits into a **hub** (`TRD.md` — the shared single source of truth: context, system design, API contract, cross-cutting, change manifest) and one **spoke per platform** (`TRD-backend.md` / `-android.md` / `-ios.md` / `-web.md`). Spokes link to the hub — they never copy the contract, so it can't drift. **The hub is groomed first — a hard gate: no spoke can be groomed until the hub exists *and its API-contract section is approved*** (spokes derive their typed client + fixtures from that contract). Separate platform teams groom their own spokes.

### Machine-checkable API contract
The hub's API contract must be, or point to, a **machine-checkable spec** (OpenAPI/Swagger preferred; shared schema/types otherwise) living authoritatively in one repo — not just a prose table. Every field is typed precisely: **nullability, enum values, and localized fields as objects** (`name: { en, id }`, never `string`). Clients **derive a typed client + test fixtures from it** rather than hand-authoring shapes that drift. Loose types are the root of the classic seam bugs — a wrong HTTP method (→ 405) or a localized object rendered as a string (→ React "objects are not valid as a child").

### Integrated boot & smoke (real FE + real BE)
Isolated levels each validate one side against its own mocks, so a frontend↔backend mismatch stays invisible until the app is assembled. The plugin closes this with a rule in `principles.md` and a **non-skippable gate**: before a feature is "done", the **real frontend + real backend are booted together the way the user runs them** (per `docs/basics/environment.md`'s *Full-stack run recipe*) and the feature's critical journeys are driven through the real HTTP stack with **relevant, domain-realistic data — never randomized/placeholder**. It fails on any unexpected **4xx/5xx**, **console error**, **failed request**, or **error-boundary/crash activation** (an error boundary hiding a crash behind a fallback still fails) — *even when every isolated test is green*. Enforced per full-stack stage in `do-development` and as `do-testing`'s mandatory **Boot & Smoke** level (which, unlike levels 1–4, can't be marked manual — the feature stays blocked until it actually runs). It closes the FE↔BE integration + real-data-render class completely; silent logic bugs and journeys never walked still need AC tests.

### Acceptance criteria = the contract
AC are written as **testable** specs in grooming, carried into tasks, turned into the per-stage tests in planning, written test-first in development, and verified in testing. Everything downstream depends on AC being concrete.

### The ladder (enforced)
Every logic/code decision climbs: **1** needs to exist? (YAGNI) → **2** reuse what's here → **3** stdlib → **4** native platform feature → **5** installed dep → **6** one line → **7** build new. The rung is **named in every proposal** and enforced by a validator hook (below).

### TDD throughout
Implementation is red → green → refactor. Upstream artifacts are kept TDD-ready: grooming/slicing produce testable AC, planning names the test per stage, development writes it first.

### Project profile (`docs/basics/`)
`do-project-setup` generates a per-repo baseline the other skills ground in instead of re-scanning. Each doc is commit-stamped, volatile detail points to authoritative files, and a refresh/reconcile mode keeps it current (and catches unregistered assets). The skill tiers the set — it generates only what applies to the repo and skips the rest (no empty files).

| Doc | Covers | Notes |
|-----|--------|-------|
| `overview.md` | Project summary + profile index with per-doc freshness stamps | core |
| `architecture.md` | Architecture style, layering + dependency rule, module/package map (Mermaid) | core |
| `ui-architecture.md` | Navigation, state management, design system, theming, screen inventory | client only |
| `tech-stack.md` | Languages, frameworks, key libs, build/run/test commands (versions → manifest) | core |
| `database.md` | Engine(s), schema shape (Mermaid ER), migration approach (DDL → migrations) | if it owns data |
| `data-cache.md` | Local persistence, caching strategy, offline behavior, what's stored where | if applicable |
| `environment.md` | Environments, config & secrets *approach* (names/locations, no values), **full-stack run recipe** (per-service start command, ready-check, FE→BE wiring, CORS — feeds the Boot & Smoke gate), flags, variants | core |
| `conventions.md` | Coding conventions, naming, folder rules, testing conventions | core |
| `git-management.md` | Branching, commit/PR/merge conventions, protected branches, tags/releases, hooks | core |
| `security-compliance.md` | Auth/authz, PII, encryption, compliance regimes, secret mgmt, audit logging | observed-only + human sign-off |
| `cicd-deployment.md` | CI/CD tool, pipeline stages, promotion, release, versioning, rollback | if deployed |
| `api-reference.md` | **Base-URL matrix (service × env)**, **machine-checkable contract** (OpenAPI/schema location + owner + whether clients derive typed client/fixtures), API catalog, auth, gotchas (no secrets) | if it calls/serves APIs |
| `asset-registry.md` | Searchable asset inventory (name · path · tags), naming, icon set, design tokens (→ Figma) | client only |
| `feature-map.md` | Catalog of features — purpose, entry points, owned endpoints/tables, **depends-on**, status, dependency graph | if it has features |

### Feature dependencies (notice what a feature relies on)
A new feature usually depends on existing ones (reuse their data/API/UI, don't break them), sometimes on a feature not built yet (a sequencing prerequisite), or shares a contract another feature owns. The pipeline catches this instead of designing in isolation: `do-grooming` runs a required **dependency-discovery step** (scanning `docs/basics/feature-map.md` + sibling feature TRDs + the profile + code, and asking the user) and records a **Feature dependencies** section in the hub TRD; `do-project-setup` seeds and grooming maintains the **feature-map** registry (register-on-create). If a feature depends on a **prerequisite that isn't built yet, it's a hard block** — an Open Decision, built/decided first — `do-planning` won't stage on a phantom, and `do-testing` adds a cross-feature journey verifying the new feature works with the depended-on one and doesn't break it.

### Open Decisions (no over-delivery)
The design/AC is the contract — the plugin builds *exactly* it. When the design is silent or ambiguous, the gap is **surfaced, not filled**: recorded in the spoke TRD's **Open Decisions** section with 2–3 recommended options, for the user to decide → update the design → re-groom. Undecided gaps block the affected slice; `do-development` that hits an unspecified gap stops and routes it back to grooming rather than inventing scope.

### Test → fix → re-test loop
`do-testing` is verify-only: it collects **all** bugs into the *Bugs found* report and presents them **before any fixing**. The user triages; confirmed fixes go to **`do-fixing`**, which fixes one at a time (reproduce-first regression test, root-cause not symptom, `docs/basics/` kept current), then hands back to `do-testing` to confirm the fixes hold and nothing regressed. Integration/Boot-&-Smoke bugs are re-verified by **re-booting the real stack**, not an isolated test.

### Content-fit (no clipped dialogs)
Variable-content containers (dialogs, sheets, lists, forms, multi-line text) must **fit their content or scroll — never clip**. The plugin verifies them at content + viewport **extremes** (longest content, largest dynamic-type, smallest screen), not just the design's ideal content — because a mockup shows ideal-length content and the clip only appears with real content. Specced in the widget-spec's *Container sizing & overflow*, rendered at extremes in `do-development`, and asserted as a UI-level *Content-fit* dimension in `do-testing`.

### Visual parity (design ↔ built UI)
For UI stages with a design reference (a Figma link or `design/<screen>.png`, recorded in the plan), `do-development` doesn't code-from-image blind: after a stage is green it **renders + screenshots** the screen and compares to the design **two ways — an AI visual checklist + a pixel-diff** — then fixes and re-renders until parity, within **platform-best-practice tolerance** (intentional platform deviations flagged, not forced pixel-identical). The screenshot + parity result appear in the stage review, and every iteration's actual screenshot + diff overlay is saved to `design/compared-ui/` (gitignored — local review trail). Rendering uses the platform's own tooling (Playwright / emulator+adb / simulator+simctl); the skill asks before installing anything. For screens taller than the viewport it captures the **full scroll extent** (web `fullPage`; mobile scroll-and-stitch) and compares **per section** — parity isn't passed while any below-the-fold section is uncompared (a viewport-only compare silently skips scrolled content).

### Widget spec (QA locator contract)
For client platforms, each screen gets `widget-spec/<screen>.md` listing interactive/asserted elements with a stable **Test ID** (`<feature>_<screen>_<element>`), its **type**, and a **content description that doubles as the accessibility label**. Development implements the exact IDs; testing locates by them (not brittle text/xpath). One ID, applied per platform via `testTag` / `accessibilityIdentifier` / `data-testid`.

### Component fidelity (every element, any size)
The design's choice of element is intent, not decoration: the plugin builds **exactly the component specified** — every element, however small — and never substitutes a look-alike (a toggle built as a checkbox looks close but breaks the behavior). The element's **type** is recorded in the widget spec, built in `do-development`, and `do-testing` **asserts the rendered a11y role matches** it; behavior the type implies is written as testable AC. **If the AI wants a different component, it asks first** — it never swaps silently.

### Clean architecture (conditional)
If the project uses layered/clean architecture, changes are placed in the right layer (presentation / domain / data) and honor the dependency rule — but layering is never imposed on a project that doesn't use it.

---

## Shared principles ([`principles.md`](./principles.md))

- **Lazy senior engineer** — efficient not careless; deletion over addition; no speculative scaffolding; **never over-simplify** (simplicity = fewer moving parts for the *same* correctness).
- **The ladder** — reuse before build, named rung (hook-enforced).
- **Ground in real code · validate every choice** (valid, relevant, compatible with existing code — no hallucinated libs/APIs) **· ask don't assume · offer 2–3 best-practice options · keep a living understanding summary** (re-summarize on change).
- **Draft + human-approve before any external write · asking ends the turn** — every gate is a hard STOP; wait for the user, no timeout, no auto-continue.
- **Keep the project profile current** (`docs/basics/` updated as work changes it, including after development *and* fixing) **· comments minimal and project-relevant** (not task/ticket provenance).
- **Test-first across the pipeline · respect the project's architecture** (clean/layered when the project uses it).
- **Integrated real-data gate** — never "done" on mock/assumed data; boot the real FE+BE and drive critical journeys through the real HTTP stack with domain-realistic data (zero 4xx/5xx · console errors · error-boundary trips). Mocks/fixtures derive from the machine-checkable contract, never hand-authored shapes that drift.

---

## Enforcement: keeping the AI consistent with the principles

Principles are applied through three stacked layers (strongest = hooks):

1. **In context** — every skill opens with an imperative *"read `principles.md` in full now, then apply it,"* and a **SessionStart hook** (`hooks/inject-principles.js`) injects `principles.md` into every session so it's always present.
2. **Hard-enforced (hooks)** — mechanizable principles are validated on `Write|Edit` and block (exit 2) on violation:
   - `validate-rung.js` — every TRD/plan decision must name its ladder rung (no empty/placeholder Approach field; every plan Stage has an Approach).
   - `validate-no-secrets.js` — no secret *values* in `docs/` artifacts (high-confidence patterns: private keys, AWS/GitHub/Google/Slack tokens, JWTs); names/locations are fine.
   - `validate-comments.js` — no task/tracker **provenance** in source-code comments (issue keys, Jira/Confluence, PRD/BRD/TRD, "added for the ticket", "per the requirement"…); scans comment lines in code files only (skips docs/generated), high-confidence patterns only.
3. **Self-check** — skills verify their own output against the principles before presenting (e.g. the rung self-check, and the comment-hygiene self-check in `do-development`/`do-fixing`).

Judgment principles (never-over-simplify, ask-don't-assume, step-by-step, wait-for-answer, and *prefer-no-comments / self-documenting code*) can't be fully script-checked — they rely on layers 1 and 3 (the `validate-comments` hook enforces only the provenance subset). Reload the plugin after install — hooks load at session start.

---

## Artifacts per feature

```
docs/development/<feature-name>/
  TRD.md                      # hub — shared contract
  TRD-<platform>.md           # spoke per platform
  widget-spec/<screen>.md     # QA locator contract per screen (clients)
  task-list.md                # Appendix-v3-scored tasks
  plan-<platform>.md          # staged dev plan (arch layout + stages + design refs)
  design/<screen>.png         # design images to build 1:1 against (or Figma links in the plan)
  design/compared-ui/         # actual-UI screenshots + diff overlays per parity iteration (gitignored)
  test-plan-<platform>.md     # AC → test → status coverage (incl. Boot & Smoke)
```

---

## Layout

```
.claude-plugin/plugin.json    # manifest (name: alpha-sdlc)
.claude-plugin/marketplace.json # repo acts as its own marketplace (alpha)
principles.md                 # shared discipline, referenced by every skill
hooks/                        # SessionStart principles injector + rung & no-secrets validators
skills/
  do-project-setup/       SKILL.md                         # generates docs/basics/ profile
  do-grooming/            SKILL.md + TRD-hub-template + TRD-spoke-template + widget-spec-template
  do-tech-debt-grooming/  SKILL.md + tech-debt-TRD-template
  do-issue-grooming/      SKILL.md + issue-TRD-template
  do-slicing/    SKILL.md
  do-uploading/  SKILL.md
  do-planning/   SKILL.md + plan-template
  do-development/ SKILL.md
  do-testing/    SKILL.md + test-plan-template
  do-fixing/     SKILL.md
```

## Install

### Prerequisite: Node.js

The plugin's hooks (principles injector + the `validate-*` blockers) run as `node` scripts, so **`node` must be on your PATH**. They use only Node built-ins — there is **no `package.json`, no `npm install`, and no third-party dependencies** — so nothing is fetched at install time; the only requirement is the Node runtime itself. If you installed Claude Code via npm you already have it; on a native-binary install with no system Node, the hooks **fail open** (they simply don't run — no enforcement, never a broken session), while the skills, templates, and principles still install normally.

From GitHub:

```
/plugin marketplace add rizkyalfauji11/alpha-sdlc
/plugin install alpha-sdlc@alpha
```

Local (development / testing):

```
/plugin marketplace add /path/to/alpha-sdlc      # this repo's root
/plugin install alpha-sdlc@alpha
```

Or run a session with the plugin loaded directly, skipping the marketplace step:

```
claude --plugin-dir /path/to/alpha-sdlc
```

Manage it with `/plugin marketplace list`, `/plugin marketplace update alpha`, `/plugin`. Hooks load at session start — use `/reload-plugins` to pick up changes without restarting. Validate the manifests any time with `claude plugin validate .`.

### Staying up to date

New versions aren't pulled automatically for third-party marketplaces by default. To update manually:

```
/plugin marketplace update alpha    # refresh the catalog + detect the new version
/reload-plugins                     # load it into the session
```

To **auto-update** instead: `/plugin` → *Marketplaces* → select `alpha` → **Enable auto-update** (Claude then checks and updates on session start).

For a **team/org**, ship this in project `./.claude/settings.json` (or managed settings) — it adds the marketplace *and* keeps it auto-updating for everyone:

```json
{
  "extraKnownMarketplaces": {
    "alpha": {
      "source": { "source": "github", "repo": "rizkyalfauji11/alpha-sdlc" },
      "autoUpdate": true
    }
  }
}
```

Updates are detected by the `version` in `plugin.json` — it's bumped on each release, so keep installs current by refreshing after a new tag.

## Usage

Invoke a phase by intent or its slash command. Start with an entry point — `/do-grooming <prd-url>` for a product feature, `/do-tech-debt-grooming` for an engineer-initiated improvement, or `/do-issue-grooming` for a user-reported issue (it audits the whole project first) — then `/do-planning`, `/do-development`, `/do-testing`. If you use Jira, insert `/do-slicing` and `/do-uploading` between grooming and planning; otherwise skip them. Each skill reads the prior phase's artifact and gates with you before writing or acting.

## Notes

- The **slicing** and **uploading** phases are optional (Jira only) and **always ask which weighting to use**: **Story Points** (Jira's default modified-Fibonacci estimation — portable, no org setup, writes the standard Story Points field) or **Appendix (v3)** (an org-specific weighting workflow with custom fields — the amarbank flow is the reference; adapt to your Jira). Skip both phases entirely and go grooming → planning → development → testing if you don't use Jira.
- Multi-repo (separate platform repos) was designed but not built: the intended shape is a checked-in manifest + a shared hub each repo reads, one repo per session for writes.
