import { describe, it, expect } from "vitest";
import { runGame, runTournament, randomPolicy } from "@lab/core";
import { createInitialState, getLegalActions, applyAction, observe } from "./engine.js";
import { catanGame } from "./game.js";
import { catanBuilderPolicy } from "./policies.js";
import { NODE_COUNT, EDGE_COUNT, HEX_COUNT } from "./geometry.js";

const players = ["p1", "p2", "p3"];
const MAX_STEPS = 60000;

describe("geometry", () => {
  it("is the standard Catan board", () => {
    expect(HEX_COUNT).toBe(19);
    expect(NODE_COUNT).toBe(54);
    expect(EDGE_COUNT).toBe(72);
  });
});

describe("createInitialState", () => {
  it("sets up a valid board", () => {
    const s = createInitialState(players, 1);
    expect(s.hexes).toHaveLength(19);
    expect(s.hexes.filter((h) => h.resource === "desert")).toHaveLength(1);
    expect(s.hexes[s.robberHex].resource).toBe("desert");
    expect(s.devDeck).toHaveLength(25);
    expect(Object.keys(s.ports)).toHaveLength(9);
    expect(s.players.every((p) => p.roadsLeft === 15 && p.settlementsLeft === 5 && p.citiesLeft === 4)).toBe(true);
    expect(s.phase).toBe("setup");
  });
});

describe("hidden information", () => {
  it("observe() shows the player their own cards but only counts for opponents", () => {
    // Play out setup so players hold resources.
    let s = createInitialState(["p1", "p2"], 3);
    for (let i = 0; i < 1000 && s.phase === "setup"; i += 1) {
      const pid = catanGame.currentPlayer(s)!;
      s = applyAction(s, getLegalActions(s, pid)[0]);
    }
    const obs = observe(s, "p1");
    expect(obs.self.id).toBe("p1");
    expect(obs.self.resources).toBeDefined(); // own resources are visible
    const opp = obs.opponents.find((o) => o.id === "p2")!;
    expect(typeof opp.resourceCount).toBe("number"); // only a count for opponents
    expect((opp as unknown as { resources?: unknown }).resources).toBeUndefined();
    expect((opp as unknown as { devCards?: unknown }).devCards).toBeUndefined();
  });
});

describe("dice RNG & reproducibility", () => {
  it("is reproducible from the seed", () => {
    const policies = { p1: randomPolicy, p2: randomPolicy, p3: randomPolicy };
    const a = runGame(catanGame, policies, players, { seed: 11, maxSteps: MAX_STEPS });
    const b = runGame(catanGame, policies, players, { seed: 11, maxSteps: MAX_STEPS });
    expect(a).toEqual(b);
  });
});

describe("termination & invariants", () => {
  it("every game finishes with a winner (no stalls)", () => {
    const policies = { p1: randomPolicy, p2: randomPolicy, p3: randomPolicy };
    for (let seed = 1; seed <= 10; seed += 1) {
      const run = runGame(catanGame, policies, players, { seed, maxSteps: MAX_STEPS });
      expect(["victory", "max_turns"]).toContain(run.endReason);
      expect(run.winnerIds).toHaveLength(1);
    }
  });

  it("the active player always has a legal action until the game ends", () => {
    let s = createInitialState(players, 77);
    for (let i = 0; i < 5000 && !catanGame.isTerminal(s); i += 1) {
      const pid = catanGame.currentPlayer(s)!;
      const legal = getLegalActions(s, pid);
      expect(legal.length).toBeGreaterThan(0);
      s = applyAction(s, legal[0]);
    }
  });
});

describe("strategy quality", () => {
  it("the builder strategy beats random", () => {
    const builder = { name: "builder", policy: catanBuilderPolicy };
    const random = { name: "random", policy: randomPolicy };
    const result = runTournament(catanGame, [builder, random], { games: 24, maxSteps: MAX_STEPS });
    const byName = Object.fromEntries(result.perStrategy.map((s) => [s.name, s]));
    expect(byName.builder.winRate).toBeGreaterThan(byName.random.winRate);
  });
});
