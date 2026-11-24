# Gaps in development — one hand-back per class

Read when a stage hits something the design doesn't cover, before you stop it (`stage-steps.md` →
*Build only decided scope*). Every return to grooming costs a round: the units re-gated, the hub
re-walked, every spoke re-walked, in each repository. Two things keep a feature to one round per
kind of gap instead of one per stage. Neither relaxes the rule: a gap is still never filled by
invention.

## A missed instance of a decided rule is not a gap

The design decided a rule, and its list missed an instance — the hub's §3 *Access inventory* says
what each role sees on a surface, and a link to that surface is not in its rows; a spoke decision
states that every in-page link follows its target's audience, and names five of six links. Nobody
has to guess: the rule's own words give the answer. Build it per the rule, test-first like any
change, and record it:
- a row in the spoke's `Open Decisions` — `<the instance> · decided: by <anchor> "<the rule,
  quoted>" · <date>` — and, when the rule's AC lists its instances, the AC it extends;
- a line in the stage packet's *Self-review* slot, so the checkpoint sees it.

It is no gap only when the quoted words settle it. Two readings of the rule, or an instance that
needs a state, frame, copy or permission the design never drew, make it a gap.

## Sweep for the class before you hand back

A real gap is rarely alone — the link a role cannot follow sits beside others; the frame one
refusal renders in repeats on every page that refuses. Before the stage stops:
1. Name the class in one line — in-page links to a surface a role is refused; pages refusing inside
   the shell or as the whole page; writes on a page a role can only read.
2. Search for it across the code every remaining stage of this plan touches, and every surface the
   hub's *Access inventory* lists.
3. Record every hit in **one** Open Decision on the spoke — the class, the search with its hit
   count, each hit with its file and the stage it falls in — with 2–3 options and one ★.

Grooming then re-gates its units once for the whole class (`do-grooming --units`), and the later
stages build from that answer instead of each stopping on its own instance. The stage packet names
the search, so the checkpoint sees it covered the plan, not one stage.

**Auto-run** decides the class's ★ once, recorded on that one Open Decision, and builds every hit
per it. When answering would change the hub, the whole class is the one hub Open Decision the
chain grooms in place (`SKILL.md` → *Hub change in auto-run*). Outside auto-run the stage stops on
it, and the halt names that Open Decision and its ★, so grooming opens on it.
