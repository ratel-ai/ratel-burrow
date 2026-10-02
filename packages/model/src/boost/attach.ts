import { type EventOf, isEvent, type TraceEvent } from "../events.js";

/** A boost is never attached to a search further than this from it in time. */
export const BOOST_WINDOW_MS = 1_000;

type RankedSearch = EventOf<"search"> | EventOf<"skill_search">;

/**
 * Which tool or skill search each `usage_boost` belongs to.
 *
 * With a turn id, the boost goes to the nearest search of that turn. Without
 * one (Ratel 0.13.0-rc.10 writes none on boosts), it goes to the next search
 * in the session after it in the log, since the core writes the boost just
 * before its search; failing that, to the last search before it. Only searches
 * within {@link BOOST_WINDOW_MS} of the boost count.
 */
export function attachBoosts(
  events: readonly TraceEvent[],
): Map<RankedSearch, EventOf<"usage_boost">> {
  const out = new Map<RankedSearch, EventOf<"usage_boost">>();
  const searches: { index: number; event: RankedSearch }[] = [];
  events.forEach((e, index) => {
    if (isEvent(e, "search") || isEvent(e, "skill_search")) searches.push({ index, event: e });
  });

  events.forEach((e, index) => {
    if (!isEvent(e, "usage_boost")) return;
    const near = searches.filter(
      (s) =>
        s.event.sessionId === e.sessionId &&
        Math.abs(s.event.ts - e.ts) <= BOOST_WINDOW_MS &&
        !out.has(s.event),
    );
    let pick: RankedSearch | undefined;
    if (e.turnId) {
      pick = near
        .filter((s) => s.event.turnId === e.turnId)
        .sort((a, b) => Math.abs(a.event.ts - e.ts) - Math.abs(b.event.ts - e.ts))[0]?.event;
    } else {
      pick =
        near.find((s) => s.index > index)?.event ??
        near.filter((s) => s.index < index).at(-1)?.event;
    }
    if (pick) out.set(pick, e);
  });
  return out;
}
