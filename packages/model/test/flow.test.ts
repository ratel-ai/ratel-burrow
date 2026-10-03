import { describe, expect, it } from "vitest";
import { buildBoostStats } from "../src/adaptive";
import { buildBoostFromTrace } from "../src/boost/selections";
import { buildCatalog } from "../src/catalog";
import { buildRatelFlow } from "../src/flow";
import { buildInspector } from "../src/inspector";
import { parseIntentGraph } from "../src/intent-graph";
import { estimateSavings } from "../src/savings";
import { fixture, v2Events } from "./helpers";

function flowFor(events = v2Events(), withGraph = true) {
  const catalog = buildCatalog(events);
  const parsed = parseIntentGraph(fixture("intent-graph.json"));
  return buildRatelFlow({
    catalog,
    sessions: buildInspector(events),
    savings: estimateSavings(events, catalog),
    boost: buildBoostFromTrace(events),
    boostStats: buildBoostStats(events),
    graph: withGraph && parsed.ok ? parsed.graph : null,
  });
}

describe("buildRatelFlow", () => {
  it("counts what is registered", () => {
    expect(flowFor().catalog).toEqual({ tools: 2, skills: 1, facts: 1, defined: true });
  });

  it("summarizes searches and how much of the catalog they returned", () => {
    expect(flowFor().search).toMatchObject({ searches: 2, avgReturned: 1.5, catalogSize: 2 });
  });

  it("measures where the called tool sat in the search before it", () => {
    expect(flowFor().call).toEqual({
      calls: 2,
      ranked: 2,
      topHit: 0,
      inResults: 1,
      notRetrieved: 1,
      failed: 1,
    });
  });

  it("reads the learned graph, or says there is none", () => {
    expect(flowFor().learn).toEqual({ intents: 2, observations: 5, seededShare: 0.2 });
    expect(flowFor(v2Events(), false).learn).toBeNull();
  });

  it("reports whether the graph is ranking and what it changed", () => {
    expect(flowFor().boost).toMatchObject({ active: true, matchRate: 0.5 });
  });
});
