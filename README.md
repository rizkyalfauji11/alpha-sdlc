# alpha-sdlc

An SDLC pipeline for Claude Code — **groom → plan → build → test → fix** — as skills you drive from
the terminal.

Your agent's tests pass and the feature is still broken: the client calls a method the route doesn't
have, the backend returns `{en,id}` where the component renders a string. Every isolated test was
green, because both sides mocked the same wrong assumption. This plugin doesn't call a feature done
until it has booted your real frontend against your real backend and driven the actual journeys
through the real HTTP stack.

## What it won't do

**Continue without you.** Every document section, plan stage, and test result is a hard gate —
unless you **explicitly opt into auto-run** for the build→test→fix chain, where gates become reports
stamped `auto`, all bugs found get fixed in severity order, and questions answer themselves with the
recommended option — the quality one, and for a question of scope the hub's boundary — each
recorded and listed for your after-the-run
ratification; it stops only when nothing can be decided (broken verification tooling, a missing
input, an external write); grooming, planning, and project setup are never auto. Every gate opens
with the **bottom line** — what happened, in plain words and engineer terms, and what it needs from
you — then why it matters (always, when you're asked to decide), then only the context that isn't
obvious; 5W+1H is the checklist each summary is held to, not six headings to wade through. Each
statement stands alone, so you never have to open another document to understand the step in front
of you; engineering detail below, then it stops. No "generate the whole document", no batched
approvals, no default it proceeds on if you go quiet. You review one small change at a time instead
of one enormous diff at the end.

**Claim a pass it didn't verify.** Done means the real stack booted with domain-realistic data and
zero unexpected 4xx/5xx, console errors, or error-boundary trips — and for UI, the render compared
against the design. What you get is a "done" you don't have to re-check by hand.

**Fill in what the design left out.** A gap or ambiguity becomes an *Open Decision* with two or
three options and one recommended — and the recommended one is **always the product-quality option
per the world-wide standard, never the cheapest way out** (the cheap option is listed with its cost
named; picking it is your explicit, recorded call). It lives in the requirements doc, blocking that
slice until you choose. Nobody ships a plausible guess in your product's name.

**Build before looking for something to reuse.** Every change names which rung it stopped at on a
seven-rung ladder — does this need to exist, is it already in the codebase, the stdlib, a platform
feature, an installed dependency, one line — and only then, new code. Each decision also names the
**world-wide standard** next to the rung: security-grade best practice overrides local reuse
outright (no propagating the hand-rolled JWT parser because it was nearby), while style conflicts
become options you decide. You end up with less code to own — none of it quietly behind the
industry.

One thing it does *to* your code: source ships with **zero comments** — configurable where law or
libraries demand it: setup can allow **license headers** and **public-API doc-comments** (an org
setting the hook reads); everything else stays banned. A rename, an extracted function, or a named
constant does that job instead, and the *why* that can't fit in a name goes in the commit message,
where it can't rot beside code that changed.

None of that is prompt-deep. Hooks block the write when a decision names no rung, a secret lands in
a doc, a comment lands in code, or a markdown table the next phase has to read stops parsing — a
prompt can be forgotten mid-session, an exit code can't. And because those hooks watch the Edit and
Write tools, a doc written through Bash — a `sed -i`, a heredoc, an inline script — is blocked and
sent back through them; replayed against 7,688 real Bash calls from one project, that closed over
3,000 doc writes the hooks had never seen. The same holds for how it talks to you: a
step summary whose plain layer a non-engineer couldn't follow — no bottom line, code names or bare
`file:line` pointers in the explanation, an English quote or a word-for-word translation in a
summary written in your language — is sent back for one rewrite before it counts as presented. In
Bahasa Indonesia the plain layer also follows [`plain-language/id.md`](./plain-language/id.md), a
fixed glossary with real before/after examples, injected into every session whose Org settings pick
that language. The whole opinion is one file:
[`principles.md`](./principles.md). If you disagree with it, you'll disagree with the plugin.

That last one, `hooks/validate-doc-tables.js`, checks every `.md` write — **the plugin's own
templates included** — rebuilding the post-edit document from disk first, so a one-row `Edit` is
still judged against the real header. It blocks on four shapes: a header whose cell count differs
from its `---` row (GFM then renders the whole block as literal pipe text), a body row with more or
fewer cells than its header (extra cells are DROPPED, missing ones render EMPTY — which is how a
*decided* item shows as an open one), a `|`-leading row that belongs to no table — its `---` row
missing, or a blank line or prose cutting it off from its header, and an unclosed code fence — the
one finding that blocks wherever it sits, because nothing below an unclosed fence can be checked.
**What it does not do:** it judges table *shape* only, never what a cell means; other findings
outside the region your edit touched are printed but never blocked, so you don't inherit a block for
debt you didn't write; a table indented four spaces (inside a list item) or one inside a blockquote
is skipped in silence; and a file it can't read is left unchecked rather than guessed at.

## The pipeline

Teach it your repo once. `/do-project-setup` reads the project and writes a profile into
`docs/basics/` — **lite tier** (8 core docs, the rest generated lazily when first needed) for teams
that want to ship this week, **full** (all 20) when the org wants the whole contract up front —
architecture, stack, domain model, API map, environment and the full-stack run recipe, conventions,
design tokens, the tech-debt register. Every later skill grounds in those files instead of
re-scanning and re-guessing each session. On an empty repo it flips modes and decides the stack
*with* you, one gate per decision.

Then, per feature:

| | | |
|---|---|---|
| **Groom** | `/do-grooming` | PRD/BRD → requirements doc, one approval per section. The shared hub is reviewed by fresh eyes and the repo's own contract checks before any platform spoke starts, so spokes don't discover its errors one at a time. Every criterion, case or decision a spoke adds names the hub sentence that requires it — anything else is asked as a scope question whose default is *not in this feature* — and each gate shows how much the spoke grew since it was last approved. Variants: `/do-tech-debt-grooming` for behavior-preserving work, `/do-issue-grooming` which audits the whole issue *class* across the project rather than the symptom you hit, `/do-foundation-grooming` for a new project's scaffold |
| **Plan** | `/do-planning` | Small independently reviewable stages, split by the layers your repo actually has — contract → domain → data → presentation, or just UI vs data-integration; it won't impose layering it doesn't find. UI splits again by section |
| **Build** | `/do-development` | One stage at a time, test-first. Each diff is audited by a fresh-eyes reviewer holding your profile docs but not the reasoning that produced the code — then it stops for you. Which criterion each stage proves is checked by a script (`scripts/check-coverage.js`), not by rounds of reading, and a round whose only findings are bookkeeping closes on that script going green |
| **Test** | `/do-testing` | API · UI · integration · E2E · boot-and-smoke, every check traced to an acceptance criterion, and the tests themselves reviewed by fresh eyes before coverage is reported. Verify-only: it reports every bug and fixes none |
| **Fix** | `/do-fixing` | The bugs you triaged, one at a time, reproduce-first, root cause not symptom |

If you track work in Jira or GitHub Issues, `/do-slicing` and `/do-uploading` turn an approved
requirements doc into a story-pointed task list and create it sample-first in small batches (tracker
chosen once, at setup). Skip both otherwise — nothing downstream depends on them.

## Auto-run: build → test → fix without stopping

Once the requirements and plan are approved, every decision is already yours — what's left is
execution. Opt in explicitly:

```
/do-development run in auto mode until re-test is green
```

and the **build → test → fix → re-test chain runs end-to-end**: each stage builds test-first, gets
its fresh-eyes review and design-parity check, then its checkpoint lands as a **report** stamped
`auto` instead of a question — straight into testing (environment boots and seeds itself; every test
case recorded then run), the bug report flows into fixing (**all bugs, severity order, blockers
first**), and back to re-test until green. Commits happen per stage and per fix, as always.

**Questions answer themselves with the recommended option** — which is always the
quality/world-standard one, never the cheapest; for a question of scope (*should this feature also
do X?*) it is the hub's boundary, so an unattended run never widens the feature — and every such
decision is written where it lives (`decided: auto ★<option>`) **and** listed under **"Decisions
taken for you"** at the top of the final report, for you to ratify after the run. Reject one and it
re-gates as a named follow-up. Prefer questions to stop the run? Say `auto-run, ask on decisions`.

The opt-in is written to `.alpha-sdlc/auto-run.json` (git-ignored), so it holds for the whole chain
— a later *"pilih (a)"* doesn't cancel it — and a `Stop` hook refuses to end the turn while that
file says `running`. A stage report is not a stop, and a reviewer runs in the foreground instead of
parking the turn. The chain ends only by writing `halted` (with its reason) or `done` into that
file — and `done` is refused while `scripts/check-feature-done.js` reads a blocked Boot & Smoke, an
uncovered AC or an unclosed bug in the test plan, the same check a feature's profile reconcile waits
on; a stop attempted with no tool run since the last push is let through, so a stuck run surfaces
instead of looping.

Only five things halt the chain, because nothing can be decided: **verification tooling that fails**
(a browser/emulator that won't boot is reported with its fix, never skipped), **an input that
doesn't exist** (a design, test account, or seed access never provided), **external writes** (git
push, Jira — those always ask), **a fix that has failed three times** (the design is wrong, not the
patch — it stops and asks), and **a change the hub would need** (a hub edit re-stales every
platform's spoke, so it goes back to grooming instead). Every verifier runs at full strength either
way — what you trade is review-per-diff, not checks.

Auto-run never applies to project setup, grooming, or planning — those phases *decide*, so their
gates always block; asking for auto there gets a polite one-line refusal. And an org can switch the
whole mode off: **Org settings → Auto-run permitted: no** (regulated change management) makes every
auto-run request politely declined, opt-in or not.

## Parallel work: behind the gate, never past it

Gates stay one at a time. What runs in parallel is the AI work the next gate would otherwise wait
for, so you spend less time watching it think:

- **Platforms in parallel sessions.** Once the hub's API contract is approved, open one terminal per
  platform — `/do-grooming` a spoke, `/do-planning`, `/do-development`, `/do-testing`, `/do-fixing`
  — and run them at the same time. They share the contract, not each other's work. Each session
  owns its own spoke, plan, test plan and code. Shared docs (the hub, `docs/basics/`) change only by
  a targeted edit that is committed at once, commits name their paths (never `git add -A`), and
  only one session boots the full stack at a time.
- **Setup scans by area at once** — up to four read-only subagents, one per platform, module,
  database or CI/CD area — and drafts the next *factual* profile doc while you review the current
  one.
- **Grooming gathers the next section's code facts while you review this one**, and after a hub
  fix it re-reviews every spoke at once.

Subagents only read and report; only the main agent writes what a gate approved. Anything prepared
ahead is redone if your decision at the current gate changed what it was built on, and nothing that
is a decision is ever drafted ahead of the decision before it.

## Adopting incrementally

You don't have to swallow the whole pipeline on day one. A working path: **setup (lite) + grooming**
first — the profile and requirements docs pay for themselves immediately; add **planning +
development** when you trust the gates; **testing + fixing** complete the loop; **auto-run** last,
once the gated runs have earned it. Missing-prerequisite stops accept an explicit "proceed anyway" —
the gap is named and recorded, so partial adoption never fakes safety — except verification gates
(parity, boot-and-smoke, tests), which either ran or the work isn't done. Org-wide knobs (tier,
tracker, auto-run permitted, comment allowlist, plain-layer language) live in one place: the
profile's **Org settings**, decided at setup.

## Models and effort

The phases run on **your session's model** — the plugin pins none of them. A skill's `model` field
holds for one turn only, so on a skill that stops at a gate every section it drafted after your
first approval would run on your model anyway, and the pin would only claim otherwise. Pick per
phase with `/model` and `/effort`; the recommendation:

| Phase | `/model` | `/effort` | Why |
|---|---|---|---|
| Setup | `opus` greenfield · `sonnet` existing repo | `high` | Greenfield decides the stack; an existing repo is mostly read and described |
| Grooming (all four) · Planning | `opus` | `high` | These phases decide — a wrong call here costs every phase after it |
| Development · Testing | `sonnet` | `high` | Executes a plan already decided and approved |
| Fixing | `opus` | `high` | Root cause across callers, not the one path the report named |
| Slicing | `sonnet` | `medium` | Structured decomposition of an approved TRD |
| Uploading | `haiku` | `low` | Mechanical tracker calls, sample-first |

The one pinned piece is the **fresh-eyes reviewer** (`agents/sdlc-reviewer.md` — **Opus, high
effort**, no Write/Edit tools) behind the conformance review in development and fixing, the test
review in testing, and the hub-alignment review in grooming. It runs start-to-finish in one shot,
so the pin holds, and a review is the last check before your gate. Fixes made on its findings go
back to it — round after round until one is clean, and a count that stops falling for three rounds
stops the loop and comes to you. An org that needs another model sets
`CLAUDE_CODE_SUBAGENT_MODEL=<model>` **with** `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` — without the
force flag the agent's own pin wins, and with it every subagent in the session moves, not only this
one.

The plain-language check on step summaries is a `Stop` prompt hook judged by **Opus**
(`claude-opus-5-5`, set in `hooks/hooks.json`). The evaluator writes its verdict before its reason,
so a weaker judge decides first and reasons after. Haiku misread where the engineer detail began.
Sonnet passed a word-for-word translation while its own reason called it a failure. The judge adds
roughly ten seconds to the end of each step summary; ordinary chat is waved through. A rejected
summary is rewritten once, and in the terminal you see both versions, the rewrite last. If the
judge's model is unavailable, the hook fails open and the summary is shown unchecked.

## Install

Needs **`node` on your PATH** — the hooks are Node scripts using built-ins only, so there's no `npm
install` and nothing is fetched. They carry a golden-case suite — `node tests/hooks.test.js`, same
built-ins, no install — because a validator that quietly stops *detecting* degrades to exit 0 and
stays invisible forever; a test fails instead. No Node? Everything still installs; the hooks fail
open and simply don't enforce.

```
/plugin marketplace add rizkyalfauji11/alpha-sdlc
/plugin install alpha-sdlc@alpha
```

## First run

```
/do-project-setup     # once per repo — writes docs/basics/, one doc at a time
/do-grooming          # point it at a PRD, a ticket, or a paragraph you typed
```

Expect the first one to take a while and to ask about your architecture, your conventions, and
anything the code doesn't state — it's writing the files every other skill reads, and a wrong fact
in there propagates. You can stop after any gate and pick it up days later.

## Design parity, not "looks close"

Coding from a screenshot and declaring it done is how built UI drifts from the design. Here the
build doesn't pass until the comparison does:

- **It renders and diffs.** When a UI stage goes green it boots the screen **where you can watch
  it** — headed browser or emulator/simulator window, headless only when there's no display —
  screenshots it, and compares against the design two ways — a structured visual checklist and a
  pixel diff — then fixes and re-renders until both pass. Findings name the value, not a vibe:
  *measured 12, `space.lg` is 16*, and a wrong token counts as a defect even when the pixel diff is
  inside tolerance. Playwright for web, real emulator and simulator for Android and iOS; it asks
  before installing a driver or booting a device.
- **The whole screen, not the viewport.** Taller than the fold means the full scroll extent is
  captured (`fullPage`, or scroll-and-stitch on mobile) and compared section by section.
- **Every state and every extreme, not just the happy one.** Loading, empty, error, offline, role
  and flag variants each compared against **their own cropped design** — because a full-screen
  mockup shows one state and would pass a screen whose other four were never built — plus the
  content extremes a mockup never shows: longest realistic text, largest font scale, smallest
  screen.
- **When it can't measure, it stops.** A browser driver that won't launch or an emulator that won't
  boot is a blocker it reports with the fix, not a stage it waves through. Tolerance follows
  platform norms rather than forcing pixel-identity where iOS and Android disagree, and a deliberate
  platform deviation is flagged for you instead of "corrected" into a bug. Every iteration's
  screenshot and diff overlay stays on disk, gitignored, as the trail.

## What it writes into your repo

```
docs/basics/                  the project profile, commit-stamped
docs/development/<feature>/
  TRD.md                      requirements — the shared contract
  TRD-<platform>.md           the per-platform spoke — numbered AC, links
                              the hub above and is reviewed against it
  contract/                   the approved OpenAPI delta — machine-checkable,
                              merged into the project spec at build time
  widget-spec/<screen>.md     per-screen element contract — Test IDs, types,
                              style bindings
  section-slicing/<screen>.md per-screen regions & cases — what shows when,
                              with a design crop per case
  task-list.md                story-pointed tasks — written by /do-slicing,
                              tracker keys written back by /do-uploading
  plan-<platform>.md          staged plan, each stage with its checkpoint
  design/                     the designs it builds and diffs against
  test-plan-<platform>.md     acceptance criterion → test → level → status
```

Markdown, reviewable in a pull request. The work outlives the session: resume days later, or hand
the feature to someone else with the reasoning already written down.

## Updating

Third-party marketplaces don't auto-update by default:

```
/plugin marketplace update alpha
/reload-plugins
```

Prefer automatic: `/plugin` → *Marketplaces* → `alpha` → **Enable auto-update**. Rolling it out to a
team? Add the marketplace with `"autoUpdate": true` under `extraKnownMarketplaces` in your project's
`.claude/settings.json`, and everyone stays current.

## Roadmap

A stand-alone regression/QA track that black-box tests the built app, then deployment and
monitoring.

Working on the plugin itself: `claude --plugin-dir /path/to/alpha-sdlc` loads it without the
marketplace, `claude plugin validate .` checks the manifests.
