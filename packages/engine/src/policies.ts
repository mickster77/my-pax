import type { Policy } from "@lab/core";
import type { GameAction } from "./actions.js";
import type { PlayerObservation } from "./types.js";

// Pax-specific baseline strategies. Game-specific policies live in the game's
// own package (the platform's generic core only ships random/first-action).

// A simple "type-greedy" heuristic: prefer developing actions (expand your
// court, build influence and board presence, run your economy) over passive
// ones, and never pass while something productive is available. Ties are broken
// with the seeded rng so runs stay reproducible.
//
// This is deliberately shallow — its job is to give the lab a non-random
// opponent that is clearly better than uniform-random, so the measurement
// framework has something to distinguish. Smarter Pax strategies (card-rank
// aware, dominance-timing aware) can be added as separate named strategies.
const ACTION_WEIGHT: Record<GameAction["type"], number> = {
  choose_faction: 9, // must happen during the draft to start playing
  gift: 6, // influence -> victory points at dominance checks
  play_card: 5, // grow the court (more actions, more scoring)
  build: 4, // coalition strength on the board
  tax: 4, // economy
  battle: 4, // deny opponents board presence
  buy_card: 3, // refill the hand
  betray: 3, // remove an opponent's court card
  start_move: 2,
  move_army: 2,
  move_spy: 2,
  end_move: 1,
  take_rupee: 1,
  perform_dominance_check: 1,
  pass: 0, // end turn only when nothing better is offered
};

export const paxGreedyPolicy: Policy<GameAction, PlayerObservation> = ({ legalActions, rng }) => {
  let best = -Infinity;
  let pool: GameAction[] = [];
  for (const action of legalActions) {
    const weight = ACTION_WEIGHT[action.type] ?? 0;
    if (weight > best) {
      best = weight;
      pool = [action];
    } else if (weight === best) {
      pool.push(action);
    }
  }
  return pool.length === 1 ? pool[0] : pool[rng.int(pool.length)];
};
