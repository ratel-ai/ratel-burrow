/** Per-turn readings, ported from Ratel Cloud's `signals/turn-facts.ts` (keep in sync). */
import { type Step, searchedAgainForSame, turnDetour } from "./same-ask.js";

export type TurnShapeKind = "direct" | "detour" | "dead_end" | "retry" | "blind" | "repeat";
export const TURN_SHAPE_KINDS: readonly TurnShapeKind[] = [
  "direct",
  "detour",
  "dead_end",
  "retry",
  "blind",
  "repeat",
];

/** A hit scoring below this share of the leader is "junk" in a list (Cloud's `CONFIDENT_SCORE_RATIO`). */
export const CONFIDENT_SCORE_RATIO = 0.9;
/** A call followed by a search for the same thing within this long did not deliver. */
export const NO_FOLLOW_WITHIN_MS = 30_000;

export function isInvoke(step: Step): boolean {
  return step.kind === "invoke" && step.targetId !== null && step.targetType !== null;
}

export function isListingSearch(step: Step): boolean {
  return (
    step.kind === "search" && (step.searchType === "search" || step.searchType === "skill_search")
  );
}

export interface TurnWaste {
  repeats: number;
  retries: number;
  noFollow: number;
}

/** The wasted calls of one turn: repeats, retries, and calls followed by a search for the same thing. */
export function turnWaste(turn: { steps: readonly Step[] }, withinMs: number): TurnWaste {
  const last = new Map<string, Step>();
  let repeats = 0;
  let retries = 0;
  let noFollow = 0;
  turn.steps.forEach((step, index) => {
    if (!isInvoke(step)) return;
    const key = `${step.targetType}:${step.targetId}`;
    const previous = last.get(key);
    if (previous?.outcome === "error") retries += 1;
    else if (previous) repeats += 1;
    last.set(key, step);
    if (searchedAgainForSame(turn.steps, index, withinMs)) noFollow += 1;
  });
  return { repeats, retries, noFollow };
}

/**
 * The one shape a closed turn takes, or null when it ran nothing and is not
 * known to be over. First match wins: retry, repeat, dead end, blind, detour,
 * direct.
 */
export function classifyTurnShape(turn: {
  steps: readonly Step[];
  abandoned: boolean;
}): TurnShapeKind | null {
  const invokes = turn.steps.filter(isInvoke);
  const searches = turn.steps.filter((step) => step.kind === "search");
  if (invokes.length === 0) return turn.abandoned ? "dead_end" : null;
  const waste = turnWaste(turn, 0);
  if (waste.retries > 0) return "retry";
  if (waste.repeats > 0) return "repeat";
  if (searches.length === 0) return "blind";
  if (turnDetour(turn.steps)) return "detour";
  return "direct";
}

/** A listing search's junk estimate: hits scoring below 90% of the leader. */
export function junkOfSearch(step: Step): { scored: number; junk: number } | null {
  const scores = step.hitScores;
  if (!isListingSearch(step) || !scores || scores.length === 0) return null;
  const top = Math.max(...scores);
  if (!Number.isFinite(top) || top <= 0) return null;
  return {
    scored: scores.length,
    junk: scores.filter((s) => s < top * CONFIDENT_SCORE_RATIO).length,
  };
}
