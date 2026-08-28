# alpha-sdlc

An SDLC pipeline for Claude Code — **groom → plan → build → test → fix** — as skills you drive from the terminal.

Your agent's tests pass and the feature is still broken: the client calls a method the route doesn't have, the backend returns `{en,id}` where the component renders a string. Every isolated test was green, because both sides mocked the same wrong assumption. This plugin doesn't call a feature done until it has booted your real frontend against your real backend and driven the actual journeys through the real HTTP stack.

## What it won't do

**Continue without you.** Every document section, plan stage, and test result is a hard gate — unless you **explicitly opt into auto-run** for the build→test→fix chain, where gates become reports stamped `auto`, all bugs found get fixed in severity order, and only genuine questions (a design gap, plan drift, a judgment call) stop the run; grooming and planning are never auto. Gates are presented as **5W+1H**: What (in plain words and engineer terms), Why (first, whenever you're asked to decide), Who, When, Where, How — each a self-contained statement, so you never have to open another document to understand the step in front of you; engineering detail below, then it stops. No "generate the whole document", no batched approvals, no default it proceeds on if you go quiet. You review one small change at a time instead of one enormous diff at the end.

**Claim a pass it didn't verify.** Done means the real stack booted with domain-realistic data and zero unexpected 4xx/5xx, console errors, or error-boundary trips — and for UI, the render compared against the design. What you get is a "done" you don't have to re-check by hand.

**Fill in what the design left out.** A gap or ambiguity becomes an *Open Decision* with two or three options and one recommended — and the recommended one is **always the product-quality option per the world-wide standard, never the cheapest way out** (the cheap option is listed with its cost named; picking it is your explicit, recorded call). It lives in the requirements doc, blocking that slice until you choose. Nobody ships a plausible guess in your product's name.

**Build before looking for something to reuse.** Every change names which rung it stopped at on a seven-rung ladder — does this need to exist, is it already in the codebase, the stdlib, a platform feature, an installed dependency, one line — and only then, new code. Each decision also names the **world-wide standard** next to the rung: security-grade best practice overrides local reuse outright (no propagating the hand-rolled JWT parser because it was nearby), while style conflicts become options you decide. You end up with less code to own — none of it quietly behind the industry.

One thing it does *to* your code: source ships with **zero comments**. A rename, an extracted function, or a named constant does that job instead, and the *why* that can't fit in a name goes in the commit message, where it can't rot beside code that changed.

None of that is prompt-deep. Hooks block the write when a decision names no rung, a secret lands in a doc, or a comment lands in code — a prompt can be forgotten mid-session, an exit code can't. The whole opinion is one file: [`principles.md`](./principles.md). If you disagree with it, you'll disagree with the plugin.

## The pipeline

Teach it your repo once. `/do-project-setup` reads the project and writes a profile into `docs/basics/` — architecture, stack, domain model, API map, environment and the full-stack run recipe, conventions, design tokens. Every later skill grounds in those files instead of re-scanning and re-guessing each session. On an empty repo it flips modes and decides the stack *with* you, one gate per decision.

Then, per feature:

| | | |
|---|---|---|
| **Groom** | `/do-grooming` | PRD/BRD → requirements doc, one approval per section. Variants: `/do-tech-debt-grooming` for behavior-preserving work, `/do-issue-grooming` which audits the whole issue *class* across the project rather than the symptom you hit, `/do-foundation-grooming` for a new project's scaffold |
| **Plan** | `/do-planning` | Small independently reviewable stages, split by the layers your repo actually has — contract → domain → data → presentation, or just UI vs data-integration; it won't impose layering it doesn't find. UI splits again by section |
| **Build** | `/do-development` | One stage at a time, test-first. Each diff is audited by a fresh-eyes reviewer holding your profile docs but not the reasoning that produced the code — then it stops for you |
| **Test** | `/do-testing` | API · UI · integration · E2E · boot-and-smoke, every check traced to an acceptance criterion. Verify-only: it reports every bug and fixes none |
| **Fix** | `/do-fixing` | The bugs you triaged, one at a time, reproduce-first, root cause not symptom |

If you use Jira, `/do-slicing` and `/do-uploading` turn an approved requirements doc into a story-pointed task list and create it sample-first in small batches. Skip both otherwise — nothing downstream depends on them.

## Install

Needs **`node` on your PATH** — the hooks are Node scripts using built-ins only, so there's no `npm install` and nothing is fetched. No Node? Everything still installs; the hooks fail open and simply don't enforce.

```
/plugin marketplace add rizkyalfauji11/alpha-sdlc
/plugin install alpha-sdlc@alpha
```

## First run

```
/do-project-setup     # once per repo — writes docs/basics/, one doc at a time
/do-grooming          # point it at a PRD, a ticket, or a paragraph you typed
```

Expect the first one to take a while and to ask about your architecture, your conventions, and anything the code doesn't state — it's writing the files every other skill reads, and a wrong fact in there propagates. You can stop after any gate and pick it up days later.

## Design parity, not "looks close"

Coding from a screenshot and declaring it done is how built UI drifts from the design. Here the build doesn't pass until the comparison does:

- **It renders and diffs.** When a UI stage goes green it boots the screen, screenshots it, and compares against the design two ways — a structured visual checklist and a pixel diff — then fixes and re-renders until both pass. Findings name the value, not a vibe: *measured 12, `space.lg` is 16*, and a wrong token counts as a defect even when the pixel diff is inside tolerance. Playwright for web, real emulator and simulator for Android and iOS; it asks before installing a driver or booting a device.
- **The whole screen, not the viewport.** Taller than the fold means the full scroll extent is captured (`fullPage`, or scroll-and-stitch on mobile) and compared section by section.
- **Every state and every extreme, not just the happy one.** Loading, empty, error, offline, role and flag variants each compared against **their own cropped design** — because a full-screen mockup shows one state and would pass a screen whose other four were never built — plus the content extremes a mockup never shows: longest realistic text, largest font scale, smallest screen.
- **When it can't measure, it stops.** A browser driver that won't launch or an emulator that won't boot is a blocker it reports with the fix, not a stage it waves through. Tolerance follows platform norms rather than forcing pixel-identity where iOS and Android disagree, and a deliberate platform deviation is flagged for you instead of "corrected" into a bug. Every iteration's screenshot and diff overlay stays on disk, gitignored, as the trail.

## What it writes into your repo

```
docs/basics/                  the project profile, commit-stamped
docs/development/<feature>/
  TRD.md                      requirements — the shared contract
  plan-<platform>.md          staged plan, each stage with its checkpoint
  design/                     the designs it builds and diffs against
  test-plan-<platform>.md     acceptance criterion → test → level → status
```

Markdown, reviewable in a pull request. The work outlives the session: resume days later, or hand the feature to someone else with the reasoning already written down.

## Updating

Third-party marketplaces don't auto-update by default:

```
/plugin marketplace update alpha
/reload-plugins
```

Prefer automatic: `/plugin` → *Marketplaces* → `alpha` → **Enable auto-update**. Rolling it out to a team? Add the marketplace with `"autoUpdate": true` under `extraKnownMarketplaces` in your project's `.claude/settings.json`, and everyone stays current.

## Roadmap

A stand-alone regression/QA track that black-box tests the built app, then deployment and monitoring.

Working on the plugin itself: `claude --plugin-dir /path/to/alpha-sdlc` loads it without the marketplace, `claude plugin validate .` checks the manifests.
