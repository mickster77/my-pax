import type { Policy, Rng } from "@lab/core";
import { NODE_HEXES } from "./geometry.js";
import type { CatanAction, CatanObservation, Resource } from "./types.js";

// Catan-specific baseline strategy. The generic core only ships random/first;
// this gives the lab a non-random Catan opponent to measure against.

const RESOURCES: Resource[] = ["brick", "lumber", "wool", "grain", "ore"];

function pick(actions: CatanAction[], rng: Rng): CatanAction {
  return actions.length === 1 ? actions[0] : actions[rng.int(actions.length)];
}

/** "Pip" value of a number token: how many of 36 dice outcomes roll it. */
function pip(num: number | null): number {
  return num === null ? 0 : 6 - Math.abs(7 - num);
}

function nodeProduction(obs: CatanObservation, node: number): number {
  return NODE_HEXES[node].reduce((sum, h) => sum + pip(obs.hexes[h].number), 0);
}

/**
 * "Builder": convert resources into victory points as directly as possible —
 * upgrade to cities, build settlements, expand roads, buy dev cards — and at
 * setup take the highest-production intersections. Bank-trades surplus toward
 * scarce resources when it can't build. Never wastes a turn on a no-op, which is
 * why it beats uniform-random.
 */
export const catanBuilderPolicy: Policy<CatanAction, CatanObservation> = ({ legalActions, observation, rng }) => {
  const ofType = (t: CatanAction["type"]): CatanAction[] => legalActions.filter((a) => a.type === t);

  const roll = ofType("roll");
  if (roll.length) return roll[0];

  // Setup: pick the most productive legal intersection.
  const setupSettle = ofType("place_setup_settlement");
  if (setupSettle.length) {
    return setupSettle.reduce((best, a) => {
      const an = a.type === "place_setup_settlement" ? a.node : -1;
      const bn = best.type === "place_setup_settlement" ? best.node : -1;
      return nodeProduction(observation, an) > nodeProduction(observation, bn) ? a : best;
    });
  }
  const setupRoad = ofType("place_setup_road");
  if (setupRoad.length) return setupRoad[0];

  // Robber: any legal hex (first). A sharper bot would target the leader.
  const robber = ofType("move_robber");
  if (robber.length) return robber[0];

  // Build toward victory points.
  const city = ofType("build_city");
  if (city.length) return pick(city, rng);
  const settlement = ofType("build_settlement");
  if (settlement.length) return pick(settlement, rng);
  const road = ofType("build_road");
  if (road.length) return pick(road, rng);

  const dev = ofType("buy_dev");
  if (dev.length) return dev[0];

  // Play any dev card we hold (knight first — also drives largest army).
  for (const t of ["play_knight", "play_road_building", "play_year_of_plenty", "play_monopoly"] as const) {
    const a = ofType(t);
    if (a.length) return a[0];
  }

  // Can't build: trade the most-held resource for the least-held to make progress.
  const trade = ofType("bank_trade");
  if (trade.length) {
    const most = [...RESOURCES].sort((a, b) => observation.self.resources[b] - observation.self.resources[a])[0];
    const least = [...RESOURCES].sort((a, b) => observation.self.resources[a] - observation.self.resources[b])[0];
    const chosen = trade.find((a) => a.type === "bank_trade" && a.give === most && a.receive === least);
    return chosen ?? trade[0];
  }

  return ofType("end_turn")[0] ?? pick(legalActions, rng);
};
