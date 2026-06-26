import type { GameDefinition, GameResult, PlayerId, Policy } from "./types.js";
import { makeRng } from "./rng.js";

export interface RunGameOptions {
  /** Seed for the game's initial state (deck shuffles, dice, etc.). */
  seed: number;
  /**
   * Seed for policy randomness. Defaults to a value derived from `seed` so a run
   * is fully reproducible from `seed` alone. Set independently to vary bot
   * decisions while holding the game setup fixed.
   */
  policySeed?: number;
  /** Safety cap on actions applied, to bound non-terminating games. Default 5000. */
  maxSteps?: number;
}

export interface GameRun extends GameResult {
  /** Number of actions actually applied. */
  steps: number;
}

/**
 * Play one game to completion (or until a safety limit) and return the result.
 * Generic over any GameDefinition — this is the heart of the lab and knows
 * nothing about any specific game.
 */
export function runGame<State, Action, Observation>(
  def: GameDefinition<State, Action, Observation>,
  policies: Record<PlayerId, Policy<Action, Observation>>,
  playerIds: PlayerId[],
  opts: RunGameOptions
): GameRun {
  const maxSteps = opts.maxSteps ?? 5000;
  const rng = makeRng(opts.policySeed ?? (opts.seed >>> 0) ^ 0x5bd1e995);

  let state = def.createInitialState(playerIds, opts.seed);
  let steps = 0;
  let exit: "terminal" | "step_limit" | "no_legal_actions" = "terminal";

  while (true) {
    if (def.isTerminal(state)) break;
    if (steps >= maxSteps) {
      exit = "step_limit";
      break;
    }
    const pid = def.currentPlayer(state);
    if (pid == null) break;

    const legalActions = def.getLegalActions(state, pid);
    if (legalActions.length === 0) {
      exit = "no_legal_actions";
      break;
    }

    const policy = policies[pid] ?? policies["*"];
    if (!policy) throw new Error(`No policy provided for player "${pid}"`);

    const action = policy({
      observation: def.observe(state, pid),
      legalActions,
      playerId: pid,
      rng,
    });
    state = def.applyAction(state, action);
    steps += 1;
  }

  const result = def.result(state);
  if (exit !== "terminal" && !def.isTerminal(state)) {
    result.endReason = exit === "step_limit" ? "step_limit" : "no_legal_actions";
  }
  return { ...result, steps };
}

export interface RunBatchOptions {
  /** Number of games to play. */
  games: number;
  /** First seed; game i uses seedBase + i. Default 1. */
  seedBase?: number;
  maxSteps?: number;
}

/** Play many games over a sweep of seeds. Seat rotation / mirroring is layered on in Phase 2. */
export function runBatch<State, Action, Observation>(
  def: GameDefinition<State, Action, Observation>,
  policies: Record<PlayerId, Policy<Action, Observation>>,
  playerIds: PlayerId[],
  opts: RunBatchOptions
): GameRun[] {
  const seedBase = opts.seedBase ?? 1;
  const runs: GameRun[] = [];
  for (let i = 0; i < opts.games; i += 1) {
    runs.push(runGame(def, policies, playerIds, { seed: seedBase + i, maxSteps: opts.maxSteps }));
  }
  return runs;
}
