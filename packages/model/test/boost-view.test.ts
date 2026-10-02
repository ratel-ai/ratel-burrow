import assert from "node:assert/strict";
import { test } from "vitest";
import type { EvaluableSelection } from "../src/boost/ground-truth";
import {
  BOOST_METRICS,
  boostExperimentName,
  boostTurns,
  buildBoostView,
  metricValue,
} from "../src/boost/view";

function selection(
  over: Partial<EvaluableSelection> & {
    baseline?: string[];
    adaptive?: string[];
    invoked?: string | null;
  },
  index = 0,
): EvaluableSelection {
  const {
    baseline = ["a", "b", "c", "d", "e"],
    adaptive = ["a", "b", "c", "d", "e"],
    invoked = null,
    ...rest
  } = over;
  return {
    selectionId: `sel-${index}`,
    occurredAt: new Date(Date.UTC(2026, 8, 18, 0, 0, index)),
    query: null,
    arms: [
      { arm: "baseline", role: "serving", resultIds: baseline },
      { arm: "adaptive", role: "shadow", resultIds: adaptive },
    ],
    invokedToolId: invoked,
    invokedRank: null,
    ...rest,
  };
}

test("the experiment name is the prefix plus the graph key", () => {
  assert.equal(boostExperimentName("kestral-app"), "adaptive-ranking:kestral-app");
});

test("metricValue scores at the cutoff: absent and beyond k are zero", () => {
  assert.equal(metricValue("recall@1", 1), 1);
  assert.equal(metricValue("recall@1", 2), 0);
  assert.equal(metricValue("recall@3", 3), 1);
  assert.equal(metricValue("recall@3", 4), 0);
  assert.equal(metricValue("recall@5", 5), 1);
  assert.equal(metricValue("recall@5", 6), 0);
  assert.equal(metricValue("recall@5", null), 0);
  assert.equal(metricValue("ndcg@5", 1), 1);
  assert.ok(Math.abs(metricValue("ndcg@5", 2) - 1 / Math.log2(3)) < 1e-12);
  assert.equal(metricValue("ndcg@5", 6), 0);
  assert.equal(metricValue("mrr@5", 4), 0.25);
  assert.equal(metricValue("mrr@5", null), 0);
});

test("turns use the invoked tool when attributed, else the baseline's first result, and skip the rest", () => {
  const selections = [
    selection({ invoked: "c", baseline: ["a", "c"], adaptive: ["c", "a"] }, 0),
    selection({ invoked: null, baseline: ["b", "a"], adaptive: ["a", "b"] }, 1),
    selection({ invoked: null, baseline: [], adaptive: ["a"] }, 2),
    {
      ...selection({ invoked: "a" }, 3),
      arms: [{ arm: "baseline", role: "serving" as const, resultIds: ["a"] }],
    },
  ];
  const { turns, skipped } = boostTurns(selections);
  assert.equal(skipped, 2, "no target for an empty baseline; a missing adaptive arm");
  assert.deepEqual(
    turns.map((t) => [t.turn, t.tier, t.rank.reference, t.rank.adaptive]),
    [
      [1, "revealed", 2, 1],
      [2, "reference", 1, 2],
    ],
  );
});

test("series carry cumulative and trailing values per arm, and totals carry intervals for recall", () => {
  // Three turns: adaptive first every time; baseline first, second, absent.
  const selections = [
    selection({ invoked: "t", baseline: ["t", "x"], adaptive: ["t"] }, 0),
    selection({ invoked: "t", baseline: ["x", "t"], adaptive: ["t"] }, 1),
    selection({ invoked: "t", baseline: ["x", "y"], adaptive: ["t"] }, 2),
  ];
  const view = buildBoostView(selections, { window: 2 });
  assert.equal(view.empty, false);
  assert.equal(view.turns.length, 3);
  const recall1 = view.series["recall@1"];
  assert.deepEqual(
    recall1.map((p) => [p.turn, p.cumulative.reference, p.cumulative.adaptive]),
    [
      [1, 1, 1],
      [2, 0.5, 1],
      [3, 1 / 3, 1],
    ],
  );
  assert.deepEqual(
    recall1.map((p) => p.trailing.reference),
    [1, 0.5, 0],
    "trailing window of two turns",
  );
  const ndcg = view.series["ndcg@5"].at(-1);
  assert.ok(ndcg);
  assert.ok(Math.abs((ndcg.cumulative.reference ?? 0) - (1 + 1 / Math.log2(3) + 0) / 3) < 1e-12);
  assert.equal(ndcg.cumulative.adaptive, 1);
  assert.equal(view.totals["recall@1"].value.adaptive, 1);
  assert.ok(view.totals["recall@1"].interval.reference, "recall totals carry a Wilson interval");
  assert.equal(view.totals["ndcg@5"].interval.reference, null, "rank credit is not a share");
  assert.deepEqual(view.verdict, { better: 2, worse: 0, same: 1 });
  assert.equal(view.evidence.revealed, 3);
  assert.equal(view.evidence.reference, 0);
  assert.equal(view.evidence.servingArm, "baseline");
  assert.deepEqual(view.reference, { arm: "baseline", kind: "baseline", scored: true, k: 2 });
  assert.deepEqual(view.online, { since: null, fromTurn: null, source: null });
  assert.equal(view.evidence.bias.adaptive, "independent", "the shadow arm never served");
  assert.equal(Object.keys(view.series).length, BOOST_METRICS.length);
});

test("no scorable selections is an empty view that still reports what was skipped", () => {
  const view = buildBoostView([selection({ baseline: [], adaptive: [] }, 0)]);
  assert.equal(view.empty, true);
  assert.equal(view.evidence.skipped, 1);
  assert.deepEqual(view.series["ndcg@5"], []);
  assert.equal(view.totals["mrr@5"].value.reference, 0);
  assert.equal(buildBoostView([]).empty, true);
});

test("a legacy reference is scored on the invoked tool when reported, else its own graded list counts as the target", () => {
  const legacy = (
    index: number,
    legacyList: string[],
    adaptive: string[],
    invoked: string | null,
  ) => ({
    ...selection({ invoked }, index),
    arms: [
      { arm: "legacy", role: "serving" as const, resultIds: legacyList },
      { arm: "adaptive", role: "shadow" as const, resultIds: adaptive },
    ],
  });
  // Invocations shared: both arms measured on the invoked tool.
  const shared = buildBoostView([
    legacy(0, ["a", "b"], ["c", "a"], "c"),
    legacy(1, ["b", "a"], ["a", "b"], "a"),
  ]);
  assert.deepEqual(shared.reference, { arm: "legacy", kind: "legacy", scored: true, k: 2 });
  assert.deepEqual(
    shared.turns.map((t) => [t.tier, t.rank.reference, t.rank.adaptive]),
    [
      ["revealed", null, 1],
      ["revealed", 2, 1],
    ],
  );
  assert.deepEqual(shared.verdict, { better: 2, worse: 0, same: 0 });

  // No invocations: the legacy list, graded by rank, is the target and only adaptive is measured.
  const agreement = buildBoostView([
    legacy(0, ["a", "b"], ["a", "c"], null), // a first: full credit on recall@1 for a alone
    legacy(1, ["b", "a"], ["a", "b"], null), // b (gain 1) second, a (gain 0.63) first
    legacy(2, [], ["a"], null), // no legacy result: unscorable
  ]);
  assert.deepEqual(agreement.reference, { arm: "legacy", kind: "legacy", scored: false, k: 2 });
  assert.equal(agreement.evidence.skipped, 1);
  assert.equal(agreement.evidence.revealed, 0);
  assert.equal(agreement.evidence.reference, 2);
  const [first, second] = agreement.turns;
  assert.deepEqual(first?.targets, [
    { id: "a", gain: 1 },
    { id: "b", gain: 1 / Math.log2(3) },
  ]);
  assert.equal(
    first?.score["recall@1"].reference,
    null,
    "the reference is never measured against its own list",
  );
  assert.ok(
    Math.abs((first?.score["recall@1"].adaptive ?? 0) - 1 / (1 + 1 / Math.log2(3))) < 1e-12,
    "share of target gain found at rank 1",
  );
  assert.ok(
    Math.abs(
      (second?.score["recall@1"].adaptive ?? 0) - 1 / Math.log2(3) / (1 + 1 / Math.log2(3)),
    ) < 1e-12,
  );
  assert.equal(second?.score["recall@3"].adaptive, 1, "both legacy results are within the top 3");
  assert.equal(
    agreement.totals["recall@3"].turns,
    2,
    "totals cover the adaptive arm's turns when the reference is unmeasured",
  );
});

test("with no reference arm the adaptive list is scored alone on the invoked tool", () => {
  const alone = (index: number, adaptive: string[], invoked: string | null) => ({
    ...selection({ invoked }, index),
    arms: [{ arm: "adaptive", role: "serving" as const, resultIds: adaptive }],
  });
  const view = buildBoostView([
    alone(0, ["t", "x"], "t"),
    alone(1, ["x", "t"], "t"),
    alone(2, ["x"], null),
  ]);
  assert.deepEqual(view.reference, { arm: null, kind: "none", scored: false, k: null });
  assert.equal(
    view.evidence.skipped,
    1,
    "no invoked tool and no reference list: nothing to score against",
  );
  assert.equal(view.totals["recall@1"].value.adaptive, 0.5);
  assert.equal(view.totals["recall@1"].turns, 2);
  assert.deepEqual(view.verdict, { better: 0, worse: 0, same: 0 });
});

test("the online boundary is the first turn at or after the boost time, or null outside the run", () => {
  const selections = [0, 1, 2].map((i) => selection({ invoked: "a" }, i));
  const at = (second: number) => new Date(Date.UTC(2026, 8, 18, 0, 0, second));
  assert.deepEqual(buildBoostView(selections, { onlineSince: at(1) }).online, {
    since: at(1),
    fromTurn: 2,
    source: "boost",
  });
  assert.deepEqual(buildBoostView(selections, { onlineSince: at(0) }).online, {
    since: at(0),
    fromTurn: 1,
    source: "boost",
  });
  assert.deepEqual(buildBoostView(selections, { onlineSince: at(9) }).online, {
    since: at(9),
    fromTurn: null,
    source: "boost",
  });
  assert.deepEqual(buildBoostView(selections).online, {
    since: null,
    fromTurn: null,
    source: null,
  });
});

test("offline turns keep the reference alone and the adaptive curve starts at the boundary", () => {
  const at = (second: number) => new Date(Date.UTC(2026, 8, 18, 0, 0, second));
  const referenceOnly = (index: number, list: string[], invoked: string) => ({
    ...selection({ invoked }, index),
    arms: [{ arm: "baseline", role: "serving" as const, resultIds: list }],
  });
  const view = buildBoostView(
    [
      referenceOnly(0, ["x", "t"], "t"), // offline, rank 2
      referenceOnly(1, ["t"], "t"), // offline, rank 1
      selection({ invoked: "t", baseline: ["x", "y", "t"], adaptive: ["t"] }, 2), // online
      selection({ invoked: "t", baseline: ["t"], adaptive: ["x", "t"] }, 3), // online
    ],
    { onlineSince: at(2) },
  );
  assert.deepEqual(
    view.turns.map((t) => [t.phase, t.adaptiveRan, t.rank.reference, t.rank.adaptive]),
    [
      ["offline", false, 2, null],
      ["offline", false, 1, null],
      ["online", true, 3, 1],
      ["online", true, 1, 2],
    ],
  );
  assert.equal(view.online.fromTurn, 3);
  const r1 = view.series["recall@1"];
  assert.deepEqual(
    r1.map((p) => [p.cumulative.reference, p.cumulative.adaptive]),
    [
      [0, null],
      [0.5, null],
      [0, 1],
      [0.5, 0.5],
    ],
    "both running averages restart at the boundary, so the curves describe the same turns",
  );
  assert.deepEqual(view.phases["recall@1"], {
    offline: {
      turns: 2,
      reference: 0.5,
      adaptive: 0,
      compared: 0,
      verdict: { better: 0, worse: 0, same: 0 },
    },
    online: {
      turns: 2,
      reference: 0.5,
      adaptive: 0.5,
      compared: 2,
      verdict: { better: 1, worse: 1, same: 0 },
    },
  });
  assert.equal(
    view.totals["recall@1"].value.reference,
    0.5,
    "totals compare the arms over the online turns only",
  );
  assert.equal(view.totals["recall@1"].value.adaptive, 0.5);
  assert.deepEqual(view.verdict, { better: 1, worse: 1, same: 0 });
  assert.equal(view.evidence.skipped, 0);

  // Without a boundary a reference-only turn is unscorable, as before.
  assert.equal(buildBoostView([referenceOnly(0, ["t"], "t")]).evidence.skipped, 1);
});

test("when adaptive shadowed offline and then served, the boundary is its first served search and the averages run on", () => {
  const at = (second: number) => new Date(Date.UTC(2026, 8, 18, 0, 0, second));
  const shadowed = (index: number, baseline: string[], adaptive: string[]) =>
    selection({ invoked: "t", baseline, adaptive }, index);
  const served = (index: number, baseline: string[], adaptive: string[]) => ({
    ...selection({ invoked: "t" }, index),
    arms: [
      { arm: "adaptive", role: "serving" as const, resultIds: adaptive },
      { arm: "baseline", role: "shadow" as const, resultIds: baseline },
    ],
  });
  const view = buildBoostView(
    [
      shadowed(0, ["t"], ["x", "t"]), // offline: baseline 1, adaptive 2
      shadowed(1, ["x", "t"], ["t"]), // offline: baseline 2, adaptive 1
      served(2, ["x", "y"], ["t"]), // online: baseline miss, adaptive 1
      served(3, ["t"], ["t"]),
    ],
    // A boost time earlier than the switch must not win over the served record.
    { onlineSince: at(0) },
  );
  assert.deepEqual(view.online, { since: at(2), fromTurn: 3, source: "served" });
  assert.deepEqual(
    view.turns.map((t) => [t.phase, t.adaptiveRan]),
    [
      ["offline", true],
      ["offline", true],
      ["online", true],
      ["online", true],
    ],
  );
  const r1 = view.series["recall@1"];
  assert.deepEqual(
    r1.map((p) => [p.cumulative.reference, p.cumulative.adaptive]),
    [
      [1, 0],
      [0.5, 0.5],
      [1 / 3, 2 / 3],
      [0.5, 0.75],
    ],
    "no restart at the switch: both arms covered every turn",
  );
  assert.equal(view.evidence.bias.adaptive, "mixed");
  assert.equal(
    view.totals["recall@1"].value.adaptive,
    0.75,
    "totals cover every turn the adaptive arm ran",
  );
});
