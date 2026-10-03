/**
 * Agent health, ported from Ratel Cloud's trace-signals (the runtime lane): the
 * band of four tiles and the six turn shapes, read from the SDK's trace events.
 */
import type { TraceEvent } from "../events.js";
import {
  dailyBuckets,
  dayOf,
  type HealthTile,
  shapesFor,
  type TurnShapeView,
  tilesFor,
  totalOver,
  windowDays,
} from "./tiles.js";
import { buildTurns } from "./turns.js";

export * from "./same-ask.js";
export * from "./shape-story.js";
export * from "./tiles.js";
export * from "./turn-facts.js";
export * from "./turns.js";

/** Turns needed before the band shows figures (Cloud waits for a floor too). */
export const HEALTH_FLOOR = 20;

export interface AgentHealth {
  /** Turns in the window. */
  turns: number;
  windowDays: number;
  tiles: HealthTile[];
  shapes: TurnShapeView[];
}

/** The band and shapes over the `days` days ending on the latest day with a turn. */
export function buildAgentHealth(
  events: readonly TraceEvent[],
  options: { days?: number; floor?: number } = {},
): AgentHealth {
  const days = options.days ?? 7;
  const turns = buildTurns(events);
  const buckets = dailyBuckets(turns);
  const lastDay = buckets.at(-1)?.day ?? dayOf(Date.now());
  const total = totalOver(buckets, windowDays(lastDay, days));
  return {
    turns: total.turns,
    windowDays: days,
    tiles: tilesFor(buckets, { lastDay, days, floor: options.floor ?? HEALTH_FLOOR }),
    shapes: shapesFor(total),
  };
}
