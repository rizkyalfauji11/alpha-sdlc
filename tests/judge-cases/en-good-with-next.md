---
expected: pass
rules: []
language: en
context: sdlc
source: added — an English summary that keeps every rule; the Indonesian guide must not apply
---
Orders export · Development · Stage 2 of 4 · ⏸ needs your decision

**Bottom line:** the rules that decide who may download which order report are built, and all their tests pass. Nothing uses them yet. One problem: the plan says the whole code base still builds after this stage, and it does not. Before stage 3 (saving reports to the database) starts, I need you to pick one of the two ways out below.

**Why it matters:** the plan calls this stage a safe place to stop. If the team stopped here, the server would not build until stage 3 is done.

**Options:**
- ★ Add a temporary stand-in for the report storage now, so the server keeps building. This keeps this stage a safe place to stop.
- Merge stages 2 and 3. There is no temporary code, but the change to review gets bigger.

**Details (for engineers):** the new `ListByOwner` method on the `ReportStore` port leaves `store.SQLStore` short of the interface; only `cmd/server` fails to compile (`main.go:88`).

**Next:** I am waiting for your choice above. Once you pick, I build stage 3 that way.
