import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isEvent, parseTraceLine, parseTraceLog } from "../src/events";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("parseTraceLine", () => {
  it("parses a v1 search envelope", () => {
    const e = parseTraceLine(
      '{"v":1,"ts":5,"session_id":"s","type":"search","query":"q","origin":"agent","top_k":2,"hits":[{"tool_id":"a","score":1}],"stages":[],"took_ms":1}',
    );
    expect(e).toMatchObject({ v: 1, ts: 5, sessionId: "s", type: "search", query: "q" });
    expect(e && isEvent(e, "search") && e.hits[0]?.tool_id).toBe("a");
  });

  it("lifts v2 envelope fields", () => {
    const e = parseTraceLine(
      '{"v":2,"event_id":"E","ts":1,"session_id":"s","source_id":"src","invocation_id":"i","turn_id":"t","type":"invoke_end","tool_id":"x","took_ms":3}',
    );
    expect(e).toMatchObject({
      eventId: "E",
      sourceId: "src",
      invocationId: "i",
      turnId: "t",
      type: "invoke_end",
    });
  });

  it("keeps unknown event types as raw, not errors", () => {
    const e = parseTraceLine(
      '{"v":2,"ts":1,"session_id":"s","type":"experiment_dispatch","arm":"a"}',
    );
    expect(e).toMatchObject({ type: "experiment_dispatch", known: false });
    expect(e?.raw).toMatchObject({ arm: "a" });
  });

  it("returns null for blank, non-JSON, or envelope-less lines", () => {
    expect(parseTraceLine("")).toBeNull();
    expect(parseTraceLine("nope")).toBeNull();
    expect(parseTraceLine('{"type":"search"}')).toBeNull();
    expect(parseTraceLine("[1,2]")).toBeNull();
  });
});

describe("parseTraceLog", () => {
  it("parses a whole v1 log, counting bad lines without failing", () => {
    const log = parseTraceLog(fixture("v1-legacy.jsonl"));
    expect(log.events).toHaveLength(11);
    expect(log.badLines).toBe(1);
    expect(log.events.every((e) => e.known)).toBe(true);
  });

  it("parses a v2 log and sorts by timestamp", () => {
    const shuffled = fixture("v2-sdk.jsonl").split("\n").reverse().join("\n");
    const log = parseTraceLog(shuffled);
    const ts = log.events.map((e) => e.ts);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    expect(log.events.filter((e) => !e.known).map((e) => e.type)).toEqual(["experiment_dispatch"]);
  });

  it("merges several logs into one ordered stream", () => {
    const log = parseTraceLog([fixture("v2-sdk.jsonl"), fixture("v1-legacy.jsonl")]);
    expect(log.events[0]?.sessionId).toBe("s1");
    expect(log.events.at(-1)?.sessionId).toBe("s2");
  });
});
