import { makeRng, type GameResult, type PlayerId, type StateView } from "@lab/core";
import {
  HEX_AXIAL,
  HEX_NODES,
  NODE_HEXES,
  NODE_ADJACENCY,
  NODE_EDGES,
  EDGES,
  NODE_XY,
  COASTAL_NODES,
} from "./geometry.js";
import type {
  CatanAction,
  CatanObservation,
  CatanPlayer,
  CatanState,
  DevCard,
  HexState,
  PortType,
  Resource,
  ResourceCount,
} from "./types.js";

// Catan rules engine. Standard 19-hex board (geometry generated in geometry.ts),
// dice production, robber, roads/settlements/cities, development cards (hidden),
// longest road, largest army, and 4:1 / 3:1 / 2:1 bank+port trading.
//
// Deliberate simplifications for a bot lab (none affect reproducibility):
//   - No player-to-player trading (only the bank/ports).
//   - The resource bank is unlimited (no shortage rule).
//   - Discards on a 7 are automatic and random; the robber steals a random card
//     from a random adjacent opponent.
//   - year-of-plenty and monopoly auto-pick their target resource; road-building
//     grants 2 free roads the player then places.
//   - Ports are placed on deterministic coastal nodes (one node each), not the
//     exact canonical layout.
//   - Longest road ignores the opponent-settlement-breaks-a-road rule.
//   - A turn cap ends very long games; the winner is then the highest VP.

const RESOURCES: Resource[] = ["brick", "lumber", "wool", "grain", "ore"];
const VP_TO_WIN = 10;
const MAX_TURNS = 200;

const COST = {
  road: { brick: 1, lumber: 1 } as Partial<ResourceCount>,
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 } as Partial<ResourceCount>,
  city: { ore: 3, grain: 2 } as Partial<ResourceCount>,
  dev: { ore: 1, wool: 1, grain: 1 } as Partial<ResourceCount>,
};

function clone(state: CatanState): CatanState {
  const sc = (globalThis as { structuredClone?: <T>(v: T) => T }).structuredClone;
  return sc ? sc(state) : (JSON.parse(JSON.stringify(state)) as CatanState);
}

function zeroResources(): ResourceCount {
  return { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
}
function zeroDev(): Record<DevCard, number> {
  return { knight: 0, victory_point: 0, road_building: 0, year_of_plenty: 0, monopoly: 0 };
}
function totalResources(p: CatanPlayer): number {
  return RESOURCES.reduce((s, r) => s + p.resources[r], 0);
}
function canAfford(p: CatanPlayer, cost: Partial<ResourceCount>): boolean {
  return (Object.keys(cost) as Resource[]).every((r) => p.resources[r] >= (cost[r] ?? 0));
}
function pay(p: CatanPlayer, cost: Partial<ResourceCount>): void {
  for (const r of Object.keys(cost) as Resource[]) p.resources[r] -= cost[r] ?? 0;
}

// ---------- setup / init ----------

function setupPlayerIndex(step: number, n: number): number {
  const round = Math.floor(step / n);
  const pos = step % n;
  return round % 2 === 0 ? pos : n - 1 - pos;
}

export function createInitialState(playerIds: PlayerId[], seed: number): CatanState {
  if (playerIds.length < 2) throw new Error("Catan needs at least 2 players");
  const rng = makeRng(seed);

  // Board resources + number tokens.
  const resourcePool: HexState["resource"][] = [
    ...Array<HexState["resource"]>(4).fill("lumber"),
    ...Array<HexState["resource"]>(4).fill("wool"),
    ...Array<HexState["resource"]>(4).fill("grain"),
    ...Array<HexState["resource"]>(3).fill("brick"),
    ...Array<HexState["resource"]>(3).fill("ore"),
    "desert",
  ];
  const shuffledResources = rng.shuffle(resourcePool);
  const numberPool = rng.shuffle([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);

  let robberHex = 0;
  let numIdx = 0;
  const hexes: HexState[] = HEX_AXIAL.map((_, i) => {
    const resource = shuffledResources[i];
    if (resource === "desert") {
      robberHex = i;
      return { resource, number: null };
    }
    return { resource, number: numberPool[numIdx++] };
  });

  // Dev card deck (hidden).
  const devDeck = rng.shuffle([
    ...Array<DevCard>(14).fill("knight"),
    ...Array<DevCard>(5).fill("victory_point"),
    ...Array<DevCard>(2).fill("road_building"),
    ...Array<DevCard>(2).fill("year_of_plenty"),
    ...Array<DevCard>(2).fill("monopoly"),
  ]);

  // Ports: deterministic coastal nodes ordered around the rim.
  const ring = [...COASTAL_NODES].sort((a, b) => Math.atan2(NODE_XY[a][1], NODE_XY[a][0]) - Math.atan2(NODE_XY[b][1], NODE_XY[b][0]));
  const portTypes: PortType[] = ["any", "any", "any", "any", "brick", "lumber", "wool", "grain", "ore"];
  const ports: Record<number, PortType> = {};
  const stride = Math.floor(ring.length / portTypes.length);
  portTypes.forEach((t, i) => {
    ports[ring[i * stride]] = t;
  });

  const players: CatanPlayer[] = playerIds.map((id) => ({
    id,
    resources: zeroResources(),
    devCards: zeroDev(),
    pendingDevCards: zeroDev(),
    playedKnights: 0,
    settlementsLeft: 5,
    citiesLeft: 4,
    roadsLeft: 15,
    hasPlayedDevThisTurn: false,
  }));

  return {
    players,
    current: 0,
    phase: "setup",
    rng: rng.state(),
    hexes,
    robberHex,
    nodes: {},
    roads: {},
    ports,
    devDeck,
    dice: null,
    freeRoads: 0,
    setupStep: 0,
    setupNode: null,
    largestArmy: null,
    longestRoad: null,
    turn: 0,
    winner: null,
    finished: false,
  };
}

// ---------- helpers ----------

function byId(state: CatanState, id: string): CatanPlayer {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`No player ${id}`);
  return p;
}

function nodeIsEmpty(state: CatanState, node: number): boolean {
  return state.nodes[node] === undefined;
}

function distanceOk(state: CatanState, node: number): boolean {
  if (!nodeIsEmpty(state, node)) return false;
  return NODE_ADJACENCY[node].every((adj) => nodeIsEmpty(state, adj));
}

function ownsRoadOrBuildingAt(state: CatanState, node: number, pid: string): boolean {
  if (state.nodes[node]?.owner === pid) return true;
  return NODE_EDGES[node].some((e) => state.roads[e] === pid);
}

function roadConnects(state: CatanState, edge: number, pid: string): boolean {
  const [a, b] = EDGES[edge];
  return ownsRoadOrBuildingAt(state, a, pid) || ownsRoadOrBuildingAt(state, b, pid);
}

function legalRoadEdges(state: CatanState, pid: string): number[] {
  const out: number[] = [];
  for (let e = 0; e < EDGES.length; e += 1) {
    if (state.roads[e] === undefined && roadConnects(state, e, pid)) out.push(e);
  }
  return out;
}

function legalSettlementNodes(state: CatanState, pid: string): number[] {
  const out: number[] = [];
  for (let n = 0; n < NODE_HEXES.length; n += 1) {
    if (distanceOk(state, n) && NODE_EDGES[n].some((e) => state.roads[e] === pid)) out.push(n);
  }
  return out;
}

function tradeRatio(state: CatanState, pid: string, resource: Resource): number {
  let ratio = 4;
  for (const [nodeStr, type] of Object.entries(state.ports)) {
    const b = state.nodes[Number(nodeStr)];
    if (!b || b.owner !== pid) continue;
    if (type === "any") ratio = Math.min(ratio, 3);
    else if (type === resource) ratio = Math.min(ratio, 2);
  }
  return ratio;
}

function longestRoadLength(state: CatanState, pid: string): number {
  const incident = new Map<number, number[]>();
  EDGES.forEach((edge, ei) => {
    if (state.roads[ei] !== pid) return;
    for (const node of edge) {
      const list = incident.get(node) ?? [];
      list.push(ei);
      incident.set(node, list);
    }
  });
  if (incident.size === 0) return 0;

  let best = 0;
  const used = new Set<number>();
  const dfs = (node: number, len: number): void => {
    if (len > best) best = len;
    for (const ei of incident.get(node) ?? []) {
      if (used.has(ei)) continue;
      const [a, b] = EDGES[ei];
      used.add(ei);
      dfs(a === node ? b : a, len + 1);
      used.delete(ei);
    }
  };
  for (const node of incident.keys()) dfs(node, 0);
  return best;
}

function updateLongestRoad(state: CatanState): void {
  let holder = state.longestRoad;
  let holderLen = holder ? longestRoadLength(state, holder) : 0;
  if (holder && holderLen < 5) {
    holder = null;
    holderLen = 0;
  }
  for (const p of state.players) {
    const len = longestRoadLength(state, p.id);
    if (len >= 5 && len > holderLen) {
      holder = p.id;
      holderLen = len;
    }
  }
  state.longestRoad = holder;
}

function updateLargestArmy(state: CatanState, pid: string): void {
  const p = byId(state, pid);
  if (p.playedKnights < 3) return;
  const holderKnights = state.largestArmy ? byId(state, state.largestArmy).playedKnights : 2;
  if (p.playedKnights > holderKnights) state.largestArmy = pid;
}

function publicVP(state: CatanState, p: CatanPlayer): number {
  let vp = 0;
  for (const key of Object.keys(state.nodes)) {
    const b = state.nodes[Number(key)];
    if (b.owner === p.id) vp += b.city ? 2 : 1;
  }
  if (state.longestRoad === p.id) vp += 2;
  if (state.largestArmy === p.id) vp += 2;
  return vp;
}

function totalVP(state: CatanState, p: CatanPlayer): number {
  return publicVP(state, p) + p.devCards.victory_point + p.pendingDevCards.victory_point;
}

function checkWin(state: CatanState, p: CatanPlayer): void {
  if (totalVP(state, p) >= VP_TO_WIN) {
    state.finished = true;
    state.winner = p.id;
    state.phase = "over";
  }
}

function finishByVP(state: CatanState): void {
  let best = state.players[0];
  for (const p of state.players) if (totalVP(state, p) > totalVP(state, best)) best = p;
  state.finished = true;
  state.winner = best.id;
  state.phase = "over";
}

function produce(state: CatanState, sum: number): void {
  for (let h = 0; h < state.hexes.length; h += 1) {
    const hex = state.hexes[h];
    if (hex.number !== sum || h === state.robberHex || hex.resource === "desert") continue;
    for (const node of HEX_NODES[h]) {
      const b = state.nodes[node];
      if (!b) continue;
      byId(state, b.owner).resources[hex.resource] += b.city ? 2 : 1;
    }
  }
}

function discardOnSeven(state: CatanState): void {
  const rng = makeRng(state.rng);
  for (const p of state.players) {
    let total = totalResources(p);
    if (total <= 7) continue;
    let toDiscard = Math.floor(total / 2);
    while (toDiscard > 0) {
      const pool: Resource[] = [];
      for (const r of RESOURCES) for (let i = 0; i < p.resources[r]; i += 1) pool.push(r);
      const r = pool[rng.int(pool.length)];
      p.resources[r] -= 1;
      toDiscard -= 1;
    }
  }
  state.rng = rng.state();
}

function moveRobberAndSteal(state: CatanState, pid: string, hex: number): void {
  state.robberHex = hex;
  const rng = makeRng(state.rng);
  const victims = new Set<string>();
  for (const node of HEX_NODES[hex]) {
    const b = state.nodes[node];
    if (b && b.owner !== pid) victims.add(b.owner);
  }
  const candidates = [...victims].filter((v) => totalResources(byId(state, v)) > 0);
  if (candidates.length > 0) {
    const victim = byId(state, candidates[rng.int(candidates.length)]);
    const pool: Resource[] = [];
    for (const r of RESOURCES) for (let i = 0; i < victim.resources[r]; i += 1) pool.push(r);
    const stolen = pool[rng.int(pool.length)];
    victim.resources[stolen] -= 1;
    byId(state, pid).resources[stolen] += 1;
  }
  state.rng = rng.state();
}

// ---------- turn flow ----------

function endTurn(state: CatanState): void {
  const p = state.players[state.current];
  // Dev cards bought this turn become playable next turn.
  for (const c of Object.keys(p.pendingDevCards) as DevCard[]) {
    p.devCards[c] += p.pendingDevCards[c];
    p.pendingDevCards[c] = 0;
  }
  p.hasPlayedDevThisTurn = false;
  state.freeRoads = 0;
  state.dice = null;
  state.current = (state.current + 1) % state.players.length;
  state.turn += 1;
  if (state.turn >= MAX_TURNS) {
    finishByVP(state);
    return;
  }
  state.phase = "roll";
}

// ---------- legal actions ----------

export function getLegalActions(state: CatanState, playerId: PlayerId): CatanAction[] {
  if (state.finished) return [];
  const p = state.players[state.current];
  if (p.id !== playerId) return [];
  const actions: CatanAction[] = [];

  switch (state.phase) {
    case "setup": {
      if (state.setupNode === null) {
        for (let n = 0; n < NODE_HEXES.length; n += 1) {
          if (distanceOk(state, n)) actions.push({ type: "place_setup_settlement", playerId, node: n });
        }
      } else {
        for (const e of NODE_EDGES[state.setupNode]) {
          if (state.roads[e] === undefined) actions.push({ type: "place_setup_road", playerId, edge: e });
        }
      }
      return actions;
    }
    case "roll":
      return [{ type: "roll", playerId }];
    case "move_robber": {
      for (let h = 0; h < state.hexes.length; h += 1) {
        if (h !== state.robberHex) actions.push({ type: "move_robber", playerId, hex: h });
      }
      return actions;
    }
    case "main": {
      const canRoad = state.freeRoads > 0 || canAfford(p, COST.road);
      if (canRoad && p.roadsLeft > 0) {
        for (const e of legalRoadEdges(state, p.id)) actions.push({ type: "build_road", playerId, edge: e });
      }
      if (canAfford(p, COST.settlement) && p.settlementsLeft > 0) {
        for (const n of legalSettlementNodes(state, p.id)) actions.push({ type: "build_settlement", playerId, node: n });
      }
      if (canAfford(p, COST.city) && p.citiesLeft > 0) {
        for (const key of Object.keys(state.nodes)) {
          const node = Number(key);
          const b = state.nodes[node];
          if (b.owner === p.id && !b.city) actions.push({ type: "build_city", playerId, node });
        }
      }
      if (canAfford(p, COST.dev) && state.devDeck.length > 0) actions.push({ type: "buy_dev", playerId });

      if (!p.hasPlayedDevThisTurn) {
        if (p.devCards.knight > 0) actions.push({ type: "play_knight", playerId });
        if (p.devCards.road_building > 0) actions.push({ type: "play_road_building", playerId });
        if (p.devCards.year_of_plenty > 0) actions.push({ type: "play_year_of_plenty", playerId });
        if (p.devCards.monopoly > 0) actions.push({ type: "play_monopoly", playerId });
      }

      for (const give of RESOURCES) {
        if (p.resources[give] >= tradeRatio(state, p.id, give)) {
          for (const receive of RESOURCES) {
            if (receive !== give) actions.push({ type: "bank_trade", playerId, give, receive });
          }
        }
      }

      actions.push({ type: "end_turn", playerId });
      return actions;
    }
    case "over":
      return [];
  }
}

// ---------- apply ----------

export function applyAction(state: CatanState, action: CatanAction): CatanState {
  const next = clone(state);
  const p = next.players[next.current];
  if (action.playerId !== p.id) throw new Error(`Not ${action.playerId}'s turn`);

  switch (action.type) {
    case "place_setup_settlement": handleSetupSettlement(next, p, action.node); break;
    case "place_setup_road": handleSetupRoad(next, p, action.edge); break;
    case "roll": handleRoll(next, p); break;
    case "move_robber": handleMoveRobber(next, p, action.hex); break;
    case "build_road": handleBuildRoad(next, p, action.edge); break;
    case "build_settlement": handleBuildSettlement(next, p, action.node); break;
    case "build_city": handleBuildCity(next, p, action.node); break;
    case "buy_dev": handleBuyDev(next, p); break;
    case "play_knight": handlePlayKnight(next, p); break;
    case "play_road_building": handlePlayRoadBuilding(next, p); break;
    case "play_year_of_plenty": handlePlayYearOfPlenty(next, p); break;
    case "play_monopoly": handlePlayMonopoly(next, p); break;
    case "bank_trade": handleBankTrade(next, p, action.give, action.receive); break;
    case "end_turn": endTurn(next); break;
  }
  return next;
}

function handleSetupSettlement(state: CatanState, p: CatanPlayer, node: number): void {
  if (state.phase !== "setup" || state.setupNode !== null) throw new Error("Cannot place a settlement now");
  if (!distanceOk(state, node)) throw new Error("Illegal settlement placement");
  state.nodes[node] = { owner: p.id, city: false };
  p.settlementsLeft -= 1;
  // The second settlement (round 1) yields starting resources.
  if (state.setupStep >= state.players.length) {
    for (const h of NODE_HEXES[node]) {
      const hex = state.hexes[h];
      if (hex.resource !== "desert") p.resources[hex.resource] += 1;
    }
  }
  state.setupNode = node;
}

function handleSetupRoad(state: CatanState, p: CatanPlayer, edge: number): void {
  if (state.phase !== "setup" || state.setupNode === null) throw new Error("Place a settlement first");
  if (state.roads[edge] !== undefined || !NODE_EDGES[state.setupNode].includes(edge)) {
    throw new Error("Road must be adjacent to the just-placed settlement");
  }
  state.roads[edge] = p.id;
  p.roadsLeft -= 1;
  state.setupNode = null;
  state.setupStep += 1;

  const n = state.players.length;
  if (state.setupStep >= 2 * n) {
    state.phase = "roll";
    state.current = 0;
    state.turn = 1;
  } else {
    state.current = setupPlayerIndex(state.setupStep, n);
  }
}

function handleRoll(state: CatanState, p: CatanPlayer): void {
  if (state.phase !== "roll") throw new Error("Cannot roll now");
  const rng = makeRng(state.rng);
  const d1 = rng.int(6) + 1;
  const d2 = rng.int(6) + 1;
  state.rng = rng.state();
  state.dice = [d1, d2];
  const sum = d1 + d2;
  if (sum === 7) {
    discardOnSeven(state);
    state.phase = "move_robber";
  } else {
    produce(state, sum);
    state.phase = "main";
  }
}

function handleMoveRobber(state: CatanState, p: CatanPlayer, hex: number): void {
  if (state.phase !== "move_robber") throw new Error("No robber to move");
  if (hex === state.robberHex) throw new Error("Robber must move to a different hex");
  moveRobberAndSteal(state, p.id, hex);
  state.phase = "main";
}

function handleBuildRoad(state: CatanState, p: CatanPlayer, edge: number): void {
  if (state.phase !== "main") throw new Error("Cannot build now");
  if (state.roads[edge] !== undefined || !roadConnects(state, edge, p.id)) throw new Error("Illegal road");
  if (p.roadsLeft <= 0) throw new Error("No roads left");
  if (state.freeRoads > 0) {
    state.freeRoads -= 1;
  } else {
    if (!canAfford(p, COST.road)) throw new Error("Cannot afford road");
    pay(p, COST.road);
  }
  state.roads[edge] = p.id;
  p.roadsLeft -= 1;
  updateLongestRoad(state);
  checkWin(state, p);
}

function handleBuildSettlement(state: CatanState, p: CatanPlayer, node: number): void {
  if (state.phase !== "main") throw new Error("Cannot build now");
  if (!distanceOk(state, node) || !NODE_EDGES[node].some((e) => state.roads[e] === p.id)) {
    throw new Error("Illegal settlement");
  }
  if (p.settlementsLeft <= 0 || !canAfford(p, COST.settlement)) throw new Error("Cannot build settlement");
  pay(p, COST.settlement);
  state.nodes[node] = { owner: p.id, city: false };
  p.settlementsLeft -= 1;
  updateLongestRoad(state); // a new settlement can split nothing here (breaks ignored) but keep consistent
  checkWin(state, p);
}

function handleBuildCity(state: CatanState, p: CatanPlayer, node: number): void {
  if (state.phase !== "main") throw new Error("Cannot build now");
  const b = state.nodes[node];
  if (!b || b.owner !== p.id || b.city) throw new Error("Must upgrade your own settlement");
  if (p.citiesLeft <= 0 || !canAfford(p, COST.city)) throw new Error("Cannot build city");
  pay(p, COST.city);
  b.city = true;
  p.citiesLeft -= 1;
  p.settlementsLeft += 1; // the settlement returns to supply
  checkWin(state, p);
}

function handleBuyDev(state: CatanState, p: CatanPlayer): void {
  if (state.phase !== "main") throw new Error("Cannot buy now");
  if (state.devDeck.length === 0 || !canAfford(p, COST.dev)) throw new Error("Cannot buy dev card");
  pay(p, COST.dev);
  const card = state.devDeck.pop()!;
  p.pendingDevCards[card] += 1;
  checkWin(state, p); // a victory-point card can clinch the game immediately
}

function handlePlayKnight(state: CatanState, p: CatanPlayer): void {
  if (state.phase !== "main" || p.hasPlayedDevThisTurn || p.devCards.knight <= 0) throw new Error("Cannot play knight");
  p.devCards.knight -= 1;
  p.playedKnights += 1;
  p.hasPlayedDevThisTurn = true;
  updateLargestArmy(state, p.id);
  checkWin(state, p);
  if (!state.finished) state.phase = "move_robber";
}

function handlePlayRoadBuilding(state: CatanState, p: CatanPlayer): void {
  if (state.phase !== "main" || p.hasPlayedDevThisTurn || p.devCards.road_building <= 0) throw new Error("Cannot play");
  p.devCards.road_building -= 1;
  p.hasPlayedDevThisTurn = true;
  state.freeRoads += 2;
}

function handlePlayYearOfPlenty(state: CatanState, p: CatanPlayer): void {
  if (state.phase !== "main" || p.hasPlayedDevThisTurn || p.devCards.year_of_plenty <= 0) throw new Error("Cannot play");
  p.devCards.year_of_plenty -= 1;
  p.hasPlayedDevThisTurn = true;
  // Auto-take 2 of the resource the player has least of.
  for (let i = 0; i < 2; i += 1) {
    const target = [...RESOURCES].sort((a, b) => p.resources[a] - p.resources[b])[0];
    p.resources[target] += 1;
  }
}

function handlePlayMonopoly(state: CatanState, p: CatanPlayer): void {
  if (state.phase !== "main" || p.hasPlayedDevThisTurn || p.devCards.monopoly <= 0) throw new Error("Cannot play");
  p.devCards.monopoly -= 1;
  p.hasPlayedDevThisTurn = true;
  // Auto-pick the resource opponents hold the most of.
  let bestRes: Resource = RESOURCES[0];
  let bestTotal = -1;
  for (const r of RESOURCES) {
    const held = state.players.reduce((s, q) => (q.id === p.id ? s : s + q.resources[r]), 0);
    if (held > bestTotal) {
      bestTotal = held;
      bestRes = r;
    }
  }
  for (const q of state.players) {
    if (q.id === p.id) continue;
    p.resources[bestRes] += q.resources[bestRes];
    q.resources[bestRes] = 0;
  }
}

function handleBankTrade(state: CatanState, p: CatanPlayer, give: Resource, receive: Resource): void {
  if (state.phase !== "main") throw new Error("Cannot trade now");
  if (give === receive) throw new Error("Trade must be for a different resource");
  const ratio = tradeRatio(state, p.id, give);
  if (p.resources[give] < ratio) throw new Error("Not enough to trade");
  p.resources[give] -= ratio;
  p.resources[receive] += 1;
}

// ---------- observation / result ----------

export function observe(state: CatanState, playerId: PlayerId): CatanObservation {
  // Snapshot first: the observation must not alias live engine state, or a policy
  // could mutate the game through it (breaking the reproducibility guarantee).
  const snap = clone(state);
  const self = snap.players.find((p) => p.id === playerId)!;
  return {
    phase: snap.phase,
    current: snap.current,
    currentPlayerId: snap.players[snap.current]?.id ?? "",
    hexes: snap.hexes,
    robberHex: snap.robberHex,
    nodes: snap.nodes,
    roads: snap.roads,
    ports: snap.ports,
    dice: snap.dice,
    devDeckCount: snap.devDeck.length,
    largestArmy: snap.largestArmy,
    longestRoad: snap.longestRoad,
    turn: snap.turn,
    finished: snap.finished,
    self,
    opponents: snap.players.map((p) => ({
      id: p.id,
      resourceCount: totalResources(p),
      devCardCount:
        (Object.values(p.devCards) as number[]).reduce((a, b) => a + b, 0) +
        (Object.values(p.pendingDevCards) as number[]).reduce((a, b) => a + b, 0),
      playedKnights: p.playedKnights,
      settlementsLeft: p.settlementsLeft,
      citiesLeft: p.citiesLeft,
      roadsLeft: p.roadsLeft,
    })),
  };
}

export function result(state: CatanState): GameResult {
  const scores: Record<PlayerId, number> = Object.fromEntries(
    state.players.map((p) => [p.id, totalVP(state, p)])
  );
  if (!state.finished) {
    return { winnerIds: state.winner ? [state.winner] : [], scores, turns: state.turn, endReason: "unfinished" };
  }
  const reachedTen = state.winner ? totalVP(state, byId(state, state.winner)) >= VP_TO_WIN : false;
  return {
    winnerIds: state.winner ? [state.winner] : [],
    scores,
    turns: state.turn,
    endReason: reachedTen ? "victory" : "max_turns",
  };
}

export function describeAction(action: CatanAction): string {
  return action.type;
}

export function describeState(state: CatanState): StateView {
  const devCount = (p: CatanPlayer): number =>
    (Object.values(p.devCards) as number[]).reduce((a, b) => a + b, 0) +
    (Object.values(p.pendingDevCards) as number[]).reduce((a, b) => a + b, 0);
  const playerPanels = state.players.map((p) => ({
    title: p.id,
    rows: [
      { label: "VP", value: String(totalVP(state, p)) },
      { label: "resources", value: String(totalResources(p)) },
      { label: "dev cards", value: String(devCount(p)) },
      { label: "knights played", value: String(p.playedKnights) },
      { label: "left S/C/R", value: `${p.settlementsLeft}/${p.citiesLeft}/${p.roadsLeft}` },
    ],
  }));
  const status = state.finished
    ? `winner ${state.winner ?? "—"}`
    : `${state.players[state.current]?.id ?? "?"} to act`;
  return {
    summary: `Turn ${state.turn} · ${state.phase} · ${status}`,
    panels: [
      {
        title: "Game",
        rows: [
          { label: "turn", value: String(state.turn) },
          { label: "longest road", value: state.longestRoad ?? "—" },
          { label: "largest army", value: state.largestArmy ?? "—" },
          { label: "dev deck left", value: String(state.devDeck.length) },
        ],
      },
      ...playerPanels,
    ],
  };
}
