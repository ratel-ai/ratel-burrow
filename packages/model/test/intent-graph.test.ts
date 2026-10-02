import { describe, expect, it } from "vitest";
import {
  buildClusterTableRows,
  buildForceGraphModel,
  buildSummaryTiles,
  edgeDamper,
  graphRows,
  modelLabel,
  neighborhoodOf,
  parseIntentGraph,
} from "../src/intent-graph";
import { fixture } from "./helpers";

const doc = () => {
  const parsed = parseIntentGraph(fixture("intent-graph.json"));
  if (!parsed.ok) throw new Error(parsed.details.join("; "));
  return parsed.graph;
};

describe("parseIntentGraph", () => {
  it("accepts a runtime-written graph", () => {
    expect(doc().rev).toBe(7);
  });

  it("rejects unknown versions and broken JSON with readable details", () => {
    expect(parseIntentGraph('{"v":2,"built_from_ts":1,"intents":[]}')).toMatchObject({
      ok: false,
      details: [expect.stringContaining("version")],
    });
    expect(parseIntentGraph("{")).toMatchObject({ ok: false });
  });
});

describe("intent graph view models", () => {
  it("flattens a document into cluster and edge rows", () => {
    const { clusters, edges } = graphRows(doc());
    expect(clusters.map((c) => [c.clusterId, c.memberCount, c.hasCentroid])).toEqual([
      ["c1", 2, true],
      ["c2", 1, false],
    ]);
    expect(edges.filter((e) => e.clusterId === "c1")).toHaveLength(3);
    expect(
      edges.find((e) => e.capabilityId === "send_email" && e.clusterId === "c1")?.surfaced,
    ).toBe(5);
  });

  it("builds summary tiles", () => {
    const { clusters, edges } = graphRows(doc());
    expect(buildSummaryTiles(clusters, edges)).toEqual({
      clusters: 2,
      totalSupport: 5,
      distinctTools: 2,
      distinctSkills: 1,
      membersTotal: 3,
      clustersWithFullSupport: 1,
      singletonClusters: 1,
      centroidCoverage: 0.5,
    });
  });

  it("builds table rows strongest first, flagging capabilities missing from the catalog", () => {
    const { clusters, edges } = graphRows(doc());
    const rows = buildClusterTableRows(clusters, edges, new Set(["tool:send_email"]));
    expect(rows[0]).toMatchObject({ clusterId: "c1", topTool: { id: "stripe_refund", weight: 4 } });
    const email = rows[0]?.edges.find((e) => e.id === "send_email");
    expect(email).toMatchObject({ missing: true, surfaced: 5, damper: edgeDamper(1, 5) });
  });

  it("builds a force model with co-usage links and intent spokes", () => {
    const { clusters, edges } = graphRows(doc());
    const model = buildForceGraphModel(clusters, edges);
    expect(model.nodes.map((n) => n.id).sort()).toEqual([
      "skill:refund_playbook",
      "tool:send_email",
      "tool:stripe_refund",
    ]);
    expect(model.intents).toHaveLength(2);
    expect(model.membershipLinks).toHaveLength(4);
    const shared = model.links.find(
      (l) => l.source === "tool:send_email" && l.target === "tool:stripe_refund",
    );
    expect(shared?.shared).toBe(1);
    expect(neighborhoodOf(model, "tool:stripe_refund").has("tool:send_email")).toBe(true);
  });

  it("labels models by their repo", () => {
    expect(modelLabel(doc().model ?? null)).toBe("BAAI/bge-small-en-v1.5");
    expect(modelLabel(null)).toBe("lexical");
  });
});
