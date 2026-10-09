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

**Leave debt in the code it touched.** A change writes no cut corner of its own — no duplicate,
workaround, skipped case or hard-coded value — unless you pick that cut at a gate, and the
recommended option is never the cut, so auto-run never takes one. Debt already in a file the change
edits is the change's to pay, behaviour-preserving behind a characterization test: planning lists
those register rows and asks about each one, recommending to pay it, and only a payment that would
change behaviour or a contract, or reach beyond the edited files, is recommended for later. A
script (`scripts/debt-balance.js`) puts the rows born, paid and still open in those files into
every review, and a feature is not done while one of them is open and undecided.

One thing it does *to* your code: source ships with **zero comments** — configurable where law or
libraries demand it: setup can allow **license headers** and **public-API doc-comments** (an org
setting the hook reads from the edited file's own profile); everything else stays banned, and a
blocked write lists every comment it found, by line. A rename, an extracted function, or a named
constant does that job instead, and the *why* that can't fit in a name goes in the commit message,
where it can't rot beside code that changed.

None of that is prompt-deep. Hooks block the write when a decision names no rung, a template
placeholder survives in a requirements doc or plan, a secret lands in a doc, a comment lands in
code, or a markdown table the next phase has to read stops parsing — a prompt can be forgotten
mid-session, an exit code can't. They act inside the projects the plugin manages — under a
directory holding `docs/basics/` or `.alpha-sdlc/` — so a scratch, temp or `~/.claude` file is never
blocked, while the secrets check covers every `docs/**.md`. And because those hooks watch the Edit
and Write tools, a doc written through Bash — a `sed -i`, a heredoc, an inline script — is blocked
and sent back through them; replayed against 7,688 real Bash calls from one project, that closed
over 3,000 doc writes the hooks had never seen. The same holds for how it talks to you: a
step summary whose plain layer a non-engineer couldn't follow — no bottom line, code names or bare
`file:line` pointers in the explanation, an English quote or a word-for-word translation in a
summary written in your language — is sent back for one rewrite before it counts as presented. Every
summary ends with what happens next and who does it — after a review too — so no report leaves you
guessing whether something waits on you. In Bahasa Indonesia the plain layer also follows
[`plain-language/id.md`](./plain-language/id.md), a fixed glossary with real before/after examples,
injected into every session whose Org settings pick that language. The whole opinion is one file:
[`principles.md`](./principles.md). If you disagree with it, you'll disagree with the plugin. Each
skill reads only the part that governs it — `rules/<bundle>.md`, generated from that one file by
`scripts/build-rules.js` — so slicing a requirements doc into tasks never loads the review,
auto-run or UI rules.

That last one, `hooks/validate-doc-tables.js`, checks every `.md` write in those projects — the
plugin's own templates included, through its self-check test —
rebuilding the post-edit document from disk first, so a one-row `Edit` is still judged against the
real header. It blocks on four shapes: a header whose cell count differs from its `---` row (GFM
then renders the whole block as literal pipe text), a body row with more or fewer cells than its
header (extra cells are DROPPED, missing ones render EMPTY — which is how a *decided* item shows as
an open one), a `|`-leading row that belongs to no table — its `---` row missing, or a blank line or
prose cutting it off from its header, and an unclosed code fence — the one finding that blocks
wherever it sits, because nothing below an unclosed fence can be checked. **What it does not do:**
it judges table *shape* only, never what a cell means; other findings outside the region your edit
touched are printed but never blocked, so you don't inherit a block for debt you didn't write; a
table indented four spaces (inside a list item) or one inside a blockquote is skipped in silence;
and a file it can't read is left unchecked rather than guessed at.

The same hook keeps the project's documents stating what is true now, not how they got there, so
a person reads them quickly and every later session reads fewer tokens. A profile doc's head (in
`docs/basics/`, the lines above its first section) is its title, one stamp line and its
description; an edit that touches a head still carrying more than one date, a stamp line grown past
200 characters or struck-through text is blocked until the history is folded out (a fact the body
lacks moves into its section, the rest goes; the commit message says what changed). In every
section of a profile doc or a feature doc (`docs/development/`: TRD, spokes, plan, test plan,
widget specs, slicing docs), a line you edit is blocked when it carries a dated change-history note
— a date beside *corrected*, *amended*, *withdrawn*, *retired*, *added*, *until* and the like, or an
*+ <feature> stage · <date>* entry — and, in `docs/basics/`, when it strikes text through. The
stamps and statuses the pipeline writes and reads pass: `_Approved: <date> · <commit>_`, `Status:
done <date>`, `Checkpoint verdict`, `reviewed <date> · hub rev`, a `decided:` outcome, a triage
cell, a retired AC's struck row. The tech-debt register deletes a paid row; its **Next ID** line
keeps IDs from reuse. Edits elsewhere in a doc are never blocked by history they didn't write, and
`/do-project-setup` refresh mode treats a doc whose head logs its history as stale, so one refresh
cleans a whole profile written before 0.35.0.

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
| **Build** | `/do-development` | One stage at a time, test-first. Each diff is audited by a fresh-eyes reviewer holding your profile docs but not the reasoning that produced the code — then it stops for you. Which criterion each stage proves is checked by a script (`scripts/check-coverage.js`), not by rounds of reading, and the review aims to be **one round**: every finding is reported with the command that will prove its fix landed, so the stage closes on those outputs instead of handing the fixes back to a reviewer. What a change makes obsolete — the old path, its tests, its profile rows — goes with it (`scripts/find-orphans.js`); debt in the files it edits — dead code it didn't cause included — is paid in the same change or kept by your decision (`scripts/debt-balance.js`) |
| **Test** | `/do-testing` | API · UI · integration · E2E · boot-and-smoke, every check traced to an acceptance criterion — a script (`scripts/check-coverage.js --test-plan`) confirms every criterion is in the test plan and every test it names exists, and, given the runner's report, that every recorded status matches it — and the tests themselves reviewed by fresh eyes before coverage is reported. Verify-only: it reports every bug and fixes none |
| **Fix** | `/do-fixing` | The bugs you triaged, one at a time, reproduce-first, root cause not symptom |

### Proof costs something, so it is chosen, not assumed

Every stage names the rung of the **verification ladder** it stops at — compiler, unit test,
instrumented test on the runner your repo already has, or a run a person watches — and from the
instrumented rung up it must say **what the rung below cannot see**. The argument is owed for
climbing, never for declining: a plan that reasons carefully each time it *skips* an expensive
check and orders one in silence only ratchets upward, which is how a nineteen-stage feature ends up
scheduling thirty device sessions its design never asked for.

Review is sized the same way. The rules and the profile are the same size whether a diff is four
lines or four hundred, so a reviewer is handed **one packet file**, built by
`scripts/review-packet.js`: a **charter distilled once per feature** instead of the profile docs
again, only the principles sections the diff **can** break — the withheld ones listed with the test
that withheld them — and the output of the mechanical checks, run once and marked settled. How many
reviewers read it is measured from the diff, never asserted by its author
(`scripts/review-tier.js`): a stage that cannot change reachable production behaviour skips the
reviewer entirely; a small one — at most 150 production lines, no contract, schema, migration,
auth, token, PII or UI file — gets one reviewer covering every dimension; anything else, or
anything the script is unsure of, gets the full panel. Reachability decides the first band, never
appearance: deleting a call site is never in it. Every round ends with `scripts/review-gaps.js`,
which names the changed file no report covered, the finding with no closing proof and the checklist
item nobody checked. Test and grooming reviews are never tiered.

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
— a later *"pilih (a)"* doesn't cancel it — and each decision taken for you is appended to it as it
happens, so the final report is built from the file, not from memory. A `Stop` hook refuses to end
the turn while that file says `running`. A stage report is not a stop, and a reviewer runs in the
foreground instead of parking the turn. The chain ends only by writing `halted` (with its reason)
or `done` into that file — and `done` is refused while `scripts/check-feature-done.js` reads a
blocked Boot & Smoke, an uncovered AC or an unclosed bug in the test plan, or a debt row still
`open` in the feature's files — the same check a feature's profile reconcile waits on; a stop attempted with no tool run since the last push in the
same session is let through, so a stuck run surfaces instead of looping, while the first stop after
a `/clear` is pushed on. Want a fresh session per stage instead of one long one? Ask for it: each
closed stage or bug then hands off, and *lanjut* in the new session picks the chain up again — see
[Working in fresh sessions](#working-in-fresh-sessions).

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
- **Setup scans by area at once** — up to four read-only subagents on Sonnet, one per platform,
  module, database or CI/CD area — and drafts the next *factual* profile doc while you review the
  current one. The scan is recorded with the commit and working tree it read
  (`scripts/scan-record.js`), so a later run re-scans only the areas that changed since.
- **Grooming gathers the next section's code facts while you review this one**, and after a hub
  fix it re-reviews each spoke against what the fix moved, one spoke at a time.
- **A review round launches at once** — every dimension reviewer of the round in one message, in
  the foreground, at most three at a time. Reviews of different stages, bugs or spokes never share
  a message.

Subagents only read and report; only the main agent writes what a gate approved. Anything prepared
ahead is redone if your decision at the current gate changed what it was built on, and nothing that
is a decision is ever drafted ahead of the decision before it.

## Working in fresh sessions

**The session is disposable — the files are the state.** Every gate lands in its document before it
counts, so a new session picks up where the last one stopped. A long session is the expensive way
to run: every call re-reads the whole context, and over two months of real projects, 85% of
interactive skill runs started inside a running session that already carried a median 616K
tokens. So each unit of work ends on a **boundary** — a closed stage, a closed bug, a bug report
with its triage, a stamped plan stage, the grooming skeleton, the hub review, each spoke's
alignment, each closed screen, a stamped tracker part or verified batch, and every phase end. There
the skill first writes everything still open in chat into its document, then
`.alpha-sdlc/next/<feature>--<platform>.json` — the skill, the unit and the commit it stood on —
plus a handoff note when only the session knows something (a running stack's ports, a tooling
consent), and its *Next* paragraph offers the fresh session: `/clear`, then *lanjut*. A boundary
never falls mid-unit, between a review and its fixes, while a background agent runs, or on an
unstamped draft. An auto-run chain asked for a fresh session per unit hands off the same way.

**Resuming.** After `/clear`, at startup or on a resume, a `SessionStart` hook finds the ready
next-files — written in the last 14 days, on a commit the current history still contains — and
tells the new session: when your next message continues the work, invoke that skill on that unit
and read the handoff first; otherwise do what you ask. From grooming to fixing, the skill's resume
block starts with `scripts/next-step.js <feature-dir> [platform]`, which reads the documents and git
and prints the next unit, any STOP that applies and a short list of files to re-read — exit 0, 1
for a STOP, 2 for a format it can't read, and then it lists the files instead of guessing; setup
and the tracker skills read their own record and stamps. The skill marks the next-file consumed,
states what it understood in one line, and never re-runs Gate 0 or a stamped step. A `Stop` hook
keeps the last step summary in `.alpha-sdlc/handoff/last-stop/` of the directory the session
started in (never inside `docs/`), and the new session is pointed to
it, so an "approve" or a "pilih B" typed right after `/clear` still has its referent.

**Nudged, or enforced.** The Org setting `sessionBoundaries` decides what
`hooks/boundary-guard.js` does once a session carries more than `sessionBoundaryTokens` (default
200000) and either a next-file is ready or the cache went cold after an idle hour — once per
trigger:

- **`advise`** (default) — the assistant tells you in one line that a fresh session continues from
  the files at a fraction of the cost, then does what you asked.
- **`enforce`** — your prompt is held once with that sentence: send it again to stay, or add *stay*
  / *tetap* to switch the check off for the session. An alpha-sdlc skill started past the threshold
  is refused once, with the instruction to write the next-file and handoff and ask you to `/clear` —
  never while auto-run is running.
- **`off`** — the guard stays silent.

In a workspace parent holding several repos, the strictest setting and the lowest threshold win.
The guard keeps its own state in `${CLAUDE_PLUGIN_DATA:-$TMPDIR/alpha-sdlc}/boundary-guard/`.

**A compaction drops no gate.** After a compaction Claude Code re-attaches only the first 20,000
characters of each skill in use, so every `SKILL.md` keeps its body within 19,000 with every gate
inside it — `scripts/check-size-budgets.js` fails one that doesn't. A hook then re-injects the
rules digest, the active skill's *Gates* section word for word, and a line to re-read that skill's
rules and the reference file of the current step before the next gate. Session start stays small
too: outside an SDLC project the plugin's hooks inject nothing, and inside one — a workspace parent
counts — a pointer of about 330 characters, plus the language guide when your Org settings name
one.

## Adopting incrementally

You don't have to swallow the whole pipeline on day one. A working path: **setup (lite) + grooming**
first — the profile and requirements docs pay for themselves immediately; add **planning +
development** when you trust the gates; **testing + fixing** complete the loop; **auto-run** last,
once the gated runs have earned it. Missing-prerequisite stops accept an explicit "proceed anyway" —
the gap is named and recorded, so partial adoption never fakes safety — except verification gates
(parity, boot-and-smoke, tests), which either ran or the work isn't done. Org-wide knobs (tier,
tracker, auto-run permitted, comment allowlist, plain-layer language, session boundaries) live in
one place: the profile's **Org settings**, decided at setup.

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

**Stay on the current generation, and set effort yourself.** `/model opus` and `/model sonnet`
follow the current models; never pin an old one such as `claude-opus-5`. A long gated phase is
mostly cache reads, and the current Opus and Sonnet read the cache at $0.20 per million tokens
against $0.50 on Opus 5 — a bigger difference than the choice between Opus and Sonnet. The current
Opus (`claude-opus-5-5`) defaults to **medium** effort at the API, below the table's `high`, so set
`/effort` explicitly instead of trusting a default. Switch at the start of a session: the cache
belongs to one model, so a switch mid-session writes the whole context again.

The pinned pieces are the **fresh-eyes reviewers** — no Write/Edit tools, each handed one packet
file instead of the conversation — behind the conformance review in development and fixing, the
test review in testing, and the hub and hub-alignment reviews in grooming. Each runs
start-to-finish in one shot, so its pin holds, and a review is the last check before your gate:

| Agent | Model · effort | Runs |
|---|---|---|
| `sdlc-reviewer` | Opus · `high` | Every review dimension, and alone on the light tier |
| `sdlc-reviewer-deep` | Opus · `max` | Only hub-review consistency and fix quality |
| `sdlc-reviewer-critic` | Opus · `medium`, no Bash | The completeness critic of a full round |

Reviewers run at high effort, not max, **because max bought re-reading, not findings**: on this
plugin's own reviews a round at max cost about three times a round at high, a reviewer at max ran
a median 16 minutes against under 5, and the difference went to re-reading the rulebook, the
profile and the sources. Max stays on the two dimensions where judgment-heavy, needs-eyes findings
concentrate — the grooming hub review's consistency and `do-fixing`'s fix quality. The round is
still meant to be the only one: each finding is reported with the literal command whose output
shows its fix landed, the dimensions declare which changed file each of them owned, and
`review-gaps.js` — with the critic on the full tier, reading the reports rather than the code —
names what nobody looked at before anything is fixed. The stage then closes on those command
outputs. A second round is owed only when a reviewer says in advance that a finding's closure **no
command can show**, when a fix adds product behaviour, or when a named proof will not go green —
and a count that stops falling for three rounds stops the loop and comes to you. Nothing in review
runs on Sonnet: the light tier is one Opus reviewer at high effort. The plugin itself picks Sonnet
only for setup's read-only scans and its drafts of factual profile docs — what is read from code,
not decided; every decision and every gate stays on your session's model. An org that needs another
model sets `CLAUDE_CODE_SUBAGENT_MODEL=<model>` **with** `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` —
without the force flag the agents' own pins win, and with it every subagent in the session moves,
not only these.

### The plain-language judge

The check on step summaries is a `Stop` **command** hook, `hooks/stop-judge.js`. It cuts the summary
itself — the header, the plain layer and the closing *Next* paragraph, leaving out the engineer
details — and sends that, with the language guide when the plain layer is in the guide's language,
to an isolated `claude -p --safe-mode --tools ""` call on **Opus** (`claude-opus-5-5`, effort
`medium`) whose system prompt is the judge's rules, `hooks/stop-judge-rules.md`. When it finds no
engineer-details label, or the cut leaves a plain layer under 200 characters, it sends the whole
summary and tells the judge to find where the details begin. Opus stays the default
because weaker judges failed the earlier evals: Haiku misread where the engineer detail began, and
Sonnet passed a word-for-word translation its own reason called a failure. The judge writes one line
per rule before its verdict, so it reasons before it rules. Every stop inside an SDLC project is
judged, plain chat included (its rule 0 passes it). No call is made for a stop that answers a block
(the rewrite itself, or an auto-run report after a push), an empty message, or a message without
step-summary markers outside an SDLC project. On the 13 cases in `tests/judge-cases/` the default
judge matched 12 on its first run, and the one miss matched in 3 of 3 re-runs; a judged stop took
8.3 s at the median and 14.3 s at p90, and cost about 4.8k input-side tokens — two thirds of them
cache reads — and 0.7k output. The prompt hook it replaces forwarded the whole conversation, up to
half the evaluator's window, on every stop; the plugin now has no prompt or agent hooks, and a test
keeps it that way.

A rejected summary is rewritten once. In the terminal you get the header, the plain layer and
*Next* again, reworded where the judge quoted, with one line saying the engineer details above are
unchanged; a headless run gets the whole summary again. The hook **fails open**: a timeout, an
error or an answer it can't parse lets the summary through unchecked, a FAIL that quotes no sentence
counts as a pass, and a `claude` it cannot find or run, or one that rejects an option, shows one
notice per session that the judge is off and why. It appends one line per stop to
`judge-log.jsonl` under `$CLAUDE_PLUGIN_DATA` (else `$TMPDIR/alpha-sdlc`) — verdict, failed rules,
latency and token usage, never message text — rotating to `judge-log.1.jsonl` at 5 MB; the
once-per-session notices are kept in `judge-notices.json` beside it.

| Variable | Default | Effect |
|---|---|---|
| `ALPHA_JUDGE` | on | `off`, `0`, `false` or `no` turns the judge off |
| `ALPHA_JUDGE_MODEL` | `claude-opus-5-5` | The judge's model; it must take `--effort` |
| `ALPHA_JUDGE_EFFORT` | `medium` | The judge's effort |
| `ALPHA_JUDGE_CLAUDE_BIN` | `claude` | The CLI to call when `claude` is not on `PATH` |
| `ALPHA_JUDGE_TIMEOUT_MS` | `60000` | The nested call's limit, at most 85000 |

`claude-haiku-4-5` does not take `--effort` — it thinks on a fixed budget and times out on failing
summaries. `ALPHA_JUDGE_CLAUDE_BIN` is for `claude.cmd` on Windows and for desktop or IDE installs;
the hook's own timeout in `hooks/hooks.json` is 90 s.

## Install

Needs **`node` on your PATH** — the hooks are Node scripts using built-ins only, so there's no `npm
install` and nothing is fetched. They carry a golden-case suite — `node tests/hooks.test.js`, same
built-ins, no install — because a validator that quietly stops *detecting* degrades to exit 0 and
stays invisible forever; a test fails instead. No Node? Everything still installs; the hooks fail
open and simply don't enforce. The plain-language judge also calls the `claude` CLI — set
`ALPHA_JUDGE_CLAUDE_BIN` where it isn't on your `PATH`.

```
/plugin marketplace add rizkyalfauji11/alpha-sdlc
/plugin install alpha-sdlc@alpha
```

### Recommended settings

Three user settings and a statusline keep a long session cheap; the plugin cannot set them for you.
Put them in your user settings, `~/.claude/settings.json` — and in each `CLAUDE_CONFIG_DIR` you
use:

```json
{
  "autoCompactWindow": 500000,
  "promptSuggestionEnabled": false,
  "awaySummaryEnabled": false
}
```

- **`autoCompactWindow`** — on a 1M-context model a session otherwise compacts near 967K tokens,
  and every call re-reads all of it. At 500000 it compacts before it gets that expensive, and a
  compaction loses no gate here (see *A compaction drops no gate* above).
- **`promptSuggestionEnabled: false`** — each prompt suggestion is one more request on your
  session's model after every response, reading the whole context.
- **`awaySummaryEnabled: false`** — so is the recap shown when you come back after five minutes
  away.
- **A statusline that shows `rate_limits`** — on a claude.ai plan the statusline input carries
  `rate_limits.five_hour.used_percentage` and `rate_limits.seven_day.used_percentage`, the meter
  your limits are counted on. Show them, and a long session's cost is visible before it hits one.

### Headless and SDK runs

A skill loads its binding rules by reading `rules/<bundle>.md` under the plugin root, outside your
project. A headless run — `claude -p`, the Agent SDK, an eval harness — denies that read unless it
is allowed, and the skill then runs without its rules: it says so in its step report, but rules
never loaded cannot bind. Start those runs with `--add-dir <plugin root>`, or give them a `Read`
allow rule for the plugin root. A run nobody watches also denies the plugin's own scripts, and a
gate that needs one (the refresh's `check-feature-done.js`) stops there: allow
`Bash(node <plugin root>/*)` as well.

A consumer that passes `/do-project-setup` a setup-run schema with `onlyWhatChanged` gets a whole
first report and, after it, reports of only what changed: the document rows that moved, the open
questions and the gate. The consumer keeps every row a report does not name. A report ends the
turn under a schema, so the skill reports only when it asks something or the setup is finished;
progress between those moments is plain text.

### The mobile driver loads only where there is a mobile app

The plugin declares one MCP server, `mobile-mcp`, which drives a real Android or iOS app — install,
launch, read the accessibility tree, tap, swipe, screenshot, pull logs and crash reports. It is what
makes the Boot & Smoke gate executable on a device instead of aspirational.

It does **not** start everywhere. `scripts/mobile-mcp-gate.js` runs first, looks at the project it
was opened in, and hands over to `npx @mobilenext/mobile-mcp@1.0.5` only when it finds an
`AndroidManifest.xml`, a `pubspec.yaml` that declares `flutter:`, an `.xcodeproj`/`.xcworkspace`, or
a `Podfile` within three directory levels — skipping `node_modules`, `build`, `Pods` and the like.
In every other repo it stays dormant: it answers the protocol, offers zero tools, and fetches
nothing. Measured on this machine, the dormant path costs 43–85 ms at session start.

Override it when the guess is wrong: `ALPHA_SDLC_MOBILE=1` forces the driver on, `=0` forces it off.
You can also toggle the server in `/mcp` without uninstalling the plugin.

So the "nothing is fetched" above holds for the hooks, and for every repo the gate finds no mobile
app in. A mobile repo fetches the driver on first use, once per version.

## First run

```
/do-project-setup     # once per repo — writes docs/basics/, one doc at a time
/do-grooming          # point it at a PRD, a ticket, or a paragraph you typed
```

Expect the first one to take a while and to ask about your architecture, your conventions, and
anything the code doesn't state — it's writing the files every other skill reads, and a wrong fact
in there propagates. You can stop after any gate and pick it up days later, in a fresh session,
from the files.

## Design parity, not "looks close"

Coding from a screenshot and declaring it done is how built UI drifts from the design. Here the
build doesn't pass until the comparison does:

- **It renders and diffs.** When a UI stage goes green it boots the screen **where you can watch
  it** — headed browser or emulator/simulator window, headless only when there's no display —
  screenshots it, and compares against the design two ways — a structured visual checklist and a
  pixel diff — then fixes and re-renders until both pass. Findings name the value, not a vibe:
  *measured 12, `space.lg` is 16*, and a wrong token counts as a defect even when the pixel diff is
  inside tolerance. Playwright for web, and on a real emulator and simulator for Android and iOS —
  through whatever single-API device driver your repo records, so the run leaves a video and a
  report instead of a claim; it asks before installing a driver or booting a device.
- **The whole screen, not the viewport.** Taller than the fold means the full scroll extent is
  captured (`fullPage`, or scroll-and-stitch on mobile) and compared section by section.
- **The layout between sections, measured.** Section crops prove each section's inside; they can't
  see a header sitting 30px low or rows 36px short. So the finished screen is rendered with the
  design's own content at the design frame's size, and the box of every Test ID is compared with
  the design's — position, size, padding inside its container, gap to its neighbour, column count
  — as numbers mapped to tokens (`scripts/compare-geometry.js`, boxes collected by
  `scripts/collect-boxes.mjs` from an HTML canvas or the running web app, or from the device's own
  UI dump on Android and iOS).
- **Every state and every extreme, not just the happy one.** Loading, empty, error, offline, role
  and flag variants each compared against **their own cropped design** — because a full-screen
  mockup shows one state and would pass a screen whose other four were never built — plus the
  content extremes a mockup never shows: longest realistic text, largest font scale, smallest
  screen.
- **When it can't measure, it stops.** A browser driver that won't launch or an emulator that won't
  boot is a blocker it reports with the fix, not a stage it waves through. Tolerance follows
  platform norms rather than forcing pixel-identity where iOS and Android disagree, and a deliberate
  platform deviation is flagged for you instead of "corrected" into a bug. Every iteration's
  screenshot and diff overlay stays on disk, gitignored, as the trail — and
  `scripts/check-parity-trail.js` refuses a parity claim whose capture has no diff overlay, or is
  older than a design that was re-groomed since.

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
  review-charter.md           what every stage's reviewer must hold,
                              distilled once from the profile
  design/                     the designs it builds and diffs against
  test-plan-<platform>.md     acceptance criterion → test → level → status
.alpha-sdlc/                  session state, git-ignored — next-files and
                              handoffs, review packets, the setup scan
                              record, the auto-run marker
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

From 0.37.0 the done gate also reads the tech-debt register. A feature planned before then has no
*Debt in the footprint* table in its plan, so its debt is measured and reported but never blocks
it; the gate binds every plan written from 0.37.0 on. Rows that name no file stay invisible to
`scripts/debt-balance.js` — name the files in each row's engineer half, as the register template
now asks.

## Roadmap

A stand-alone regression/QA track that black-box tests the built app, then deployment and
monitoring.

## Working on the plugin

`claude --plugin-dir /path/to/alpha-sdlc` loads it without the marketplace, and
`claude plugin validate .` checks the manifests. Before a change ships, each of these exits non-zero
on a failure:

```
node tests/hooks.test.js              # every hook and script suite — no live model call
node scripts/build-rules.js --check   # rules/*.md and the compact digest match principles.md
node scripts/check-size-budgets.js    # size-budgets.json: skill bodies ≤ 19,000 chars, gates inside
node scripts/rule-coverage.js         # every rule of origin/main kept, or signed off in the ledger
```

Edit `principles.md`, never `rules/`: `node scripts/build-rules.js` regenerates the bundles from it
and `rules/applicability.json`. A clause rewritten, merged or moved on purpose is signed off in
`tests/coverage-ledger/<area>.json` with the reason — the format is in that directory's README.
The judge has its own live check, `node tests/judge-eval.js --runs 3`: each case is one judge call
on your plan, so it runs only when you ask, never inside the suite.
