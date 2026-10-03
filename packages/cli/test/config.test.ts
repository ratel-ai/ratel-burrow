import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { burrowConfig, burrowPaths } from "../src/config";

describe("burrowConfig", () => {
  it("points Ratel's JSONL sink at <dir>/traces and turns catalog definitions on", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "burrow-cfg-")), ".ratel", "burrow");
    const config = burrowConfig({ dir, sessionId: "abc" });
    expect(config).toEqual({
      trace: { kind: "jsonl", sessionId: "abc", path: join(dir, "traces", "abc.jsonl") },
      events: { sessionId: "abc", experimentalCatalogDefinitions: true },
    });
    expect(existsSync(join(dir, "traces"))).toBe(true);
  });

  it("defaults to ./.ratel/burrow and a fresh session id", () => {
    const a = burrowConfig({ dir: join(mkdtempSync(join(tmpdir(), "burrow-cfg-")), "b") });
    const b = burrowConfig({ dir: join(mkdtempSync(join(tmpdir(), "burrow-cfg-")), "b") });
    expect(a.trace.sessionId).not.toBe(b.trace.sessionId);
    expect(burrowPaths().dir).toBe(join(process.cwd(), ".ratel", "burrow"));
  });

  it("names a project: the runtime's source_id, and the project's own intent graph", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "burrow-cfg-")), "b");
    expect(burrowConfig({ dir, sessionId: "s", project: "billing-agent" }).events).toEqual({
      sessionId: "s",
      sourceId: "billing-agent",
      experimentalCatalogDefinitions: true,
    });
    expect(burrowPaths({ dir: "/x", project: "billing-agent" }).intentGraph).toBe(
      "/x/intent-graphs/billing-agent.json",
    );
  });

  it("names the intent graph and snapshot files the CLI discovers", () => {
    const paths = burrowPaths({ dir: "/x" });
    expect(paths).toEqual({
      dir: "/x",
      traces: "/x/traces",
      intentGraph: "/x/intent-graph.json",
      catalogSnapshot: "/x/catalog-snapshot.json",
    });
  });
});
