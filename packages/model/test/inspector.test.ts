import { describe, expect, it } from "vitest";
import { parseTraceLog } from "../src/events";
import { buildInspector } from "../src/inspector";
import { v1Events, v2Events } from "./helpers";

describe("buildInspector", () => {
  it("groups searches by session, newest session first", () => {
    const sessions = buildInspector([...v1Events(), ...v2Events()]);
    expect(sessions.map((s) => s.sessionId)).toEqual(["s2", "s1"]);
    expect(sessions[0]?.sourceId).toBe("demo-agent");
  });

  it("links each call to the latest preceding search and records its rank", () => {
    const [s2] = buildInspector(v2Events());
    const refund = s2?.searches.find(
      (s) => s.query === "refund the last order" && s.kind === "tool",
    );
    expect(refund?.hits.map((h) => h.id)).toEqual(["send_email", "stripe_refund"]);
    expect(refund?.stages.map((st) => st.name)).toEqual(["bm25", "dense", "rrf"]);
    expect(refund?.boost).toMatchObject({ intent: "c1", promoted: 1 });
    expect(refund?.invocations.map((c) => [c.id, c.rank])).toEqual([["stripe_refund", 2]]);

    const email = s2?.searches.find((s) => s.query === "email the customer");
    expect(email?.boost).toMatchObject({ intent: null });
    expect(email?.invocations).toEqual([
      expect.objectContaining({ id: "crm_lookup", rank: null, error: "timeout" }),
    ]);
  });

  it("attaches usage boosts to skill searches too", () => {
    const events = parseTraceLog(
      [
        '{"v":2,"ts":10,"session_id":"s","type":"skill_search","query":"q","origin":"agent","top_k":1,"hits":[],"stages":[],"took_ms":1}',
        '{"v":2,"ts":10,"session_id":"s","type":"usage_boost","intent":"i","similarity":1,"support":2,"promoted":1,"dropped":0}',
      ].join("\n"),
    ).events;
    expect(buildInspector(events)[0]?.searches[0]?.boost).toMatchObject({ intent: "i" });
  });

  it("attaches a turn-less boost to the search written after it", () => {
    const events = parseTraceLog(
      [
        '{"v":2,"ts":100,"session_id":"s","type":"search","query":"q1","origin":"direct","top_k":1,"hits":[],"stages":[],"took_ms":1}',
        '{"v":2,"ts":102,"session_id":"s","type":"usage_boost","intent":"i2","similarity":1,"support":1,"promoted":1,"dropped":0}',
        '{"v":2,"ts":110,"session_id":"s","type":"search","query":"q2","origin":"direct","top_k":1,"hits":[],"stages":[],"took_ms":1}',
      ].join("\n"),
    ).events;
    const searches = buildInspector(events)[0]?.searches ?? [];
    expect(searches.map((s) => s.boost?.intent ?? null)).toEqual([null, "i2"]);
  });

  it("links skill loads to skill searches", () => {
    const [s2] = buildInspector(v2Events());
    const skill = s2?.searches.find((s) => s.kind === "skill");
    expect(skill?.invocations.map((c) => [c.id, c.rank])).toEqual([["refund_playbook", 1]]);
  });

  it("does not double-count gateway_search when core search events exist", () => {
    const [s1] = buildInspector(v1Events());
    expect(s1?.searches.map((s) => s.query)).toEqual(["list files in a folder", "delete a file"]);
    expect(s1?.searches[0]?.invocations.map((c) => [c.id, c.rank])).toEqual([
      ["filesystem__list_directory", 1],
      ["filesystem.list_directory", null],
    ]);
    expect(s1?.stats).toMatchObject({
      searches: 2,
      invocations: 2,
      errors: 1,
      notRetrieved: 1,
      emptySearches: 1,
    });
  });

  it("uses gateway_search when it is the only search record", () => {
    const events = v1Events().filter((e) => e.type !== "search");
    const [s1] = buildInspector(events);
    expect(s1?.searches[0]).toMatchObject({
      query: "list files in a folder",
      hitCount: 2,
      hits: [],
    });
  });

  it("puts calls before any search in `orphans`", () => {
    const events = v2Events().filter((e) => e.type !== "search" && e.type !== "skill_search");
    const [s2] = buildInspector(events);
    expect(s2?.orphans.map((c) => c.id)).toEqual([
      "stripe_refund",
      "refund_playbook",
      "crm_lookup",
    ]);
  });
});
