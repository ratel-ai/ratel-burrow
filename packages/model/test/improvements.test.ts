import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../src/catalog";
import { buildImprovements } from "../src/improvements";
import type { LinkedInvocation, SearchRecord, SessionTimeline } from "../src/inspector";

let n = 0;
function call(id: string, rank: number | null, error: string | null = null): LinkedInvocation {
  return { kind: "tool", id, ts: n, sessionId: "s", tookMs: 1, error, rank };
}
function search(query: string, hits: string[], invocations: LinkedInvocation[] = []): SearchRecord {
  n += 1;
  return {
    key: `k${n}`,
    kind: "tool",
    ts: n,
    sessionId: "s",
    query,
    origin: "agent",
    topK: 5,
    hits: hits.map((id, i) => ({ id, score: 1 - i / 10 })),
    hitCount: hits.length,
    stages: [],
    tookMs: 1,
    invocations,
  } as SearchRecord;
}
function session(searches: SearchRecord[]): SessionTimeline {
  return { sessionId: "s", start: 0, end: n, searches, orphans: [] } as unknown as SessionTimeline;
}
function tool(id: string, retrieved: number, removed = false): CatalogEntry {
  return {
    kind: "tool",
    id,
    name: id,
    defined: true,
    description: "",
    searchableDescription: "",
    searchableOverridden: false,
    tags: [],
    inputSchema: null,
    outputSchema: null,
    removed,
    firstSeen: null,
    lastSeen: null,
    stats: { retrieved, invoked: 0, errors: 0, avgLatencyMs: null, p95LatencyMs: null },
  };
}
const catalog = (tools: CatalogEntry[]) => ({ tools, skills: [], facts: [], hasDefinitions: true });

describe("buildImprovements", () => {
  it("names tools the agent called but the search before did not return", () => {
    const sessions = [
      session([
        search("open a ticket", ["a", "b"], [call("create_task", null)]),
        search("new todo item", ["a"], [call("create_task", null)]),
        search("make a task", ["create_task"], [call("create_task", 1)]),
      ]),
    ];
    const [first] = buildImprovements({ catalog: catalog([]), sessions });
    expect(first).toMatchObject({
      kind: "missed",
      capability: "tool",
      id: "create_task",
      missed: 2,
      calls: 3,
    });
    expect(first?.kind === "missed" && first.examples.map((e) => e.query)).toEqual([
      "open a ticket",
      "new todo item",
    ]);
  });

  it("does not count calls after a count-only search as missed", () => {
    const gateway = (q: string) => ({ ...search(q, [], [call("g", null)]), hitCount: 4 });
    const sessions = [session([gateway("a"), gateway("b"), gateway("c")])];
    expect(buildImprovements({ catalog: catalog([]), sessions })).toEqual([]);
  });

  it("needs a pattern, not one miss", () => {
    const sessions = [session([search("q", ["a"], [call("x", null)])])];
    expect(buildImprovements({ catalog: catalog([]), sessions })).toEqual([]);
  });

  it("flags tools usually found below the top 3", () => {
    const sessions = [
      session([
        search("q1", ["a", "b", "c", "d"], [call("d", 4)]),
        search("q2", ["a", "b", "c", "e", "d"], [call("d", 5)]),
        search("q3", ["d"], [call("d", 1)]),
      ]),
    ];
    expect(buildImprovements({ catalog: catalog([]), sessions })).toEqual([
      expect.objectContaining({ kind: "buried", id: "d", low: 2, ranked: 3, medianRank: 4 }),
    ]);
  });

  it("counts searches that returned nothing", () => {
    const sessions = [session([search("zzz", []), search("yyy", []), search("ok", ["a"])])];
    expect(buildImprovements({ catalog: catalog([]), sessions })).toEqual([
      expect.objectContaining({ kind: "empty_searches", count: 2, searches: 3 }),
    ]);
  });

  it("reports tools that fail often", () => {
    const sessions = [
      session([
        search("q", ["f"], [call("f", 1, "boom"), call("f", 1, "boom again"), call("f", 1)]),
      ]),
    ];
    expect(buildImprovements({ catalog: catalog([]), sessions })).toEqual([
      expect.objectContaining({
        kind: "failing",
        id: "f",
        errors: 2,
        calls: 3,
        lastError: "boom again",
      }),
    ]);
  });

  it("lists registered tools no search ever returned, once searches exist", () => {
    const tools = [tool("used", 3), tool("dead", 0), tool("gone", 0, true)];
    const sessions = [session([search("q", ["used"])])];
    expect(buildImprovements({ catalog: catalog(tools), sessions })).toEqual([
      expect.objectContaining({
        kind: "never_retrieved",
        capability: "tool",
        ids: ["dead"],
        searches: 1,
      }),
    ]);
    expect(buildImprovements({ catalog: catalog(tools), sessions: [] })).toEqual([]);
  });

  it("orders by kind, then by how much each affects", () => {
    const sessions = [
      session([
        search("a1", ["z"], [call("a", null)]),
        search("a2", ["z"], [call("a", null)]),
        search("b1", ["z"], [call("b", null)]),
        search("b2", ["z"], [call("b", null)]),
        search("b3", ["z"], [call("b", null)]),
        search("e1", []),
        search("e2", []),
      ]),
    ];
    expect(buildImprovements({ catalog: catalog([]), sessions }).map((i) => i.kind)).toEqual([
      "missed",
      "missed",
      "empty_searches",
    ]);
    expect(buildImprovements({ catalog: catalog([]), sessions })[0]).toMatchObject({ id: "b" });
  });
});
