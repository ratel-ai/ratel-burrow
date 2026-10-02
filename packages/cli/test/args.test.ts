import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/args";

describe("parseCliArgs", () => {
  it("defaults to discovery with the browser opening", () => {
    expect(parseCliArgs([])).toEqual({
      kind: "run",
      dirs: [],
      traces: [],
      intentGraphs: [],
      catalogs: [],
      open: true,
      port: 0,
    });
  });

  it("collects repeated flags", () => {
    const parsed = parseCliArgs([
      "--trace",
      "a.jsonl",
      "--trace",
      "logs/",
      "--intent-graph",
      "g.json",
      "--catalog",
      "c.json",
      "--dir",
      "d",
      "--no-open",
      "--port",
      "4377",
    ]);
    expect(parsed).toMatchObject({
      traces: ["a.jsonl", "logs/"],
      intentGraphs: ["g.json"],
      catalogs: ["c.json"],
      dirs: ["d"],
      open: false,
      port: 4377,
    });
  });

  it("handles help, version and bad input", () => {
    expect(parseCliArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseCliArgs(["-v"])).toEqual({ kind: "version" });
    expect(parseCliArgs(["--port", "abc"])).toMatchObject({ kind: "error" });
    expect(parseCliArgs(["--nope"])).toMatchObject({ kind: "error" });
    expect(parseCliArgs(["--all-projects"])).toMatchObject({ kind: "error" });
  });
});
