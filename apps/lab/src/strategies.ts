import { randomPolicy, firstActionPolicy, type Strategy } from "@lab/core";
import { paxGreedyPolicy } from "@pax/engine";
import { monopolyBuyerPolicy } from "@games/monopoly";
import { catanBuilderPolicy } from "@games/catan";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStrategy = Strategy<any, any>;

// Strategies are resolved per game: every game gets the universal baselines, plus
// its own game-specific strategies. Adding a strategy for a new game means adding
// an entry under its game id here.
const UNIVERSAL: Record<string, AnyStrategy> = {
  random: { name: "random", policy: randomPolicy },
  first: { name: "first", policy: firstActionPolicy },
};

const BY_GAME: Record<string, Record<string, AnyStrategy>> = {
  pax: { greedy: { name: "greedy", policy: paxGreedyPolicy } },
  monopoly: { buyer: { name: "buyer", policy: monopolyBuyerPolicy } },
  catan: { builder: { name: "builder", policy: catanBuilderPolicy } },
  tictactoe: {},
};

export function strategyNames(gameId: string): string[] {
  return [...Object.keys(UNIVERSAL), ...Object.keys(BY_GAME[gameId] ?? {})];
}

export function resolveStrategy(gameId: string, name: string): AnyStrategy {
  const strategy = BY_GAME[gameId]?.[name] ?? UNIVERSAL[name];
  if (!strategy) {
    throw new Error(`Unknown strategy "${name}" for game "${gameId}". Available: ${strategyNames(gameId).join(", ")}`);
  }
  return strategy;
}
