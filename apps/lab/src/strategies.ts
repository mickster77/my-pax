import { randomPolicy, firstActionPolicy, type Strategy } from "@lab/core";
import { paxGreedyPolicy } from "@pax/engine";

// Named strategies available on the command line. `random` and `first` are
// game-agnostic; `greedy` is Pax-specific (it will be meaningful once each game
// ships its own strategies — this registry becomes per-game then).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STRATEGIES: Record<string, Strategy<any, any>> = {
  random: { name: "random", policy: randomPolicy },
  first: { name: "first", policy: firstActionPolicy },
  greedy: { name: "greedy", policy: paxGreedyPolicy },
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
