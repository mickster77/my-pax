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
  `Policy` contracts, a seeded/serializable RNG, the match runner, the tournament
  runner (seat rotation + stats), baseline policies, and the game registry.
- `packages/engine` (`@pax/engine`) — the Pax Pamir 2e rules engine + a `paxGame`
  adapter and a `greedy` policy.
- `packages/monopoly` (`@games/monopoly`) — a Monopoly engine (dice-driven; the
  game that exercises the in-game RNG model) + a `buyer` policy.
- `packages/catan` (`@games/catan`) — a Catan engine (dice + hidden dev cards;
  the game that exercises hidden-information observations) + a `builder` policy.
- `apps/lab` (`@lab/cli`) — runs tournaments and reports results; `--out` writes a
  summary + CSV, `--replay` records a game.
- `apps/web` (`@lab/web`) — a generic web UI: a results dashboard (win rates +
  CIs, head-to-head, endings) and a replay inspector that steps through a game
  using each game's `describeState` panels. No per-game UI code.
- `apps/server` (`@lab/server`) — a small results/replay API that serves the
  JSON files the lab writes to a `runs/` dir.

## Quick start

```bash
npm install
npm run dev:lab           # greedy vs. 2 random bots over 60 games
```

Pit named strategies against each other (one per seat). Seats rotate across
games so first-player advantage is averaged out; results report per-seat-game
win rate with 95% confidence intervals plus a head-to-head matrix.

```bash
# Pax: a heuristic vs. two random bots, write CSV + JSON
npm run dev:lab -- --game pax --seats greedy,random,random --games 99 --seed 1 --out results

# Monopoly: an aggressive buyer vs. two random bots
npm run dev:lab -- --game monopoly --seats buyer,random,random --games 99 --seed 1

# Catan: a builder vs. two random bots (Catan games are longer — raise the step cap)
npm run dev:lab -- --game catan --seats builder,random,random --games 60 --seed 1 --max-steps 60000
```

Flags: `--game <id>` (`pax`, `monopoly`, `catan`), `--seats <s1,s2,...>` (one
strategy per seat), `--games <n>`, `--seed <n>`, `--max-steps <n>`, `--no-rotate`,
`--out <prefix>`. Built-in strategies: `random`, `first` (any game), `greedy`
(Pax), `buyer` (Monopoly), `builder` (Catan). A run is fully reproducible from
its seed.

### Web UI

```bash
npm run dev:web     # dashboard + replay inspector at http://localhost:5173
```

It loads a bundled sample by default; use the in-page file pickers to load your
own `--out` summary or `--replay` JSON. To serve runs over HTTP instead:

```bash
npm run dev:lab -- --game catan --seats builder,random,random --out runs/catan --replay runs/catan.replay.json
npm run dev:server  # results/replay API at http://localhost:4000 (reads ./runs)
```

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
