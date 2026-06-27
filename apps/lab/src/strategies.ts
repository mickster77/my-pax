import { randomPolicy, firstActionPolicy, type Strategy } from "@lab/core";
import { paxGreedyPolicy } from "@pax/engine";
import { monopolyBuyerPolicy } from "@games/monopoly";
import { catanBuilderPolicy } from "@games/catan";

// Named strategies available on the command line. `random` and `first` are
// game-agnostic; `greedy` (Pax), `buyer` (Monopoly), and `builder` (Catan) are
// game-specific (using a game-mismatched strategy still runs but is not
// meaningful). When convenient this registry should become per-game.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STRATEGIES: Record<string, Strategy<any, any>> = {
  random: { name: "random", policy: randomPolicy },
  first: { name: "first", policy: firstActionPolicy },
  greedy: { name: "greedy", policy: paxGreedyPolicy },
  buyer: { name: "buyer", policy: monopolyBuyerPolicy },
  builder: { name: "builder", policy: catanBuilderPolicy },
};

export function strategyNames(): string[] {
  return Object.keys(STRATEGIES);
}

export function resolveStrategy(name: string): Strategy {
  const strategy = STRATEGIES[name];
  if (!strategy) {
    throw new Error(`Unknown strategy "${name}". Available: ${strategyNames().join(", ")}`);
  }
  return strategy;
}
