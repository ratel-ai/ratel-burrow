import { describe, expect, it } from "vitest";
import {
  buildAgentHealth,
  buildTurns,
  classifyTurnShape,
  formatSharePercent,
  type Step,
  sameAsk,
  shapeStory,
  tileDelta,
  tileFigure,
  turnFirstTry,
} from "../src/agent-health";
import { parseTraceLog } from "../src/events";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1, 12);

function search(ordinal: number, query: string, hits: string[], at = T0 + ordinal * 1000): Step {
  return {
    kind: "search",
    ordinal,
    occurredAt: at,
    endOccurredAt: at,
    searchType: "search",
    queryHash: query,
    hitIds: hits,
    hitScores: hits.map((_, i) => 1 - i * 0.05),
    targetType: null,
    targetId: null,
    outcome: null,
    offeredByOrdinal: null,
  };
}
function invoke(
  ordinal: number,
  tool: string,
  offeredBy: number | null,
  outcome: "ok" | "error" = "ok",
): Step {
  const at = T0 + ordinal * 1000;
  return {
    kind: "invoke",
    ordinal,
    occurredAt: at,
    endOccurredAt: at + 100,
    searchType: null,
    queryHash: null,
    hitIds: null,
    hitScores: null,
    targetType: "tool",
    targetId: tool,
    outcome,
    offeredByOrdinal: offeredBy,
  };
}

describe("same ask (Cloud's same-ask.ts)", () => {
  it("matches the same query or mostly the same hits", () => {
    expect(sameAsk(search(0, "a", ["x"]), search(1, "a", ["y"]))).toBe(true);
    expect(sameAsk(search(0, "a", ["x", "y"]), search(1, "b", ["x", "y", "z"]))).toBe(true);
    expect(sameAsk(search(0, "a", ["x"]), search(1, "b", ["y"]))).toBe(false);
  });
});

describe("turn shapes (Cloud's classifyTurnShape)", () => {
  const shape = (steps: Step[], abandoned = false) => classifyTurnShape({ steps, abandoned });
  it("classifies each shape by precedence", () => {
    expect(shape([search(0, "a", ["t"]), invoke(1, "t", 0)])).toBe("direct");
    expect(shape([search(0, "a", ["x"]), search(1, "a", ["t"]), invoke(2, "t", 1)])).toBe("detour");
    expect(shape([search(0, "a", ["x"])], true)).toBe("dead_end");
    expect(shape([search(0, "a", ["t"]), invoke(1, "t", 0, "error"), invoke(2, "t", 0)])).toBe(
      "retry",
    );
    expect(shape([invoke(0, "t", null)])).toBe("blind");
    expect(shape([search(0, "a", ["t"]), invoke(1, "t", 0), invoke(2, "t", 0)])).toBe("repeat");
  });

  it("first try: each tool came from the latest search, which was not a retry", () => {
    expect(turnFirstTry([search(0, "a", ["t"]), invoke(1, "t", 0)])).toBe(true);
    expect(turnFirstTry([search(0, "a", ["x"]), search(1, "a", ["t"]), invoke(2, "t", 1)])).toBe(
      false,
    );
    expect(turnFirstTry([invoke(0, "t", null)])).toBeNull();
  });
});

describe("turns from the trace", () => {
  const log = () =>
    parseTraceLog(
      [
        `{"v":2,"ts":${T0},"session_id":"s","turn_id":"t1","type":"search","query":"refund","origin":"agent","top_k":3,"hits":[{"tool_id":"email","score":2},{"tool_id":"refund","score":1.9}],"stages":[],"took_ms":1}`,
        `{"v":2,"ts":${T0 + 10},"session_id":"s","turn_id":"t1","invocation_id":"i1","type":"invoke_start","tool_id":"refund","args_size_bytes":1}`,
        `{"v":2,"ts":${T0 + 50},"session_id":"s","turn_id":"t1","invocation_id":"i1","type":"invoke_end","tool_id":"refund","took_ms":40}`,
        `{"v":2,"ts":${T0 + 1000},"session_id":"s","turn_id":"t2","type":"search","query":"track","origin":"agent","top_k":3,"hits":[{"tool_id":"ship","score":1}],"stages":[],"took_ms":1}`,
      ].join("\n"),
    ).events;

  it("groups steps by session and turn id and links each call to the search that offered it", () => {
    const turns = buildTurns(log());
    expect(turns.map((t) => [t.key, t.steps.map((s) => s.kind), t.abandoned])).toEqual([
      ["s:t1", ["search", "invoke"], false],
      ["s:t2", ["search"], true],
    ]);
    expect(turns[0]?.steps[1]).toMatchObject({
      targetId: "refund",
      offeredByOrdinal: 0,
      outcome: "ok",
    });
  });

  it("builds the band and the shapes", () => {
    const health = buildAgentHealth(log(), { floor: 1 });
    expect(health.turns).toBe(2);
    expect(health.tiles.map((t) => [t.key, t.value])).toEqual([
      ["first_try", 1],
      ["detours", 0],
      ["junk", 0],
      ["wasted_calls", 0],
    ]);
    expect(health.shapes.find((s) => s.shape === "direct")?.count).toBe(1);
    expect(health.shapes.find((s) => s.shape === "dead_end")?.count).toBe(1);
  });

  it("waits for enough turns before showing figures", () => {
    expect(buildAgentHealth(log()).tiles[0]?.value).toBeNull();
  });
});

describe("figures (Cloud's tiles.ts)", () => {
  it("formats shares, rates and deltas the way the band prints them", () => {
    expect(formatSharePercent(0.642)).toBe("64%");
    expect(formatSharePercent(0.001)).toBe("<1%");
    expect(formatSharePercent(0.999)).toBe(">99%");
    expect(tileFigure({ value: 9.44, unit: "per_100_turns" })).toEqual({
      value: "9.4",
      unit: "per 100 turns",
      ready: true,
    });
    expect(tileDelta({ value: 0.6, delta: -0.03, unit: "share", upIsGood: true })).toMatchObject({
      direction: "down",
      tone: "bad",
      text: "−3 pts",
    });
  });

  it("draws every shape on the shared lattice", () => {
    expect(shapeStory("direct").length).toBeGreaterThan(0);
    expect(
      shapeStory("retry")
        .filter((b) => b.part === "mark")
        .map((b) => b.mark),
    ).toContain("error");
  });
});

describe("window", () => {
  it("reads the last 7 days and compares them to the 7 before", () => {
    const old = `{"v":2,"ts":${T0 - 8 * DAY},"session_id":"o","turn_id":"x","type":"search","query":"q","origin":"agent","top_k":1,"hits":[{"tool_id":"a","score":1}],"stages":[],"took_ms":1}`;
    const oldCall = `{"v":2,"ts":${T0 - 8 * DAY + 10},"session_id":"o","turn_id":"x","type":"invoke_start","tool_id":"zzz","args_size_bytes":1}`;
    const now = `{"v":2,"ts":${T0},"session_id":"n","turn_id":"y","type":"search","query":"q","origin":"agent","top_k":1,"hits":[{"tool_id":"a","score":1}],"stages":[],"took_ms":1}`;
    const nowCall = `{"v":2,"ts":${T0 + 10},"session_id":"n","turn_id":"y","type":"invoke_start","tool_id":"a","args_size_bytes":1}`;
    const ends = [
      `{"v":2,"ts":${T0 - 8 * DAY + 20},"session_id":"o","turn_id":"x","type":"invoke_end","tool_id":"zzz","took_ms":10}`,
      `{"v":2,"ts":${T0 + 20},"session_id":"n","turn_id":"y","type":"invoke_end","tool_id":"a","took_ms":10}`,
    ];
    const health = buildAgentHealth(
      parseTraceLog([old, oldCall, now, nowCall, ...ends].join("\n")).events,
      { floor: 1 },
    );
    const firstTry = health.tiles.find((t) => t.key === "first_try");
    expect(firstTry).toMatchObject({ value: 1, delta: 1 });
    expect(firstTry?.series).toHaveLength(7);
  });
});
