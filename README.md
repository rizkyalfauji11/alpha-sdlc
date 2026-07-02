# SDLC Plugin

A Claude Code plugin that supports the engineering lifecycle — **grooming → development → testing → deployment → monitoring** — as a set of skills an engineer drives from the terminal. It leans on the team's existing tools (Jira/Confluence, Datadog, Mixpanel) rather than replacing them.

**Philosophy:** every skill is opinionated, gated, and lazy-in-the-good-sense. It proposes, the human approves; it reuses before it builds; it never simplifies away the hard parts. The shared discipline lives in [`principles.md`](./principles.md) and every skill applies it.

---

## The pipeline

Each phase produces an artifact the next phase consumes. The **acceptance criteria (AC)** thread the whole way through — written in grooming, tested in development and testing.

**Two entry points**, both producing a TRD that flows into the same pipeline:
- **do-grooming** — product features, driven by a PRD/BRD.
- **do-tech-debt-grooming** — engineer-initiated improvements (refactor, performance, fragility, dependency upgrade, cleanup), no PRD.

| # | Skill | Does | Output |
|---|-------|------|--------|
| 0 | **do-project-setup** | Generates the project profile (architecture, tech-stack, database, API map, security, CI/CD, assets…) one doc at a time; refresh/reconcile mode keeps it current | `docs/basics/*.md` (13-doc set) |
| 1a | **do-grooming** | PRD/BRD → Technical Requirements Doc, section-by-section with one gate per section | `TRD.md` (hub) + `TRD-<platform>.md` (spokes), `widget-spec/<screen>.md` |
| 1b | **do-tech-debt-grooming** | Engineer's improvement statement → behavior-preserving TRD (justify → target → regression safety), one gate per section | `TRD.md` + spokes (tech-debt template) |
| 2 | **do-slicing** | TRD work slices → task-list document scored against Jira *Choose Appendix (v3)* | `task-list.md` |
| 3 | **do-uploading** | task-list → Jira tasks (epic-linked, weighted), keys written back | Jira issues + updated docs |
| 4 | **do-planning** | TRD + tasks → staged dev plan: arch/package layout + small reviewable stages | `plan-<platform>.md` |
| 5 | **do-development** | Executes the plan stage-by-stage, TDD, stop at each checkpoint | code + passing tests |
| 6 | **do-testing** | Feature-level tests per platform, located by widget-spec IDs | tests + `test-plan-<platform>.md` |

**Roadmap (not yet built):** deployment, monitoring (Datadog + Mixpanel), multi-repo awareness.

---

## Core concepts

### Hub + spokes
A feature's TRD splits into a **hub** (`TRD.md` — the shared single source of truth: context, system design, API contract, cross-cutting, change manifest) and one **spoke per platform** (`TRD-backend.md` / `-android.md` / `-ios.md` / `-web.md`). Spokes link to the hub — they never copy the contract, so it can't drift. The hub is groomed first; separate platform teams groom their own spokes.

### Acceptance criteria = the contract
AC are written as **testable** specs in grooming, carried into tasks, turned into the per-stage tests in planning, written test-first in development, and verified in testing. Everything downstream depends on AC being concrete.

### The ladder (enforced)
Every logic/code decision climbs: **1** needs to exist? (YAGNI) → **2** reuse what's here → **3** stdlib → **4** native platform feature → **5** installed dep → **6** one line → **7** build new. The rung is **named in every proposal** and enforced by a validator hook (below).

### TDD throughout
Implementation is red → green → refactor. Upstream artifacts are kept TDD-ready: grooming/slicing produce testable AC, planning names the test per stage, development writes it first.

### Project profile (`docs/basics/`)
`do-project-setup` generates a per-repo baseline the other skills ground in instead of re-scanning: architecture, ui-architecture, tech-stack, database, data-cache, environment, conventions, git-management, security-compliance, cicd-deployment, api-reference (base-URL matrix), asset-registry. Each doc is commit-stamped; volatile detail points to authoritative files; a refresh/reconcile mode keeps it current (and catches unregistered assets).

### Widget spec (QA locator contract)
For client platforms, each screen gets `widget-spec/<screen>.md` listing interactive/asserted elements with a stable **Test ID** (`<feature>_<screen>_<element>`) and a **content description that doubles as the accessibility label**. Development implements the exact IDs; testing locates by them (not brittle text/xpath). One ID, applied per platform via `testTag` / `accessibilityIdentifier` / `data-testid`.

### Clean architecture (conditional)
If the project uses layered/clean architecture, changes are placed in the right layer (presentation / domain / data) and honor the dependency rule — but layering is never imposed on a project that doesn't use it.

---

## Shared principles ([`principles.md`](./principles.md))

- **Lazy senior engineer** — efficient not careless; deletion over addition; no speculative scaffolding; **never over-simplify** (simplicity = fewer moving parts for the *same* correctness).
- **The ladder** — reuse before build, named rung.
- **Ground in real code · ask don't assume · offer 2–3 best-practice options · keep a living understanding summary (re-summarize on change) · draft + human-approve before any external write.**
- **Test-first across the pipeline · respect the project's architecture.**

---

## Enforcement: the ladder validator hook

The one hook in an otherwise skill-only plugin (added deliberately for the ladder).

- `hooks/hooks.json` registers a **PreToolUse** hook on `Write|Edit`.
- `hooks/validate-rung.js` blocks (exit 2) any write to a TRD/plan artifact where an `Approach (ladder rung)` field is empty/placeholder, or a plan Stage has no Approach line. Skill templates and unrelated files are excluded.
- Reload the plugin after install — hooks load at session start.

---

## Artifacts per feature

```
docs/development/<feature-name>/
  TRD.md                      # hub — shared contract
  TRD-<platform>.md           # spoke per platform
  widget-spec/<screen>.md     # QA locator contract per screen (clients)
  task-list.md                # Appendix-v3-scored tasks
  plan-<platform>.md          # staged dev plan (arch layout + stages)
  test-plan-<platform>.md     # AC → test → status coverage
```

---

## Layout

```
.claude-plugin/plugin.json    # manifest (name: alpha-sdlc)
.claude-plugin/marketplace.json # repo acts as its own marketplace (alpha)
principles.md                 # shared discipline, referenced by every skill
hooks/                        # ladder validator
skills/
  do-project-setup/       SKILL.md                         # generates docs/basics/ profile
  do-grooming/            SKILL.md + TRD-hub-template + TRD-spoke-template + widget-spec-template
  do-tech-debt-grooming/  SKILL.md + tech-debt-TRD-template
  do-slicing/    SKILL.md
  do-uploading/  SKILL.md
  do-planning/   SKILL.md + plan-template
  do-development/ SKILL.md
  do-testing/    SKILL.md + test-plan-template
```

## Install

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

## Usage

Invoke a phase by intent or its slash command. Start with either entry point — `/do-grooming <prd-url>` for a product feature, or `/do-tech-debt-grooming` for an engineer-initiated improvement — then `/do-slicing`, `/do-uploading`, `/do-planning`, `/do-development`, `/do-testing`. Each skill reads the prior phase's artifact and gates with you before writing or acting.

## Notes

- The **slicing** and **uploading** phases assume an "Appendix (v3)" task-weighting workflow and organization-specific Jira custom fields (weight points, an appendix multiselect, an epic-link field). These are org-configured — point the skills at your own Jira fields/weighting scheme, or skip these two phases and go grooming → planning → development → testing directly. Everything else works without any Jira setup.
- Multi-repo (separate platform repos) was designed but not built: the intended shape is a checked-in manifest + a shared hub each repo reads, one repo per session for writes.
