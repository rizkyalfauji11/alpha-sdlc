---
expected: fail
rules: [3, 7, 10]
language: en
context: sdlc
source: added — code names and unexplained jargon in an English plain layer, ending on the details
---
Orders export · Development · Stage 2 of 4 · ⏸ needs your decision

**Bottom line:** the rules that decide who may download which order report are built, and all their tests pass. One problem: adding `ListByOwner` to the `ReportStore` port broke `store.SQLStore`, so `go build ./...` fails in `cmd/server` (main.go:88). Before stage 3 starts, I need you to pick one of the two ways out below.

**Why it matters:** the composition root no longer wires, and the DI container panics at boot until the adapter implements the port.

**Options:**
- ★ Stub the adapter now.
- Merge stages 2 and 3.

**Details (for engineers):** `internal/store/sql.go` lacks `ListByOwner(ctx, ownerID)`; the interface assertion at `sql.go:12` fails.
