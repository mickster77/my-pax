import { runGame } from "./runner.js";
import type { GameDefinition, PlayerId, Policy } from "./types.js";

// A generic conformance suite: the checks every game must pass to be a
// well-behaved platform citizen. Run it on a new game (see the authoring guide)
// and it will catch the mistakes that silently corrupt a strategy lab —
// non-reproducibility, stalls, missing scores, and observations that leak/alias
// engine state.

export interface ConformanceOptions {
  seeds?: number[];
  maxSteps?: number;
}

export interface ConformanceCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface ConformanceReport {
  gameId: string;
  passed: boolean;
  checks: ConformanceCheck[];
}

const randomPolicy: Policy<unknown, unknown> = ({ legalActions, rng }) =>
  (legalActions as unknown[])[rng.int((legalActions as unknown[]).length)];

// Mutate every nested array/object in place. If `obs` shares structure with the
// engine state, this corruption will show up in the state's snapshot.
function mutateDeep(value: unknown): void {
  if (Array.isArray(value)) {
    value.push("__conformance_probe__");
    for (const item of value) mutateDeep(item);
  } else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (typeof v === "number") obj[key] = v + 1;
      else mutateDeep(v);
    }
  }
}

export function checkConformance<State, Action, Observation>(
  def: GameDefinition<State, Action, Observation>,
  playerIds: PlayerId[],
  opts: ConformanceOptions = {}
): ConformanceReport {
  const seeds = opts.seeds ?? [1, 2, 3];
  const maxSteps = opts.maxSteps ?? 20000;
  const checks: ConformanceCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string): void => {
    checks.push({ name, ok, detail });
  };

  const policies: Record<PlayerId, Policy<Action, Observation>> = Object.fromEntries(
    playerIds.map((id) => [id, randomPolicy as Policy<Action, Observation>])
  );

  add(
    "player count within meta range",
    playerIds.length >= def.meta.minPlayers && playerIds.length <= def.meta.maxPlayers,
    `got ${playerIds.length}, meta allows ${def.meta.minPlayers}-${def.meta.maxPlayers}`
  );

  // Reproducibility: same seed -> identical run.
  let reproOk = true;
  let reproDetail = "";
  for (const seed of seeds) {
    const a = runGame(def, policies, playerIds, { seed, maxSteps });
    const b = runGame(def, policies, playerIds, { seed, maxSteps });
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      reproOk = false;
      reproDetail = `seed ${seed} produced different results across runs`;
      break;
    }
  }
  add("reproducible (same seed → same run)", reproOk, reproDetail);

  // Per-seed run checks.
  let noStall = true;
  let terminates = true;
  let scoresOk = true;
  let winnersOk = true;
  const detail: Record<string, string> = {};
  for (const seed of seeds) {
    const run = runGame(def, policies, playerIds, { seed, maxSteps });
    if (run.endReason === "no_legal_actions") {
      noStall = false;
      detail.stall = `seed ${seed}: active player had no legal actions before the game ended`;
    }
    if (run.endReason === "step_limit") {
      terminates = false;
      detail.step = `seed ${seed}: did not finish within ${maxSteps} steps`;
    }
    for (const id of playerIds) {
      if (!(id in run.scores)) {
        scoresOk = false;
        detail.score = `seed ${seed}: result.scores is missing player "${id}"`;
      }
    }
    for (const w of run.winnerIds) {
      if (!playerIds.includes(w)) {
        winnersOk = false;
        detail.winner = `seed ${seed}: winnerIds contains unknown player "${w}"`;
      }
    }
  }
  add("terminates within the step cap", terminates, detail.step);
  add("never stalls (legal actions until terminal)", noStall, detail.stall);
  add("result scores every player", scoresOk, detail.score);
  add("winners are real players", winnersOk, detail.winner);

  // Observation isolation: observe() must not alias engine state.
  let obsOk = true;
  let obsDetail = "";
  const init = def.createInitialState(playerIds, seeds[0]);
  const actor = def.currentPlayer(init);
  if (actor != null) {
    const obs = def.observe(init, actor);
    if ((obs as unknown) === (init as unknown)) {
      obsOk = false;
      obsDetail = "observe() returned the raw state object";
    } else {
      const before = JSON.stringify(init);
      try {
        mutateDeep(obs);
      } catch {
        // frozen observation — that's fine, it can't alias-and-mutate
      }
      if (JSON.stringify(init) !== before) {
        obsOk = false;
        obsDetail = "mutating the observation changed engine state (shared nested references)";
      }
    }
  }
  add("observation does not alias engine state", obsOk, obsDetail);

  return { gameId: def.id, passed: checks.every((c) => c.ok), checks };
}

/** One-line-per-check text rendering, for CLIs and test failure messages. */
export function formatConformance(report: ConformanceReport): string {
  const head = `${report.passed ? "PASS" : "FAIL"} ${report.gameId}`;
  const lines = report.checks.map(
    (c) => `  ${c.ok ? "✓" : "✗"} ${c.name}${c.ok || !c.detail ? "" : ` — ${c.detail}`}`
  );
  return [head, ...lines].join("\n");
}
