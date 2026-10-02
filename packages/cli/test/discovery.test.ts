import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { discoverSources, projectSlug } from "../src/discovery";

let root: string;
let home: string;
let cwd: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "burrow-disc-"));
  home = join(root, "home");
  cwd = join(root, "work", "my.app");
  mkdirSync(cwd, { recursive: true });
});

const local = (slug: string, file: string, body = "{}\n") => {
  const dir = join(home, ".ratel", "telemetry", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), body);
};

describe("projectSlug", () => {
  it("replaces / and . with - like ratel-local", () => {
    expect(projectSlug("/Users/me/my.app")).toBe("-Users-me-my-app");
  });
});

describe("discoverSources", () => {
  it("finds ratel-local telemetry for the cwd and the ./.ratel/burrow dir", () => {
    local(projectSlug(cwd), "2026-01-01T00-00-00-000Z-aaaaaa.jsonl");
    local("-some-other-project", "x.jsonl");
    const burrow = join(cwd, ".ratel", "burrow");
    mkdirSync(join(burrow, "traces"), { recursive: true });
    writeFileSync(join(burrow, "traces", "s.jsonl"), "");
    writeFileSync(join(burrow, "intent-graph.json"), "{}");
    writeFileSync(join(burrow, "catalog-snapshot.json"), "{}");

    const sources = discoverSources({ cwd, home, env: {} });
    expect(sources.map((s) => [s.kind, s.label])).toEqual([
      ["trace", "ratel-local · 2026-01-01T00-00-00-000Z-aaaaaa.jsonl"],
      ["trace", ".ratel/burrow/traces/s.jsonl"],
      ["intent_graph", ".ratel/burrow/intent-graph.json"],
      ["catalog_snapshot", ".ratel/burrow/catalog-snapshot.json"],
    ]);
    expect(new Set(sources.map((s) => s.id)).size).toBe(4);
    expect(sources[0]).toMatchObject({ size: 3 });
  });

  it("honours RATEL_TELEMETRY_DIR", () => {
    const dir = join(root, "elsewhere", projectSlug(cwd));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.jsonl"), "");
    const sources = discoverSources({
      cwd,
      home,
      env: { RATEL_TELEMETRY_DIR: join(root, "elsewhere") },
    });
    expect(sources.map((s) => s.path)).toEqual([join(dir, "a.jsonl")]);
  });

  it("reads every project with allProjects", () => {
    local("-a", "1.jsonl");
    local("-b", "2.jsonl");
    const sources = discoverSources({ cwd, home, env: {}, allProjects: true });
    expect(sources.map((s) => s.label)).toEqual([
      "ratel-local · -a/1.jsonl",
      "ratel-local · -b/2.jsonl",
    ]);
  });

  it("replaces the defaults with explicit paths", () => {
    local(projectSlug(cwd), "ignored.jsonl");
    const traceDir = join(root, "t");
    mkdirSync(traceDir);
    writeFileSync(join(traceDir, "one.jsonl"), "");
    writeFileSync(join(traceDir, "notes.txt"), "");
    const graph = join(root, "g.json");
    writeFileSync(graph, "{}");
    const sources = discoverSources({
      cwd,
      home,
      env: {},
      traces: [traceDir],
      intentGraphs: [graph],
    });
    expect(sources.map((s) => [s.kind, s.path])).toEqual([
      ["trace", join(traceDir, "one.jsonl")],
      ["intent_graph", graph],
    ]);
  });

  it("returns nothing (not an error) when no data exists", () => {
    expect(discoverSources({ cwd, home, env: {} })).toEqual([]);
  });
});
