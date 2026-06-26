import { writeFileSync } from "node:fs";
import {
  runTournament,
  tournamentGamesCsv,
  tournamentSummary,
  type Strategy,
  type TournamentResult,
} from "@lab/core";
import { registry } from "./registry.js";
import { resolveStrategy, strategyNames } from "./strategies.js";

// Strategy lab CLI: pit named strategies against each other over many seeded
// games (with seat rotation to remove first-player bias) and report per-strategy
// win rates with confidence intervals plus a head-to-head matrix.

interface Args {
  game: string;
  seats: string[];
  games: number;
  seed: number;
  maxSteps: number;
  rotate: boolean;
  out: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    game: "pax",
    seats: ["greedy", "random", "random"],
    games: 60,
    seed: 1,
    maxSteps: 3000,
    rotate: true,
    out: null,
  };

  const str = (key: string, raw: string | undefined): string => {
    if (raw === undefined) throw new Error(`Missing value for ${key}`);
    return raw;
  };
  const int = (key: string, raw: string | undefined): number => {
    const v = str(key, raw);
    const n = Number(v);
    if (!Number.isInteger(n)) throw new Error(`${key} must be an integer, got "${v}"`);
    return n;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const eq = argv[i].indexOf("=");
    const key = eq >= 0 ? argv[i].slice(0, eq) : argv[i];
    const inlineVal = eq >= 0 ? argv[i].slice(eq + 1) : undefined;
    const consume = (): string | undefined => {
      if (inlineVal !== undefined) return inlineVal;
      const nextTok = argv[i + 1];
      if (nextTok === undefined || nextTok.startsWith("--")) return undefined;
      i += 1;
      return nextTok;
    };
    switch (key) {
      case "--game": args.game = str(key, consume()); break;
      case "--seats": args.seats = str(key, consume()).split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--games": args.games = int(key, consume()); break;
      case "--seed": args.seed = int(key, consume()); break;
      case "--max-steps": args.maxSteps = int(key, consume()); break;
      case "--no-rotate": args.rotate = false; break;
      case "--out": args.out = str(key, consume()); break;
      default: throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }

  if (args.seats.length < 1) throw new Error("--seats needs at least one strategy");
  if (args.games < 1) throw new Error(`--games must be >= 1 (got ${args.games})`);
  if (args.maxSteps < 1) throw new Error(`--max-steps must be >= 1 (got ${args.maxSteps})`);
  return args;
}

function pct(x: number): string {
  return `${(100 * x).toFixed(1)}%`;
}

function printReport(result: TournamentResult): void {
  const nameW = Math.max(8, ...result.perStrategy.map((s) => s.name.length));
  // No-skill baseline: each seat is equally likely to take a decisive win, so
  // the achievable average win rate is (single-winner games / games) / seats.
  // That is 1/seats only when every game has a single winner.
  const decisive = result.games - result.noSingleWinner;
  const chanceLevel = (decisive / result.games) / result.seatCount;

  console.log("");
  console.log(`Win rate per seat-game  (no-skill baseline = ${pct(chanceLevel)}):`);
  for (const s of result.perStrategy) {
    const ci = `[${pct(s.ci95[0])}, ${pct(s.ci95[1])}]`;
    console.log(
      `  ${s.name.padEnd(nameW)}  ${pct(s.winRate).padStart(6)}  95% CI ${ci.padEnd(18)}` +
        `  (${s.wins}/${s.seatGames})  meanScore ${s.meanScore.toFixed(2)}`
    );
  }

  const { names, outscoreRate, counts } = result.headToHead;
  if (names.length > 1) {
    console.log("");
    console.log("Head-to-head (row outscored column, per seat-pair):");
    const cellW = Math.max(6, ...names.map((n) => n.length));
    console.log(`  ${"".padEnd(nameW)}  ${names.map((n) => n.padStart(cellW)).join("  ")}`);
    for (const a of names) {
      const cells = names.map((b) => {
        const rate = outscoreRate[a][b];
        return (rate === null ? "—" : pct(rate)).padStart(cellW);
      });
      console.log(`  ${a.padEnd(nameW)}  ${cells.join("  ")}`);
    }
    console.log(`  (n per off-diagonal cell ≈ ${counts[names[0]][names[1]] ?? 0})`);
  }

  console.log("");
  console.log("How games ended:");
  for (const [reason, count] of Object.entries(result.byEndReason)) {
    console.log(`  ${reason}: ${count}  (${pct(count / result.games)})`);
  }
  if (result.noSingleWinner > 0) {
    console.log(`  games with no single winner: ${result.noSingleWinner}  (${pct(result.noSingleWinner / result.games)})`);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const def = registry.get(args.game);

  if (args.seats.length < def.meta.minPlayers || args.seats.length > def.meta.maxPlayers) {
    throw new Error(
      `${def.meta.name} supports ${def.meta.minPlayers}-${def.meta.maxPlayers} players; ` +
        `--seats has ${args.seats.length}. Available strategies: ${strategyNames().join(", ")}`
    );
  }

  const lineup: Strategy[] = args.seats.map(resolveStrategy);

  console.log(`Game: ${def.meta.name} (${def.id})`);
  console.log(`Seats: ${args.seats.join(", ")}`);
  console.log(
    `Games: ${args.games}   Seeds: ${args.seed}..${args.seed + args.games - 1}   ` +
      `Seat rotation: ${args.rotate ? "on" : "off"}`
  );
  if (args.rotate && args.games % args.seats.length !== 0) {
    console.log(
      `  note: ${args.games} games is not a multiple of ${args.seats.length} seats — ` +
        `seat coverage is slightly uneven. Use a multiple of ${args.seats.length} for exact balance.`
    );
  }

  const result = runTournament(def, lineup, {
    games: args.games,
    seedBase: args.seed,
    maxSteps: args.maxSteps,
    rotateSeats: args.rotate,
  });

  printReport(result);

  if (args.out) {
    const summaryPath = `${args.out}.summary.json`;
    const csvPath = `${args.out}.games.csv`;
    writeFileSync(summaryPath, JSON.stringify(tournamentSummary(result), null, 2));
    writeFileSync(csvPath, tournamentGamesCsv(result));
    console.log("");
    console.log(`Wrote ${summaryPath} and ${csvPath}`);
  }
}

main();
