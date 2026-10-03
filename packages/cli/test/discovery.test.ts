import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { discoverSources } from "../src/discovery";

let root: string;
let cwd: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "burrow-disc-"));
  cwd = join(root, "work", "app");
  mkdirSync(cwd, { recursive: true });
});

describe("discoverSources", () => {
  it("reads ./.ratel/burrow by default", () => {
    const burrow = join(cwd, ".ratel", "burrow");
    mkdirSync(join(burrow, "traces"), { recursive: true });
    writeFileSync(join(burrow, "traces", "s.jsonl"), "{}\n");
    writeFileSync(join(burrow, "traces", "notes.txt"), "");
    writeFileSync(join(burrow, "intent-graph.json"), "{}");
    writeFileSync(join(burrow, "catalog-snapshot.json"), "{}");

    const sources = discoverSources({ cwd });
    expect(sources.map((s) => [s.kind, s.label])).toEqual([
      ["trace", ".ratel/burrow/traces/s.jsonl"],
      ["intent_graph", ".ratel/burrow/intent-graph.json"],
      ["catalog_snapshot", ".ratel/burrow/catalog-snapshot.json"],
    ]);
    expect(new Set(sources.map((s) => s.id)).size).toBe(3);
    expect(sources[0]).toMatchObject({ size: 3 });
  });

  it("finds one intent graph per project under intent-graphs/", () => {
    const graphs = join(cwd, ".ratel", "burrow", "intent-graphs");
    mkdirSync(graphs, { recursive: true });
    writeFileSync(join(graphs, "billing-agent.json"), "{}");
    writeFileSync(join(graphs, "support-agent.json"), "{}");
    writeFileSync(join(graphs, "notes.txt"), "");
    expect(discoverSources({ cwd }).map((s) => [s.kind, s.label])).toEqual([
      ["intent_graph", ".ratel/burrow/intent-graphs/billing-agent.json"],
      ["intent_graph", ".ratel/burrow/intent-graphs/support-agent.json"],
    ]);
  });

  it("replaces the default with explicit paths", () => {
    mkdirSync(join(cwd, ".ratel", "burrow", "traces"), { recursive: true });
    writeFileSync(join(cwd, ".ratel", "burrow", "traces", "ignored.jsonl"), "");
    const traceDir = join(root, "t");
    mkdirSync(traceDir);
    writeFileSync(join(traceDir, "one.jsonl"), "");
    writeFileSync(join(traceDir, "notes.txt"), "");
    const graph = join(root, "g.json");
    writeFileSync(graph, "{}");
    const sources = discoverSources({ cwd, traces: [traceDir], intentGraphs: [graph] });
    expect(sources.map((s) => [s.kind, s.path])).toEqual([
      ["trace", join(traceDir, "one.jsonl")],
      ["intent_graph", graph],
    ]);
  });

  it("reads other Burrow dirs with --dir", () => {
    const other = join(root, "other");
    mkdirSync(join(other, "traces"), { recursive: true });
    writeFileSync(join(other, "traces", "a.jsonl"), "");
    expect(discoverSources({ cwd, dirs: [other] }).map((s) => s.path)).toEqual([
      join(other, "traces", "a.jsonl"),
    ]);
  });

  it("returns nothing (not an error) when no data exists", () => {
    expect(discoverSources({ cwd })).toEqual([]);
  });
});
