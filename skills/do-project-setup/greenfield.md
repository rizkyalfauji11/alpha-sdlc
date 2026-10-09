# Greenfield mode — a project from zero

Read this file when step 1 finds no real source (or the user says they're starting from zero) and
the user has confirmed the switch. Everything in `SKILL.md` still applies — its gates, the record,
one doc at a time, the stamps; this file turns describing into deciding.

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
- **Every decision is recorded the moment its gate passes** — one line in
  `.alpha-sdlc/drafts/greenfield-decisions.md` (decision · choice · tradeoff · date; a new
  `.alpha-sdlc/` gets a `.gitignore` holding `*`). The docs are written from it, and a fresh
  session states each recorded decision instead of asking it again; a different answer later is a
  reversal, named as one.
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
- **Nothing is drafted ahead.** Greenfield mode drafts nothing ahead — every step there is a
  decision.
- **`12-security-compliance.md` stays gaps-only.** Nothing is observed in a greenfield repo, so it
  can assert no controls — record the intended approach plus every open gap, and keep the human
  sign-off requirement.
- **`16-feature-map.md` starts empty.** The foundation is **not a feature**; the first product
  feature registers itself when `do-grooming` runs.
- **Hand off to `do-foundation-grooming`** — it grooms the scaffold, folder structure, and
  architecture skeleton into a foundation TRD that **binds to these decisions by link**. Stack
  decisions belong here, in the profile; if foundation grooming exposes a wrong or missing decision,
  it comes back to this skill rather than being re-decided there. This is the phase end: persist
  first and ask the user to commit the profile (the next-file's `head`, foundation grooming's
  stamps and its review `--base` all name a commit), then write the next-file
  `.alpha-sdlc/next/foundation--hub.json` for
  `alpha-sdlc:do-foundation-grooming` (`args` `foundation`, `unit` step 1) and offer the fresh
  session in Next.
- **After the base is built and green, run refresh mode** to re-stamp the prescriptive docs against
  the real commit — flipping them from intent to description, and **flagging anywhere the built code
  diverged from what was decided** (flag it; don't silently rewrite the decision to match the code).
