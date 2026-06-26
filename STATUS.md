# Status

## Meta
- project: Strategy Lab
- slug: strategy-lab
- subtitle: Multi-game bot strategy lab · Pax / Monopoly / Catan · TS monorepo
- phase: Phase 5 — Catan game plugin (or Phase 3 web inspector)
- phase_status: next
- color: amber
- icon: SL

## Progress
- total: 7
- done: 4

## Tasks
- [P0] [done] Phase 0 — Detach to own repo + replace cloneState with generic clone
- [P0] [done] Phase 1 — Generic @lab/core (GameDefinition, Policy, RNG, runGame) + paxGame adapter
- [P1] [done] Phase 2 — Strategy lab: tournament runner, seat rotation, win-rate/CI stats, head-to-head, CSV/JSON out, Pax greedy policy
- [P2] [done] Phase 4 — Monopoly game plugin (validated the in-game dice RNG model; buyer beats random)
- [P1] [next] Phase 3 — Generic web state inspector + results dashboard; demote server to replay API
- [P2] [next] Phase 5 — Catan game plugin (validates hidden-info + trading)
- [P2] [next] Phase 6 — "Add a game" kit: template package + conformance test suite

Note: Phase 4 (Monopoly) was pulled ahead of Phase 3 — a second game is the headline
goal and validates the dice RNG model (the key architectural risk).

## Blockers
- None

## Milestones
- [x] Phase 1 — Core + Pax behind GameDefinition, proven via runGame
- [x] Phase 2 — Usable strategy lab on Pax (greedy beats random with non-overlapping 95% CIs)
- [x] Phase 4 — Monopoly playable in the lab (buyer beats random, 66.7% vs 16.7% per seat-game)
- [ ] Phase 3 — Generic inspector + dashboard
- [ ] Phase 5 — Catan playable in the lab
- [ ] Phase 6 — Documented, conformance-tested extension path

## Notes
- Pax rules are still partial (≈30 card special effects inert, piece pools unenforced),
  so Pax win-rate numbers are noisy until completed — treat as a parallel track.
- Engine state is pure JSON; RNG model is "seed + actions ⇒ reproducible", with the
  serializable RNG cursor exercised once Monopoly/Catan add in-game dice.
