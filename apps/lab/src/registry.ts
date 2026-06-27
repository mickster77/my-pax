import { GameRegistry } from "@lab/core";
import { paxGame } from "@pax/engine";
import { monopolyGame } from "@games/monopoly";
import { catanGame } from "@games/catan";
import { ticTacToeGame } from "@games/tictactoe";

// The single place that knows which games exist on the platform. Adding a game
// is: implement GameDefinition in its package, import it here, and register it.
// (tictactoe is the minimal example — see docs/ADDING_A_GAME.md.)
export const registry = new GameRegistry()
  .register(paxGame)
  .register(monopolyGame)
  .register(catanGame)
  .register(ticTacToeGame);
