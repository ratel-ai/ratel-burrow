import { describe, expect, it } from "vitest";
import type { LinkedInvocation, SearchRecord, SessionTimeline } from "../src/inspector";
import {
  callOutcomes,
  firstResultRate,
  inResultsRate,
  outcomesByCapability,
  summarizeOutcomes,
} from "../src/search-outcomes";

let n = 0;
function call(
  id: string,
  rank: number | null,
  error: string | null = null,
  kind: "tool" | "skill" = "tool",
): LinkedInvocation {
  return { kind, id, ts: n, sessionId: "s", tookMs: 1, error, rank };
}
function search(
  hits: string[],
  invocations: LinkedInvocation[],
  patch: Partial<SearchRecord> = {},
): SearchRecord {
  n += 1;
  return {
    key: `k${n}`,
    kind: "tool",
    ts: n,
    sessionId: "s",
    query: `q${n}`,
    origin: "agent",
    topK: 5,
    hits: hits.map((id, i) => ({ id, score: 1 - i / 10 })),
    hitCount: hits.length,
    stages: [],
    tookMs: 1,
    invocations,
    ...patch,
  } as SearchRecord;
}
const session = (searches: SearchRecord[]) =>
  ({ sessionId: "s", start: 0, end: n, searches, orphans: [] }) as unknown as SessionTimeline;

describe("callOutcomes", () => {
  const sessions = [
    session([
      search(["a", "b", "c", "d"], [call("a", 1)]),
      search(["a", "b", "c"], [call("c", 3, "boom")]),
      search(["a", "b", "c", "d", "e"], [call("e", 5)]),
      search(["a"], [call("x", null)]),
      // Gateway-only: a hit count but no ids, so the rank is unknowable.
      search([], [call("g", null)], { hitCount: 4 }),
      search(["p"], [call("p", 1, null, "skill")], { kind: "skill" }),
      // Fact searches never lead to calls that count.
      search(["f"], [], { kind: "fact" }),
    ]),
  ];

  it("classifies each call by where its search ranked it", () => {
    expect(callOutcomes(sessions).map((o) => [o.id, o.outcome, o.failed])).toEqual([
      ["a", "first", false],
      ["c", "top3", true],
      ["e", "lower", false],
      ["x", "missed", false],
      ["g", "unknown", false],
      ["p", "first", false],
    ]);
  });

  it("keeps the search for each call, for linking", () => {
    const [first] = callOutcomes(sessions);
    expect(first).toMatchObject({ kind: "tool", rank: 1, sessionId: "s" });
    expect(first?.searchKey).toMatch(/^k\d+$/);
  });

  it("summarizes with one denominator: calls whose rank is knowable", () => {
    const summary = summarizeOutcomes(callOutcomes(sessions));
    expect(summary).toEqual({
      calls: 6,
      ranked: 5,
      first: 2,
      top3: 1,
      lower: 1,
      missed: 1,
      failed: 1,
    });
    expect(firstResultRate(summary)).toBeCloseTo(0.4);
    expect(inResultsRate(summary)).toBeCloseTo(0.8);
  });

  it("returns null rates when nothing is ranked", () => {
    const empty = summarizeOutcomes([]);
    expect(firstResultRate(empty)).toBeNull();
    expect(inResultsRate(empty)).toBeNull();
  });

  it("tallies per capability", () => {
    const repeated = [
      session([
        search(["a"], [call("t", null)]),
        search(["t"], [call("t", 1)]),
        search(["a", "b", "c", "t"], [call("t", 4)]),
      ]),
    ];
    expect(outcomesByCapability(callOutcomes(repeated)).get("tool:t")).toEqual({
      calls: 3,
      ranked: 3,
      first: 1,
      top3: 0,
      lower: 1,
      missed: 1,
      failed: 0,
      ranks: [1, 4],
    });
  });
});
