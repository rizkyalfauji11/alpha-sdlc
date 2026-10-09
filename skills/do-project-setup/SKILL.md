---
name: do-project-setup
description: Generate the project profile — the baseline "basics" docs (architecture, tech stack, database, environment, API map, security, CI/CD, assets, etc.) that grooming and every downstream skill ground in. Drafts the docs one at a time with your approval; has a refresh/reconcile mode to keep them current. Use to set up a project, bootstrap project docs, generate the project profile, or before the first grooming. **Also the FIRST step for a brand-new project**: on an empty repo it switches to greenfield mode and decides the stack (framework, architecture, structure, tooling) with the user, one gate per decision — then hands off to do-foundation-grooming for the scaffold. Triggers on "project setup", "generate project docs", "project profile", "set up the basics", "/do-project-setup", "onboard this repo", "start a new app", "new project from zero", "greenfield", "bootstrap the project".
---

You are generating the **project profile** — the baseline reference every other skill grounds in, so
grooming/planning/testing don't re-derive the same orientation each run. Output goes to
**`./docs/basics/`**. Run once per repo to bootstrap; re-run in **refresh mode** to keep it current.
**Empty repo? Switch to greenfield mode** — describing gives you 20 docs of `UNKNOWN`; deciding
gives the project a foundation to be built against. Everything else in this skill still applies.

**Read `../../rules/setup.md` in full now** (and `../../rules/ui.md` when the project has a client
platform — web, android or ios: design tokens; in greenfield, as soon as the platforms decision
names one) — these are this skill's binding rules,
generated from `principles.md`. After a compaction, re-read it and the reference file of your
current step before the next gate. If the read is denied (headless runs), say so in the step
report — rules never loaded cannot bind. Especially: **ground in real code (never fabricate — mark
anything you can't determine as `UNKNOWN — needs human input`, don't guess)**, draft +
human-approve, and never over-simplify.

**Auto-run/auto-decide NEVER applies in this skill** — this is a decision phase. If the user asks
for auto mode here, decline in one line ("this phase decides — gates apply; auto-run starts at
`do-development`") and proceed gated: every gate blocks as normal, nothing auto-decides.

Every gate you present: header `<development> · <phase> · <step> · ✅/⏸/⚠️`, then Bottom line (what
happened + what I need from you) → Why it matters (never omitted when a question is asked) →
Options ★ → Context (only where it adds something) → Details (for engineers) → Next as the last
paragraph (rules → *Present every step bottom line first*). The plain layer is in the org's
language and follows its guide in `../../plain-language/` when one exists (`id.md` for Bahasa
Indonesia) — at every gate, in every phase. When the consumer passes a setup-run schema
(`--json-schema`, a StructuredOutput tool), read `setup-run-schema.md` before the first report.

## Gates — modes and their gates

- **Every mode:** the record is read first — a recorded answer is stated, never re-asked; a
  different one is a reversal, named with both values and dates. One doc at a time: draft →
  present → approve / edit / skip → only then write it, stamped; a byte-identical regenerated doc
  is listed as unchanged, not gated.
- **Normal:** the Org settings block (profile tier first) → the applicable doc list, confirmed
  once → each doc's gate, in order.
- **Greenfield** (no real source): confirm the switch before deciding anything; then one gate per
  decision, 2–3 real options with one ★ — never a batch sheet, never an assumed default; never
  invent a fact a feature hasn't created; stamp `prescriptive (pre-code)`; hand off to
  `do-foundation-grooming`.
- **Refresh:** a feature's reconcile first needs `check-feature-done.js` exit 0 for every platform
  the feature built, else **STOP** — back to `do-testing` / `do-fixing`, never waived, not even on
  *proceed anyway*. Every refresh runs `find-orphans.js --registry`; migrations are offered one at
  a time.
- **`12-security-compliance.md`:** observed controls only; written only after an explicit human
  sign-off — the other docs carry on while it waits.

## Flow

1. **Record, scan, settings.**
   - **Read the record before you ask — every session, every time.** The first action of any run,
     bootstrap or refresh, is to read `docs/basics/.alpha-sdlc.json` and the `approved <date>`
     stamps already in `docs/basics/`. A subject recorded there is **stated, not re-asked**; a
     different answer is a **reversal** and is named as one, with both values and both dates,
     before anything is built on it (`principles.md` → *Ask, don't assume*). **Each subject has
     one key, and it does not change between sessions, callers or plugin versions:**
     `profile-tier` · `plain-language` · `tracker` · `auto-run-permitted` · `comment-allowlist` ·
     `session-boundaries` · `doc-applicability` and its `doc-applicability-<nn>-<name>` members ·
     `repo-access` · and each document's own file stem (`01-overview`, `07-database`). Inventing a
     fresh key for a subject that already has one makes two askings indistinguishable to
     everything downstream — including to the person, who sees new wording and answers it as a new
     question. In the same batch, run
     `node ../../scripts/scan-record.js --check <repo>/.alpha-sdlc/scan.md <repo>`.
   - **Refresh mode** (the profile exists, or the user asks). **A feature's reconcile waits for the
     feature to be done.** When refresh runs as the end of a feature's SDLC (after `do-testing`),
     first run `node ../../scripts/check-feature-done.js docs/development/<feature-name>
     <platform>` for every platform the feature built. Anything but exit 0 — Boot & Smoke not
     passed, an AC not covered and passing, a bug not closed — is a **STOP**: report the reasons
     and send the feature back to `do-testing` / `do-fixing`. A verification gate is never waived,
     so an explicit *proceed anyway* does not open this one. A refresh that is not a feature's
     reconcile (the profile has simply aged) runs as before. Then read `refresh.md` and follow it.
   - **Scan only what moved.** The check's exit 0 → the record is the scan: reuse it, launch no
     scanner. Exit 1 → re-scan only the record's areas whose covered paths hold a path it lists
     (`*` = uncommitted now; a path no area covers is a new area), merge, and rewrite the record
     (below). Exit 2 (no record, or unreadable), or the user asks for a full scan → scan the
     **entire** project (per the full-scan rule — every module, not a sample) to identify the repo
     type/platform and which docs apply (applicability). **Fan the scan out:** split the repo by
     area — each platform or module, the database, CI/CD, assets — across up to four read-only
     subagents in one message, launched with `model: "sonnet"` in the Agent call (they read and
     report; merging, drafting decisions and every gate stay on the session model), each returning
     facts with `file:line` evidence; merge their reports and present one picture (per
     `principles.md` → *Parallel work*). Full-scan coverage is unchanged — the areas together
     cover every module.
   - **Write the scan record** `<repo>/.alpha-sdlc/scan.md` after the merge — drafts go beside it
     in `.alpha-sdlc/drafts/`, and a new `.alpha-sdlc/` gets a `.gitignore` holding `*`: the output
     of `node ../../scripts/scan-record.js --hash <repo>` pasted verbatim, then each area's report
     with its `file:line` evidence and the paths (directories) it covered. Drafters and later gates
     start from it. No git repository yet (`--hash` fails) means no record — say so; then no
     boundary falls before the phase end.
   - **If the scan finds no real source, say so and switch to greenfield mode** — confirm that with
     the user before deciding anything, then read `greenfield.md` and follow it.
   - **Org settings and applicability.** Read `templates/01-overview.md` once, before the first Org
     setting or applicability question (again after a compaction) — its setup instructions hold
     the tier, Org settings, mirror and applicability rules for every one of them. Gate the **Org
     settings** block — including the **profile tier** (lite/full) — writing each setting to the
     mirror as it passes. Present the applicable doc list (minus lazy docs under lite) and get the
     user to confirm before drafting.
2. **Per doc, in order:** read its template → scan the relevant real sources (the record first) →
   draft the doc (mark `UNKNOWN` where undetermined; point to authoritative files for volatile
   detail) → **present for approval** (approve / edit / skip) → write to
   `./docs/basics/<file>.md` with the commit stamp → next doc. `12-security-compliance.md` needs
   explicit human sign-off. **Draft the next doc while this one is reviewed:** when the next doc is
   factual — read from code, not decided (`07-database`, `09-environment`, `14-cicd-deployment`,
   `15-api-reference`, `17-asset-registry`, `19-code-inventory`, and the like) — hand it to a
   background subagent launched with `model: "sonnet"` as soon as this doc is presented, with the
   scan record, the doc's template and the drafting rules (`UNKNOWN` where undetermined, no secret
   values, volatile detail pointed to); it returns the draft as text and writes nothing but its
   copy in `.alpha-sdlc/drafts/<file>` — never `docs/basics/`. Before presenting it, check it
   against what this gate approved and redo it if an input moved. A doc that records decisions is
   never drafted ahead. Greenfield mode drafts nothing ahead — every step there is a decision.
3. **Finish.** Write/refresh `01-overview.md` as the index — links only, never a copy of each doc's
   stamp (a copy goes stale the moment refresh re-stamps one doc). Report what was generated and
   what was skipped (and why). This is the phase end (*Session boundaries* below).

## Resume (fresh session)

The files are the state: each doc's stamp in `docs/basics/`, the mirror
`docs/basics/.alpha-sdlc.json` (every Org setting and applicability verdict), and the repo's
`.alpha-sdlc/scan.md` and `.alpha-sdlc/drafts/` (background drafts; greenfield's
`greenfield-decisions.md`). `next-step.js` has no setup phase, so read them in one batch (rules →
*Batch independent reads*) with the next-file naming `alpha-sdlc:do-project-setup` and its handoff
when present; set the next-file's `status` to `consumed` and state the recorded understanding in
one line. Then run step 1 — the record check decides what, if anything, is re-scanned. Continue at
the first applicable doc with no stamp (refresh: the first one still stale against its stamp);
never re-ask what the mirror records, and check a saved draft against its inputs before
presenting it.

**Session boundaries** (rules → *The session is disposable — the files are the state*): at the
phase end; inside the run only once the scan record exists, and only after an approved doc is
written (greenfield: or a decision recorded) — never while a doc awaits its gate or a background
drafter runs. Persist first, then write the next-file: inside the run
`.alpha-sdlc/next/profile--<repo>.json` (`alpha-sdlc:do-project-setup`, `args` the mode, the next
doc as `unit`); at the phase end, for the skill that comes next when it is known (greenfield:
`do-foundation-grooming`; a run another skill asked for: that skill), and `profile--<repo>.json`'s
`status` set to `consumed` so no later session offers a finished run. Offer the fresh session in
Next ("/clear, then 'lanjut'"); skip it when little work remains.

## Rules

- **Full-project scan — no sampling.** Learn the **whole** project, not a representative subset.
  Walk every module/package/directory, every manifest and config, all migrations, the entire asset
  tree — don't infer the architecture from a few modules or stop at the first pattern you recognize.
  This is the one skill where completeness outranks laziness: the profile is grounding truth for
  every later phase, so a partial scan quietly corrupts everything downstream. If the repo is too
  large for one pass, scan it **systematically in parts until fully covered** (module by module,
  optionally fanning out with parallel/Explore sub-agents) — never mark a doc complete from a
  partial view. If a section is unavoidably based on incomplete coverage, **say so explicitly**
  rather than guessing. A reused or partly re-scanned record still covers every module — its
  areas' path lists are the proof.
- **One doc at a time, with approval.** Draft a doc → present it → user **approves / edits / skips**
  → only then write it to `./docs/basics/<file>.md` → move to the next. Never batch-write all docs.
  **A doc whose regenerated content is byte-identical to the approved one on disk is not gated
  again** — list it as unchanged in the step summary and move on (`principles.md` → *Always
  step-by-step approval*). Diff before you present: in refresh mode most docs do not move, and
  asking for the same approval twice is the single fastest way to stall a run.
- **Applicability, tier, Org settings** (in full: `templates/01-overview.md` → setup
  instructions). Generate only what applies: skip a doc that doesn't fit this repo and *say so*,
  never emit empty filler files; confirm the applicable list once. **`lite`** = the 8 core docs,
  the rest **lazy** GAPs generated on demand, one doc at a time, when a skill first needs one;
  **`full`** = all 20 up front. **Org settings are decided once, honored everywhere:** every one
  goes in the machine mirror `docs/basics/.alpha-sdlc.json` with the date it was decided, not only
  the ones a hook reads, and a recorded value is never overwritten without saying so — a change is
  presented as a reversal first.
- **Point, don't copy volatile detail.** Dependency versions, full DB DDL, pipeline YAML, env values
  → summarize + link the authoritative file. Cache the slow-changing orientation (architecture,
  conventions, base-URL matrix).
- **Never write secrets.** Record where/what-name (config file, env-var name), never values, tokens,
  or keys.
- **Stamp each doc** with the git commit it was generated at **and the date its approval gate
  passed** (in the doc header: `commit · approved <date>`) — so refresh can tell which docs are
  stale without regenerating all 20, and the approval is recorded, not implied. **Greenfield
  exception:** a pre-code doc is stamped `prescriptive (pre-code) · approved <date>` instead (the
  approval is still recorded; only the commit claim is dropped) (see `greenfield.md`) — a commit
  stamp on a doc whose code doesn't exist is a false claim that it was read.
- **12-security-compliance.md is stricter:** document only *observed* controls; never assert a
  compliance status you can't verify; flag every unconfirmed item as a gap for a human/security to
  fill; require an explicit human sign-off before writing it. **And ask who must answer** — its
  template's setup instructions say whom to propose, from where, and that the run does not wait.
- **Every question setup raises follows five rules** — each is something only the producer can do,
  because the reader renders what it is given: 1–3 below bind every run; 4 and 5 — `askedAt` and
  `notes` — are setup-run-schema fields, in `setup-run-schema.md`.
  1. **It carries evidence.** Show what the reader needs to answer without guessing — the value
     histogram, the conflicting rows, the both-ways list, the gap and its source lines — on every
     question; when there is genuinely nothing to show, say so instead of omitting it.
  2. **It offers a way out that is not an answer** — an option to decline to decide: assign it to
     someone, ask the two teams, write it themselves. Forcing a binary choice out of someone who
     does not know is how a wrong rule reaches twenty documents.
  3. **A refusal needs a reason; an acceptance does not.** An option or action that skips,
     declines or refuses carries `requiresReason: true`; every other one leaves it false. Skipping
     a document is the only answer that leaves nothing behind to read, so the reason is the record.

## The docs (`./docs/basics/`)

Each doc has a template, `templates/<file>.md` — read it when the doc is drafted or refreshed (and
hand its path to a background drafter), and fill it from the real project: its
*Setup instructions — do not copy* block (scope, cache vs point, seeds, checks) binds the draft.
Keep the header commit-stamp; drop template sections that don't apply. *(c)* = client repos only.

| File | Scope |
|------|-------|
| `01-overview` | index, Org settings |
| `02-architecture` | layers, full code tree, wiring |
| `03-ui-architecture` *(c)* | UI structure, scaffolds, Test IDs |
| `04-ux-conventions` *(c)* | interaction behavior |
| `05-tech-stack` | stack, libraries, commands |
| `06-domain-model` | entities, ownership |
| `07-database` | schema, migrations, seeds |
| `08-data-cache` | persistence, server-state sync |
| `09-environment` | config, full-stack run recipe |
| `10-conventions` | code conventions |
| `11-git-management` | branching, PRs, releases |
| `12-security-compliance` | controls, gaps, sign-off |
| `13-auth` *(if it authenticates)* | token handling |
| `14-cicd-deployment` | pipeline, release |
| `15-api-reference` | base URLs, contract |
| `16-feature-map` | features, dependencies |
| `17-asset-registry` *(c)* | assets, font files |
| `18-design-tokens` *(c)* | token names and values |
| `19-code-inventory` | reusable units |
| `20-tech-debt-register` | the debt ledger |

**Reference files**, each read at the step that names it: `refresh.md`, `greenfield.md`,
`setup-run-schema.md`, `templates/<file>.md`.
