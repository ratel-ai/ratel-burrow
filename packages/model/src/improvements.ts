/**
 * "What to improve": patterns in the trace that point at a concrete fix, most
 * actionable first. Each needs a pattern (at least two occurrences), not a
 * single miss.
 */
import type { Catalog } from "./catalog.js";
import type { SearchRecord, SessionTimeline } from "./inspector.js";

export type Capability = "tool" | "skill";

export interface ImprovementExample {
  query: string;
  sessionId: string;
  searchKey: string;
}

export type Improvement =
  /** Called after a search that did not return it: the searchable text misses how the agent asks. */
  | {
      kind: "missed";
      capability: Capability;
      id: string;
      missed: number;
      calls: number;
      examples: ImprovementExample[];
    }
  /** Usually found, but below the top 3. */
  | {
      kind: "buried";
      capability: Capability;
      id: string;
      low: number;
      ranked: number;
      medianRank: number;
      examples: ImprovementExample[];
    }
  /** Searches that returned nothing at all. */
  | {
      kind: "empty_searches";
      count: number;
      searches: number;
      examples: ImprovementExample[];
    }
  /** Calls that fail often. Not a ranking problem, but the agent pays for it. */
  | {
      kind: "failing";
      capability: Capability;
      id: string;
      errors: number;
      calls: number;
      lastError: string;
    }
  /** Registered, but no search returned them: dead weight, or text nobody's queries match. */
  | { kind: "never_retrieved"; capability: Capability; ids: string[]; searches: number };

const MIN_PATTERN = 2;
/** Ranks deeper than this count as "low". */
const LOW_RANK_AFTER = 3;
const MAX_EXAMPLES = 3;
const ORDER: Improvement["kind"][] = [
  "missed",
  "buried",
  "empty_searches",
  "failing",
  "never_retrieved",
];

interface Tally {
  capability: Capability;
  id: string;
  calls: number;
  missed: ImprovementExample[];
  ranks: number[];
  low: ImprovementExample[];
  errors: number;
  lastError: string;
}

const example = (s: SearchRecord): ImprovementExample => ({
  query: s.query,
  sessionId: s.sessionId,
  searchKey: s.key,
});

export function buildImprovements(input: {
  catalog: Catalog;
  sessions: readonly SessionTimeline[];
}): Improvement[] {
  const tallies = new Map<string, Tally>();
  const searchesByKind = { tool: 0, skill: 0 };
  let searchCount = 0;
  const empty: ImprovementExample[] = [];

  for (const session of input.sessions) {
    for (const s of session.searches) {
      searchCount += 1;
      if (s.kind === "tool" || s.kind === "skill") searchesByKind[s.kind] += 1;
      if (s.hitCount === 0) empty.push(example(s));
      for (const inv of s.invocations) {
        const key = `${inv.kind}:${inv.id}`;
        let t = tallies.get(key);
        if (!t) {
          t = {
            capability: inv.kind,
            id: inv.id,
            calls: 0,
            missed: [],
            ranks: [],
            low: [],
            errors: 0,
            lastError: "",
          };
          tallies.set(key, t);
        }
        t.calls += 1;
        if (inv.rank === null) t.missed.push(example(s));
        else {
          t.ranks.push(inv.rank);
          if (inv.rank > LOW_RANK_AFTER) t.low.push(example(s));
        }
        if (inv.error !== null) {
          t.errors += 1;
          t.lastError = inv.error;
        }
      }
    }
  }

  const out: Improvement[] = [];
  for (const t of tallies.values()) {
    if (t.missed.length >= MIN_PATTERN) {
      out.push({
        kind: "missed",
        capability: t.capability,
        id: t.id,
        missed: t.missed.length,
        calls: t.calls,
        examples: t.missed.slice(0, MAX_EXAMPLES),
      });
    }
    if (t.low.length >= MIN_PATTERN && t.low.length * 2 >= t.ranks.length) {
      out.push({
        kind: "buried",
        capability: t.capability,
        id: t.id,
        low: t.low.length,
        ranked: t.ranks.length,
        medianRank: median(t.ranks),
        examples: t.low.slice(0, MAX_EXAMPLES),
      });
    }
    if (t.errors >= MIN_PATTERN) {
      out.push({
        kind: "failing",
        capability: t.capability,
        id: t.id,
        errors: t.errors,
        calls: t.calls,
        lastError: t.lastError,
      });
    }
  }
  if (empty.length >= MIN_PATTERN) {
    out.push({
      kind: "empty_searches",
      count: empty.length,
      searches: searchCount,
      examples: empty.slice(0, MAX_EXAMPLES),
    });
  }
  for (const capability of ["tool", "skill"] as const) {
    const searches = searchesByKind[capability];
    if (searches === 0) continue;
    const entries = capability === "tool" ? input.catalog.tools : input.catalog.skills;
    const ids = entries
      .filter((e) => e.defined && !e.removed && e.stats.retrieved === 0)
      .map((e) => e.id);
    if (ids.length > 0) out.push({ kind: "never_retrieved", capability, ids, searches });
  }

  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || impact(b) - impact(a));
}

/** How many calls, searches or entries the finding affects. */
export function impact(i: Improvement): number {
  switch (i.kind) {
    case "missed":
      return i.missed;
    case "buried":
      return i.low;
    case "empty_searches":
      return i.count;
    case "failing":
      return i.errors;
    case "never_retrieved":
      return i.ids.length;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}
