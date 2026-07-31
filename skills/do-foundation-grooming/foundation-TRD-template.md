# Foundation TRD — <project name>

_Groomed by `do-foundation-grooming` · <YYYY-MM-DD>_

| | |
|---|---|
| **What this is** | <one line: the app/service being started from zero> |
| **Platforms in scope** | <backend · web · android · ios — a spoke per platform> |
| **Repo strategy** | <monorepo · separate repos per platform — and why> |
| **Profile** | [architecture](../../basics/02-architecture.md) · [tech-stack](../../basics/05-tech-stack.md) · [environment](../../basics/09-environment.md) · [conventions](../../basics/10-conventions.md) · [git](../../basics/11-git-management.md) |
| **Spokes** | <TRD-backend.md · TRD-web.md · …> |

> **Scaffolding only.** This TRD covers the project scaffold, folder structure, architecture skeleton,
> and build/run/test harness. **No features** — no auth, no schema, no screens, no business logic.
> The first product feature is groomed with `do-grooming` **after** the base lands.
> **Stack decisions live in `docs/basics/`** (decided by `do-project-setup` in greenfield mode) — this
> document **binds to them by link and never re-decides them**.

## Intent & constraints

<What the product/service is, at the thinnest useful level — enough to justify the stack, not a PRD. Known hard constraints: target platforms/versions, org standards, must-use infrastructure, compliance the base must not preclude.>

## Shared decisions (hub-level)

> What every platform must agree on. **Approved before any spoke is groomed.**

| Decision | Choice | Why / tradeoff | Bound to |
|----------|--------|----------------|----------|
| **Repo strategy** | <monorepo / separate repos> | <…> | `11-git-management.md` |
| **Architecture style** | <clean-layered / modular / MVC / …; layering used? yes-no> | <…> | `02-architecture.md` |
| **Cross-service contract** | <OpenAPI file location + owner · shared types package · n/a (single platform)> | <…> | `15-api-reference.md` |
| **Shared conventions** | <naming, formatting, commit convention> | <…> | `10-conventions.md`, `11-git-management.md` |
| **Environments** | <which envs exist at the base: local only? local+staging?> | <…> | `09-environment.md` |

## Per-platform sections *(one spoke each — the sections below live in `TRD-<platform>.md`)*

### Framework & scaffold

| | |
|---|---|
| **Language / runtime** | <+ pinned version> |
| **Framework** | <+ pinned version> |
| **Scaffold tool + exact command** | <e.g. `npx create-next-app@15.1.0 <name> --ts --app` — pinned, reproducible> |
| **What the scaffold emits** | <the generator's own output, briefly — so the diff between "generated" and "ours" is visible> |
| **What we change from the default** | <each deviation + why; ladder rung for anything hand-built> |

### Folder structure (the deliverable — write the real tree)

> Concrete, directory by directory. `do-development` creates exactly this; its conformance review
> checks the built tree against it. Must match `02-architecture.md`.

```
<project-root>/
  <dir>/                  # <what belongs here — and what must NOT>
    <subdir>/             # <…>
  <dir>/                  # <…>
```

| Directory | Holds | Depends on | Must never import |
|-----------|-------|------------|-------------------|
| <`domain/`> | <entities, use-cases> | <nothing> | <presentation, data> |
| <`data/`> | <repositories, API/DB clients> | <domain> | <presentation> |
| <`presentation/`> | <UI, state> | <domain> | <data directly> |

### Architecture skeleton

> Empty-but-real: what code actually exists when the base is done. **No placeholder classes "for later"** — if nothing needs it yet, it goes in *Deliberate omissions* instead.

| Piece | What exists at base | Notes |
|-------|--------------------|-------|
| **Entry point** | <e.g. `main.kt` / `App.tsx` / `Application.java`> | <boots and answers/launches> |
| **Config loading** | <how env/config is read — names only, no values> | `09-environment.md` |
| **Module/package boundaries** | <the modules created and their dependency edges> | |
| **Dependency-rule enforcement** | <module graph · lint rule · ArchUnit/Konsist · **not enforced yet — deferred**> | be explicit; "we'll be careful" is not enforcement |
| **Dependency management** | <package manager + lockfile committed> | |

### Build / run / test harness

| Command | Exact command | Must do |
|---------|---------------|---------|
| **Build** | <…> | exits 0 |
| **Run** | <…> | starts; entry point responds/launches |
| **Test** | <…> | runs the suite (empty is fine at base) |
| **Lint / format** | <…> | passes |

<These are the commands that get recorded in `05-tech-stack.md` and `09-environment.md`'s run recipe.>

### Repo hygiene

<`.gitignore` (framework defaults + `design/compared-ui/`), README stub, editor/format config, commit-convention setup, branch protection if applicable — per `11-git-management.md`.>

### Acceptance criteria (mechanically checkable)

> "The base is set up" is not an AC. Each line below must be verifiable by running something or
> asserting a fact about the tree. These are what `do-testing` checks for the base.

| # | AC | How it's verified |
|---|----|-------------------|
| A1 | <`<build cmd>` exits 0> | <run it> |
| A2 | <`<run cmd>` starts and the entry point responds/launches> | <run + hit it> |
| A3 | <`<test cmd>` executes the suite> | <run it> |
| A4 | <`<lint cmd>` passes> | <run it> |
| A5 | <the created tree matches *Folder structure* exactly> | <compare tree vs the table above> |
| A6 | <the dependency rule holds: `<layer>` doesn't import `<layer>`> | <the enforcement mechanism above — or mark deferred> |

## Deliberate omissions & deferrals

> What the base intentionally does **not** include, and when each gets decided. This is what keeps a
> **prescriptive** profile honest: the docs may describe an intended design, but only what's listed as
> built is real. Anything here that someone tries to add during the base is scope creep → say no, and
> route it to `do-grooming` as the first feature.

| Not in the base | Why | Decided/built when |
|-----------------|-----|--------------------|
| <authentication> | <no feature needs it yet> | <first feature that authenticates → `13-auth.md`> |
| <database schema> | <no entities yet> | <first feature with persistence → `07-database.md`> |
| <CI/CD pipeline> | <nothing to deploy yet> | <before first deploy → `14-cicd-deployment.md`> |
| <error taxonomy / logging strategy> | <…> | <…> |
| <design system / tokens> | <no designs yet> | <first UI feature → `18-design-tokens.md`> |

**What the base cannot prove:** with no end-to-end slice, the integrated **Boot & Smoke gate reduces to "the app boots and its entry point answers"** — the real FE↔BE data gate begins at the first feature. Do not report the reduced check as the full gate.

## Open Decisions

| # | Decision needed | Options (recommended marked) | Status |
|---|-----------------|------------------------------|--------|
| D1 | <…> | <a / **b (recommended)** / c> | open / decided |

## Hand-off

- **`do-planning`** — scaffolding stages, `Layer: n/a (scaffolding)`: init → structure → skeleton → harness → hygiene.
- **`do-development`** — TDD mostly doesn't apply; verify per stage by the real check (command runs · tree matches · dependency rule holds). The conformance review checks the built tree against *Folder structure*.
- **`do-testing`** — the AC table above, plus the reduced boot check, reported honestly.
- **Then `do-project-setup` in refresh mode** — re-stamp the prescriptive `docs/basics/` docs against the real commit, flag anywhere the built base diverged from what was decided. **Only then** does `do-grooming` groom the first product feature.
