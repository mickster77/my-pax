# Strategy Lab

A multi-game board-game **strategy lab**. Define playing strategies as bots, run
large seeded AI-vs-AI tournaments, and compare win rates to find out which
strategies actually work.

Pax Pamir 2e is the first game. The platform is built so adding a game —
**Monopoly** and **Catan** are next — is just implementing one interface.

> This started as a Pax Pamir 2e engine ([upstream](https://github.com/djfracking/pax))
> and is being generalized into a game-agnostic strategy lab.

## How it fits together

Everything depends on a small generic core; each game is a plugin that
implements the core's `GameDefinition`. Nothing in the lab or core knows about a
specific game.

- `packages/core` (`@lab/core`) — game-agnostic kernel: the `GameDefinition` and
  `Policy` contracts, a seeded/serializable RNG, the match runner, baseline
  policies, and the game registry.
- `packages/engine` (`@pax/engine`) — the Pax Pamir 2e rules engine, plus a
  `paxGame` adapter that implements `GameDefinition`.
- `apps/lab` (`@lab/cli`) — runs tournaments and reports results.
- `apps/server`, `apps/web` — the original Pax server + spectator UI (being
  repurposed into a generic state inspector and results dashboard).

Planned: `packages/games/monopoly`, `packages/games/catan`.

## Quick start

```bash
npm install
npm run dev:lab           # greedy vs. 2 random bots over 60 games
```

Pit named strategies against each other (one per seat). Seats rotate across
games so first-player advantage is averaged out; results report per-seat-game
win rate with 95% confidence intervals plus a head-to-head matrix.

```bash
# 99 games, a heuristic vs. two random bots, write CSV + JSON
npm run dev:lab -- --seats greedy,random,random --games 99 --seed 1 --out results
```

Flags: `--game <id>`, `--seats <s1,s2,...>` (one strategy per seat),
`--games <n>`, `--seed <n>`, `--max-steps <n>`, `--no-rotate`, `--out <prefix>`.
Built-in strategies: `random`, `first` (game-agnostic), `greedy` (Pax). A run is
fully reproducible from its seed.

### Useful scripts

- `npm run typecheck`
- `npm run test`
- `npm run build`

## Adding a game

1. Create a package that exports a `GameDefinition<State, Action, Observation>`.
2. Make any in-game randomness draw from an RNG seeded off state (so runs stay
   reproducible), and make `observe()` hide what a player shouldn't see.
3. Register it in `apps/lab/src/registry.ts`.

That's it — the runner, stats, and viewer work against the interface, not your game.
