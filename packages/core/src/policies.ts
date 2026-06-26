import type { Policy } from "./types.js";

/**
 * Baseline strategies that work for any game. Game-specific heuristics live in
 * the game's own package (or in the lab); these exist so every new game has an
 * opponent to measure against on day one.
 */

/** Uniformly random over legal actions, using the seeded rng (reproducible). */
export const randomPolicy: Policy<unknown, unknown> = ({ legalActions, rng }) =>
  legalActions[rng.int(legalActions.length)];

/** Always take the first legal action. Deterministic; a trivial fixed baseline. */
export const firstActionPolicy: Policy<unknown, unknown> = ({ legalActions }) => legalActions[0];
