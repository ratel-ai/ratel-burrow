import { describe, expect, it } from "vitest";
import { buildCatalog } from "../src/catalog";
import { parseTraceLog } from "../src/events";
import { v1Events, v2Events } from "./helpers";

describe("buildCatalog", () => {
  it("builds full entries from catalog_definition events", () => {
    const catalog = buildCatalog(v2Events());
    expect(catalog.hasDefinitions).toBe(true);
    expect(catalog.tools.map((t) => t.id)).toEqual(["send_email", "stripe_refund"]);
    expect(catalog.skills.map((s) => s.id)).toEqual(["refund_playbook"]);
    expect(catalog.facts.map((f) => f.id)).toEqual(["tz"]);
    const refund = catalog.tools.find((t) => t.id === "stripe_refund");
    expect(refund).toMatchObject({
      defined: true,
      description: "Refund a Stripe charge",
      searchableDescription: "Refund a Stripe charge charge_id",
      searchableOverridden: false,
      inputSchema: { type: "object" },
    });
    expect(refund?.stats).toMatchObject({ retrieved: 1, invoked: 1, errors: 0, avgLatencyMs: 200 });
    expect(catalog.tools.find((t) => t.id === "send_email")?.searchableOverridden).toBe(true);
    expect(catalog.facts[0]?.stats).toMatchObject({ invoked: 1 });
  });

  it("falls back to ids seen in churn and hits when definitions are missing", () => {
    const catalog = buildCatalog(v1Events());
    expect(catalog.hasDefinitions).toBe(false);
    expect(catalog.tools.map((t) => [t.id, t.defined, t.server])).toEqual([
      ["filesystem__list_directory", false, "filesystem"],
      ["filesystem__read_file", false, "filesystem"],
    ]);
    expect(catalog.tools[0]?.stats).toMatchObject({ retrieved: 1, invoked: 1 });
  });

  it("marks removed entries and keeps the latest definition", () => {
    const log = parseTraceLog(
      [
        '{"v":2,"ts":1,"session_id":"s","type":"catalog_definition","kind":"tool","id":"a","name":"a","description":"old","tags":[],"input_schema":null,"output_schema":null,"searchable_description":"old","searchable_description_overridden":false,"content_hash":"1"}',
        '{"v":2,"ts":2,"session_id":"s","type":"catalog_definition","kind":"tool","id":"a","name":"a","description":"new","tags":[],"input_schema":null,"output_schema":null,"searchable_description":"new","searchable_description_overridden":false,"content_hash":"2"}',
        '{"v":2,"ts":3,"session_id":"s","type":"index_churn","kind":"remove","tool_id":"a"}',
      ].join("\n"),
    );
    const [a] = buildCatalog(log.events).tools;
    expect(a).toMatchObject({ description: "new", removed: true, lastSeen: 3 });
  });

  it("merges a catalog snapshot file (camelCase or snake_case)", () => {
    const catalog = buildCatalog([], {
      source_id: "x",
      tools: [{ id: "t", name: "t", description: "d", inputSchema: { type: "object" } }],
      skills: [{ id: "k", name: "k", description: "sk", tags: ["x"] }],
    });
    expect(catalog.hasDefinitions).toBe(true);
    expect(catalog.tools[0]).toMatchObject({
      id: "t",
      defined: true,
      inputSchema: { type: "object" },
    });
    expect(catalog.skills[0]).toMatchObject({ id: "k", tags: ["x"] });
  });
});
