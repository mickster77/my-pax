import { describe, it, expect } from "vitest";
import { runGame, runTournament, randomPolicy } from "@lab/core";
import { createInitialState, getLegalActions, applyAction } from "./engine.js";
import { monopolyGame } from "./game.js";
import { monopolyBuyerPolicy } from "./policies.js";

const players = ["p1", "p2", "p3"];
const MAX_STEPS = 8000;

describe("createInitialState", () => {
  it("sets up the standard starting position", () => {
    const s = createInitialState(players, 1);
    expect(s.players).toHaveLength(3);
    expect(s.players.every((p) => p.cash === 1500 && p.position === 0 && !p.bankrupt)).toBe(true);
    expect(s.housesRemaining).toBe(32);
    expect(Object.values(s.ownables).every((o) => o.owner === null && o.houses === 0)).toBe(true);
    expect(s.phase).toBe("preroll");
  });
});

describe("in-game dice RNG", () => {
  it("draws dice from the serializable rng carried on the state", () => {
    const s = createInitialState(["p1", "p2"], 7);
    const before = s.rng.value;
    const next = applyAction(s, { type: "roll", playerId: "p1" });
    expect(next.rng.value).not.toBe(before); // a roll consumed randomness from state.rng
    expect(s.rng.value).toBe(before); // applyAction did not mutate the input
  });

  it("is reproducible: same seed yields an identical game", () => {
    const policies = { p1: randomPolicy, p2: randomPolicy, p3: randomPolicy };
    const a = runGame(monopolyGame, policies, players, { seed: 42, maxSteps: MAX_STEPS });
    const b = runGame(monopolyGame, policies, players, { seed: 42, maxSteps: MAX_STEPS });
    expect(a).toEqual(b);
  });
});

describe("game termination & invariants", () => {
  it("every game finishes with a winner (never stalls or runs out of moves)", () => {
    const policies = { p1: randomPolicy, p2: randomPolicy, p3: randomPolicy };
    for (let seed = 1; seed <= 25; seed += 1) {
      const run = runGame(monopolyGame, policies, players, { seed, maxSteps: MAX_STEPS });
      expect(["victory", "max_turns"]).toContain(run.endReason);
      expect(run.winnerIds).toHaveLength(1);
    }
  });

  it("the active player always has at least one legal action until the game ends", () => {
    let state = createInitialState(players, 99);
    for (let i = 0; i < 2000 && !monopolyGame.isTerminal(state); i += 1) {
      const pid = monopolyGame.currentPlayer(state)!;
      const legal = getLegalActions(state, pid);
      expect(legal.length).toBeGreaterThan(0);
      // drive with the first action just to advance deterministically
      state = applyAction(state, legal[0]);
    }
  });
});

describe("strategy quality", () => {
  it("the buyer strategy beats random", () => {
    const buyer = { name: "buyer", policy: monopolyBuyerPolicy };
    const random = { name: "random", policy: randomPolicy };
    const result = runTournament(monopolyGame, [buyer, random], { games: 30, maxSteps: MAX_STEPS });
    const byName = Object.fromEntries(result.perStrategy.map((s) => [s.name, s]));
    expect(byName.buyer.winRate).toBeGreaterThan(byName.random.winRate);
  });
});
