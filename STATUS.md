# Status

## Meta
- project: Strategy Lab
- slug: strategy-lab
- subtitle: Multi-game bot strategy lab · Pax / Monopoly / Catan · TS monorepo
- phase: Complete — all 7 phases done
- phase_status: done
- color: green
- icon: SL

## Progress
- total: 7
- done: 7

## Tasks
- [P0] [done] Phase 0 — Detach to own repo + replace cloneState with generic clone
- [P0] [done] Phase 1 — Generic @lab/core (GameDefinition, Policy, RNG, runGame) + paxGame adapter
- [P1] [done] Phase 2 — Strategy lab: tournament runner, seat rotation, win-rate/CI stats, head-to-head, CSV/JSON out, Pax greedy policy
- [P1] [done] Phase 3 — Web UI: results dashboard + generic replay inspector; server demoted to a results/replay API
- [P2] [done] Phase 4 — Monopoly game plugin (validated the in-game dice RNG model; buyer beats random)
- [P2] [done] Phase 5 — Catan game plugin (validated hidden-info observations; builder beats random ~98%)
- [P2] [done] Phase 6 — "Add a game" kit: conformance suite, tic-tac-toe example game, per-game strategy registry, authoring guide

## Blockers
- None

## Milestones
- [x] Phase 1 — Core + Pax behind GameDefinition, proven via runGame
- [x] Phase 2 — Usable strategy lab on Pax (greedy beats random with non-overlapping 95% CIs)
- [x] Phase 3 — Web dashboard + replay inspector (verified in-browser); results API
- [x] Phase 4 — Monopoly playable in the lab (buyer beats random, 66.7% vs 16.7% per seat-game)
- [x] Phase 5 — Catan playable in the lab (builder beats random ~98%; hidden dev cards)
- [x] Phase 6 — Documented, conformance-tested extension path (tic-tac-toe example; 4/4 games conform)

## Notes
- Pax rules are still partial (≈30 card special effects inert, piece pools unenforced),
  so Pax win-rate numbers are noisy until completed — treat as a parallel track.
- Engine state is pure JSON; RNG model is "seed + actions ⇒ reproducible", with the
  serializable RNG cursor exercised once Monopoly/Catan add in-game dice.
