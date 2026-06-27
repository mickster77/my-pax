import { makeRng, type GameResult, type PlayerId, type StateView } from "@lab/core";
import {
  BOARD,
  COLOR_GROUPS,
  RAILROAD_INDICES,
  UTILITY_INDICES,
  JAIL_INDEX,
  GO_SALARY,
  BAIL,
  TOTAL_HOUSES,
  isOwnable,
  type Space,
} from "./board.js";
import type { MonopolyAction, MonopolyPlayer, MonopolyState } from "./types.js";

// Monopoly rules engine. Faithful to the standard US board's prices, rents,
// railroad/utility rent rules, doubles/jail flow, building with the even-build
// rule and a finite house bank, mortgaging, and bankruptcy.
//
// Deliberate simplifications (documented for a bot lab; none change reproducibility):
//   - No auctions: a declined property simply stays with the bank.
//   - No trading between players (the hardest part to bot well).
//   - No hotels: houses cap at 4 per property (the 6th rent tier is unused).
//   - Chance / Community Chest are a curated, representative set of effects drawn
//     uniformly at random, not the exact 32-card decks.
//   - On the 3rd failed jail roll the player pays bail but does not move that turn.
//   - A turn cap ends very long games; the winner is then decided by net worth.

const STARTING_CASH = 1500;
const MAX_TURNS = 400;
const OWNABLE_INDICES = BOARD.filter(isOwnable).map((s) => s.index);

function clone(state: MonopolyState): MonopolyState {
  const sc = (globalThis as { structuredClone?: <T>(v: T) => T }).structuredClone;
  return sc ? sc(state) : (JSON.parse(JSON.stringify(state)) as MonopolyState);
}

// Read the phase widened to the full union. Helper calls (resolveLanding, etc.)
// mutate state.phase, but TS narrows it from the function's entry guard and can't
// see those mutations — this defeats that narrowing at the re-check sites.
function phaseOf(state: MonopolyState): MonopolyState["phase"] {
  return state.phase;
}

export function createInitialState(playerIds: PlayerId[], seed: number): MonopolyState {
  if (playerIds.length < 2) throw new Error("Monopoly needs at least 2 players");
  const rng = makeRng(seed);
  const ownables: MonopolyState["ownables"] = {};
  for (const idx of OWNABLE_INDICES) ownables[idx] = { owner: null, houses: 0, mortgaged: false };

  return {
    players: playerIds.map((id) => ({
      id,
      cash: STARTING_CASH,
      position: 0,
      inJail: false,
      jailRolls: 0,
      getOutCards: 0,
      bankrupt: false,
    })),
    current: 0,
    phase: "preroll",
    rng: rng.state(),
    ownables,
    housesRemaining: TOTAL_HOUSES,
    hotelsRemaining: 0,
    pendingBuy: null,
    debt: null,
    dice: null,
    rolledDoubles: false,
    doublesCount: 0,
    sentToJail: false,
    turn: 0,
    winner: null,
    finished: false,
  };
}

// ---------- lookups & money ----------

function playerById(state: MonopolyState, id: string): MonopolyPlayer | undefined {
  return state.players.find((p) => p.id === id);
}

function spaceAt(index: number): Space {
  return BOARD[index];
}

function ownablePrice(space: Space): number {
  return isOwnable(space) ? space.price : 0;
}

function ownsFullGroup(state: MonopolyState, playerId: string, color: keyof typeof COLOR_GROUPS): boolean {
  return COLOR_GROUPS[color].every((i) => state.ownables[i].owner === playerId && !state.ownables[i].mortgaged);
}

function computeRent(state: MonopolyState, idx: number): number {
  const space = spaceAt(idx);
  const o = state.ownables[idx];
  if (!o.owner) return 0;
  if (space.type === "property") {
    if (o.houses > 0) return space.rent[o.houses];
    return ownsFullGroup(state, o.owner, space.color) ? space.rent[0] * 2 : space.rent[0];
  }
  if (space.type === "railroad") {
    const count = RAILROAD_INDICES.filter((i) => state.ownables[i].owner === o.owner).length;
    return 25 * 2 ** (count - 1); // 25 / 50 / 100 / 200
  }
  if (space.type === "utility") {
    const count = UTILITY_INDICES.filter((i) => state.ownables[i].owner === o.owner).length;
    const roll = (state.dice?.[0] ?? 0) + (state.dice?.[1] ?? 0);
    return roll * (count === 2 ? 10 : 4);
  }
  return 0;
}

function netWorth(state: MonopolyState, p: MonopolyPlayer): number {
  let total = p.cash;
  for (const idx of OWNABLE_INDICES) {
    const o = state.ownables[idx];
    if (o.owner !== p.id) continue;
    const space = spaceAt(idx);
    total += o.mortgaged ? ownablePrice(space) / 2 : ownablePrice(space);
    if (space.type === "property") total += o.houses * space.houseCost;
  }
  return total;
}

/** Pay `amount` from p to creditor (or the bank). If p can't cover it from cash, open a debt and pause. */
function chargeOrDebt(state: MonopolyState, p: MonopolyPlayer, amount: number, creditorId: string | null): void {
  if (amount <= 0) return;
  if (p.cash >= amount) {
    p.cash -= amount;
    if (creditorId) {
      const c = playerById(state, creditorId);
      if (c) c.cash += amount;
    }
  } else {
    state.debt = { amount, creditor: creditorId };
    state.phase = "debt";
  }
}

// ---------- movement & landing ----------

function movePlayer(state: MonopolyState, p: MonopolyPlayer, steps: number): void {
  const next = (p.position + steps) % 40;
  if (p.position + steps >= 40) p.cash += GO_SALARY; // passed or landed on GO
  p.position = next;
}

function advanceTo(state: MonopolyState, p: MonopolyPlayer, index: number): void {
  if (index < p.position) p.cash += GO_SALARY; // moving forward past GO
  p.position = index;
  resolveLanding(state, p);
}

function sendToJail(state: MonopolyState, p: MonopolyPlayer): void {
  p.position = JAIL_INDEX;
  p.inJail = true;
  p.jailRolls = 0;
  state.sentToJail = true;
}

// Curated Chance / Community Chest effects, drawn uniformly. Some move the player,
// which re-resolves the new landing (none of these land on another card space, so
// there is no unbounded recursion).
const CARD_EFFECTS: Array<(state: MonopolyState, p: MonopolyPlayer) => void> = [
  (_s, p) => { p.cash += 50; }, // bank pays you a dividend
  (_s, p) => { p.cash += 100; }, // inheritance
  (_s, p) => { p.cash += 25; }, // consultancy fee
  (s, p) => { advanceTo(s, p, 0); }, // advance to GO
  (s, p) => { chargeOrDebt(s, p, 50, null); }, // doctor's fee
  (s, p) => { chargeOrDebt(s, p, 100, null); }, // pay hospital
  (s, p) => { sendToJail(s, p); }, // go directly to jail
  (_s, p) => { p.getOutCards += 1; }, // get out of jail free
  (s, p) => { advanceTo(s, p, 24); }, // advance to Illinois Avenue
  (s, p) => { advanceTo(s, p, 39); }, // advance to Boardwalk
];

function drawCard(state: MonopolyState, p: MonopolyPlayer): void {
  const rng = makeRng(state.rng);
  const effect = CARD_EFFECTS[rng.int(CARD_EFFECTS.length)];
  state.rng = rng.state();
  effect(state, p);
}

function resolveLanding(state: MonopolyState, p: MonopolyPlayer): void {
  const space = spaceAt(p.position);
  switch (space.type) {
    case "go":
    case "jail":
    case "freeparking":
      break;
    case "gotojail":
      sendToJail(state, p);
      break;
    case "tax":
      chargeOrDebt(state, p, space.amount, null);
      break;
    case "chance":
    case "chest":
      drawCard(state, p);
      break;
    case "property":
    case "railroad":
    case "utility": {
      const o = state.ownables[space.index];
      if (o.owner === null) {
        state.pendingBuy = space.index;
        state.phase = "buy_decision";
      } else if (o.owner !== p.id && !o.mortgaged) {
        chargeOrDebt(state, p, computeRent(state, space.index), o.owner);
      }
      break;
    }
  }
}

// ---------- dice & turn flow ----------

function rollDice(state: MonopolyState): [number, number] {
  const rng = makeRng(state.rng);
  const d1 = rng.int(6) + 1;
  const d2 = rng.int(6) + 1;
  state.rng = rng.state(); // write the advanced cursor back onto the state
  return [d1, d2];
}

function moveAndResolve(state: MonopolyState, p: MonopolyPlayer, steps: number): void {
  movePlayer(state, p, steps);
  resolveLanding(state, p);
}

function postTurn(state: MonopolyState): void {
  if (state.finished) return;
  const p = state.players[state.current];
  if (state.sentToJail) {
    endTurn(state);
    return;
  }
  if (state.rolledDoubles && state.doublesCount < 3 && !p.bankrupt) {
    state.phase = "preroll"; // same player rolls again
    return;
  }
  endTurn(state);
}

function endTurn(state: MonopolyState): void {
  state.rolledDoubles = false;
  state.doublesCount = 0;
  state.sentToJail = false;
  state.dice = null;
  state.pendingBuy = null;
  state.debt = null;

  const n = state.players.length;
  let idx = state.current;
  for (let k = 0; k < n; k += 1) {
    idx = (idx + 1) % n;
    if (!state.players[idx].bankrupt) break;
  }
  state.current = idx;
  state.turn += 1;
  if (state.turn >= MAX_TURNS) {
    finishByNetWorth(state);
    return;
  }
  state.phase = "preroll";
}

function activePlayers(state: MonopolyState): MonopolyPlayer[] {
  return state.players.filter((p) => !p.bankrupt);
}

function finishByNetWorth(state: MonopolyState): void {
  const active = activePlayers(state);
  let best = active[0];
  for (const p of active) if (netWorth(state, p) > netWorth(state, best)) best = p;
  state.finished = true;
  state.winner = best ? best.id : null;
  state.phase = "over";
}

// ---------- legal actions ----------

function canMortgage(state: MonopolyState, p: MonopolyPlayer, idx: number): boolean {
  const o = state.ownables[idx];
  if (o.owner !== p.id || o.mortgaged) return false;
  const space = spaceAt(idx);
  // A property can't be mortgaged while ANY property in its color group still has
  // houses — all of the group's buildings must be sold back first.
  if (space.type === "property" && COLOR_GROUPS[space.color].some((i) => state.ownables[i].houses > 0)) {
    return false;
  }
  return true;
}

function canBuildHouse(state: MonopolyState, p: MonopolyPlayer, idx: number): boolean {
  const space = spaceAt(idx);
  if (space.type !== "property") return false;
  const o = state.ownables[idx];
  if (o.owner !== p.id || o.mortgaged || o.houses >= 4) return false;
  if (!ownsFullGroup(state, p.id, space.color)) return false;
  if (state.housesRemaining <= 0 || p.cash < space.houseCost) return false;
  const groupHouses = COLOR_GROUPS[space.color].map((i) => state.ownables[i].houses);
  return o.houses === Math.min(...groupHouses); // even build
}

function canSellHouse(state: MonopolyState, p: MonopolyPlayer, idx: number): boolean {
  const space = spaceAt(idx);
  if (space.type !== "property") return false;
  const o = state.ownables[idx];
  if (o.owner !== p.id || o.houses <= 0) return false;
  const groupHouses = COLOR_GROUPS[space.color].map((i) => state.ownables[i].houses);
  return o.houses === Math.max(...groupHouses); // even sell
}

export function getLegalActions(state: MonopolyState, playerId: PlayerId): MonopolyAction[] {
  if (state.finished) return [];
  const p = state.players[state.current];
  if (p.id !== playerId || p.bankrupt) return [];
  const actions: MonopolyAction[] = [];

  switch (state.phase) {
    case "preroll": {
      if (p.inJail) {
        if (p.cash >= BAIL) actions.push({ type: "pay_bail", playerId });
        if (p.getOutCards > 0) actions.push({ type: "use_jail_card", playerId });
        actions.push({ type: "roll", playerId });
        return actions;
      }
      actions.push({ type: "roll", playerId });
      for (const idx of OWNABLE_INDICES) {
        if (canBuildHouse(state, p, idx)) actions.push({ type: "build_house", playerId, space: idx });
      }
      return actions;
    }
    case "buy_decision": {
      const idx = state.pendingBuy!;
      if (p.cash >= ownablePrice(spaceAt(idx))) actions.push({ type: "buy", playerId });
      actions.push({ type: "decline", playerId });
      return actions;
    }
    case "debt": {
      for (const idx of OWNABLE_INDICES) {
        if (canMortgage(state, p, idx)) actions.push({ type: "mortgage", playerId, space: idx });
        if (canSellHouse(state, p, idx)) actions.push({ type: "sell_house", playerId, space: idx });
      }
      actions.push({ type: "declare_bankruptcy", playerId });
      return actions;
    }
    case "over":
      return [];
  }
}

// ---------- action application ----------

export function applyAction(state: MonopolyState, action: MonopolyAction): MonopolyState {
  const next = clone(state);
  const p = next.players[next.current];
  if (action.playerId !== p.id) throw new Error(`Not ${action.playerId}'s turn`);

  switch (action.type) {
    case "roll": handleRoll(next, p); break;
    case "pay_bail": handlePayBail(next, p); break;
    case "use_jail_card": handleUseJailCard(next, p); break;
    case "build_house": handleBuildHouse(next, p, action.space); break;
    case "buy": handleBuy(next, p); break;
    case "decline": handleDecline(next, p); break;
    case "mortgage": handleMortgage(next, p, action.space); break;
    case "sell_house": handleSellHouse(next, p, action.space); break;
    case "declare_bankruptcy": handleBankruptcy(next, p); break;
  }
  return next;
}

function handleRoll(state: MonopolyState, p: MonopolyPlayer): void {
  if (state.phase !== "preroll") throw new Error("Can only roll during preroll");
  const [d1, d2] = rollDice(state);
  state.dice = [d1, d2];
  const sum = d1 + d2;
  const doubles = d1 === d2;

  if (p.inJail) {
    state.rolledDoubles = false; // leaving jail never grants a bonus roll
    if (doubles) {
      p.inJail = false;
      p.jailRolls = 0;
      moveAndResolve(state, p, sum);
    } else {
      p.jailRolls += 1;
      if (p.jailRolls >= 3) {
        chargeOrDebt(state, p, BAIL, null); // forced bail; no move this turn (simplification)
        p.inJail = false;
        p.jailRolls = 0;
        if (phaseOf(state) === "debt") return;
        endTurn(state);
        return;
      }
      endTurn(state); // stay in jail
      return;
    }
  } else {
    state.rolledDoubles = doubles;
    if (doubles) {
      state.doublesCount += 1;
      if (state.doublesCount >= 3) {
        sendToJail(state, p);
        endTurn(state);
        return;
      }
    }
    moveAndResolve(state, p, sum);
  }

  const phase = phaseOf(state);
  if (phase === "buy_decision" || phase === "debt" || phase === "over") return;
  postTurn(state);
}

function handlePayBail(state: MonopolyState, p: MonopolyPlayer): void {
  if (state.phase !== "preroll" || !p.inJail) throw new Error("Cannot pay bail now");
  if (p.cash < BAIL) throw new Error("Cannot afford bail");
  p.cash -= BAIL;
  p.inJail = false;
  p.jailRolls = 0;
  // stays in preroll: the player now rolls normally this turn
}

function handleUseJailCard(state: MonopolyState, p: MonopolyPlayer): void {
  if (state.phase !== "preroll" || !p.inJail || p.getOutCards <= 0) throw new Error("No jail card to use");
  p.getOutCards -= 1;
  p.inJail = false;
  p.jailRolls = 0;
}

function handleBuildHouse(state: MonopolyState, p: MonopolyPlayer, idx: number): void {
  if (state.phase !== "preroll") throw new Error("Can only build during preroll");
  if (!canBuildHouse(state, p, idx)) throw new Error(`Cannot build on space ${idx}`);
  const space = spaceAt(idx);
  if (space.type !== "property") throw new Error("Not a property");
  p.cash -= space.houseCost;
  state.ownables[idx].houses += 1;
  state.housesRemaining -= 1;
}

function handleBuy(state: MonopolyState, p: MonopolyPlayer): void {
  if (state.phase !== "buy_decision" || state.pendingBuy === null) throw new Error("Nothing to buy");
  const idx = state.pendingBuy;
  const price = ownablePrice(spaceAt(idx));
  if (p.cash < price) throw new Error("Cannot afford property");
  p.cash -= price;
  state.ownables[idx].owner = p.id;
  state.pendingBuy = null;
  postTurn(state);
}

function handleDecline(state: MonopolyState, _p: MonopolyPlayer): void {
  if (state.phase !== "buy_decision") throw new Error("Nothing to decline");
  state.pendingBuy = null; // no auction
  postTurn(state);
}

function settleDebtIfAble(state: MonopolyState, p: MonopolyPlayer): void {
  if (!state.debt || p.cash < state.debt.amount) return;
  const { amount, creditor } = state.debt;
  p.cash -= amount;
  if (creditor) {
    const c = playerById(state, creditor);
    if (c) c.cash += amount;
  }
  state.debt = null;
  postTurn(state);
}

function handleMortgage(state: MonopolyState, p: MonopolyPlayer, idx: number): void {
  if (state.phase !== "debt") throw new Error("Can only mortgage while resolving debt");
  if (!canMortgage(state, p, idx)) throw new Error(`Cannot mortgage space ${idx}`);
  state.ownables[idx].mortgaged = true;
  p.cash += ownablePrice(spaceAt(idx)) / 2;
  settleDebtIfAble(state, p);
}

function handleSellHouse(state: MonopolyState, p: MonopolyPlayer, idx: number): void {
  if (state.phase !== "debt") throw new Error("Can only sell houses while resolving debt");
  if (!canSellHouse(state, p, idx)) throw new Error(`Cannot sell house on space ${idx}`);
  const space = spaceAt(idx);
  if (space.type !== "property") throw new Error("Not a property");
  state.ownables[idx].houses -= 1;
  state.housesRemaining += 1;
  p.cash += space.houseCost / 2;
  settleDebtIfAble(state, p);
}

function handleBankruptcy(state: MonopolyState, p: MonopolyPlayer): void {
  if (state.phase !== "debt") throw new Error("Can only declare bankruptcy while in debt");
  const creditor = state.debt?.creditor ? playerById(state, state.debt.creditor) : null;

  if (creditor) creditor.cash += p.cash;
  p.cash = 0;
  for (const idx of OWNABLE_INDICES) {
    const o = state.ownables[idx];
    if (o.owner !== p.id) continue;
    state.housesRemaining += o.houses;
    o.houses = 0;
    if (creditor) {
      o.owner = creditor.id; // creditor inherits the (still-mortgaged) deeds
    } else {
      o.owner = null; // back to the bank
      o.mortgaged = false;
    }
  }
  p.bankrupt = true;
  state.debt = null;

  const active = activePlayers(state);
  if (active.length <= 1) {
    state.finished = true;
    state.winner = active[0]?.id ?? null;
    state.phase = "over";
    return;
  }
  endTurn(state);
}

// ---------- observation / result ----------

// Monopoly has no hidden information, but the observation must still be a copy:
// returning live state would let a policy mutate the game (breaking reproducibility).
export function observe(state: MonopolyState): MonopolyState {
  return clone(state);
}

export function result(state: MonopolyState): GameResult {
  const scores: Record<PlayerId, number> = Object.fromEntries(
    state.players.map((p) => [p.id, netWorth(state, p)])
  );
  if (!state.finished) {
    return { winnerIds: state.winner ? [state.winner] : [], scores, turns: state.turn, endReason: "unfinished" };
  }
  const bankruptCount = state.players.filter((p) => p.bankrupt).length;
  const endReason = bankruptCount === state.players.length - 1 ? "victory" : "max_turns";
  return { winnerIds: state.winner ? [state.winner] : [], scores, turns: state.turn, endReason };
}

export function describeState(state: MonopolyState): StateView {
  const ownedCount = (pid: string): number =>
    OWNABLE_INDICES.filter((idx) => state.ownables[idx].owner === pid).length;
  const playerPanels = state.players.map((p) => ({
    title: `${p.id}${p.bankrupt ? " (bankrupt)" : ""}`,
    rows: [
      { label: "cash", value: `$${p.cash}` },
      { label: "position", value: spaceAt(p.position).name },
      { label: "properties", value: String(ownedCount(p.id)) },
      { label: "net worth", value: `$${netWorth(state, p)}` },
      { label: "in jail", value: p.inJail ? "yes" : "no" },
    ],
  }));
  const status = state.finished ? `winner ${state.winner ?? "—"}` : `${state.players[state.current].id} to act`;
  return {
    summary: `Turn ${state.turn} · ${state.phase} · ${status}`,
    panels: [
      {
        title: "Game",
        rows: [
          { label: "turn", value: String(state.turn) },
          { label: "phase", value: state.phase },
          { label: "houses left", value: String(state.housesRemaining) },
          { label: "last roll", value: state.dice ? `${state.dice[0]}+${state.dice[1]}` : "—" },
        ],
      },
      ...playerPanels,
    ],
  };
}

export function describeAction(action: MonopolyAction): string {
  if (action.type === "build_house" || action.type === "mortgage" || action.type === "sell_house") {
    return `${action.type} ${spaceAt(action.space).name}`;
  }
  return action.type;
}
