/**
 * Retry or next step, ported from Ratel Cloud's `lib/trace-signals/same-ask.ts`
 * (keep in sync). Two searches ask for the same thing when they carry the same
 * query, or when their top-10 hit ids overlap by at least half (Jaccard), the
 * bar Cloud chose on the Kestral replay. Every "searched again" reading on the
 * Agent health screen goes through these helpers.
 */

export type StepKind = "search" | "invoke";

/** One step of a turn: a search, or a call of a tool or skill. */
export interface Step {
  kind: StepKind;
  /** Position in the turn, from 0. */
  ordinal: number;
  occurredAt: number;
  endOccurredAt: number;
  /** `search` lists tools, `skill_search` skills. Null for a call. */
  searchType: "search" | "skill_search" | null;
  /** Cloud keeps a salted hash of the query; Burrow has the text, normalised. */
  queryHash: string | null;
  hitIds: string[] | null;
  hitScores: number[] | null;
  targetType: "tool" | "skill" | null;
  targetId: string | null;
  outcome: "ok" | "error" | null;
  /** The ordinal of the search that offered the called entry, or null. */
  offeredByOrdinal: number | null;
}

export const SAME_ASK_TOP_HITS = 10;
export const SAME_ASK_MIN_JACCARD = 0.5;

/** Jaccard of the two searches' top-10 hit ids; null when either lists nothing. */
export function hitOverlap(a: Pick<Step, "hitIds">, b: Pick<Step, "hitIds">): number | null {
  const left = new Set((a.hitIds ?? []).slice(0, SAME_ASK_TOP_HITS));
  const right = new Set((b.hitIds ?? []).slice(0, SAME_ASK_TOP_HITS));
  if (left.size === 0 || right.size === 0) return null;
  let shared = 0;
  for (const id of left) if (right.has(id)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Whether two searches ask for the same thing: same query, or mostly the same hits. */
export function sameAsk(
  a: Pick<Step, "kind" | "queryHash" | "hitIds">,
  b: Pick<Step, "kind" | "queryHash" | "hitIds">,
  threshold: number = SAME_ASK_MIN_JACCARD,
): boolean {
  if (a.kind !== "search" || b.kind !== "search") return false;
  if (a.queryHash !== null && a.queryHash === b.queryHash) return true;
  const overlap = hitOverlap(a, b);
  return overlap !== null && overlap >= threshold;
}

/** The search step with this ordinal, if the turn has one. */
export function searchAt(steps: readonly Step[], ordinal: number | null): Step | undefined {
  if (ordinal === null) return undefined;
  const step = steps.find((s) => s.ordinal === ordinal);
  return step?.kind === "search" ? step : undefined;
}

/** The last search before `step` in the turn. */
export function searchBefore(
  steps: readonly Step[],
  step: Pick<Step, "ordinal">,
): Step | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    const candidate = steps[i];
    if (candidate?.kind === "search" && candidate.ordinal < step.ordinal) return candidate;
  }
  return undefined;
}

/** Whether `search` repeats the ask of the search right before it. */
export function isRetrySearch(
  steps: readonly Step[],
  search: Step,
  threshold: number = SAME_ASK_MIN_JACCARD,
): boolean {
  const previous = searchBefore(steps, search);
  return previous !== undefined && sameAsk(previous, search, threshold);
}

/**
 * Whether the ok call at `index` was followed at once (the next step, within
 * `withinMs`) by a search for the same thing as the search that led to it.
 */
export function searchedAgainForSame(
  steps: readonly Step[],
  index: number,
  withinMs: number,
  threshold: number = SAME_ASK_MIN_JACCARD,
): boolean {
  const step = steps[index];
  const next = steps[index + 1];
  if (!step || !next || step.kind !== "invoke" || step.targetId === null || step.outcome !== "ok") {
    return false;
  }
  if (next.kind !== "search") return false;
  if (next.occurredAt - step.endOccurredAt > withinMs) return false;
  const led = searchAt(steps, step.offeredByOrdinal);
  return led !== undefined && sameAsk(led, next, threshold);
}

function firstCalls(steps: readonly Step[]): Step[] {
  const seen = new Set<string>();
  return steps.filter((s) => {
    if (s.kind !== "invoke" || s.targetId === null) return false;
    const key = `${s.targetType}:${s.targetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * First try: every tool the turn ran was offered by the most recent search
 * before its first call, and that search was not a retry of the one before.
 * Null when the turn has no search or no call.
 */
export function turnFirstTry(
  steps: readonly Step[],
  threshold: number = SAME_ASK_MIN_JACCARD,
): boolean | null {
  const calls = firstCalls(steps);
  if (calls.length === 0 || !steps.some((s) => s.kind === "search")) return null;
  return calls.every((call) => {
    const recent = searchBefore(steps, call);
    return (
      recent !== undefined &&
      call.offeredByOrdinal === recent.ordinal &&
      !isRetrySearch(steps, recent, threshold)
    );
  });
}

/** Detour: the turn searched again for the same thing at least once. */
export function turnDetour(
  steps: readonly Step[],
  threshold: number = SAME_ASK_MIN_JACCARD,
): boolean {
  return steps.some((s) => s.kind === "search" && isRetrySearch(steps, s, threshold));
}
