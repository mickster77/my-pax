import { describe, it, expect } from "vitest";
import { runTournament, tournamentGamesCsv } from "./tournament.js";
import { wilson95 } from "./stats.js";
import type { GameDefinition, Policy } from "./types.js";

// Deterministic race game: each turn the active player adds their chosen amount
// to their total; first to reach the target wins. Seat 0 moves first.
interface RaceState {
  totals: Record<string, number>;
  order: string[];
  toMove: number;
  target: number;
  turn: number;
}
type RaceAction = { playerId: string; amount: 1 | 2 };

const raceGame: GameDefinition<RaceState, RaceAction, number> = {
  id: "race",
  meta: { name: "Race", minPlayers: 2, maxPlayers: 4 },
  createInitialState(playerIds) {
    return {
      totals: Object.fromEntries(playerIds.map((p) => [p, 0])),
      order: [...playerIds],
      toMove: 0,
      target: 12,
      turn: 0,
    };
  },
  currentPlayer(state) {
    return this.isTerminal(state) ? null : state.order[state.toMove];
  },
  isTerminal(state) {
    return Object.values(state.totals).some((v) => v >= state.target);
  },
  getLegalActions(state, playerId) {
    if (this.isTerminal(state) || state.order[state.toMove] !== playerId) return [];
    return [
      { playerId, amount: 1 },
      { playerId, amount: 2 },
    ];
  },
  applyAction(state, action) {
    const next: RaceState = {
      ...state,
      totals: { ...state.totals },
      turn: state.turn + 1,
      toMove: (state.toMove + 1) % state.order.length,
    };
    next.totals[action.playerId] += action.amount;
    return next;
  },
  observe(state, playerId) {
    return state.totals[playerId];
  },
  result(state) {
    const winner = Object.entries(state.totals).find(([, v]) => v >= state.target);
    return {
      winnerIds: winner ? [winner[0]] : [],
      scores: { ...state.totals },
      turns: state.turn,
      endReason: winner ? "victory" : "unfinished",
    };
  },
};

const maxPolicy: Policy<RaceAction, number> = ({ legalActions }) =>
  legalActions.find((a) => a.amount === 2) ?? legalActions[0];
const minPolicy: Policy<RaceAction, number> = ({ legalActions }) =>
  legalActions.find((a) => a.amount === 1) ?? legalActions[0];

describe("runTournament", () => {
  const max = { name: "max", policy: maxPolicy };
  const min = { name: "min", policy: minPolicy };

  it("the stronger strategy wins regardless of seat, thanks to rotation", () => {
    const result = runTournament(raceGame, [max, min], { games: 20 });
    const byName = Object.fromEntries(result.perStrategy.map((s) => [s.name, s]));
    expect(byName.max.winRate).toBe(1);
    expect(byName.min.winRate).toBe(0);
    expect(result.perStrategy[0].name).toBe("max");
  });

  it("seat rotation balances how often each strategy sits in each seat", () => {
    const result = runTournament(raceGame, [max, min], { games: 20, rotateSeats: true });
    // max occupies seat 0 in exactly half the games and seat 1 in the other half
    const maxAtSeat0 = result.records.filter((r) => r.lineup[0] === "max").length;
    expect(maxAtSeat0).toBe(10);
    // each distinct strategy fills exactly one seat per game
    expect(result.perStrategy.every((s) => s.seatGames === 20)).toBe(true);
  });

  it("is reproducible: identical options give identical per-strategy stats", () => {
    const a = runTournament(raceGame, [max, min], { games: 16, seedBase: 5 });
    const b = runTournament(raceGame, [max, min], { games: 16, seedBase: 5 });
    expect(a.perStrategy).toEqual(b.perStrategy);
    expect(a.headToHead).toEqual(b.headToHead);
  });

  it("handles a repeated strategy in the lineup (1 vs 2) fairly per seat-game", () => {
    const result = runTournament(raceGame, [max, min, min], { games: 30 });
    const byName = Object.fromEntries(result.perStrategy.map((s) => [s.name, s]));
    expect(byName.max.seatGames).toBe(30); // one max seat per game
    expect(byName.min.seatGames).toBe(60); // two min seats per game
    expect(byName.max.winRate).toBeGreaterThan(byName.min.winRate);
  });

  it("produces a head-to-head matrix and CSV with one row per game", () => {
    const result = runTournament(raceGame, [max, min], { games: 8 });
    expect(result.headToHead.outscoreRate.max.min).not.toBeNull();
    expect(result.headToHead.outscoreRate.max.max).toBeNull();
    const csv = tournamentGamesCsv(result);
    expect(csv.trim().split("\n")).toHaveLength(1 + 8); // header + 8 games
    expect(csv).toContain("seat1_strategy");
  });
});

describe("wilson95", () => {
  it("brackets the point estimate and clamps to [0,1]", () => {
    const [lo, hi] = wilson95(5, 10);
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeLessThan(1);
    expect(lo).toBeLessThan(0.5);
    expect(hi).toBeGreaterThan(0.5);
    expect(wilson95(0, 10)[0]).toBe(0);
    expect(wilson95(10, 10)[1]).toBe(1);
    expect(wilson95(0, 0)).toEqual([0, 0]);
  });
});
