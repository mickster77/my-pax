import { describe, it, expect } from "vitest";
import { checkConformance, runGame, randomPolicy } from "@lab/core";
import { ticTacToeGame } from "./game.js";

const players = ["x", "o"];

describe("tic-tac-toe", () => {
  it("passes the platform conformance suite", () => {
    const report = checkConformance(ticTacToeGame, players, { seeds: [1, 2, 3], maxSteps: 100 });
    expect(report.passed, JSON.stringify(report.checks.filter((c) => !c.ok), null, 2)).toBe(true);
  });

  it("detects a row win", () => {
    let s = ticTacToeGame.createInitialState(players, 0);
    // x:0, o:3, x:1, o:4, x:2 -> x wins top row
    for (const cell of [0, 3, 1, 4, 2]) {
      const pid = ticTacToeGame.currentPlayer(s)!;
      s = ticTacToeGame.applyAction(s, { type: "place", playerId: pid, cell });
    }
    expect(ticTacToeGame.isTerminal(s)).toBe(true);
    expect(ticTacToeGame.result(s).winnerIds).toEqual(["x"]);
  });

  it("random self-play always terminates with a victory or draw", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const run = runGame(ticTacToeGame, { x: randomPolicy, o: randomPolicy }, players, { seed, maxSteps: 100 });
      expect(["victory", "draw"]).toContain(run.endReason);
    }
  });
});
