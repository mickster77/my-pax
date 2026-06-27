# Status

## Meta
- project: Strategy Lab
- slug: strategy-lab
- subtitle: Multi-game bot strategy lab · Pax / Monopoly / Catan · TS monorepo
- phase: Phase 3 — Generic web inspector + results dashboard (last remaining)
- phase_status: next
- color: green
- icon: SL

## Progress
- total: 7
- done: 6

## Tasks
- [P0] [done] Phase 0 — Detach to own repo + replace cloneState with generic clone
- [P0] [done] Phase 1 — Generic @lab/core (GameDefinition, Policy, RNG, runGame) + paxGame adapter
- [P1] [done] Phase 2 — Strategy lab: tournament runner, seat rotation, win-rate/CI stats, head-to-head, CSV/JSON out, Pax greedy policy
- [P2] [done] Phase 4 — Monopoly game plugin (validated the in-game dice RNG model; buyer beats random)
- [P2] [done] Phase 5 — Catan game plugin (validated hidden-info observations; builder beats random ~98%)
- [P2] [done] Phase 6 — "Add a game" kit: conformance suite, tic-tac-toe example game, per-game strategy registry, authoring guide
- [P1] [next] Phase 3 — Generic web state inspector + results dashboard; demote server to replay API

Note: Phases 4-6 were done before Phase 3 (web UI). All three requested games (Pax,
Monopoly, Catan) plus a tic-tac-toe example run in the lab; only the web UI remains.

## Blockers
- None

## Milestones
- [x] Phase 1 — Core + Pax behind GameDefinition, proven via runGame
- [x] Phase 2 — Usable strategy lab on Pax (greedy beats random with non-overlapping 95% CIs)
- [x] Phase 4 — Monopoly playable in the lab (buyer beats random, 66.7% vs 16.7% per seat-game)
- [x] Phase 5 — Catan playable in the lab (builder beats random ~98%; hidden dev cards)
- [x] Phase 6 — Documented, conformance-tested extension path (tic-tac-toe example; 4/4 games conform)
- [ ] Phase 3 — Generic inspector + dashboard

## Notes
- Pax rules are still partial (≈30 card special effects inert, piece pools unenforced),
  so Pax win-rate numbers are noisy until completed — treat as a parallel track.
- Engine state is pure JSON; RNG model is "seed + actions ⇒ reproducible", with the
  serializable RNG cursor exercised once Monopoly/Catan add in-game dice.
