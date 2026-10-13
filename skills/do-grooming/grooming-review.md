# Grooming review — the hub and every spoke, reviewed once

The review file of all four groomings: `do-grooming` Step 2a (the hub's self-review), Step 4 (each
spoke's alignment self-review) and Step 5 (the grooming review — the phase's one review, of the hub
and every spoke together), and the same steps in `do-tech-debt-grooming`, `do-issue-grooming` and
`do-foundation-grooming` — *Variants* says what each drops, adds or keeps. Read it at each of those
steps, and whenever a hub edit moves a spoke — once per session, again after a compaction.
Alignment points 1–11 and hub points 12–16 keep their numbers: the packet and `review-gaps.js` key
on them. The gates stay in each skill's `SKILL.md`.

## Contents

- **Self-reviews** — the hub's points 12–16, each spoke's points 1–11, before the grooming review
- **How the grooming review runs** — packet, reviewers, gaps check, critic, one merged verdict
- **Hub points** — 12–16, the hub's own consistency
- **Alignment points** — 1–11, every spoke against the hub
- **Resolve by direction** — spoke wrong, hub wrong, deliberate divergence
- **Closing on proofs**
- **Stamps** — and **The hub moving**
- **Variants** — feature · tech-debt · issue · foundation

## Self-reviews

**The hub is self-reviewed before any spoke is groomed.** Spokes are not the hub's reviewers: every
hub defect a spoke finds moves every other spoke, so the hub's own errors are caught by its author
first, while nothing depends on it yet. Once the hub's last section is written, run the repo's doc
checks and the contract checker, then walk *Hub points* 12–16 yourself against the hub, its
contract delta and the profile docs it references — one point at a time, each answered with the
line or the command that settles it. Fix what you find, present the result, and stamp the `Hub
review` row `self-reviewed <date> · rev <commit>`: that stamp opens the first spoke.

**Every spoke is self-reviewed before the grooming review.** After a spoke's last section and its
per-screen artifacts, run point 8's AC ↔ slice lookup and the contract checker, then walk
*Alignment points* 1–11 yourself against the hub and that spoke, resolve what you find by direction
(below), and stamp the spoke's `Hub alignment` row `self-reviewed <date> · hub rev <commit>` — and
the hub's *Spokes* table the same (a foundation spoke: its cell in the hub's *Spokes* row). Say which
points a command settled and which you judged by reading. A self-review never replaces the grooming
review; it is what lets that review run once.

## How the grooming review runs

**One review per grooming, once every spoke in the hub's *Spokes* table is self-reviewed** — the
hub and all its spokes together, so a fact the hub states once and each spoke restates is checked in
one place, and the stamps are written after it, once. A TRD with no spokes is reviewed right after
the hub's self-review. Grooming reviews follow `principles.md` → *Reviews run as parallel
dimensions* and are never tiered.

1. **One packet, written by script** —
   `node ../../scripts/review-packet.js docs/development/<feature> all --kind groom --base <sha>`.
   `--base` is the parent of the commit that first added the hub — that commit itself when it is the
   repo's first, `HEAD` while the hub is uncommitted; the review of a spoke added after ✅ takes the
   hub rev of the ✅ stamps (*The hub moving*). `--base` names a real commit, never an invented one: a hub
   rev recorded as a date is the hub's last commit by that day, from
   `git log -1 --format=%h --until='<date> 23:59:59' -- <hub>` (none → the first-review base), and
   a repo with no commit yet gets one first — the user commits the profile. The repo's doc-check
   outputs go in with `--settled <file>`. A review scoped to one spoke names its platform in place
   of `all`. Its first stdout lines give the packet path, the tier, the reviewers and the settled
   exit codes.
2. **Launch the reviewers it names, in the foreground** — each handed the packet path, its
   dimension id and, for a variant TRD, that variant's notes under *Variants* as text (a foundation
   spoke's own checks, note 5, one per line, each answered on its own report line), the whole round
   in one message, at most 3 in flight. Each writes `<packet stem>-<id>.md` itself and returns it.
3. **Then, before fixing anything, the gaps check and the critic:** the `review-gaps.js` command the
   packet prints under *Reviewers*, then `alpha-sdlc:sdlc-reviewer-critic` with the reports, that
   output and the section map, written by you as text — every heading of the hub and of each spoke
   (with each spoke's screens, AC IDs and slices), the dimension that owned each, and any variant's
   own checks — so it names each one no report covers; file the critic's report at the path the
   packet names. What they return joins the review's findings — the review cannot close without the
   gaps output in the merged report.
4. **The author verifies before acting** — open every cited file at the cited line, in one batch,
   before editing anything on a report's authority: a review that is wrong in one finding is not
   wrong in all of them, and acting on the wrong one ships a fix nobody reviews.
5. **Stamp the run before fixing anything** — the hub's `Hub review` row becomes
   `review ran <date> · rev <the hub commit the packet read>`. From then on the review only closes
   (*Closing on proofs*): no second packet, and nothing its fixes move sends a spoke back to its
   self-review.
6. If no subagent can run, run the identical checklist inline and say so; never skip the gate.

**Three dimensions, one reviewer each**, launched together: **(a) contract and data** — points 1,
2, 4, 6, 12 and 13, the half a checker and the migrations can settle; **(b) flow and coverage** —
points 3, 5, 7, 8, 9 and 15, and every spoke's widget specs and section slicings read whole, in
whichever repository the spoke lives; **(c) consistency and decisions** — points 10, 11, 14 and 16, the half
only a reader holding the hub and every spoke at once can judge, run on
`alpha-sdlc:sdlc-reviewer-deep`. **A thin dimension folds into its neighbour**, and the packet does
the folding and says so: with one spoke, point 11 does not apply; with no spoke, points 1–11 do not;
a dimension left with one point after `--items` folds the same way; a foundation merges (a) into
(b). Merge the reports into one verdict and one objective-violation count, the same `file:line`
counting once, and record which points — and so which hub and spoke sections — each dimension
owned.

The reviewers' own brief carries their output contract: **measured** or **inferred** per finding
(**inferred is a question, not a defect** — never counted), which copy was read, the working tree
left exactly as found.

**Rendering is checked before any of them, by script, and never reaches a reviewer** — tables
parse and diagrams meet the Mermaid 9.x floor. `validate-doc-tables.js` already decides the table
half at write time; run the repo's doc checks for the rest and put their output in the packet, per
`principles.md` → *What a script decides never reaches a reviewer*. A reviewer spending attention
on what a parser already answered is the cost that makes people skip review.

The per-screen artifacts are frozen while the review runs: a new frame, crop, case or state goes
back to its Step 3 gate first, and the review resumes on the approved result. The grooming review
checks a finished design; it doesn't grow one.

## Hub points

Checked against the **hub, its contract delta, and the profile docs it references**:

12. **The contract passes the repo's own checks** — run the contract validation the profile records
    (`15-api-reference.md` / `10-conventions.md`, e.g. the contract test) against the delta. A form
    the checker cannot read — `nullable: true` in an OpenAPI 3.1 file whose checker reads only
    `type` — is an objective violation, because it is invisible downstream.
13. **Entities complete** — every table the design reads or writes, and every foreign key on those
    tables, has its row in §2 *Entities touched*, with owner and on-delete **read from the
    migrations**, not only the entities the PRD names.
14. **One statement per fact** — §2 freshness, §3 flow steps, §4 design, §5 contract and every table
    agree with each other and with their prose.
15. **Every flow step is served** — each system action in §3 maps to a contract endpoint or a stated
    client-only behavior.
16. **No spoke has to decide a hub matter** — anything a spoke would need decided to make the hub
    true is decided here or listed as a hub Open Decision.

## Alignment points

**A spoke is not complete until the grooming review passes it.** The hub is the single source of
truth; a spoke that quietly disagrees with it is the drift the hub/spoke split exists to prevent,
and it surfaces as a bug three phases later. Every point is checked for every spoke, against the
**hub, the spoke, and the profile docs both reference**:

1. **Contract fidelity** — every endpoint/field the spoke consumes or exposes exists in the hub's
   §5 contract with the **same method, path, shape, nullability, enum values, and localized-object
   typing**; the spoke **links** the contract and never copies it; typed client/fixtures derive
   from it.
2. **No divergent restatement** — anything the hub owns (context, system design, contract,
   cross-cutting) is *linked* from the spoke, not re-described. A restated fact is a fork waiting
   to drift.
3. **Manifest ↔ work slices, both directions** — every spoke work slice appears in the hub's §7
   change manifest, and every manifest row for this platform has a spoke slice. A slice on one
   side only is a gap, not a detail.
4. **Entities & ownership** — entities the spoke touches match the hub's *Entities touched* +
   `06-domain-model.md` ownership; the **decided on-delete edge** is implemented (FK action for
   backend, consumer behavior for clients); no private copy of an entity another feature owns.
5. **Dependencies & flow bindings** — every hub §2 dependency and flow binding that concerns this
   platform is represented in the spoke **with its decided freshness**, and the spoke invents no
   dependency the hub doesn't list.
6. **Cross-cutting** — auth, error handling, logging, i18n, and the freshness mechanism follow hub
   §6; no local variant of a decision the hub already made.
7. **Feature flow covered** — every step and alternate path in the hub's §3 *Feature flow* that
   this platform participates in is present in the spoke (as a screen/step or a work slice), and
   the spoke adds no step the flow doesn't have. A hub journey step no spoke implements is the gap
   this catches.
8. **Hub rules enumerated as numbered AC** — every hub decision about **behavior** touching this
   platform (each integrity cell — visibility · on-delete · freshness — each feature-flow step,
   each flow binding) appears as **its own numbered row in the spoke's §8 Acceptance criteria**
   with the hub decision named in its Source column — a mechanical lookup, not "the spirit was
   carried". Hub **process** rules — register-on-create, profile-doc updates — are **not** AC;
   they are the plan's and stage packet's checklist (`principles.md` → *Keep the project profile
   current*). Every AC's Source names its hub anchor (or an approved spoke decision that cites
   one); an AC without one is a *beyond hub scope* question, not a row. And every AC is claimed by
   ≥ 1 slice (§9), every slice claims ≥ 1 AC.
9. **Sequencing** — the spoke's release considerations don't contradict the hub's release
   ordering.
10. **Open Decisions placed correctly** — a **pending hub decision blocks** the spoke sections
    that depend on it (the spoke must never silently decide it), and a spoke Open Decision that's
    really hub-level is **escalated to the hub**.
11. **Cross-spoke consistency** (2+ spokes) — the spokes agree with **each other** on shared
    behavior (freshness, error semantics, enum handling, validation rules). Two spokes disagreeing
    is a **hub gap**, not a spoke preference.

## Resolve by direction

**Findings resolve by direction, and the direction matters** — in a self-review and in the
grooming review alike:
- **Spoke is wrong** → fix the spoke, re-present the affected section for approval (it's a
  decision change, so it re-gates; a screen's moved sections re-gate together, once per screen).
- **Hub is wrong** (a spoke exposed a real hub error) → **fix it in the hub, once for all spokes —
  never spoke by spoke — and only on a yes to the hub change itself.** Present it as its own
  decision, never folded into "apply all recommendations": the hub sections it moves and the
  spokes it touches. A blanket approval — "all recommendations", "continue" — covers spoke fixes
  only. Gather every hub-wrong finding — from each spoke's self-review, from another session (a
  spoke or a plan groomed alongside), and from the grooming review — as rows of the hub's *Open
  Decisions* with the status `pending hub change`, so they outlive the session, and **leave the
  hub's sections as they are until the grooming review's closing gate**: there they go to the user
  as **one** hub change, and the hub is fixed once. A `pending hub change` row moves no stamp; a
  spoke that needs it cites the row and follows its ★ meanwhile. A hub fixed after each finding
  moves the spokes already checked, so the work multiplies — spokes × hub edits. Never patch a spoke
  to match a hub you know is wrong. After the review has closed, a hub-wrong finding is gathered the
  same way and asked when found (*The hub moving*).
- **Deliberate divergence** (this platform genuinely must differ) → it's an **Open Decision**, and
  once decided it's recorded **in the hub** as a platform exception, so the next spoke and
  `do-development` both see it. Silent divergence is never acceptable.

On the user's yes, the `pending hub change` row becomes `decided: <the change> · <date>` in the same
message as the Edits that fix the hub; on a no it records why the hub stands, and those findings
resolve against the hub as it is.

## Closing on proofs

**One round, closed by proof** (`principles.md` → *One round, closed by proof*). Every finding
names its **closing proof** where a command can give one — the contract checker for points 1 and
12, the AC ↔ slice lookup for point 8, the repo's doc checks, `validate-doc-tables.js` — and the
author fixes every finding in one pass and closes on that output. Hub and spoke consistency is the
half no script can decide, so expect **needs-eyes** findings here more than anywhere else in the
pipeline: they go to the user at the verdict gate, each with its fix and the lines it changed —
never to a second round. What needs-eyes must never be is the easy answer for a point a script can
settle. Judgment findings are the user's decision. A finding **only a code change
can close is not a grooming finding** — record it as a numbered AC (§8) and hand it to
`do-development`.

**The held hub change is applied here, once**, on the user's yes at the verdict gate, with the
spoke fixes, and closes on the same proofs. It sends no spoke back to its self-review and runs no
second review: the review already read each finding and its fix. A screen whose approved sections
the close moves re-gates once per screen (`client-spoke.md` → *Slice every screen*).

## Stamps

**Stamp the result once, after the grooming review closes.** The hub's `Hub review` row becomes
`` ✅ reviewed <YYYY-MM-DD> · rev `<hash>` · findings <n> · needs-eyes <n> ``; each spoke's header
records `Hub alignment: reviewed <date> · hub rev <the hub commit after the close>`, and the
hub's *Spokes* table the same per spoke — a **foundation** spoke, which has no header table of its
own, carries it in the hub's *Spokes* cell. **The exit is never a dirty stamp** — `reviewed` means
the review's objective findings are closed on their proofs and its needs-eyes answered; until then
the hub's row stays `review ran` and the spokes keep their `self-reviewed` stamps.

Spokes may be groomed in parallel sessions, one per platform, each owning its `TRD-<platform>.md`
(per `principles.md` → *Parallel work*): each session self-reviews its own spoke, and the grooming
review runs once, in whichever session finds every spoke self-reviewed — `next-step.js` names the
spokes it still waits for. A stamp given before every spoke is checked is the one the next spoke's
hub fix breaks.

### The hub moving

**The review runs once per feature, and nothing the hub moves is reviewed twice.** A `pending hub
change` row moves no stamp — `next-step.js` skips it.
- **Before the grooming review**, any other hub edit moves every stamp: each spoke re-walks the
  points the changed sections feed, and its `self-reviewed` stamp is rewritten.
- **While it closes** (`review ran`), its held hub change and its fixes move nothing back
  (*Closing on proofs*).
- **After ✅**, a hub change is asked once and, on the yes, fixed once. Each spoke's author then
  re-walks the points the moved sections feed and restamps
  `reviewed <date> · hub rev <commit> · amended <date>`. The hub's author re-walks the hub points
  the change touches and appends `· amended <date>` to the `Hub review` row. No reviewer runs: the
  feature's next fresh eyes are its feature review in `do-development`.

The points a moved section feeds: §1 context or §4 system design → 2 · §2 dependencies and
entities → 4, 5, 8, 13 · §3 feature flow → 7, 8, 15 · §5 contract → 1, 2, 12 · §6 cross-cutting →
6 · §7 change manifest and release ordering → 3, 9 — plus 10, 14 and 16 always, and 11 when two or
more spokes exist. A hub edit that adds, removes, or renumbers a section → every point. A variant
hub maps its moved sections by what they hold — its contract, its AC registry, its change
manifest — and when unsure, every point. A spoke added after ✅ gets its self-review, then the
grooming review scoped to it — its platform in place of `all`, `--items 1,2,3,4,5,6,7,8,9,10,11` —
its first review, not a second. `do-planning` refuses to plan a spoke whose stamp is missing, only
self-reviewed, or older than the hub's last change.

## Variants

Every variant runs the self-reviews and the grooming review by this file. A point is read by what it
checks, never by its section number, and a point a variant skips is reported skipped, with why, in
the verdict — never reported passed.

| Variant | AC registry · slices | Hub points | Alignment points |
|---|---|---|---|
| feature — `do-grooming` | spoke §8 · spoke §9 | 12–16 | 1–11 |
| tech-debt | hub §6 · hub §8 | 12–16 ¹ | 1–11 ¹ ² |
| issue | hub §4 · §6's change manifest | 12–16 ¹ | 1–11 ¹ ³ |
| foundation | each spoke's AC · none | 14, 16 ⁴ | 2–3, 5–6, 8–11 and its own ⁵ |

1. **A point whose subject the TRD lacks** — no contract delta, no user flow, no entity change — is
   left out of the packet's `--items` and named skipped, with why, in the verdict; the hub's
   *Entities touched*, *Feature flow* and contract are read wherever the variant's template keeps
   them.
2. **Tech-debt:** point 8 reads "every §6 AC claimed by ≥ 1 §8 slice and back"; **contract fidelity
   (1, 12) and feature-flow coverage (7, 15) apply only when the refactor touches a contract or a
   user flow** — otherwise they are left out of the packet's `--items` and reported skipped.
3. **Issue:** point 8 reads "every §4 AC claimed by ≥ 1 slice in §6's change manifest and back";
   across platforms the review is what keeps the backend's and the web's account of the same root
   cause from diverging.
4. **Foundation hub points:** minus the contract, entity and flow points (12, 13, 15) a scaffold
   has nothing to check, said so in the verdict.
5. **Foundation alignment:** skip contract fidelity (1), entity ownership (4), feature-flow coverage
   (7) and point 8's AC ↔ slice pair — a base has no contract, flow, entities or slices — and say
   so in the verdict; point 3 has no manifest to match unless the hub keeps one. What's left is the
   highest-value part, checked in the merged (a)+(b) dimension — with two or more spokes, point 10
   stays with 11 in (c): the spoke's structure tree matches the hub's decided **architecture
   style** and repo strategy · the harness commands match the hub's environment decisions · **each
   spoke's AC and structure are consistent with the hub's single omissions register** (one platform
   quietly including what the register defers is exactly the divergence this catches) · every
   spoke's AC bind to the same conventions · Open Decisions sit at the right level (point 10). The
   packet takes `--items 2,3,5,6,8,9,10,11,14,16`.

**Stamps per variant.** Every hub carries a `Hub review` row — `self-reviewed` after its
self-review, `review ran` once the grooming review has run, ✅ at its close. A tech-debt or issue spoke uses `TRD-spoke-template.md`,
so its `Hub alignment` row carries its side, and the hub's *Spokes* row is the hub's one home for
the stamp — no hub-level `Hub alignment` row. A foundation spoke has no header table: its stamp sits
in the hub's *Spokes* row alone, and every spoke is re-checked when a hub decision changes.
