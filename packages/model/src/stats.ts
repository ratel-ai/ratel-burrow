/** Nearest-rank percentile (`q` in 0..1); `null` for no values. */
export function percentile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(Math.min(1, Math.max(0, q)) * sorted.length);
  return sorted[Math.max(0, rank - 1)] ?? null;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** A bucket width (ms) giving at most ~`target` buckets over `[start, end]`, on a friendly step. */
export function bucketWidth(start: number, end: number, target = 40): number {
  const steps = [
    60_000,
    5 * 60_000,
    15 * 60_000,
    3_600_000,
    6 * 3_600_000,
    86_400_000,
    7 * 86_400_000,
  ];
  const span = Math.max(1, end - start);
  return steps.find((s) => span / s <= target) ?? 30 * 86_400_000;
}
