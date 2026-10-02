import { describe, expect, it } from "vitest";
import { parseTraceLog } from "../src/events";
import { buildHealth } from "../src/health";
import { v1Events, v2Events } from "./helpers";

describe("buildHealth", () => {
  it("summarizes latency and errors per tool", () => {
    const h = buildHealth([...v1Events(), ...v2Events()]);
    expect(h.totals).toMatchObject({ searches: 5, invocations: 5, errors: 2 });
    const refund = h.tools.find((t) => t.id === "stripe_refund");
    expect(refund).toMatchObject({ calls: 1, errors: 0, p50: 200, p95: 200 });
    expect(h.tools[0]?.calls).toBeGreaterThanOrEqual(h.tools.at(-1)?.calls ?? 0);
  });

  it("lists MCP servers with tool counts and their calls", () => {
    const h = buildHealth(v1Events());
    expect(h.servers).toEqual([
      expect.objectContaining({
        server: "filesystem",
        transport: "stdio",
        toolCount: 2,
        calls: 1,
        errors: 0,
        auth: "ok",
      }),
    ]);
  });

  it("tracks auth state per upstream", () => {
    const log = parseTraceLog(
      [
        '{"v":1,"ts":1,"session_id":"s","type":"upstream_register","server":"gh","transport":"StreamableHTTPClientTransport","tool_count":3}',
        '{"v":1,"ts":2,"session_id":"s","type":"auth_needs","upstream":"gh"}',
      ].join("\n"),
    );
    expect(buildHealth(log.events).servers[0]).toMatchObject({
      transport: "http",
      auth: "needs_auth",
    });
  });

  it("reports embedder status, dropped events and warnings", () => {
    const h = buildHealth(v2Events());
    expect(h.embedders).toEqual([
      expect.objectContaining({ model: "BAAI/bge-small-en-v1.5", status: "slow", tookMs: 4200 }),
    ]);
    expect(h.dropped).toMatchObject({ total: 7, windows: 1 });
    expect(h.searchLatency).toMatchObject({ p50: 1, p95: 9 });
  });
});
