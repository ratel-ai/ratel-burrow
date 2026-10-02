import { describe, expect, it } from "vitest";
import { boostTurnKey, parseBoostReplay } from "../src/boost/replay";
import { buildBoostFromTrace, buildBoostSelections } from "../src/boost/selections";
import { parseTraceLog, type TraceEvent } from "../src/events";
import { fixture } from "./helpers";

const boostEvents = () => parseTraceLog(fixture("v2-boost.jsonl")).events;

/** A replay as a launcher would serve it: every tool search ranked plain and boosted. */
function replayFor(events: readonly TraceEvent[], lists: Record<string, [string[], string[]]>) {
  return {
    v: 1 as const,
    method: "bm25",
    k: 5,
    turns: events
      .filter((e) => e.type === "search")
      .map((e) => {
        const query = (e as { query: string }).query;
        const [plain, boosted] = lists[query] ?? [[], []];
        return {
          key: boostTurnKey(e),
          plain_ids: plain,
          boosted_ids: boosted,
          matched: false,
          reported: false,
        };
      }),
  };
}

describe("boostTurnKey", () => {
  it("is the event id, or session|ts|query for v1 lines", () => {
    const [v2] = boostEvents();
    expect(boostTurnKey(v2 as TraceEvent)).toBe("B01");
    const [v1] = parseTraceLog(
      '{"v":1,"ts":5,"session_id":"s","type":"search","query":"q","origin":"agent","top_k":1,"hits":[],"stages":[],"took_ms":1}',
    ).events;
    expect(boostTurnKey(v1 as TraceEvent)).toBe("s|5|q");
  });
});

describe("parseBoostReplay", () => {
  it("accepts a launcher's replay and rejects anything else", () => {
    expect(parseBoostReplay('{"v":1,"method":"bm25","k":5,"turns":[]}')).toMatchObject({
      ok: true,
    });
    expect(parseBoostReplay('{"error":"no definitions"}')).toMatchObject({
      ok: false,
      error: "no definitions",
    });
    expect(parseBoostReplay("nope")).toMatchObject({ ok: false });
  });
});

describe("selections with a replay (Cloud's fold)", () => {
  const lists: Record<string, [string[], string[]]> = {
    "refund the order": [
      ["email_send", "stripe_refund"],
      ["stripe_refund", "email_send"],
    ],
    "track my parcel": [["shipping_track"], ["shipping_track"]],
    "refund order 42": [["x"], ["y"]],
    "email the customer": [["email_send"], ["email_send"]],
  };

  it("gives offline turns both arms, the baseline serving and adaptive in shadow", () => {
    const events = boostEvents();
    const [first] = buildBoostSelections(events, { replay: replayFor(events, lists) });
    expect(first?.arms).toEqual([
      { arm: "baseline", role: "serving", resultIds: ["email_send", "stripe_refund"] },
      { arm: "adaptive", role: "shadow", resultIds: ["stripe_refund", "email_send"] },
    ]);
  });

  it("prefers the runtime's own report (base_hits) over the replay", () => {
    const events = boostEvents();
    const third = buildBoostSelections(events, { replay: replayFor(events, lists) })[2];
    expect(third?.arms).toEqual([
      { arm: "baseline", role: "shadow", resultIds: ["email_send", "stripe_refund"] },
      { arm: "adaptive", role: "serving", resultIds: ["stripe_refund", "email_send"] },
    ]);
  });

  it("keeps both running averages going through the switch, as Cloud's chart does", () => {
    const events = boostEvents();
    const view = buildBoostFromTrace(events, { replay: replayFor(events, lists) });
    expect(view).toMatchObject({ estimated: true, reported: true });
    expect(view.turns.every((t) => t.adaptiveRan)).toBe(true);
    const r1 = view.series["recall@1"].map((p) => p.cumulative.reference);
    // Offline turn 1: baseline missed (rank 2), turn 2 hit → 0, 0.5; no reset at turn 3.
    expect(r1).toEqual([0, 0.5, 1 / 3, 0.5]);
  });

  it("falls back to adaptive-only without a replay or base_hits", () => {
    const events = boostEvents().filter((e) => e.type !== "usage_ranking_status");
    const stripped = events.map((e) => (e.type === "search" ? { ...e, base_hits: undefined } : e));
    expect(buildBoostFromTrace(stripped).reference.arm).toBeNull();
  });
});
