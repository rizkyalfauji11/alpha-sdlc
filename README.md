# alpha-sdlc

A Claude Code plugin that walks a feature through the engineering lifecycle — **groom → plan → build → test → fix** — as skills you drive from the terminal. Each phase writes a real artifact into your repo, and stops for your approval before moving on.

It's opinionated on purpose: it proposes, you approve. It reuses before it builds. It won't quietly simplify away the hard parts, and it won't invent scope the design never asked for. Uses your existing tools (Jira, Datadog, Mixpanel) instead of replacing them.

---

## How it works

**Step 0 — teach it your repo.** `/do-project-setup` scans the whole project and writes `docs/basics/` (18 tiered docs: architecture, tech stack, DB, API map, env + run recipe, conventions, UX conventions, design tokens, feature map…). Every later skill grounds in these instead of re-scanning and re-guessing. Re-run it in refresh mode after a feature ships.

**Starting from zero?** Same command, different mode: on an empty repo it stops describing and starts **deciding** — framework, architecture, structure, tooling, one gate per decision — and writes the profile as intended design (stamped `prescriptive (pre-code)`, never as if it had read code that doesn't exist). Then `/do-foundation-grooming` grooms the base: scaffold, folder structure, architecture skeleton. Once that's built, refresh mode re-stamps the docs against the real commit and you're on the normal path.

**Then pick an entry point** — each produces a TRD that flows into the same pipeline:

| | Skill | For |
|---|---|---|
| 1a | `/do-grooming` | a product feature, from a PRD/BRD |
| 1b | `/do-tech-debt-grooming` | refactor, perf, fragility, upgrades — behavior-preserving, no PRD |
| 1c | `/do-issue-grooming` | a reported bug — audits the **whole project for the issue class**, not just the symptom |
| 1d | `/do-foundation-grooming` | the **base of a new project** — scaffold + structure + architecture skeleton, no features |

**And run the pipeline:**

| # | Skill | Does | Output |
|---|-------|------|--------|
| 2–3 | `/do-slicing` → `/do-uploading` | *Jira only, optional* — TRD → weighted task list → Jira issues | `task-list.md` + Jira keys |
| 4 | `/do-planning` | TRD → staged dev plan: where code lands + small reviewable stages, **split by layer** (domain → data → presentation) | `plan-<platform>.md` |
| 5 | `/do-development` | Builds stage by stage, TDD, **reviews each diff against your docs + principles**, visual parity for UI, **⏸ stops at every checkpoint** | code + tests |
| 6 | `/do-testing` | API · UI · Integration · E2E · **Boot & Smoke** (real FE+BE, non-skippable); verify-only — reports every bug before any fix | tests + `test-plan-<platform>.md` |
| 7 | `/do-fixing` | Fixes triaged bugs one at a time — reproduce-first, root cause not symptom, **same fresh-eyes review per fix** | fixes, back to testing |

No Jira? Skip 2–3 and go setup → grooming → planning → development → testing.

**Everything lands in your repo**, reviewable in a PR:

```
docs/basics/                      # the project profile (step 0)
docs/development/<feature>/
  TRD.md                          # hub — shared contract, single source of truth
  TRD-<platform>.md               # one spoke per platform, links the hub (never copies it)
  widget-spec/<screen>.md         # per-screen contract: test IDs, element types, style bindings
  plan-<platform>.md              # staged plan + design refs
  design/                         # the designs to build against (+ gitignored parity screenshots)
  test-plan-<platform>.md         # AC → test → status
```

**What you'll actually notice while using it:**

- **It stops.** Every section, stage, and result is a hard gate — proposed in plain language first, engineer detail second, then it waits. No auto-continue.
- **It asks instead of inventing.** A gap in the design becomes an *Open Decision* with 2–3 options for you to pick, never a guess it ships.
- **It won't fake a pass.** UI parity is rendered and compared (not code-from-image); "done" requires the real frontend + backend booted together with realistic data.
- **Every stage gets code-reviewed before you see it.** A fresh-eyes reviewer (no build context) audits the diff against your `docs/basics/` and the principles — layer placement, error handling, tokens, cache keys, contract types, scope. Objective violations get fixed in the stage; anything about scope or a convention comes to you as an Open Decision.
- **Hooks block the mechanizable stuff** — unnamed reuse decisions, leftover template placeholders, secrets in docs, ticket provenance in comments.

Shared discipline lives in [`principles.md`](./principles.md); the mechanics of each phase live in its `skills/*/SKILL.md`.

> **Roadmap** — a stand-alone regression/QA track (black-box testing the built app), then deployment and monitoring.

---

## Install

Needs **`node` on your PATH** (the hooks are Node scripts — built-ins only, no `npm install`, nothing fetched). No Node? Everything still installs; the hooks just fail open and don't enforce.

```
/plugin marketplace add rizkyalfauji11/alpha-sdlc
/plugin install alpha-sdlc@alpha
```

Working on the plugin itself:

```
/plugin marketplace add /path/to/alpha-sdlc     # this repo's root
/plugin install alpha-sdlc@alpha

claude --plugin-dir /path/to/alpha-sdlc         # or just load it, no marketplace
claude plugin validate .                        # check the manifests
```

Hooks load at session start — `/reload-plugins` picks up changes without restarting.

## Update

Third-party marketplaces don't auto-update by default:

```
/plugin marketplace update alpha    # refresh catalog, detect the new version
/reload-plugins                     # load it
```

Prefer automatic: `/plugin` → *Marketplaces* → `alpha` → **Enable auto-update**.

For a team, ship it in `./.claude/settings.json` — adds the marketplace *and* keeps everyone current:

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

New versions are detected from `version` in `plugin.json`, bumped each release.
