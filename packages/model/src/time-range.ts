/**
 * The time range every page reads. Windows end at the latest event rather than
 * now, so a trace from yesterday still shows its last 24 hours.
 */

export const RANGES = ["24h", "7d", "30d", "all"] as const;
export type TimeRange = (typeof RANGES)[number];

export interface TimeWindow {
  /** Exclusive lower bound. */
  from: number;
  /** Inclusive upper bound. */
  to: number;
}

const HOUR_MS = 3_600_000;
const SPAN_MS: Record<Exclude<TimeRange, "all">, number> = {
  "24h": 24 * HOUR_MS,
  "7d": 7 * 24 * HOUR_MS,
  "30d": 30 * 24 * HOUR_MS,
};

export function isRange(value: unknown): value is TimeRange {
  return typeof value === "string" && (RANGES as readonly string[]).includes(value);
}

export function windowFor(range: TimeRange, latestTs: number): TimeWindow {
  if (range === "all") return { from: Number.NEGATIVE_INFINITY, to: latestTs };
  return { from: latestTs - SPAN_MS[range], to: latestTs };
}

/** The window of the same length just before, for trends; none for "all". */
export function previousWindow(range: TimeRange, latestTs: number): TimeWindow | null {
  if (range === "all") return null;
  const span = SPAN_MS[range];
  return { from: latestTs - 2 * span, to: latestTs - span };
}

export function inWindow<T extends { ts: number }>(events: readonly T[], w: TimeWindow): T[] {
  return events.filter((e) => e.ts > w.from && e.ts <= w.to);
}
