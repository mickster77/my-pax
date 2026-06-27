import type { GameDefinition } from "@lab/core";
import { createInitialState, getLegalActions, applyAction, observe, result, describeAction, describeState } from "./engine.js";
import type { CatanState, CatanAction, CatanObservation } from "./types.js";

// Catan as a platform game plugin. Catan is the game with hidden information —
// observe() shows a player their own hand and dev cards but only counts for
// opponents — so this is the platform's hidden-information validation, alongside
// dice (like Monopoly) drawn from the serializable on-state RNG.
export const catanGame: GameDefinition<CatanState, CatanAction, CatanObservation> = {
  id: "catan",
  meta: { name: "Catan", minPlayers: 2, maxPlayers: 4 },
  createInitialState: (playerIds, seed) => createInitialState(playerIds, seed),
  currentPlayer: (state) => (state.finished ? null : state.players[state.current].id),
  isTerminal: (state) => state.finished,
  getLegalActions,
  applyAction,
  observe,
  result,
  describeAction: (_state, action) => describeAction(action),
  describeState,
};
