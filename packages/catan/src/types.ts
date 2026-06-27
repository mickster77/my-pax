import type { RngState } from "@lab/core";

export type Resource = "brick" | "lumber" | "wool" | "grain" | "ore";
export type HexResource = Resource | "desert";
export type DevCard = "knight" | "victory_point" | "road_building" | "year_of_plenty" | "monopoly";
export type PortType = "any" | Resource;

export type ResourceCount = Record<Resource, number>;
export type DevCount = Record<DevCard, number>;

export interface HexState {
  resource: HexResource;
  /** Dice number that produces this hex; null for the desert. */
  number: number | null;
}

export interface CatanPlayer {
  id: string;
  resources: ResourceCount;
  /** Dev cards playable now (bought on a previous turn). */
  devCards: DevCount;
  /** Dev cards bought this turn — not playable until next turn. */
  pendingDevCards: DevCount;
  playedKnights: number;
  settlementsLeft: number;
  citiesLeft: number;
  roadsLeft: number;
  hasPlayedDevThisTurn: boolean;
}

export type CatanPhase =
  | "setup" // snake-draft placement of 2 settlements + 2 roads each
  | "roll" // current player must roll the dice
  | "move_robber" // a 7 (or knight) requires moving the robber and stealing
  | "main" // build / buy / play / bank-trade / end turn
  | "over";

export interface BuiltNode {
  owner: string;
  city: boolean;
}

export interface CatanState {
  players: CatanPlayer[];
  current: number;
  phase: CatanPhase;
  rng: RngState;

  hexes: HexState[]; // 19
  robberHex: number;
  /** Built settlements/cities by node id. */
  nodes: Record<number, BuiltNode>;
  /** Road owner by edge id. */
  roads: Record<number, string>;
  /** Port type by node id (a player with a building there gets the trade ratio). */
  ports: Record<number, PortType>;
  /** Remaining development-card deck (hidden). */
  devDeck: DevCard[];

  dice: [number, number] | null;
  /** Free roads remaining from a road-building card. */
  freeRoads: number;

  // setup bookkeeping
  setupStep: number; // 0 .. 2*players-1, snake order
  setupNode: number | null; // settlement just placed, awaiting its road

  largestArmy: string | null;
  longestRoad: string | null;

  turn: number;
  winner: string | null;
  finished: boolean;
}

export type CatanAction =
  | { type: "place_setup_settlement"; playerId: string; node: number }
  | { type: "place_setup_road"; playerId: string; edge: number }
  | { type: "roll"; playerId: string }
  | { type: "move_robber"; playerId: string; hex: number }
  | { type: "build_road"; playerId: string; edge: number }
  | { type: "build_settlement"; playerId: string; node: number }
  | { type: "build_city"; playerId: string; node: number }
  | { type: "buy_dev"; playerId: string }
  | { type: "play_knight"; playerId: string }
  | { type: "play_road_building"; playerId: string }
  | { type: "play_year_of_plenty"; playerId: string }
  | { type: "play_monopoly"; playerId: string }
  | { type: "bank_trade"; playerId: string; give: Resource; receive: Resource }
  | { type: "end_turn"; playerId: string };

// What a player sees. Catan hides information: opponents' specific resource cards
// (only the count is public) and their dev cards. This is the platform's
// hidden-information validation.
export interface OpponentView {
  id: string;
  resourceCount: number;
  devCardCount: number;
  playedKnights: number;
  settlementsLeft: number;
  citiesLeft: number;
  roadsLeft: number;
}

export interface CatanObservation {
  phase: CatanPhase;
  current: number;
  currentPlayerId: string;
  hexes: HexState[];
  robberHex: number;
  nodes: Record<number, BuiltNode>;
  roads: Record<number, string>;
  ports: Record<number, PortType>;
  dice: [number, number] | null;
  devDeckCount: number;
  largestArmy: string | null;
  longestRoad: string | null;
  turn: number;
  finished: boolean;
  /** The requesting player's full private view. */
  self: CatanPlayer;
  /** Reduced view of everyone (including self), with hidden info stripped. */
  opponents: OpponentView[];
}
