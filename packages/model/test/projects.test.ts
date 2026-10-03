import { describe, expect, it } from "vitest";
import { parseTraceLog } from "../src/events";
import { DEFAULT_PROJECT, listProjects, projectOf, scopeToProject } from "../src/projects";
import { v1Events, v2Events } from "./helpers";

const mixed = () =>
  parseTraceLog(
    [
      '{"v":2,"ts":1,"session_id":"a","source_id":"billing-agent","type":"search","query":"q","origin":"agent","top_k":1,"hits":[],"stages":[],"took_ms":1}',
      '{"v":2,"ts":2,"session_id":"b","source_id":"support-agent","type":"search","query":"q","origin":"agent","top_k":1,"hits":[],"stages":[],"took_ms":1}',
      '{"v":2,"ts":3,"session_id":"b","source_id":"support-agent","type":"invoke_start","tool_id":"x","args_size_bytes":1}',
      '{"v":1,"ts":4,"session_id":"c","type":"search","query":"q","origin":"agent","top_k":1,"hits":[],"stages":[],"took_ms":1}',
    ].join("\n"),
  ).events;

describe("projects", () => {
  it("is the runtime's source_id, or the default project for lines without one", () => {
    const [billing, , , legacy] = mixed();
    expect(billing && projectOf(billing)).toBe("billing-agent");
    expect(legacy && projectOf(legacy)).toBe(DEFAULT_PROJECT);
  });

  it("lists projects by activity, with their event counts and last activity", () => {
    expect(listProjects(mixed())).toEqual([
      { id: "support-agent", events: 2, lastTs: 3 },
      { id: "billing-agent", events: 1, lastTs: 1 },
      { id: DEFAULT_PROJECT, events: 1, lastTs: 4 },
    ]);
  });

  it("scopes events to one project", () => {
    expect(scopeToProject(mixed(), "support-agent").map((e) => e.ts)).toEqual([2, 3]);
    expect(scopeToProject(mixed(), null)).toHaveLength(4);
  });

  it("finds the fixtures' projects", () => {
    expect(listProjects(v2Events()).map((p) => p.id)).toEqual(["demo-agent"]);
    expect(listProjects(v1Events()).map((p) => p.id)).toEqual([DEFAULT_PROJECT]);
  });
});
