import { GameRegistry } from "@lab/core";
import { paxGame } from "@pax/engine";

// The single place that knows which games exist on the platform. Adding a game
// is: implement GameDefinition in its package, import it here, and register it.
// (Future: games/monopoly, games/catan.)
export const registry = new GameRegistry().register(paxGame);
