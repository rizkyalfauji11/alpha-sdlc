# alpha-sdlc

An SDLC pipeline for Claude Code — **groom → plan → build → test → fix** — as skills you drive from the terminal.

Your agent's tests pass and the feature is still broken: the client calls a method the route doesn't have, the backend returns `{en,id}` where the component renders a string. Every isolated test was green, because both sides mocked the same wrong assumption. This plugin doesn't call a feature done until it has booted your real frontend against your real backend and driven the actual journeys through the real HTTP stack.

## What it won't do

**Continue without you.** Every document section, plan stage, and test result is a hard gate: plain-language summary first, engineering detail below, then it stops. No "generate the whole document", no batched approvals, no default it proceeds on if you go quiet.

**Claim a pass it didn't verify.** Done means the real stack booted with domain-realistic data and zero unexpected 4xx/5xx, console errors, or error-boundary trips. UI is rendered, screenshotted, and diffed against the design — never written from an image and called parity. If the screenshot tooling breaks, it stops and tells you instead of skipping the comparison.

**Fill in what the design left out.** A gap or ambiguity becomes an *Open Decision* with two or three options and one recommended, recorded in the requirements doc, blocking that slice until you choose. Building beyond the spec is treated as the same defect as building below it.

**Build before looking for something to reuse.** Every change names which rung it stopped at on a seven-rung ladder — does this need to exist, is it already in the codebase, the stdlib, a platform feature, an installed dependency, one line — and only then, new code. A hook rejects a requirements doc or plan that doesn't name its rung.

One thing it does *to* your code: source ships with **zero comments**. No prose, no docstrings, no banners — a rename, an extracted function, or a named constant does that job, and a hook blocks the write when a comment slips in. The *why* that can't fit in a name goes in the commit message, where it can't rot beside code that changed.

## The pipeline

Teach it your repo once. `/do-project-setup` reads the project and writes a profile into `docs/basics/` — architecture, stack, domain model, API map, environment and the full-stack run recipe, conventions, design tokens. Every later skill grounds in those files instead of re-scanning and re-guessing each session. On an empty repo it flips modes and decides the stack *with* you, one gate per decision.

Then, per feature:

| | | |
|---|---|---|
| **Groom** | `/do-grooming` | PRD/BRD → requirements doc, one approval per section. Variants: `/do-tech-debt-grooming` for behavior-preserving work, `/do-issue-grooming` which audits the whole issue *class* across the project rather than the symptom you hit, `/do-foundation-grooming` for a new project's scaffold |
| **Plan** | `/do-planning` | Small independently reviewable stages, split by layer (domain → data → presentation); UI splits again by section |
| **Build** | `/do-development` | One stage at a time, test-first. Each diff is audited by a fresh-eyes reviewer holding your profile docs but not the reasoning that produced the code — then it stops for you |
| **Test** | `/do-testing` | API · UI · integration · E2E · boot-and-smoke, every check traced to an acceptance criterion. Verify-only: it reports every bug and fixes none |
| **Fix** | `/do-fixing` | The bugs you triaged, one at a time, reproduce-first, root cause not symptom |

Use Jira? `/do-slicing` and `/do-uploading` turn an approved requirements doc into a story-pointed task list and bulk-create it, sample-first in small batches. Skip both otherwise — nothing downstream depends on them.

## Install

Needs **`node` on your PATH** — the hooks are Node scripts using built-ins only, so there's no `npm install` and nothing is fetched. Without Node everything still installs; the hooks fail open and simply don't enforce.

```
/plugin marketplace add rizkyalfauji11/alpha-sdlc
/plugin install alpha-sdlc@alpha
```

## First run

```
/do-project-setup     # once per repo — writes docs/basics/, one doc at a time
/do-grooming          # point it at a PRD, a ticket, or a paragraph you typed
```

Expect the first one to take a while and to ask you things: it's writing the files every other skill reads, and a wrong fact in there propagates. You can stop after any gate and pick it up days later — the state is markdown in your repo, not in the session.

## What it writes into your repo

```
docs/basics/                  the project profile, commit-stamped
docs/development/<feature>/
  TRD.md                      requirements — the shared contract
  plan-<platform>.md          staged plan, each stage with its checkpoint
  design/                     the designs it builds and diffs against
  test-plan-<platform>.md     acceptance criterion → test → status
```

Everything is reviewable in a pull request, and readable by whoever picks the feature up next.

## Updating

Third-party marketplaces don't auto-update by default:

```
/plugin marketplace update alpha
/reload-plugins
```

Prefer automatic: `/plugin` → *Marketplaces* → `alpha` → **Enable auto-update**. Rolling it out to a team? Add the marketplace with `"autoUpdate": true` under `extraKnownMarketplaces` in your project's `.claude/settings.json`, and everyone stays current.

## Roadmap

A stand-alone regression/QA track that black-box tests the built app, then deployment and monitoring.

Working on the plugin itself: `claude --plugin-dir /path/to/alpha-sdlc` to load it without the marketplace, `claude plugin validate .` to check the manifests. The shared discipline every skill applies is one file — [`principles.md`](./principles.md). It's the whole opinion; if you disagree with it, you'll disagree with the plugin.
