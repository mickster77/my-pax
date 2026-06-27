import { describe, it, expect } from "vitest";
import { runGame } from "./runner.js";
import { makeRng } from "./rng.js";
import { randomPolicy, firstActionPolicy } from "./policies.js";
import type { GameDefinition } from "./types.js";

// A trivial two-player race game used only to exercise the generic runner with
// no dependency on any real game. Each turn the active player adds 1 or 2 to
// their total; first to reach the target wins.
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
  meta: { name: "Race", minPlayers: 2, maxPlayers: 2 },
  createInitialState(playerIds) {
    return {
      totals: Object.fromEntries(playerIds.map((p) => [p, 0])),
      order: [...playerIds],
      toMove: 0,
      target: 10,
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

const players = ["a", "b"];

describe("runGame", () => {
  it("is reproducible: same seed yields an identical run", () => {
    const policies = { a: randomPolicy, b: randomPolicy };
    const r1 = runGame(raceGame, policies, players, { seed: 7 });
    const r2 = runGame(raceGame, policies, players, { seed: 7 });
    expect(r1).toEqual(r2);
  });

  it("terminates with a winner under random play", () => {
    const policies = { a: randomPolicy, b: randomPolicy };
    const run = runGame(raceGame, policies, players, { seed: 123 });
    expect(run.endReason).toBe("victory");
    expect(run.winnerIds).toHaveLength(1);
    expect(run.steps).toBeGreaterThan(0);
  });

  it("respects the step limit on a non-terminating setup", () => {
    // target unreachable in few steps; cap at 3 actions
    const run = runGame(raceGame, { a: firstActionPolicy, b: firstActionPolicy }, players, {
      seed: 1,
      maxSteps: 3,
    });
    expect(run.steps).toBe(3);
    expect(run.endReason).toBe("step_limit");
  });

  it("different seeds can produce different runs", () => {
    const policies = { a: randomPolicy, b: randomPolicy };
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => runGame(raceGame, policies, players, { seed: s }).steps);
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });
});

describe("makeRng", () => {
  it("is resumable from its serialized state", () => {
    const a = makeRng(42);
    a.next();
    a.next();
    const snapshot = a.state();
    const b = makeRng(snapshot);
    expect(b.next()).toBe(a.next());
    expect(b.next()).toBe(a.next());
  });
});
