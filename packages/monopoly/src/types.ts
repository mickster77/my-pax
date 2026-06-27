import type { RngState } from "@lab/core";

export type MonopolyPhase =
  | "preroll" // active player may build, then must roll (or act on jail)
  | "buy_decision" // landed on an unowned ownable space: buy or decline
  | "debt" // owes money it can't cover from cash: raise funds or go bankrupt
  | "over"; // game finished

export interface MonopolyPlayer {
  id: string;
  cash: number;
  position: number;
  inJail: boolean;
  jailRolls: number; // failed attempts to roll out of jail
  getOutCards: number;
  bankrupt: boolean;
}

export interface OwnableState {
  owner: string | null;
  /** 0-4 houses, 5 = hotel. Always 0 for railroads/utilities. */
  houses: number;
  mortgaged: boolean;
}

export interface Debt {
  amount: number;
  /** Player owed, or null when the money is owed to the bank (tax, etc.). */
  creditor: string | null;
}

export interface MonopolyState {
  players: MonopolyPlayer[];
  /** Index into players of the player to act. */
  current: number;
  phase: MonopolyPhase;
  /** Serializable RNG state — dice are drawn from here so runs are reproducible. */
  rng: RngState;
  /** Ownable spaces by board index. */
  ownables: Record<number, OwnableState>;
  housesRemaining: number;
  hotelsRemaining: number;
  /** Board index awaiting a buy/decline decision, or null. */
  pendingBuy: number | null;
  debt: Debt | null;
  dice: [number, number] | null;
  /** Whether the last roll was doubles (drives the re-roll). */
  rolledDoubles: boolean;
  /** Doubles in a row this turn (3 -> jail). */
  doublesCount: number;
  /** Set when the active player was just sent to jail, to suppress a doubles re-roll. */
  sentToJail: boolean;
  turn: number; // individual player-turns taken
  winner: string | null;
  finished: boolean;
}

export type MonopolyAction =
  | { type: "roll"; playerId: string }
  | { type: "pay_bail"; playerId: string }
  | { type: "use_jail_card"; playerId: string }
  | { type: "build_house"; playerId: string; space: number }
  | { type: "buy"; playerId: string }
  | { type: "decline"; playerId: string }
  | { type: "mortgage"; playerId: string; space: number }
  | { type: "sell_house"; playerId: string; space: number }
  | { type: "declare_bankruptcy"; playerId: string };

/** What a player can see. Monopoly has no hidden information, so this is the full state. */
export type MonopolyObservation = MonopolyState;
