/** Ported from Ratel Cloud's `lib/quality/metrics.ts`. */

export interface ConfidenceInterval {
  low: number;
  high: number;
}

/**
 * Discounted-gain rank credit, `1 / log2(1 + rank)`. Absent scores 0.
 *
 * Plain nDCG. Used where a POSITION is being weighted rather than an outcome
 * scored, such as how much of the incumbent's ordering we reproduced; the
 * per-search Quality credit is {@link hitCredit}.
 */
export function rankCredit(rank: number): number {
  if (!Number.isFinite(rank) || rank < 1) return 0;
  return 1 / Math.log2(1 + rank);
}

/**
 * 95% Wilson score interval for a proportion.
 *
 * Shown next to containment on every surface, because the populations here are
 * small (a partner week is tens of searches, not thousands) and a bare "56%"
 * invites reading a ten-point swing as a result when it is noise. Wilson rather
 * than the normal approximation because it stays inside [0, 1] and behaves at
 * the extremes, where a small sample most often sits.
 */
export function wilsonInterval(
  successes: number,
  total: number,
  z = 1.96,
): ConfidenceInterval | null {
  if (total <= 0) return null;
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return {
    low: Math.max(0, (centre - margin) / denominator),
    high: Math.min(1, (centre + margin) / denominator),
  };
}
