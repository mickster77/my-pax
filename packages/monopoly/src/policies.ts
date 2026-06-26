import type { Policy, Rng } from "@lab/core";
import type { MonopolyAction, MonopolyObservation } from "./types.js";

// Monopoly-specific baseline strategy. The generic core only ships random/first;
// this gives the lab a non-random Monopoly opponent to measure against.

function pick(actions: MonopolyAction[], rng: Rng): MonopolyAction {
  return actions.length === 1 ? actions[0] : actions[rng.int(actions.length)];
}

/**
 * "Buyer": acquire aggressively and develop monopolies, while avoiding
 * bankruptcy. Priorities:
 *   - in debt: raise cash (mortgage, then sell houses); bankruptcy only as a last resort
 *   - buy every property it lands on (if affordable)
 *   - build houses once it holds a full color group, keeping a cash buffer
 *   - otherwise roll; use a jail card if held
 * Acquiring more deeds directly raises net worth (the tiebreak when a game hits
 * the turn cap), so this should beat random even when few games end in bankruptcy.
 */
export const monopolyBuyerPolicy: Policy<MonopolyAction, MonopolyObservation> = ({
  legalActions,
  observation,
  playerId,
  rng,
}) => {
  const ofType = (t: MonopolyAction["type"]): MonopolyAction[] => legalActions.filter((a) => a.type === t);

  // Debt: free up cash before ever going bankrupt.
  const mortgage = ofType("mortgage");
  if (mortgage.length) return pick(mortgage, rng);
  const sell = ofType("sell_house");
  if (sell.length) return pick(sell, rng);

  // Always take a property.
  const buy = ofType("buy");
  if (buy.length) return buy[0];

  // Develop monopolies while keeping a buffer against incoming rent.
  const me = observation.players.find((p) => p.id === playerId);
  const build = ofType("build_house");
  if (build.length && me && me.cash > 250) return pick(build, rng);

  const jailCard = ofType("use_jail_card");
  if (jailCard.length) return jailCard[0];

  const roll = ofType("roll");
  if (roll.length) return roll[0];

  const decline = ofType("decline");
  if (decline.length) return decline[0];

  // Only reachable in debt with no assets left to liquidate.
  return pick(legalActions, rng);
};
