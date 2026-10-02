import { describe, expect, it } from "vitest";
import { collectInvocations } from "../src/invocations";
import { v1Events, v2Events } from "./helpers";

describe("collectInvocations", () => {
  it("counts one call once even when invoke_*, upstream_* and gateway_* all fire", () => {
    const calls = collectInvocations(v1Events()).filter((c) => c.error === null);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      kind: "tool",
      id: "filesystem__list_directory",
      tookMs: 610,
      server: "filesystem",
    });
  });

  it("keeps gateway errors (e.g. an unknown tool id) as failed calls", () => {
    const failed = collectInvocations(v1Events()).filter((c) => c.error !== null);
    expect(failed).toEqual([
      expect.objectContaining({ id: "filesystem.list_directory", error: "unknown_tool_id" }),
    ]);
  });

  it("collects tool errors and skill loads from SDK logs", () => {
    const calls = collectInvocations(v2Events());
    expect(calls.map((c) => [c.kind, c.id, c.error])).toEqual([
      ["tool", "stripe_refund", null],
      ["skill", "refund_playbook", null],
      ["tool", "crm_lookup", "timeout"],
    ]);
    expect(calls[0]).toMatchObject({ invocationId: "inv1", turnId: "t1", tookMs: 200 });
  });

  it("falls back to gateway_invoke when a session has no invoke_* events", () => {
    const calls = collectInvocations(
      v1Events().filter((e) => !e.type.startsWith("invoke_")),
    ).filter((c) => c.error === null);
    expect(calls).toEqual([
      expect.objectContaining({ id: "filesystem__list_directory", tookMs: 612 }),
    ]);
  });
});
