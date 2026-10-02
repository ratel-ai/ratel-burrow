import { describe, expect, it } from "vitest";
import { buildBoostSelections } from "../src/boost/selections";
import { buildBoostView } from "../src/boost/view";
import { isEvent, parseTraceLog } from "../src/events";
import { buildRankingState } from "../src/graph-state";
import { fixture } from "./helpers";

const events = () => parseTraceLog(fixture("v2-boost.jsonl")).events;

describe("trace fields for the Boost panel", () => {
  it("parses base_hits and usage_ranking_status", () => {
    const all = events();
    const search = all.find((e) => e.eventId === "B07");
    expect(search && isEvent(search, "search") && search.base_hits?.map((h) => h.tool_id)).toEqual([
      "email_send",
      "stripe_refund",
    ]);
    const status = all.find((e) => isEvent(e, "usage_ranking_status"));
    expect(status).toMatchObject({
      known: true,
      status: "active",
      graph_key: "kestral",
      learn: false,
      rev: 7,
    });
  });
});

describe("buildBoostSelections", () => {
  it("makes one selection per invoked turn, offline before ranking was active and online after", () => {
    const selections = buildBoostSelections(events());
    expect(
      selections.map((s) => [s.query, s.invokedToolId, s.arms.map((a) => `${a.arm}:${a.role}`)]),
    ).toEqual([
      ["refund the order", "stripe_refund", ["baseline:serving"]],
      ["track my parcel", "shipping_track", ["baseline:serving"]],
      ["refund order 42", "stripe_refund", ["adaptive:serving", "baseline:shadow"]],
      ["email the customer", "email_send", ["adaptive:serving", "baseline:shadow"]],
    ]);
  });

  it("uses base_hits as the baseline, and the served list when no intent changed it", () => {
    const [, , boosted, unchanged] = buildBoostSelections(events());
    expect(boosted?.arms.find((a) => a.arm === "baseline")?.resultIds).toEqual([
      "email_send",
      "stripe_refund",
    ]);
    expect(boosted?.arms.find((a) => a.arm === "adaptive")?.resultIds).toEqual([
      "stripe_refund",
      "email_send",
    ]);
    expect(unchanged?.arms.map((a) => a.resultIds)).toEqual([["email_send"], ["email_send"]]);
  });

  it("only counts a status for the requested graph", () => {
    const selections = buildBoostSelections(events(), { graphKey: "other" });
    // No active status for "other": online falls back to searches with a usage_boost.
    expect(selections.map((s) => s.arms.length)).toEqual([1, 1, 2, 2]);
  });

  it("feeds Cloud's boost view: online from the first served adaptive turn, lift on the boosted turn", () => {
    const view = buildBoostView(buildBoostSelections(events()), { reported: true });
    expect(view.online).toMatchObject({ source: "served", fromTurn: 3 });
    expect(view.turns.map((t) => t.phase)).toEqual(["offline", "offline", "online", "online"]);
    expect(view.phases["recall@1"].online).toMatchObject({
      reference: 0.5,
      adaptive: 1,
      compared: 2,
    });
    expect(view.verdict).toEqual({ better: 1, worse: 0, same: 1 });
  });
});

describe("buildRankingState", () => {
  it("reports the latest status, when it went live and when it first boosted", () => {
    expect(buildRankingState(events())).toMatchObject({
      status: "active",
      learn: false,
      graphKey: "kestral",
      rev: 7,
      liveSince: 1790000002000,
      boostingSince: 1790000003001,
    });
  });

  it("is unknown without status events but still sees boosts", () => {
    const noStatus = events().filter((e) => e.type !== "usage_ranking_status");
    expect(buildRankingState(noStatus)).toMatchObject({
      status: null,
      liveSince: null,
      boostingSince: 1790000003001,
    });
  });
});
