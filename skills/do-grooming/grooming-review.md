# Grooming reviews — the hub review and the hub-alignment review

The review file of all four groomings: `do-grooming` Step 2a (hub review) and Step 4 (hub-alignment
review), and the same two reviews in `do-tech-debt-grooming`, `do-issue-grooming` and
`do-foundation-grooming` — *Variants* says what each drops, adds or keeps. Read it at the hub
review, at the alignment review, and whenever a hub edit stales a spoke — once per session, again
after a compaction. Hub review points 1–5 and alignment points 1–11 keep their numbers: the packet
and `review-gaps.js` key on them. The gates stay in each skill's `SKILL.md`.

## Contents

- **How a round runs** — packet, reviewers, gaps check, critic, one merged verdict
- **Hub review** — points 1–5, the gate before any spoke
- **Hub-alignment review** — points 1–11, the completion gate of every spoke
- **Resolve by direction** — spoke wrong, hub wrong, deliberate divergence
- **Rounds and closing proofs**
- **Stamps** — and **The hub moving**
- **Variants** — feature · tech-debt · issue · foundation

## How a round runs

Grooming reviews follow `principles.md` → *Reviews run as parallel dimensions* and are never
tiered: every round runs its dimensions.

1. **One packet per round, written by script** — the hub review runs
   `node ../../scripts/review-packet.js docs/development/<feature> hub --kind trd --base <sha>`
   and an alignment review the same with `<platform>` in place of `hub`. `--base` is the hub rev
   of the spoke's last stamp; for a first review, and for the hub review, it is the parent of the
   commit that first added the reviewed TRD — that commit itself when it is the repo's first,
   `HEAD` while that TRD is uncommitted. `--base` names a real commit, never an invented one: a hub
   rev recorded as a date is the hub's last commit by that day, from
   `git log -1 --format=%h --until='<date> 23:59:59' -- <hub>` (none → the first-review base), and
   a repo with no commit yet gets one first — the user commits the profile. The repo's doc-check
   outputs go in with `--settled <file>`. A later round adds `--round <r> --prev <merged findings>`
   and `--dimensions <those with findings>`; a scoped re-review after a hub fix adds
   `--items <points in play> --single`. Its first stdout lines give the packet path, the tier, the
   reviewers and the settled exit codes.
2. **Launch the reviewers it names, in the foreground** — each handed the packet path, its
   dimension id and, for a variant TRD, that variant's notes under *Variants* as text (a foundation
   spoke's own checks, note 5, one per line, each answered on its own report line), the whole round
   in one message, at most 3 in flight, never reviews of two spokes in one message. Each writes
   `<packet stem>-<id>.md` itself and returns it.
3. **Then, before fixing anything, the gaps check and the critic:** the `review-gaps.js` command the
   packet prints under *Reviewers*, then `alpha-sdlc:sdlc-reviewer-critic` with the reports, that
   output and the section map, written by you as text — every heading of the reviewed TRD (an
   alignment adds the spoke's screens, AC IDs and slices), the dimension that owned each, and any
   variant's own checks — so it names each one no report covers; file the critic's report at the
   path the packet names. What they return joins the round's findings — a round cannot close
   without the gaps output in the merged report.
4. **The author verifies before acting** — open every cited file at the cited line, in one batch,
   before editing anything on a report's authority: a review that is wrong in one finding is not
   wrong in all of them, and acting on the wrong one costs a whole round.
5. If no subagent can run, run the identical checklist inline and say so; never skip the gate.

The reviewers' own brief carries their output contract: **measured** or **inferred** per finding
(**inferred is a question, not a defect** — never counted), which copy was read, the working tree
left exactly as found.

## Hub review

**The hub is reviewed before any spoke is groomed.** Spokes are not the hub's reviewers: every hub
defect a spoke finds re-stales every other spoke, so the hub's own errors are caught once, up
front, while nothing depends on it yet.

Once the hub's last section is written, hand the **hub, its contract delta, and the profile docs it
references** — the packet — to the **reviewer subagents** (`alpha-sdlc:sdlc-reviewer` — not your
grooming context), split across the dimensions named under the checklist, each handed the whole
packet but only its own points:

1. **The contract passes the repo's own checks** — run the contract validation the profile records
   (`15-api-reference.md` / `10-conventions.md`, e.g. the contract test) against the delta. A form
   the checker cannot read — `nullable: true` in an OpenAPI 3.1 file whose checker reads only
   `type` — is an objective violation, because it is invisible downstream.
2. **Entities complete** — every table the design reads or writes, and every foreign key on those
   tables, has its row in §2 *Entities touched*, with owner and on-delete **read from the
   migrations**, not only the entities the PRD names.
3. **One statement per fact** — §2 freshness, §3 flow steps, §4 design, §5 contract and every table
   agree with each other and with their prose.
4. **Every flow step is served** — each system action in §3 maps to a contract endpoint or a stated
   client-only behavior.
5. **No spoke has to decide a hub matter** — anything a spoke would need decided to make the hub
   true is decided here or listed as a hub Open Decision.

**Two dimensions, one reviewer each**, launched together (`principles.md` → *Reviews run as
parallel dimensions*): **(a) contract & entities** — points 1 and 2, the half a checker and the
migrations can settle; **(b) consistency & flow** — points 3, 4 and 5, the half only a reader
holding the whole hub at once can judge, run on `alpha-sdlc:sdlc-reviewer-deep`. Merge the two
reports into one verdict and one objective-violation count, the same `file:line` counting once. A
re-run after a fix launches only the dimension whose points are in play. Record which dimension
owns each section of the hub, and **before fixing anything, run the completeness critic** over the
merged findings, that map and the hub — a section neither dimension opened is the gap one round
cannot afford (`principles.md` → *Reviews run as parallel dimensions*).

**Rendering is checked before either of them, by script, and never reaches a reviewer** — tables
parse and diagrams meet the Mermaid 9.x floor. `validate-doc-tables.js` already decides the table
half at write time; run the repo's doc checks for the rest and put their output in the packet, per
`principles.md` → *What a script decides never reaches a reviewer*. A reviewer spending attention
on what a parser already answered is the cost that makes people skip review.

Fix objective violations and **close on each finding's closing proof** where one exists — here
that is the doc checks, `validate-doc-tables.js`, the coverage checker or a cited re-read of the
section (`principles.md` → *One round, closed by proof*). Hub consistency is the half no script can
decide, so expect **needs-eyes** findings here more than anywhere else in the pipeline, and **those
are exactly what a second round is for** — send them back rather than closing on a claim. Judgment
findings are the user's decision.

**Every round, clean or not, appends its objective-violation count to the Hub review row** —
`` ❌ not reviewed · rounds `5 · 2` `` — so the count, and the three-round STOP it feeds, outlive the
session. On a clean pass stamp the hub's **Hub review** row (`reviewed <date> · rev <commit>` plus
its round counts — `` ✅ reviewed <YYYY-MM-DD> · rev `<hash>` · rounds `5 · 2 · 0` ``), and only
then offer the first spoke. Present the verdict and STOP.

## Hub-alignment review

**Hub-alignment review — every spoke, before it's done, and again whenever the hub moves.** The
hub is the single source of truth; a spoke that quietly disagrees with it is the drift the hub/spoke
split exists to prevent, and it surfaces as a bug three phases later. So a spoke is **not
complete** until it passes an alignment review against the hub. Run it with the **reviewer
subagent** (`alpha-sdlc:sdlc-reviewer`) handed the **hub, the spoke, and the profile docs both
reference** — the packet — not your grooming reasoning. The checklist:

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

**Three dimensions, one reviewer each**, launched together (`principles.md` → *Reviews run as
parallel dimensions*): (a) contract and data — points 1, 2, 4 and 6; (b) flow and coverage — points
3, 5, 7, 8 and 9; (c) decisions and siblings — points 10 and 11. **A thin dimension folds into its
neighbour**, and the packet does the folding and says so: with one spoke, point 11 does not apply
and point 10 joins (b); a dimension left with one point after `--items` folds the same way; a
foundation spoke merges (a) into (b). A re-run after a fix, or a scoped re-review after a hub
change, launches only the dimensions whose points are in play. Record which checklist points — and
so which spoke sections — each dimension owned, and **before fixing anything, run the completeness
critic** over the merged findings, that map and the spoke: a screen, slice or AC row no dimension
opened is the gap one round cannot afford (`principles.md` → *Reviews run as parallel
dimensions*).

The per-screen artifacts are frozen while the rounds run: a new frame, crop, case or state goes back
to its Step 3 gate first, and the rounds resume on the approved result. Alignment rounds check a
finished design; they don't grow one.

## Resolve by direction

**Findings resolve by direction, and the direction matters:**
- **Spoke is wrong** → fix the spoke, re-present the affected section for approval (it's a
  decision change, so it re-gates).
- **Hub is wrong** (the spoke exposed a real hub error) → **fix it in the hub, once for all
  spokes — never spoke by spoke — and only on a yes to the hub change itself.** Present it as its
  own decision, never folded into "apply all recommendations": the hub sections it moves, the
  spokes whose stamps it stales, and the re-review each of them then needs. A blanket approval —
  "all recommendations", "continue" — covers spoke fixes only. If other existing spokes are
  awaiting alignment, run theirs against the current hub first and gather every hub-wrong finding;
  record them as one row of the hub's *Open Decisions* with the status `pending hub change` before
  you ask, so they outlive the session; take them to the user as **one** hub change, fix the hub
  once, then re-run alignment once per spoke (scoped, per *The hub moving* below). **Scoped
  re-reviews run one spoke at a time** — the packet with `--items <points in play> --single`, one
  reviewer, then the critic — and the stamps are written after every review is back. A hub fixed
  after each spoke's review re-stales the spokes already re-stamped, so rounds multiply — spokes ×
  hub edits. Never patch a spoke to match a hub you know is wrong.
- **Deliberate divergence** (this platform genuinely must differ) → it's an **Open Decision**, and
  once decided it's recorded **in the hub** as a platform exception, so the next spoke and
  `do-development` both see it. Silent divergence is never acceptable.

On the user's yes, the `pending hub change` row becomes `decided: <the change> · <date>` in the same
message as the Edits that fix the hub; on a no it records why the hub stands, and those findings
resolve against the hub as it is.

## Rounds and closing proofs

**Rounds converge, or they stop — and the first one aims to be the only one.** Every finding
names its **closing proof** where a command can give one — the contract checker, the repo's doc
checks, `validate-doc-tables.js`, the AC ↔ slice lookup — and the author closes on that output
instead of handing the fixes back; a finding no command can close is labelled **needs-eyes** by
the reviewer that raised it, and those are what a next round is for (`principles.md` → *One
round, closed by proof*). Each round records its **objective-violation count** and its
**needs-eyes count** (per `principles.md`); **flat or rising across three rounds is a STOP** —
escalate to the user with the trend instead of launching another round. A finding **only a code
change can close is not a grooming finding** — record it as a numbered AC (§8) and hand it to
`do-development`.

In alignment, **close on each finding's closing proof** where one exists — the contract checker for
point 1, the AC ↔ slice lookup for point 8, the doc checks for the rest — and send back only what
came back **needs-eyes**. Alignment is largely a reading judgment, so needs-eyes is common here and
is exactly what a round is for; what it must never be is the easy answer for a point a script can
settle.

## Stamps

**Stamp the result.** The spoke header records `Hub alignment: reviewed <date> · hub rev <commit /
hub's last approval date>`, and the hub's *Spokes* table records the same per spoke — those two
segments only; each round appends its objective-violation count to the spoke's separate `Alignment
rounds` row instead (`7 · 4 · 0`) — a **foundation** spoke, which has no header table of its own,
carries the count in the hub's *Spokes* cell beside its stamp. Both sides are stamped only on a
clean pass; every round, clean or dirty, appends its count. **The exit is never a dirty stamp** —
the stamp keeps meaning *aligned*, so it lands only on a clean pass.

Spokes may also be groomed in parallel sessions, one per platform, each owning its
`TRD-<platform>.md` (per `principles.md` → *Parallel work*) — but then **no spoke is stamped until
every spoke in scope has finished its first alignment round**, so the hub-wrong findings of all of
them are gathered and fixed once. A stamp given early is the one the next spoke's hub fix breaks.

### The hub moving

**The hub moving makes every stamp stale — and the re-review is scoped to what moved.** When a hub
section is edited after any spoke exists, re-run this review for each spoke and re-stamp, handing
the reviewer the hub diff since that spoke's stamp and only the checklist items the changed sections
feed: §1 context or §4 system design → 2 · §2 dependencies and entities → 4, 5, 8 · §3 feature flow
→ 7, 8 · §5 contract → 1, 2 · §6 cross-cutting → 6 · §7 change manifest and release ordering → 3,
9 — plus 10 always, and 11 when two or more spokes exist. A hub edit that adds, removes, or
renumbers a section gets the full checklist. A variant hub maps its moved sections by what they
hold — its contract, its AC registry, its change manifest — and when unsure, the full checklist. The
reviewer names the items it ran; an item it judges the change also reaches, it runs and says why.
`do-planning` refuses to plan a spoke whose stamp is missing or older than the hub's last change.

## Variants

Every variant runs both reviews by this file. A point is read by what it checks, never by its
section number, and a point a variant skips is reported skipped, with why, in the verdict — never
reported passed.

| Variant | AC registry · slices | Hub review | Hub-alignment review |
|---|---|---|---|
| feature — `do-grooming` | spoke §8 · spoke §9 | points 1–5 | points 1–11 |
| tech-debt | hub §6 · hub §8 | points 1–5 ¹ | points 1–11 ¹ ² |
| issue | hub §4 · §6's change manifest | points 1–5 ¹ | points 1–11 ¹ ³ |
| foundation | each spoke's AC · none | points 3, 5 ⁴ | points 2–3, 5–6, 8–11 and its own ⁵ |

1. **A point whose subject the TRD lacks** — no contract delta, no user flow, no entity change — is
   left out of the packet's `--items` and named skipped, with why, in the verdict; the hub's
   *Entities touched*, *Feature flow* and contract are read wherever the variant's template keeps
   them.
2. **Tech-debt:** point 8 reads "every §6 AC claimed by ≥ 1 §8 slice and back"; **contract fidelity
   (1) and feature-flow coverage (7) apply only when the refactor touches a contract or a user
   flow** — otherwise they are left out of the packet's `--items` and reported skipped.
3. **Issue:** point 8 reads "every §4 AC claimed by ≥ 1 slice in §6's change manifest and back";
   across platforms the review is what keeps the backend's and the web's account of the same root
   cause from diverging.
4. **Foundation hub review:** minus the contract, entity and flow points (1, 2, 4) a scaffold has
   nothing to check, said so in the verdict — the packet takes `--items 3,5`.
5. **Foundation alignment:** skip contract fidelity (1), entity ownership (4), feature-flow coverage
   (7) and point 8's AC ↔ slice pair — a base has no contract, flow, entities or slices — and say
   so in the verdict; point 3 has no manifest to match unless the hub keeps one. What's left is the
   highest-value part, checked in the merged (a)+(b) dimension — with two or more spokes, point 10
   stays with 11 in (c): the spoke's structure tree matches the hub's decided **architecture
   style** and repo strategy · the harness commands match the hub's environment decisions · **each
   spoke's AC and structure are consistent with the hub's single omissions register** (one platform
   quietly including what the register defers is exactly the divergence this catches) · every
   spoke's AC bind to the same conventions · Open Decisions sit at the right level (point 10). The
   packet takes `--items 2,3,5,6,8,9,10,11`.

**Stamps per variant.** Every hub carries a `Hub review` row — round counts every round, ✅ on a
clean pass. A tech-debt or issue spoke uses `TRD-spoke-template.md`, so its `Hub alignment` and
`Alignment rounds` rows carry its side, and the hub's *Spokes* row is the hub's one home for the
stamp — no hub-level `Hub alignment` row. A foundation spoke has no header table: its stamp and
round count sit side by side in the hub's *Spokes* row alone, and every spoke is re-reviewed when a
hub decision changes.
