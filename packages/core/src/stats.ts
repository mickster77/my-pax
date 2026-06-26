// Small statistics helpers for tournament reporting. Kept dependency-free.

/**
 * Wilson score 95% confidence interval for a binomial proportion (wins / n).
 * Better than the naive normal approximation at small n and near 0/1, which is
 * exactly the regime a strategy lab lives in. Returns [low, high] clamped to [0,1].
 */
export function wilson95(wins: number, n: number): [number, number] {
  if (n <= 0) return [0, 0];
  const z = 1.959963985; // 97.5th percentile of the standard normal
  const z2 = z * z;
  const p = wins / n;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
