import { runBatch, randomPolicy, type Policy, type GameRun, type PlayerId } from "@lab/core";
import { registry } from "./registry.js";

// Minimal Phase-1 tournament runner: play a batch of games with random bots and
// report win rates and how games ended. Rich CLI, per-seat policy assignment,
// seat rotation, confidence intervals, and CSV output are Phase 2.

interface Args {
  game: string;
  players: number;
  games: number;
  seed: number;
  maxSteps: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { game: "pax", players: 3, games: 30, seed: 1, maxSteps: 3000 };

  const num = (key: string, raw: string | undefined): number => {
    if (raw === undefined) throw new Error(`Missing value for ${key}`);
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`Invalid number for ${key}: "${raw}"`);
    return n;
  };
  const str = (key: string, raw: string | undefined): string => {
    if (raw === undefined) throw new Error(`Missing value for ${key}`);
    return raw;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const eq = argv[i].indexOf("=");
    const key = eq >= 0 ? argv[i].slice(0, eq) : argv[i];
    const inlineVal = eq >= 0 ? argv[i].slice(eq + 1) : undefined;
    // Take the inline value (--k=v), else the next token — but never a following
    // flag, so a missing value is reported instead of swallowing the next flag.
    const consume = (): string | undefined => {
      if (inlineVal !== undefined) return inlineVal;
      const nextTok = argv[i + 1];
      if (nextTok === undefined || nextTok.startsWith("--")) return undefined;
      i += 1;
      return nextTok;
    };
    switch (key) {
      case "--game": args.game = str(key, consume()); break;
      case "--players": args.players = num(key, consume()); break;
      case "--games": args.games = num(key, consume()); break;
      case "--seed": args.seed = num(key, consume()); break;
      case "--max-steps": args.maxSteps = num(key, consume()); break;
      default: throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }

  if (args.games < 1) throw new Error(`--games must be >= 1 (got ${args.games})`);
  if (args.players < 1) throw new Error(`--players must be >= 1 (got ${args.players})`);
  if (args.maxSteps < 1) throw new Error(`--max-steps must be >= 1 (got ${args.maxSteps})`);
  return args;
}

function pct(n: number, total: number): string {
  return total === 0 ? "0.0%" : `${((100 * n) / total).toFixed(1)}%`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const def = registry.get(args.game);

  const clampedPlayers = Math.min(Math.max(args.players, def.meta.minPlayers), def.meta.maxPlayers);
  const playerIds: PlayerId[] = Array.from({ length: clampedPlayers }, (_, i) => `p${i + 1}`);
  const policies: Record<PlayerId, Policy<unknown, unknown>> = Object.fromEntries(
    playerIds.map((id) => [id, randomPolicy])
  );

  console.log(`Game: ${def.meta.name} (${def.id})`);
  console.log(
    `Players: ${playerIds.length} (all random)   Games: ${args.games}   Seeds: ${args.seed}..${args.seed + args.games - 1}`
  );
  console.log("");

  const runs: GameRun[] = runBatch(def, policies, playerIds, {
    games: args.games,
    seedBase: args.seed,
    maxSteps: args.maxSteps,
  });

  const wins: Record<PlayerId, number> = Object.fromEntries(playerIds.map((id) => [id, 0]));
  const endReasons: Record<string, number> = {};
  let draws = 0;
  let totalSteps = 0;
  let totalTurns = 0;

  for (const run of runs) {
    endReasons[run.endReason] = (endReasons[run.endReason] ?? 0) + 1;
    totalSteps += run.steps;
    totalTurns += run.turns;
    if (run.winnerIds.length === 1) wins[run.winnerIds[0]] += 1;
    else draws += 1;
  }

  const decisive = runs.length - draws;
  console.log("Win rate by seat:");
  for (const id of playerIds) {
    console.log(
      `  ${id}: ${wins[id]} wins  (${pct(wins[id], runs.length)} of all, ${pct(wins[id], decisive)} of decisive)`
    );
  }
  console.log(`  draws / no winner: ${draws}  (${pct(draws, runs.length)})`);
  console.log("");

  console.log("How games ended:");
  for (const [reason, count] of Object.entries(endReasons)) {
    console.log(`  ${reason}: ${count}  (${pct(count, runs.length)})`);
  }
  console.log("");
  console.log(
    `Avg actions/game: ${(totalSteps / runs.length).toFixed(1)}   Avg turns/game: ${(totalTurns / runs.length).toFixed(1)}`
  );
}

main();
