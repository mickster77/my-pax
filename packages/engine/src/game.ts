import type { GameDefinition, GameResult, PlayerId } from "@lab/core";
import {
  createInitialState,
  getLegalActions,
  applyAction,
  toPlayerObservation,
  describeState,
} from "./engine.js";
import type { GameState } from "./types.js";
import type { GameAction } from "./actions.js";
import type { PlayerObservation } from "./types.js";

// Pax Pamir 2e as a platform game plugin. This is a thin adapter — all the rules
// live in engine.ts; here we only map the engine's free functions onto the
// generic GameDefinition the runner/lab/viewer program against.
//
// Pax has no in-game randomness (no dice); its only randomness is the seeded
// deck shuffle at setup, already carried via state.seed. So it satisfies the
// "reproducible from seed + actions" contract trivially.

function paxResult(state: GameState): GameResult {
  const scores: Record<PlayerId, number> = Object.fromEntries(
    state.players.map((p) => [p.id, p.victoryPoints])
  );
  if (!state.isFinished) {
    return { winnerIds: [], scores, turns: state.turn, endReason: "unfinished" };
  }
  return {
    winnerIds: state.winnerPlayerId ? [state.winnerPlayerId] : [],
    scores,
    turns: state.turn,
    endReason: state.winnerPlayerId ? "victory" : "draw",
  };
}

export const paxGame: GameDefinition<GameState, GameAction, PlayerObservation> = {
  id: "pax",
  meta: { name: "Pax Pamir 2e", minPlayers: 2, maxPlayers: 5 },

  createInitialState: (playerIds, seed) => createInitialState(`pax-${seed}`, playerIds, seed),

  currentPlayer: (state) => (state.isFinished ? null : state.currentPlayerId),

  isTerminal: (state) => state.isFinished,

  getLegalActions: (state, playerId) => getLegalActions(state, playerId),

  applyAction: (state, action) => applyAction(state, action),

  observe: (state, playerId) => toPlayerObservation(state, playerId),

  result: paxResult,

  describeAction: (_state, action) => action.type,

  describeState,
};
