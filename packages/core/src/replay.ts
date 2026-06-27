import { makeRng } from "./rng.js";
import type { GameDefinition, GameResult, PlayerId, Policy, StateView } from "./types.js";

// Recording a game for the web replay inspector. A replay is a list of
// pre-rendered StateViews (via the game's describeState) plus the action label
// for each step — so the browser can step through a game without the engine.

export interface ReplayFrame {
  index: number;
  /** Player to move in this state (null when the game is over). */
  actor: string | null;
  /** The action that produced this state (null for the initial frame). */
  actionLabel: string | null;
  view: StateView;
}

export interface Replay {
  gameId: string;
  gameName: string;
  players: PlayerId[];
  seed: number;
  result: GameResult;
  frames: ReplayFrame[];
}

function viewOf<S, A, O>(def: GameDefinition<S, A, O>, state: S): StateView {
  if (def.describeState) return def.describeState(state);
  const pid = def.currentPlayer(state);
  return {
    summary: def.isTerminal(state) ? "Game over" : `${pid ?? "?"} to move`,
    panels: [],
  };
}

/** Play one game and capture a frame (rendered view + action label) per step. */
export function recordGame<State, Action, Observation>(
  def: GameDefinition<State, Action, Observation>,
  policies: Record<PlayerId, Policy<Action, Observation>>,
  playerIds: PlayerId[],
  opts: { seed: number; policySeed?: number; maxSteps?: number }
): Replay {
  const maxSteps = opts.maxSteps ?? 5000;
  const rng = makeRng(opts.policySeed ?? (opts.seed >>> 0) ^ 0x5bd1e995);

  let state = def.createInitialState(playerIds, opts.seed);
  const frames: ReplayFrame[] = [
    { index: 0, actor: def.currentPlayer(state), actionLabel: null, view: viewOf(def, state) },
  ];

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
    if (!policy) throw new Error(`No policy for player "${pid}"`);

    const action = policy({ observation: def.observe(state, pid), legalActions, playerId: pid, rng });
    const actionLabel = def.describeAction ? def.describeAction(state, action) : "action";
    state = def.applyAction(state, action);
    steps += 1;
    frames.push({ index: steps, actor: def.currentPlayer(state), actionLabel, view: viewOf(def, state) });
  }

  // Match runGame: report why the run stopped when the game itself didn't end.
  const result = def.result(state);
  if (exit !== "terminal" && !def.isTerminal(state)) {
    result.endReason = exit === "step_limit" ? "step_limit" : "no_legal_actions";
  }

  return {
    gameId: def.id,
    gameName: def.meta.name,
    players: playerIds,
    seed: opts.seed,
    result,
    frames,
  };
}
