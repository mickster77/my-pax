# Adding a game

The lab works against one interface, `GameDefinition`. Implement it and register
it — the runner, tournament stats, and (eventually) the viewer all work for free.

The smallest complete example is **tic-tac-toe** in `packages/tictactoe` (~80
lines). Copy it as a starting point.

## 1. Create the package

```
packages/<your-game>/
  package.json      # name "@games/<your-game>", depends on "@lab/core"
  tsconfig.json     # extends ../../tsconfig.base.json
  src/game.ts       # exports your GameDefinition
  src/index.ts      # re-exports it
  src/game.test.ts  # run checkConformance (see below)
```

## 2. Implement `GameDefinition<State, Action, Observation>`

- `createInitialState(playerIds, seed)` — build the start state.
- `currentPlayer(state)` — the player to move, or `null` when the game is over.
- `isTerminal(state)` — is the game finished?
- `getLegalActions(state, playerId)` — the moves available. Must be **non-empty**
  for the active player until the game ends, or the runner reports a stall.
- `applyAction(state, action)` — **pure**: return a new state, never mutate the
  input. Clone first (`structuredClone`, as the example does).
- `observe(state, playerId)` — the player's view. Must be a **copy**, and must
  hide information that player shouldn't see (e.g. opponents' hands → expose only
  counts). Returning raw state, or sharing nested arrays, fails conformance.
- `result(state)` — `{ winnerIds, scores, turns, endReason }`.

### Two rules that keep the lab trustworthy

1. **Reproducible from the seed.** Never call `Math.random`. Any in-game
   randomness (dice, shuffles, steals) must come from a seeded RNG whose state is
   carried on your game state so it survives cloning — see Monopoly/Catan, which
   do `const rng = makeRng(state.rng); ...; state.rng = rng.state()`. Setup-only
   randomness can use `makeRng(seed)` in `createInitialState`.
2. **No hidden-information leaks.** `observe` is the only thing policies see.

Long-running games should self-cap (a turn limit + a score tiebreak) and report
`endReason: "max_turns"`, so a tournament can't hang.

## 3. Register it

Add it to `apps/lab/src/registry.ts`, and add any game-specific strategies to
`apps/lab/src/strategies.ts` under your game's id. Every game automatically gets
the universal `random` and `first` strategies.

## 4. Verify

Run the conformance suite in your test (this is exactly what `apps/lab`'s
cross-game test does for every registered game):

```ts
import { checkConformance, formatConformance } from "@lab/core";
import { yourGame } from "./game.js";

const report = checkConformance(yourGame, ["p1", "p2"], { seeds: [1, 2, 3] });
// report.passed === true; formatConformance(report) prints each check
```

Then play a tournament:

```bash
npm run dev:lab -- --game <your-game> --seats random,random --games 50 --seed 1
```
