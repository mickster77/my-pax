import type { Rng } from "./rng.js";

export type PlayerId = string;

export type EndReason =
  | "victory" // a winner (or tie) was decided by the game's own rules
  | "draw" // game ended by its rules with no winner
  | "max_turns" // the game self-reported a turn cap and decided a winner (e.g. by score)
  | "step_limit" // the runner stopped it before it finished
  | "no_legal_actions" // the active player had no moves and the game did not end
  | "unfinished"; // game state is non-terminal (default from result() before a run ends)

export interface GameResult {
  /** Winner(s). Empty for a draw/no-winner. Length > 1 for a tie. */
  winnerIds: PlayerId[];
  /** Final score per player (game-defined; e.g. victory points, money, points). */
  scores: Record<PlayerId, number>;
  /** Game-defined turn count (for reporting only — the runner does not interpret it). */
  turns: number;
  endReason: EndReason;
}

export interface GameMeta {
  name: string;
  minPlayers: number;
  maxPlayers: number;
}

/** A game-agnostic, renderable description of a state, for the web inspector. */
export interface StatePanel {
  title: string;
  rows: Array<{ label: string; value: string }>;
}
export interface StateView {
  /** One-line status, e.g. "Turn 12 · p1 to move". */
  summary: string;
  panels: StatePanel[];
}

/**
 * The contract every game implements. The runner, lab, and viewer depend ONLY on
 * this interface — never on a concrete game — which is what lets new games plug in.
 *
 * State, Action, and Observation are the game's own types. State is treated as an
 * opaque, JSON-serializable value by everything above this interface.
 *
 * Determinism / randomness rule: a game must be fully reproducible from
 * (initial seed + action sequence). Any in-game randomness (dice, shuffles during
 * play) MUST be drawn from an Rng seeded off state and written back into the
 * returned state — never from Math.random. Games with no in-game randomness
 * (e.g. Pax Pamir) satisfy this trivially.
 *
 * Hidden information rule: observe(state, playerId) must return only what that
 * player is allowed to see. Policies receive observations, never raw State.
 */
export interface GameDefinition<State, Action, Observation> {
  readonly id: string;
  readonly meta: GameMeta;

  /** Build the starting state for the given players, seeded for reproducibility. */
  createInitialState(playerIds: PlayerId[], seed: number): State;

  /** The player to move, or null if the game is over / no one is to move. */
  currentPlayer(state: State): PlayerId | null;

  isTerminal(state: State): boolean;

  /** Legal actions for a player. Empty when it is not their turn or the game is over. */
  getLegalActions(state: State, playerId: PlayerId): Action[];

  /** Pure transition: returns a new state, never mutates the input. */
  applyAction(state: State, action: Action): State;

  /** Per-seat, hidden-information-respecting view of the state. */
  observe(state: State, playerId: PlayerId): Observation;

  /** Outcome of a (usually terminal) state. */
  result(state: State): GameResult;

  /** Optional human-readable description of an action, for logs/replay. */
  describeAction?(state: State, action: Action): string;

  /** Optional game-agnostic rendering of a state, for the web inspector/replay. */
  describeState?(state: State): StateView;
}

export interface PolicyContext<Action, Observation> {
  observation: Observation;
  legalActions: Action[];
  playerId: PlayerId;
  /** Seeded RNG for reproducible stochastic policies. Never use Math.random in a policy. */
  rng: Rng;
}

/**
 * A strategy. Given what the player can see and do, choose one legal action.
 * Parameterized over Action/Observation (not State) so policies cannot peek at
 * hidden information.
 */
export type Policy<Action, Observation> = (ctx: PolicyContext<Action, Observation>) => Action;
