import { describe, it, expect } from "vitest";
import { checkConformance, formatConformance } from "@lab/core";
import { registry } from "./registry.js";

// Every registered game must satisfy the platform contract. This is the gate a
// new game has to pass — it catches non-reproducibility, stalls, missing scores,
// and observations that alias engine state.
describe("all registered games conform to the platform contract", () => {
  for (const def of registry.list()) {
    it(`${def.id} conforms`, () => {
      const players = Array.from({ length: def.meta.minPlayers }, (_, i) => `p${i + 1}`);
      const report = checkConformance(def, players, { seeds: [1, 2, 3], maxSteps: 60000 });
      expect(report.passed, formatConformance(report)).toBe(true);
    });
  }
});
