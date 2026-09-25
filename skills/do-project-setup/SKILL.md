---
name: do-project-setup
description: Generate the project profile — the baseline "basics" docs (architecture, tech stack, database, environment, API map, security, CI/CD, assets, etc.) that grooming and every downstream skill ground in. Drafts the docs one at a time with your approval; has a refresh/reconcile mode to keep them current. Use to set up a project, bootstrap project docs, generate the project profile, or before the first grooming. **Also the FIRST step for a brand-new project**: on an empty repo it switches to greenfield mode and decides the stack (framework, architecture, structure, tooling) with the user, one gate per decision — then hands off to do-foundation-grooming for the scaffold. Triggers on "project setup", "generate project docs", "project profile", "set up the basics", "/do-project-setup", "onboard this repo", "start a new app", "new project from zero", "greenfield", "bootstrap the project".
---

You are generating the **project profile** — the baseline reference every other skill grounds in, so
grooming/planning/testing don't re-derive the same orientation each run. Output goes to
**`./docs/basics/`**. Run once per repo to bootstrap; re-run in **refresh mode** to keep it current.

**Read `../../principles.md` in full now, then apply it** — the `SessionStart` hook injects only the
INDEX of these rules, never their text, so the file is the only place they actually bind —
especially: **ground in real code (never fabricate — mark anything you can't determine as `UNKNOWN —
needs human input`, don't guess)**, draft + human-approve, and never over-simplify.


**Auto-run/auto-decide NEVER applies in this skill** — this is a decision phase. If the user asks
for auto mode here, decline in one line ("this phase decides — gates apply; auto-run starts at
`do-development`") and proceed gated: every gate blocks as normal, nothing auto-decides.

## Rules

- **Empty repo? Switch to greenfield mode** (below) — describing gives you 20 docs of `UNKNOWN`;
  deciding gives the project a foundation to be built against. Everything else in this skill still
  applies.
- **Full-project scan — no sampling.** Learn the **whole** project, not a representative subset.
  Walk every module/package/directory, every manifest and config, all migrations, the entire asset
  tree — don't infer the architecture from a few modules or stop at the first pattern you recognize.
  This is the one skill where completeness outranks laziness: the profile is grounding truth for
  every later phase, so a partial scan quietly corrupts everything downstream. If the repo is too
  large for one pass, scan it **systematically in parts until fully covered** (module by module,
  optionally fanning out with parallel/Explore sub-agents) — never mark a doc complete from a
  partial view. If a section is unavoidably based on incomplete coverage, **say so explicitly**
  rather than guessing.
- **One doc at a time, with approval.** Draft a doc → present it → user **approves / edits / skips**
  → only then write it to `./docs/basics/<file>.md` → move to the next. Never batch-write all docs.
- **Applicability — generate only what applies.** Skip docs that don't fit this repo (e.g.
  `ui-architecture` / `asset-registry` on a backend repo) and *say so*; never emit empty filler
  files. Confirm the applicable list with the user first.
- **Profile tier — right-size the ceremony (ask at the first gate).** **`lite`** = the 8 core docs
  (`01-overview` · `02-architecture` · `05-tech-stack` · `06-domain-model` · `09-environment` ·
  `10-conventions` · `15-api-reference` · `16-feature-map`); everything else is **lazy** — recorded
  as a GAP in `01` and generated **on demand, one doc at a time,** when a skill first needs it (that
  skill offers the single-doc setup right there — never proceeds pretending the doc exists).
  **`full`** = all 20 up front. Startups default lite; choose full when the org wants the whole
  contract day one.
- **Org settings — decided once, honored everywhere.** Gate the `01-overview` **Org settings** block
  at setup: profile tier · auto-run permitted (a "no" makes every auto-run request politely declined
  — regulated change management) · plain-language layer (every step summary's plain layer is in this
  language; engineer detail stays technical) · tracker (none/Jira/GitHub Issues — routes
  `do-uploading`) · comment allowlist (license header / public-API doc-comments — legal/library
  needs). **Write the machine mirror `docs/basics/.alpha-sdlc.json`** (keys: `allowLicenseHeader`,
  `allowPublicApiDocstrings`, `plainLanguage` — the plain layer's ISO 639-1 code, e.g. `id`, `en`)
  so the hooks can read it, and stamp the **plugin version**. Refresh mode adds `plainLanguage` to a
  mirror written before the key existed.
- **Point, don't copy volatile detail.** Dependency versions, full DB DDL, pipeline YAML, env values
  → summarize + link the authoritative file. Cache the slow-changing orientation (architecture,
  conventions, base-URL matrix).
- **Never write secrets.** Record where/what-name (config file, env-var name), never values, tokens,
  or keys.
- **Stamp each doc** with the git commit it was generated at **and the date its approval gate
  passed** (in the doc header: `commit · approved <date>`) — so refresh can tell which docs are
  stale without regenerating all 20, and the approval is recorded, not implied. **Greenfield
  exception:** a pre-code doc is stamped `prescriptive (pre-code) · approved <date>` instead (the
  approval is still recorded; only the commit claim is dropped) (see *Greenfield mode*) — a commit
  stamp on a doc whose code doesn't exist is a false claim that it was read.
- **12-security-compliance.md is stricter:** document only *observed* controls; never assert a
  compliance status you can't verify; flag every unconfirmed item as a gap for a human/security to
  fill; require an explicit human sign-off before writing it. **And ask who must answer.** When an
  item cannot be confirmed from the code, it stays a recorded gap *and* becomes a question that
  proposes the people who can close it — a gap nobody is asked about is a gap nobody closes:
  - **Candidates come only from this repository** — the authors of the very lines that raised the
    gap, read from git history (`git blame` / `git log` on those lines), and whoever signed a
    previous `12-security-compliance.md`, read from that file's history. **Names only, never an
    email.** Never invent a colleague, and never carry a name over from another project.
  - **Proposing nobody is a valid outcome.** When the repository shows no candidate, ask the
    question with no candidates and say plainly that no name could be read from the repository —
    the name itself is `UNKNOWN — needs human input`, never a guess.
  - **The run does not wait on it.** The other documents carry on while this one sits at *needs
    sign-off*; the gaps stay in the doc's *Gaps* section with their candidates, and the doc is still
    not written without the explicit human sign-off. This adds the asking; it removes no strictness.
  - **Reported through the setup-run schema** (when the consumer passes one as `--json-schema`),
    the question travels inside the existing shapes, with the schema unchanged: one `options[]`
    entry per person — `label` their name, `why` their role, `trade` the prior sign-off note when
    there is one; `evidence.caption` says where the names came from (e.g. *"From the three log
    calls' authors"*) and `evidence.groups[]` holds one row per gap; `actions[]` carries *Pick
    someone* and *Change*; `blocks: []`, because the run carries on; and `notes` says where each
    gap stands — e.g. `{ label: "Standing", text: "One is with <name> · the other has nobody
    named" }` — with names under the same candidate rule.
- **Every question setup raises follows five rules** — each is something only the producer can do,
  because the reader renders what it is given:
  1. **It carries evidence.** Show what the reader needs to answer without guessing — the value
     histogram, the conflicting rows, the both-ways list, the gap and its source lines. In the
     setup-run schema that is `evidence`, **on every question**: the consumer renders nothing when
     it is absent, so an evidence-less question looks exactly like a well-grounded one. When there
     is genuinely nothing to show, say so in the evidence caption instead of omitting the block.
  2. **It offers a way out that is not an answer** — an option to decline to decide: assign it to
     someone, ask the two teams, write it themselves. Forcing a binary choice out of someone who
     does not know is how a wrong rule reaches twenty documents.
  3. **A refusal needs a reason; an acceptance does not.** An option or action that skips,
     declines or refuses carries `requiresReason: true`; every other one leaves it false. Skipping
     a document is the only answer that leaves nothing behind to read, so the reason is the record.
  4. **It says when it was asked — as an instant, never a phrase.** `askedAt` is an RFC 3339
     timestamp read from the clock (`date -u +%Y-%m-%dT%H:%M:%SZ`), never estimated and never
     *"2 days"*: a phrase is computed when the report is written and is wrong an hour later, while
     the consumer renders the age from the instant and keeps it current. Set it **once, when the
     question is first raised**, and carry it unchanged in every later report of the same question
     (same `id`) — a timestamp refreshed on each report resets the age to zero and hides the only
     signal that a question is going stale.
  5. **What the reader should simply see, and nothing the app must act on, goes in `notes`** — an
     array of `{ label, text, engineer? }` blocks, the step summary's shape, rendered in order. Fill
     it on every question, and on a document row wherever something is worth saying that no field
     carries; never fill it with filler. Sorting, colour, blocking and requiring a reason stay in
     their typed fields, because the app cannot act on a string it does not understand.

  `notes` and `askedAt` are optional in the setup-run schema: when the consumer's schema lacks
  them, they are simply not emitted. This adds to the report; every existing field is filled
  exactly as before.

## The docs (`./docs/basics/`)

Each doc has a starter template in this skill's `templates/` directory (`templates/<file>`) — read
the relevant one and fill it from the real project. Keep the header commit-stamp; drop template
sections that don't apply.

| File | Contents | Cache vs point |
|------|----------|----------------|
| `01-overview.md` | Project summary, the profile index (links only — each doc's commit stamp stays in that doc's own header, never copied here) | cache |
| `02-architecture.md` | Architecture style + layering + dependency rule, **full code structure (complete directory tree — every dir annotated + significant files + feature boundaries, not sampled/elided)**, **layer interaction & wiring patterns (how a call crosses each boundary — interface→impl→DI binding, async, errors, mapping, common-code consumption — per platform, with real examples)**, module/package map (module · feature · deps), key components (Mermaid) | cache |
| `03-ui-architecture.md` *(clients)* | Navigation, UI-state management (server state → `data-cache`), **design-system component inventory (search-before-build, register-on-create)**, **screen scaffolds & layout patterns (header anatomy · body slicing · dividers — learned from the real screens, register-on-create)**, **Test-ID & widget-spec conventions (locator style learned from the code's real IDs + shared-element canonical IDs)**, theming, screen inventory (flows grouped) | cache |
| `04-ux-conventions.md` *(clients)* | App-wide **interaction behavior** — form validation & submit enable/disable, mandatory marking, empty/loading/error states, snackbars, confirmations, disabled affordance, a11y | cache; cross-links `ui-architecture` |
| `05-tech-stack.md` | Languages, frameworks, **approved library per concern** (reuse-before-add lookup), **code generation** (typed-client command), build tooling + build/run/test commands | stack cached; **versions → manifest** |
| `06-domain-model.md` | **Logical entities + relationships + cross-feature ownership** (owner = source of truth; consumers read via owner) — the shared truth interdependent features bind to; flags cross-feature contradictions | cache; cross-links `database`/`api-reference`/`feature-map` |
| `07-database.md` | Engine(s), **complete schema — every table/column/FK with on-delete actions (must match domain-model edges), indexes — no sampling**, migrations, **seed/test data** | full mirror cached; **migrations = executable truth** |
| `08-data-cache.md` | Local persistence (incl. flow drafts), caching strategy, **shared server-state sync** (query keys · mutation→invalidation · real-time events), offline behavior | cache |
| `09-environment.md` | Environments, config & secrets *approach* (names/locations), **full-stack run recipe** (per-service start command, ready-check, FE→BE wiring, CORS, **visible client launch per surface** — feeds the integrated Boot & Smoke gate), feature flags, build variants | approach cached; **values → config files** |
| `10-conventions.md` | Coding conventions, naming, folder rules, **error handling & logging**, data contract & localized rendering, testing conventions | cache |
| `11-git-management.md` | Branching, commit/PR/merge conventions, protected branches, tags/releases, hooks | cache; **release/version → cicd-deployment** |
| `12-security-compliance.md` | Auth/authz, PII/data classification, encryption, compliance regimes, secret mgmt, security testing, audit logging | controls cached; **policy → policy docs**; strict sign-off |
| `13-auth.md` *(if it authenticates)* | **Runtime token handling** — scheme, tokens (type/lifetime/storage/attach), **refresh flow** (rotation, single-flight), **401/expiry** (refresh-and-retry, no loop), logout/revocation, multi-tab/device | mechanics cached (no secrets); cross-links security-compliance/api-reference/environment |
| `14-cicd-deployment.md` | CI/CD tool + pipeline stages, environment promotion, release process, versioning, rollback | shape cached; **config → pipeline files** |
| `15-api-reference.md` | **Base-URL matrix (service × environment)**, **machine-checkable contract** (OpenAPI/schema location + owner + whether clients derive typed client/fixtures from it), API catalog (consumed/exposed, auth, owner, version), gotchas, error/retry conventions | matrix cached (no secrets); **defined-in → config** |
| `16-feature-map.md` | Catalog of the app's **features** — purpose, entry points, owned endpoints/tables, **depends-on**, status, dependency graph | inventory cached; **detail → each feature's TRD** |
| `17-asset-registry.md` *(clients)* | Searchable inventory of registered assets (name · description · path per platform · tags), naming conventions, icon set, font files | inventory cached; **token names/values → `18-design-tokens`** |
| `18-design-tokens.md` *(clients)* | The **enumerated visual contract — names *and* values**: base unit + spacing scale & named roles, typography ramp + emphasis rules, font families & fallbacks, semantic color roles (light/dark), borders/dividers/hairlines, radius/elevation, icon & control sizing, grid/breakpoints, approved deviations, enforcement | **values mirrored** (Figma stays upstream); contradictions flagged |
| `19-code-inventory.md` | **Every reusable code unit in the whole project — wherever it lives, not just core/common** (helpers, extensions, base classes, wrappers, hooks): name · plain+engineer description · location · used-by; **duplicates flagged as contradictions**; promotion rule (to core at the second consumer) | inventory cached; **register-on-create; rung-2 lookups run here** |
| `20-tech-debt-register.md` | **The single ledger of every known debt — open and paid (history)**: stable `TD-<n>` IDs · what (plain+engineer) · kind (simplification/contradiction/duplicate/deferral/omission/suspicion) · origin · ceiling (when it bites) · status (open · groomed → TRD · accepted-with-why · paid) | ledger cached; **register-on-create from every source table; the tech-debt-grooming backlog** |

## Flow

> Present every gate below in the shared **step-summary format** (`principles.md`): header
> (development · phase · step · status) · **bottom line** (what happened + what I need from you) ·
> **why it matters** (never omitted when a question is asked) · options ★ · context only where it
> adds something · engineer detail last.
> The plain layer is in the org's language and follows its guide in `../../plain-language/`
> when one exists (`id.md` for Bahasa Indonesia) — at every gate, in every phase.

1. **Full scan & confirm.** Scan the **entire** project (per the full-scan rule — every module, not
   a sample) to identify the repo type/platform and which docs apply (applicability), then gate the
   **Org settings** block — including the **profile tier** (lite/full). Present the applicable doc
   list (minus lazy docs under lite) and get the user to confirm before drafting. **If the scan
   finds no real source, say so and switch to greenfield mode** (below) — confirm that with the user
   before deciding anything. **Fan the scan out:** split the repo by area — each platform or module,
   the database, CI/CD, assets — across up to four read-only subagents in one message, each
   returning facts with `file:line` evidence; merge their reports and present one picture (per
   `principles.md` → *Parallel work*). Full-scan coverage is unchanged — the areas together cover
   every module.
2. **Per doc, in order:** scan the relevant real sources → draft the doc (mark `UNKNOWN` where
   undetermined; point to authoritative files for volatile detail) → **present for approval**
   (approve / edit / skip) → write to `./docs/basics/<file>.md` with the commit stamp → next doc.
   `12-security-compliance.md` needs explicit human sign-off. **Draft the next doc while this one
   is reviewed:** when the next doc is factual — read from code, not decided (`07-database`,
   `09-environment`, `14-cicd-deployment`, `15-api-reference`, `17-asset-registry`,
   `19-code-inventory`, and the like) — hand it to a background subagent as soon as this doc is
   presented; it returns the draft as text and writes nothing. Before presenting it, check it
   against what this gate approved and redo it if an input moved. A doc that records decisions is
   never drafted ahead. Greenfield mode drafts nothing ahead — every step there is a decision. Seed
   `17-asset-registry.md` by scanning the actual asset directories. Seed `16-feature-map.md` from
   any existing `docs/development/*/TRD.md` (each **product-feature** TRD is a feature — skip
   `foundation/` and any TRD whose first line reads `# Issue TRD:` or `# Tech-Debt TRD:`) plus the
   code's feature modules/routes — capture their depends-on edges; if the app has no discernible
   features yet, start it minimal and note it. Seed `03-ui-architecture.md`'s **screen scaffolds**
   by scanning the real screens for recurring anatomy (header composition, body slicing ratios,
   dividers) — describe the patterns found, flag screens that contradict each other, and establish
   the intended scaffold with the user where none is consistent. Seed its **Test-ID conventions** by
   sweeping every locator attribute in the codebase (`android:id`/`testTag` ·
   `accessibilityIdentifier` · `data-testid`) and reading the style off the histogram: one
   consistent style → **describe** it; **mixed styles → contradiction** — show the histogram, the
   user canonicalizes (new IDs follow the canon; shipped IDs are never renamed — record the old
   style as an accepted deviation + a `TD-<n>` row if migration is wanted); none found →
   **establish** with the user (★ plugin default `<feature>_<screen>_<element>`, snake_case).
   Register shared-element canonical IDs from the components every feature touches. Seed
   `18-design-tokens.md` by extracting the **real values in use** — read the theme/tokens file(s)
   first, then sweep the actual screen/component code for spacing, font size/weight/family, color,
   border-thickness, radius and icon-size values, and **mirror names *and* values** (per platform:
   dp/sp · pt · rem/px). Where the same purpose has **contradictory values** (body text at
   13/14/15sp across screens), do **not** pick silently: fill the *Contradictions found* table with
   the value histogram and **ask the user to canonicalize**, noting that migrating existing screens
   is `do-tech-debt-grooming` work, not a feature-time rewrite. A value that exists only in Figma is
   `UNKNOWN — needs human input` — never inferred from a mockup. If the project has **no token file
   in code**, say so, keep the doc-level scale authoritative (it's still enforceable), and record
   extracting one as recommended tech-debt. Also fill *Enforcement* with the project's **real**
   commands — and where no screenshot-baseline tool exists, record that limitation instead of
   inventing a gate. Seed `20-tech-debt-register.md` by harvesting every debt the other docs just
   flagged (contradictions in `18`/`06`, duplicates in `19`, omissions, smells the full scan
   surfaced) into `TD-<n>` rows — open, with origin + ceiling — and, when the repo has no command
   that checks its own docs (links, tables, cross-references), one row saying so: recorded here,
   once, so no stage's review is charged with it. Seed `19-code-inventory.md` with a
   **full-project sweep for reusable units — every module, never just core/common** (helpers,
   extensions, base classes, wrappers, hooks, validators): register each (plain+engineer description
   · location · used-by), and put **the same job implemented more than once** into its Duplicates
   table as a contradiction to canonicalize — never pick one silently. Seed `06-domain-model.md` by
   extracting the core **entities, relationships, and which feature owns each** from the real
   schema/models/API — and per the codebase-state-agnostic principle: **describe** what exists,
   **establish** missing entities/relationships with the user, and **flag contradictions** (the same
   entity modelled two ways across features) in its *Contradictions* section rather than smoothing
   them over.
3. **Finish.** Write/refresh `01-overview.md` as the index — links only, never a copy of each doc's
   stamp (a copy goes stale the moment refresh re-stamps one doc). Report what was generated and
   what was skipped (and why).

## Greenfield mode — a project from zero

When the repo is **empty or has no real source yet** (or the user says they're starting from zero),
this skill flips from **describing** to **deciding**. Announce the mode explicitly before anything
else — the docs it produces are *intent*, not observation, and every downstream skill needs to know
that.

- **Decide with the user, one gate per decision.** Each decision is its own approve/edit gate with
  **2–3 real options and one marked as the recommendation + its tradeoff** (per `principles.md`) —
  never a batch sheet, never an assumed default. The decision set: **product/service intent ·
  platforms · repo strategy (monorepo vs separate repos) · language + runtime + framework per
  platform (pinned) · architecture style (and whether layering is used) · folder-structure
  convention · persistence/storage (if any) · API style + machine-checkable contract format · auth
  approach (if any) · testing stack · lint/format · CI/CD + hosting · config & env approach ·
  git/commit conventions.** Skip any that genuinely don't apply and say so.
- **Write all applicable docs, prescriptively.** The tiered set is generated as the **intended
  design**, so grooming binds to a full picture instead of a stub. Two hard limits keep this from
  becoming fabrication:
  - **Stamp them `prescriptive (pre-code) · approved <date>`, in place of the commit hash** — a
    commit stamp would claim the code was read. Add one line at the top of each: *"Intended design,
    not observed — nothing is built yet."*
  - **Never invent a fact a feature hasn't created.** Concrete schemas, endpoint catalogs, screen
    inventories, asset entries, and token *values* don't exist yet: write the **decided approach**
    (engine, naming, contract format, structure) and mark the specifics **`deferred — established
    when the first feature needs it`**. A prescriptive doc records decisions; it does not
    hallucinate content.
- **`12-security-compliance.md` stays gaps-only.** Nothing is observed in a greenfield repo, so it
  can assert no controls — record the intended approach plus every open gap, and keep the human
  sign-off requirement.
- **`16-feature-map.md` starts empty.** The foundation is **not a feature**; the first product
  feature registers itself when `do-grooming` runs.
- **Hand off to `do-foundation-grooming`** — it grooms the scaffold, folder structure, and
  architecture skeleton into a foundation TRD that **binds to these decisions by link**. Stack
  decisions belong here, in the profile; if foundation grooming exposes a wrong or missing decision,
  it comes back to this skill rather than being re-decided there.
- **After the base is built and green, run refresh mode** to re-stamp the prescriptive docs against
  the real commit — flipping them from intent to description, and **flagging anywhere the built code
  diverged from what was decided** (flag it; don't silently rewrite the decision to match the code).

## Refresh / reconcile mode

**A feature's reconcile waits for the feature to be done.** When refresh runs as the end of a
feature's SDLC (after `do-testing`), first run `node ../../scripts/check-feature-done.js
docs/development/<feature-name> <platform>` for every platform the feature built. Anything but exit
0 — Boot & Smoke not passed, an AC not covered and passing, a bug not closed — is a **STOP**: report
the reasons and send the feature back to `do-testing` / `do-fixing`. A verification gate is never
waived, so an explicit *proceed anyway* does not open this one. A refresh that is not a feature's
reconcile (the profile has simply aged) runs as before.

**Every refresh looks for rows naming what is gone.** Run `node ../../scripts/find-orphans.js
<repo-root> --registry`: each *measured* line is a `19-code-inventory` or `18-design-tokens` row
naming a unit or token the source no longer has. Offer their removal with the doc they sit in (the
same one-doc-at-a-time gate), and check `17-asset-registry` and `03-ui-architecture` the same way
by hand. Registering on create was always the rule; this is the other half.

**Profile migration first:** compare the profile's recorded **plugin version** (Org settings)
against the running plugin; if older, diff the current template set + each template's section
headings against the existing docs — **missing docs/sections are migration candidates, offered one
at a time** (gated, like any doc), then re-stamp the version. A lite-tier profile also lists its
lazy GAPs here — generate any the team now wants.


This is also the **end-of-feature reconcile** the pipeline calls after a feature's SDLC completes
(`do-testing` green): run it whenever a feature ships so `docs/basics/` reflects what was built
before the next feature grooms against it. Pay special attention to `feature-map` (register the new
feature + its dependencies), `api-reference`, `ui-architecture`/`ux-conventions`, `auth`, and
`20-tech-debt-register` (statuses flip here: groomed debt that shipped → paid; new deferrals from
the run → open rows).

Re-running on an existing profile: per-doc, compare the repo against the doc's commit stamp; refresh
only the **stale** docs (with approval). For `17-asset-registry.md`, **reconcile** — diff the
registry against the actual asset directories and flag **unregistered assets** (added without
registering). For `18-design-tokens.md`, **reconcile** too — diff the doc against the theme file
*and* sweep the code for **raw literals** (spacing/size/weight/hex/border values written outside the
tokens): each one is either a token that was never registered or drift to report, and any new
contradiction goes back into *Contradictions found*. A token doc that silently disagrees with the
code is worse than none — the builder trusts it. For `19-code-inventory.md`, **reconcile** — sweep
for reusable units created since the stamp but never registered, and for new duplicates of an
already-registered job. For `20-tech-debt-register.md`, **reconcile** — every entry in any source
table (contradictions, duplicates, omissions, named simplifications in TRDs) without a `TD-<n>` row
is a gap; statuses checked against reality (a groomed TRD shipped means paid). For
`03-ui-architecture.md`'s Test-ID conventions, **reconcile** — new locator IDs in code that break
the recorded convention are flagged (new IDs must follow it; old ones are grandfathered). Fast-rot
docs (tech-stack, database, cicd, api-reference) warrant aggressive checks; slow-rot docs
(architecture, conventions, security) rarely change.
