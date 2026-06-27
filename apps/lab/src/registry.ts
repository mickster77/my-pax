import { GameRegistry } from "@lab/core";
import { paxGame } from "@pax/engine";
import { monopolyGame } from "@games/monopoly";
import { catanGame } from "@games/catan";

// The single place that knows which games exist on the platform. Adding a game
// is: implement GameDefinition in its package, import it here, and register it.
export const registry = new GameRegistry().register(paxGame).register(monopolyGame).register(catanGame);
