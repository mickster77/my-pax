// Seeded, serializable pseudo-random number generator.
//
// This is the single source of randomness for the platform. Two rules make a
// strategy lab trustworthy, and this type enforces both:
//   1. Reproducible — a run is fully determined by its seed(s), never Math.random.
//   2. Serializable — the generator's state is a plain number, so it can be
//      stored on a game state, snapshotted, and resumed (required for dice games
//      where randomness happens mid-game, and for replay).
//
// The algorithm is a 32-bit LCG (Numerical Recipes constants) — cheap, well
// understood, and good enough for game simulation (it is NOT cryptographic).

export interface RngState {
  /** The current 32-bit generator value. Resuming from this reproduces the stream exactly. */
  value: number;
}

export interface Rng {
  /** Next unsigned 32-bit integer in [0, 2^32). */
  next(): number;
  /** Next float in [0, 1). */
  float(): number;
  /** Integer in [0, maxExclusive). Throws if maxExclusive < 1. */
  int(maxExclusive: number): number;
  /** Uniformly pick one element. Throws on empty array. */
  pick<T>(items: readonly T[]): T;
  /** Return a new shuffled array (Fisher-Yates); does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[];
  /** Snapshot the resumable state (plain, JSON-safe). */
  state(): RngState;
  /** Derive an independent sub-stream (e.g. a per-seat stream). Advances this rng. */
  fork(label?: number): Rng;
}

function scramble(seed: number): number {
  // Spread small/sequential seeds across the 32-bit space so seed 1, 2, 3 give
  // well-separated streams.
  let v = seed >>> 0;
  v = (v ^ 0x9e3779b9) >>> 0;
  v = (Math.imul(v ^ (v >>> 16), 0x45d9f3b)) >>> 0;
  v = (Math.imul(v ^ (v >>> 16), 0x45d9f3b)) >>> 0;
  return (v ^ (v >>> 16)) >>> 0;
}

export function makeRng(init: number | RngState): Rng {
  let value = typeof init === "number" ? scramble(init) : init.value >>> 0;

  const rng: Rng = {
    next() {
      value = (Math.imul(1664525, value) + 1013904223) >>> 0;
      return value;
    },
    float() {
      return rng.next() / 0x100000000;
    },
    int(maxExclusive: number) {
      if (maxExclusive < 1) throw new Error(`int(maxExclusive) requires maxExclusive >= 1, got ${maxExclusive}`);
      return Math.floor(rng.float() * maxExclusive);
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error("pick() on empty array");
      return items[rng.int(items.length)];
    },
    shuffle<T>(items: readonly T[]): T[] {
      const result = [...items];
      for (let i = result.length - 1; i > 0; i -= 1) {
        const j = rng.int(i + 1);
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    },
    state() {
      return { value };
    },
    fork(label = 0) {
      const childSeed = (rng.next() ^ scramble(label)) >>> 0;
      return makeRng(childSeed);
    },
  };

  return rng;
}
