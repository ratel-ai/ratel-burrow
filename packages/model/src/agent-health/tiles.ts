/**
 * The health band and the turn shapes, ported from Ratel Cloud's
 * `signals/project-metrics.ts` and `tiles.ts` (keep in sync): UTC daily
 * buckets of counts, four tiles over a window with a Wilson interval, a 7-day
 * series and the change on the previous window, and the six shapes.
 */
import { wilsonInterval } from "../boost/metrics.js";
import { turnDetour, turnFirstTry } from "./same-ask.js";
import {
  classifyTurnShape,
  junkOfSearch,
  NO_FOLLOW_WITHIN_MS,
  TURN_SHAPE_KINDS,
  type TurnShapeKind,
  turnWaste,
} from "./turn-facts.js";
import type { Turn } from "./turns.js";

export type HealthTileKey = "first_try" | "detours" | "junk" | "wasted_calls";
export type TileUnit = "share" | "per_100_turns";
export interface Interval {
  low: number;
  high: number;
}
export interface TilePoint {
  day: string;
  value: number | null;
}
export interface HealthTile {
  key: HealthTileKey;
  label: string;
  unit: TileUnit;
  upIsGood: boolean;
  value: number | null;
  interval: Interval | null;
  sub: string;
  delta: number | null;
  series: TilePoint[];
  /** What the figure counts (turns, hits or wasted calls), over `n`. */
  count: number;
  n: number;
}
export interface TurnShapeView {
  shape: TurnShapeKind;
  label: string;
  description: string;
  count: number;
  share: number;
}

type ShapeCounts = Record<TurnShapeKind, number>;
export interface DayBucket {
  day: string;
  turns: number;
  firstTry: number;
  firstTryN: number;
  detours: number;
  detourN: number;
  junk: number;
  scored: number;
  wasted: number;
  shaped: number;
  shapes: ShapeCounts;
}

const DAY_MS = 86_400_000;
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function emptyShapes(): ShapeCounts {
  return { direct: 0, detour: 0, dead_end: 0, retry: 0, blind: 0, repeat: 0 };
}
export function emptyBucket(day: string): DayBucket {
  return {
    day,
    turns: 0,
    firstTry: 0,
    firstTryN: 0,
    detours: 0,
    detourN: 0,
    junk: 0,
    scored: 0,
    wasted: 0,
    shaped: 0,
    shapes: emptyShapes(),
  };
}

/** One turn's contribution to its day. */
export function turnBucket(turn: Turn): DayBucket {
  const searches = turn.steps.filter((s) => s.kind === "search");
  const waste = turnWaste(turn, NO_FOLLOW_WITHIN_MS);
  const firstTry = turnFirstTry(turn.steps);
  const shape = classifyTurnShape(turn);
  const junk = searches.map(junkOfSearch).filter((j) => j !== null);
  return {
    day: dayOf(turn.endedAt),
    turns: 1,
    firstTry: firstTry === true ? 1 : 0,
    firstTryN: firstTry === null ? 0 : 1,
    detours: searches.length > 0 && turnDetour(turn.steps) ? 1 : 0,
    detourN: searches.length > 0 ? 1 : 0,
    junk: junk.reduce((n, j) => n + j.junk, 0),
    scored: junk.reduce((n, j) => n + j.scored, 0),
    wasted: waste.repeats + waste.retries + waste.noFollow,
    shaped: shape === null ? 0 : 1,
    shapes: shape === null ? emptyShapes() : { ...emptyShapes(), [shape]: 1 },
  };
}

export function addBuckets(left: DayBucket, right: DayBucket): DayBucket {
  const shapes = Object.fromEntries(
    TURN_SHAPE_KINDS.map((k) => [k, left.shapes[k] + right.shapes[k]]),
  ) as ShapeCounts;
  return {
    day: left.day,
    turns: left.turns + right.turns,
    firstTry: left.firstTry + right.firstTry,
    firstTryN: left.firstTryN + right.firstTryN,
    detours: left.detours + right.detours,
    detourN: left.detourN + right.detourN,
    junk: left.junk + right.junk,
    scored: left.scored + right.scored,
    wasted: left.wasted + right.wasted,
    shaped: left.shaped + right.shaped,
    shapes,
  };
}

export function dailyBuckets(turns: readonly Turn[]): DayBucket[] {
  const days = new Map<string, DayBucket>();
  for (const turn of turns) {
    const b = turnBucket(turn);
    const existing = days.get(b.day);
    days.set(b.day, existing ? addBuckets(existing, b) : b);
  }
  return [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** The `days` UTC days ending on `lastDay`, oldest first. */
export function windowDays(lastDay: string, days: number): string[] {
  const end = Date.parse(`${lastDay}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => dayOf(end - (days - 1 - i) * DAY_MS));
}

export function totalOver(buckets: readonly DayBucket[], days: readonly string[]): DayBucket {
  const wanted = new Set(days);
  return buckets
    .filter((b) => wanted.has(b.day))
    .reduce((sum, b) => addBuckets(sum, b), emptyBucket(days[0] ?? ""));
}

/** A Poisson count as a rate per 100 turns, with a score interval that stays above zero. */
export function rateInterval(count: number, turns: number): Interval | null {
  if (turns <= 0) return null;
  const z = 1.96;
  const centre = count + (z * z) / 2;
  const margin = z * Math.sqrt(count + (z * z) / 4);
  return {
    low: (Math.max(0, centre - margin) / turns) * 100,
    high: ((centre + margin) / turns) * 100,
  };
}

const fmt = (n: number) => n.toLocaleString("en-US");

interface TileReading {
  value: number | null;
  interval: Interval | null;
  count: number;
  n: number;
  sub: string;
}

export function readTile(key: HealthTileKey, t: DayBucket): TileReading {
  switch (key) {
    case "first_try":
      return {
        value: t.firstTryN > 0 ? t.firstTry / t.firstTryN : null,
        interval: wilsonInterval(t.firstTry, t.firstTryN),
        count: t.firstTry,
        n: t.firstTryN,
        sub: `${fmt(t.firstTry)} of ${fmt(t.firstTryN)} turns found each tool on the first search for it.`,
      };
    case "detours":
      return {
        value: t.detourN > 0 ? t.detours / t.detourN : null,
        interval: wilsonInterval(t.detours, t.detourN),
        count: t.detours,
        n: t.detourN,
        sub: `${fmt(t.detours)} of ${fmt(t.detourN)} turns that searched had to search again for the same thing.`,
      };
    case "junk":
      return {
        value: t.scored > 0 ? t.junk / t.scored : null,
        interval: wilsonInterval(t.junk, t.scored),
        count: t.junk,
        n: t.scored,
        sub: `${fmt(t.junk)} of ${fmt(t.scored)} listed hits scored well below the top hit.`,
      };
    case "wasted_calls":
      return {
        value: t.turns > 0 ? (t.wasted / t.turns) * 100 : null,
        interval: rateInterval(t.wasted, t.turns),
        count: t.wasted,
        n: t.turns,
        sub: `${fmt(t.wasted)} repeats, retries and calls followed by a search for the same thing.`,
      };
  }
}

export const TILE_META: ReadonlyArray<{
  key: HealthTileKey;
  label: string;
  unit: TileUnit;
  upIsGood: boolean;
}> = [
  { key: "first_try", label: "First try", unit: "share", upIsGood: true },
  { key: "detours", label: "Detours", unit: "share", upIsGood: false },
  { key: "junk", label: "Junk in lists", unit: "share", upIsGood: false },
  { key: "wasted_calls", label: "Wasted calls", unit: "per_100_turns", upIsGood: false },
];

/** The four tiles over the window ending `lastDay`: figure, interval, 7-day series, delta. */
export function tilesFor(
  buckets: readonly DayBucket[],
  window: { lastDay: string; days: number; floor: number },
): HealthTile[] {
  const current = windowDays(window.lastDay, window.days);
  const previousLast = dayOf(Date.parse(`${current[0]}T00:00:00Z`) - DAY_MS);
  const previous = windowDays(previousLast, window.days);
  const total = totalOver(buckets, current);
  const prevTotal = totalOver(buckets, previous);
  const byDay = new Map(buckets.map((b) => [b.day, b]));
  const ready = total.turns >= window.floor;
  return TILE_META.map((meta) => {
    const reading = readTile(meta.key, total);
    const prev = prevTotal.turns > 0 ? readTile(meta.key, prevTotal).value : null;
    const series: TilePoint[] = windowDays(window.lastDay, 7).map((day) => {
      const bucket = byDay.get(day);
      return { day, value: bucket ? readTile(meta.key, bucket).value : null };
    });
    return {
      ...meta,
      value: ready ? reading.value : null,
      interval: ready ? reading.interval : null,
      sub: ready ? reading.sub : "Waiting for enough turns.",
      delta: ready && reading.value !== null && prev !== null ? reading.value - prev : null,
      series,
      count: reading.count,
      n: reading.n,
    };
  });
}

const SHAPE_COPY: Record<TurnShapeKind, { label: string; description: string }> = {
  direct: { label: "Direct", description: "Searched once, then ran a tool." },
  detour: { label: "Detour", description: "Searched again for the same thing." },
  dead_end: { label: "Dead end", description: "Searched and ran nothing." },
  retry: { label: "Retry", description: "Ran a tool, it failed, ran it again." },
  blind: { label: "Blind", description: "Ran a tool without searching." },
  repeat: { label: "Repeat", description: "Ran the same tool again in one turn." },
};

export function shapesFor(total: DayBucket): TurnShapeView[] {
  return TURN_SHAPE_KINDS.map((shape) => ({
    shape,
    ...SHAPE_COPY[shape],
    count: total.shapes[shape],
    share: total.shaped === 0 ? 0 : total.shapes[shape] / total.shaped,
  })).sort((a, b) => b.count - a.count);
}

/* - Figures (Cloud's tiles.ts) ------------------------------------------------ */

export const TILE_PLACEHOLDER = "–";
const EPSILON = 1e-9;

/** A share as a whole percent; a tiny non-zero share reads "<1%", almost all ">99%". */
export function formatSharePercent(share: number): string {
  if (share > 0 && share < 0.005) return "<1%";
  if (share < 1 && share > 0.995) return ">99%";
  return `${Math.round(share * 100)}%`;
}

const formatRate = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const formatValue = (v: number, unit: TileUnit) =>
  unit === "share" ? formatSharePercent(v) : formatRate(v);

export function tileFigure(tile: Pick<HealthTile, "value" | "unit">): {
  value: string;
  unit: string | null;
  ready: boolean;
} {
  const unit = tile.unit === "share" ? null : "per 100 turns";
  if (tile.value === null) return { value: TILE_PLACEHOLDER, unit, ready: false };
  return { value: formatValue(tile.value, tile.unit), unit, ready: true };
}

export function tileIntervalText(
  tile: Pick<HealthTile, "value" | "interval" | "unit">,
): string | null {
  if (tile.value === null || !tile.interval) return null;
  const scale = tile.unit === "share" ? 100 : 10;
  const low = Math.max(0, Math.floor(tile.interval.low * scale + EPSILON) / scale);
  const highRaw = Math.ceil(tile.interval.high * scale - EPSILON) / scale;
  const high = tile.unit === "share" ? Math.min(1, highRaw) : highRaw;
  if (tile.unit === "share") {
    const l = Math.round(low * 100);
    const h = Math.round(high * 100);
    return l === h ? `${l}%` : `${l} to ${h}%`;
  }
  return low === high ? formatRate(low) : `${formatRate(low)} to ${formatRate(high)}`;
}

export interface TileDelta {
  direction: "up" | "down" | "flat";
  tone: "good" | "bad" | "neutral";
  text: string;
  description: string;
}

export function tileDelta(
  tile: Pick<HealthTile, "value" | "delta" | "unit" | "upIsGood">,
): TileDelta | null {
  if (tile.value === null || tile.delta === null || !Number.isFinite(tile.delta)) return null;
  const share = tile.unit === "share";
  const rounded = share ? Math.round(tile.delta * 100) : Math.round(tile.delta * 10) / 10;
  const magnitude = share ? `${Math.abs(rounded)}` : Math.abs(rounded).toFixed(1);
  const suffix = share ? " pts" : "";
  if (rounded === 0) {
    return {
      direction: "flat",
      tone: "neutral",
      text: `0${suffix}`,
      description: "No change on the previous window",
    };
  }
  const direction = rounded > 0 ? "up" : "down";
  const good = (direction === "up") === tile.upIsGood;
  return {
    direction,
    tone: good ? "good" : "bad",
    text: `${rounded > 0 ? "+" : "−"}${magnitude}${suffix}`,
    description: `${direction === "up" ? "Up" : "Down"} ${magnitude}${suffix} on the previous window, ${good ? "better" : "worse"}`,
  };
}

/** The sparkline's vertical range: the data's own, widened to a minimum span and centred. */
export function sparkDomain(
  series: readonly TilePoint[],
  unit: TileUnit,
): { min: number; max: number } | null {
  const values = series.flatMap((p) => (p.value === null ? [] : [p.value]));
  if (values.length === 0) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(high - low, unit === "share" ? 0.1 : 2) * 1.25;
  const min = Math.max(0, (low + high) / 2 - span / 2);
  return { min, max: min + span };
}

export function formatTurnCount(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "turn" : "turns"}`;
}
