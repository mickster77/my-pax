import type { GameDefinition } from "@lab/core";
import { createInitialState, getLegalActions, applyAction, observe, result, describeAction } from "./engine.js";
import type { MonopolyState, MonopolyAction, MonopolyObservation } from "./types.js";

// Monopoly as a platform game plugin. Monopoly is dice-driven, so this is the
// game that exercises the platform's in-game RNG model: dice are drawn from a
// serializable RNG carried on MonopolyState (see engine.rollDice / drawCard), so
// applyAction stays a pure (state, action) => state and a run is fully
// reproducible from its seed. There is no hidden information, so observe()
// returns the full state.
export const monopolyGame: GameDefinition<MonopolyState, MonopolyAction, MonopolyObservation> = {
  id: "monopoly",
  meta: { name: "Monopoly", minPlayers: 2, maxPlayers: 6 },
  createInitialState: (playerIds, seed) => createInitialState(playerIds, seed),
  currentPlayer: (state) => (state.finished ? null : state.players[state.current].id),
  isTerminal: (state) => state.finished,
  getLegalActions,
  applyAction,
  observe,
  result,
  describeAction: (_state, action) => describeAction(action),
};
