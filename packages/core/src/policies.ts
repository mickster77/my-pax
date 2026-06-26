import type { PolicyContext } from "./types.js";

/**
 * Baseline strategies that work for any game. Game-specific heuristics live in
 * the game's own package (or in the lab); these exist so every new game has an
 * opponent to measure against on day one.
 *
 * Written as generic functions so they are assignable to any game's concrete
 * Policy<Action, Observation> type.
 */

/** Uniformly random over legal actions, using the seeded rng (reproducible). */
export function randomPolicy<Action, Observation>(ctx: PolicyContext<Action, Observation>): Action {
  return ctx.legalActions[ctx.rng.int(ctx.legalActions.length)];
}

/** Always take the first legal action. Deterministic; a trivial fixed baseline. */
export function firstActionPolicy<Action, Observation>(ctx: PolicyContext<Action, Observation>): Action {
  return ctx.legalActions[0];
}
