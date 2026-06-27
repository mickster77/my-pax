import { runGame } from "./runner.js";
import type { GameDefinition, PlayerId, Policy } from "./types.js";
import { wilson95 } from "./stats.js";

/** A named strategy: a policy plus a label to report it under. */
export interface Strategy<Action = unknown, Observation = unknown> {
  name: string;
  policy: Policy<Action, Observation>;
}

export interface TournamentOptions {
  /** Total games to play. For balanced seat rotation, use a multiple of the seat count. */
  games: number;
  seedBase?: number;
  maxSteps?: number;
  /**
   * Rotate which seat each strategy occupies across games, to neutralize
   * first-player / seat advantage. On by default.
   */
  rotateSeats?: boolean;
}

export interface StrategyStat {
  name: string;
  /** Number of (game, seat) slots this strategy occupied. */
  seatGames: number;
  wins: number;
  /**
   * Wins per seat-game. Directly comparable across strategies regardless of how
   * many seats each occupies. Under no skill difference it tends to the
   * single-winner rate / seatCount — i.e. 1 / seatCount only when (nearly) every
   * game has a single winner; lower if many games draw or hit the step limit.
   */
  winRate: number;
  /** Wilson 95% CI for winRate. */
  ci95: [number, number];
  /** Mean final score across this strategy's seat-games. */
  meanScore: number;
}

export interface GameRecord {
  index: number;
  seed: number;
  /** Strategy name per seat, after rotation. */
  lineup: string[];
  winnerSeat: number | null;
  winnerStrategy: string | null;
  /** Final score per seat. */
  scores: number[];
  steps: number;
  turns: number;
  endReason: string;
}

export interface HeadToHead {
  names: string[];
  /** outscoreRate[a][b] = fraction of seat-pair comparisons where a's score > b's (null on the diagonal / no data). */
  outscoreRate: Record<string, Record<string, number | null>>;
  /** Number of comparisons behind each rate. */
  counts: Record<string, Record<string, number>>;
}

export interface TournamentResult {
  gameId: string;
  seatCount: number;
  games: number;
  rotateSeats: boolean;
  /** Pre-rotation lineup (strategy per seat as supplied). */
  lineup: string[];
  perStrategy: StrategyStat[];
  headToHead: HeadToHead;
  byEndReason: Record<string, number>;
  /**
   * Games with no single winner (true draws + multi-winner ties + games that hit
   * the step limit). Reconciles with byEndReason: this counts everything that did
   * not credit exactly one seat.
   */
  noSingleWinner: number;
  records: GameRecord[];
}

/**
 * Run a full tournament: a lineup of one strategy per seat, played over many
 * seeded games with optional seat rotation, aggregated into per-strategy win
 * rates (with CIs) and a head-to-head outscore matrix.
 *
 * Strategies are compared per seat-game, so a lineup may repeat a strategy
 * (e.g. one greedy vs. two random) and the rates remain fair.
 */
export function runTournament<State, Action, Observation>(
  def: GameDefinition<State, Action, Observation>,
  lineup: Strategy<Action, Observation>[],
  opts: TournamentOptions
): TournamentResult {
  const seatCount = lineup.length;
  if (seatCount < def.meta.minPlayers || seatCount > def.meta.maxPlayers) {
    throw new Error(
      `${def.meta.name} supports ${def.meta.minPlayers}-${def.meta.maxPlayers} players, but the lineup has ${seatCount}`
    );
  }
  if (opts.games < 1) throw new Error("games must be >= 1");

  const rotate = opts.rotateSeats ?? true;
  const seedBase = opts.seedBase ?? 1;
  const playerIds: PlayerId[] = Array.from({ length: seatCount }, (_, i) => `p${i + 1}`);

  const records: GameRecord[] = [];
  for (let g = 0; g < opts.games; g += 1) {
    const shift = rotate ? g % seatCount : 0;
    // Seat i is occupied by lineup[(i + shift) % seatCount]; over seatCount games
    // each strategy visits each seat once.
    const seatStrategies = playerIds.map((_, i) => lineup[(i + shift) % seatCount]);
    const policies: Record<PlayerId, Policy<Action, Observation>> = {};
    seatStrategies.forEach((s, i) => {
      policies[playerIds[i]] = s.policy;
    });

    const seed = seedBase + g;
    const run = runGame(def, policies, playerIds, { seed, maxSteps: opts.maxSteps });
    const scores = playerIds.map((pid) => run.scores[pid] ?? 0);
    const winnerSeat = run.winnerIds.length === 1 ? playerIds.indexOf(run.winnerIds[0]) : null;

    records.push({
      index: g,
      seed,
      lineup: seatStrategies.map((s) => s.name),
      winnerSeat: winnerSeat != null && winnerSeat >= 0 ? winnerSeat : null,
      winnerStrategy: winnerSeat != null && winnerSeat >= 0 ? seatStrategies[winnerSeat].name : null,
      scores,
      steps: run.steps,
      turns: run.turns,
      endReason: run.endReason,
    });
  }

  return aggregate(def.id, seatCount, opts.games, rotate, lineup.map((s) => s.name), records);
}

function aggregate(
  gameId: string,
  seatCount: number,
  games: number,
  rotateSeats: boolean,
  lineupNames: string[],
  records: GameRecord[]
): TournamentResult {
  const names = [...new Set(lineupNames)];
  const acc: Record<string, { wins: number; seatGames: number; scoreSum: number }> = {};
  const h2hWin: Record<string, Record<string, number>> = {};
  const h2hCount: Record<string, Record<string, number>> = {};
  for (const a of names) {
    acc[a] = { wins: 0, seatGames: 0, scoreSum: 0 };
    h2hWin[a] = {};
    h2hCount[a] = {};
    for (const b of names) {
      h2hWin[a][b] = 0;
      h2hCount[a][b] = 0;
    }
  }

  const byEndReason: Record<string, number> = {};
  let noSingleWinner = 0;

  for (const rec of records) {
    byEndReason[rec.endReason] = (byEndReason[rec.endReason] ?? 0) + 1;
    if (rec.winnerStrategy === null) noSingleWinner += 1;

    rec.lineup.forEach((name, i) => {
      acc[name].seatGames += 1;
      acc[name].scoreSum += rec.scores[i];
      if (rec.winnerSeat === i) acc[name].wins += 1;
    });

    for (let i = 0; i < seatCount; i += 1) {
      for (let j = 0; j < seatCount; j += 1) {
        // Skip same seat and same-strategy pairs: a strategy vs. itself carries
        // no head-to-head signal (and would leak a bogus self-count when a
        // strategy occupies multiple seats).
        if (i === j || rec.lineup[i] === rec.lineup[j]) continue;
        const a = rec.lineup[i];
        const b = rec.lineup[j];
        h2hCount[a][b] += 1;
        if (rec.scores[i] > rec.scores[j]) h2hWin[a][b] += 1;
      }
    }
  }

  const perStrategy: StrategyStat[] = names
    .map((name) => {
      const { wins, seatGames, scoreSum } = acc[name];
      return {
        name,
        seatGames,
        wins,
        winRate: seatGames > 0 ? wins / seatGames : 0,
        ci95: wilson95(wins, seatGames),
        meanScore: seatGames > 0 ? scoreSum / seatGames : 0,
      };
    })
    .sort((a, b) => b.winRate - a.winRate);

  const outscoreRate: Record<string, Record<string, number | null>> = {};
  for (const a of names) {
    outscoreRate[a] = {};
    for (const b of names) {
      outscoreRate[a][b] = a === b || h2hCount[a][b] === 0 ? null : h2hWin[a][b] / h2hCount[a][b];
    }
  }

  return {
    gameId,
    seatCount,
    games,
    rotateSeats,
    lineup: lineupNames,
    perStrategy,
    headToHead: { names, outscoreRate, counts: h2hCount },
    byEndReason,
    noSingleWinner,
    records,
  };
}

/** Per-game results as CSV (one row per game; seat columns expand to the seat count). */
export function tournamentGamesCsv(result: TournamentResult): string {
  const seatCols: string[] = [];
  for (let i = 0; i < result.seatCount; i += 1) {
    seatCols.push(`seat${i + 1}_strategy`, `seat${i + 1}_score`);
  }
  const header = ["game", "seed", "endReason", "steps", "turns", "winner_seat", "winner_strategy", ...seatCols];
  const rows = result.records.map((r) => {
    const cells: (string | number)[] = [
      r.index,
      r.seed,
      r.endReason,
      r.steps,
      r.turns,
      r.winnerSeat ?? "",
      r.winnerStrategy ?? "",
    ];
    for (let i = 0; i < result.seatCount; i += 1) cells.push(r.lineup[i], r.scores[i]);
    return cells.join(",");
  });
  return [header.join(","), ...rows].join("\n") + "\n";
}

/** Compact, serializable summary (everything except the per-game records). */
export function tournamentSummary(result: TournamentResult): Omit<TournamentResult, "records"> {
  const { records: _records, ...summary } = result;
  return summary;
}
