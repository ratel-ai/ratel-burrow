import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Source } from "../src/discovery";
import { type BurrowServer, startServer } from "../src/server";

let dir: string;
let server: BurrowServer;
const token = "test-token";

const source = (path: string, size: number): Source => ({
  id: "abc123",
  kind: "trace",
  path,
  label: "t.jsonl",
  size,
  mtime: 1,
});

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "burrow-srv-"));
  const ui = join(dir, "ui");
  mkdirSync(join(ui, "assets"), { recursive: true });
  writeFileSync(join(ui, "index.html"), "<!doctype html><title>Burrow</title>");
  writeFileSync(join(ui, "assets", "app.js"), "console.log(1)");
  writeFileSync(join(dir, "secret.txt"), "nope");
  const trace = join(dir, "t.jsonl");
  writeFileSync(trace, "0123456789");
  server = await startServer({
    discover: () => [source(trace, 10)],
    uiDir: ui,
    token,
    port: 0,
    derived: [
      {
        id: "boost-replay",
        kind: "boost_replay",
        label: "Boost replay",
        describe: () => ({ size: 10, mtime: 1 }),
        read: async () => JSON.stringify({ v: 1, method: "bm25", k: 5, turns: [] }),
      },
    ],
  });
});

afterEach(async () => {
  await server.close();
});

const api = (path: string, init: RequestInit = {}) =>
  fetch(`${server.origin}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });

describe("startServer", () => {
  it("binds to 127.0.0.1 and builds a launch URL carrying the token", () => {
    expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(server.url).toBe(`${server.origin}/?t=${token}`);
  });

  it("lists sources", async () => {
    const res = await api("/api/sources");
    expect(res.status).toBe(200);
    const { sources } = (await res.json()) as { sources: unknown[] };
    expect(sources[0]).toEqual(expect.objectContaining({ id: "abc123", kind: "trace", size: 10 }));
  });

  it("lists and serves a derived source (the Boost replay)", async () => {
    const { sources } = (await (await api("/api/sources")).json()) as {
      sources: { id: string; kind: string }[];
    };
    expect(sources.map((s) => [s.id, s.kind])).toEqual([
      ["abc123", "trace"],
      ["boost-replay", "boost_replay"],
    ]);
    const res = await api("/api/sources/boost-replay");
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ v: 1, turns: [] });
  });

  it("serves a source from an offset", async () => {
    expect(await (await api("/api/sources/abc123")).text()).toBe("0123456789");
    const tail = await api("/api/sources/abc123?offset=7");
    expect(await tail.text()).toBe("789");
    expect(tail.headers.get("x-burrow-size")).toBe("10");
    expect(await (await api("/api/sources/abc123?offset=99")).text()).toBe("");
    expect((await api("/api/sources/nope")).status).toBe(404);
  });

  it("rejects api calls without the token", async () => {
    expect((await fetch(`${server.origin}/api/sources`)).status).toBe(401);
    const wrong = await fetch(`${server.origin}/api/sources`, {
      headers: { authorization: "Bearer nope" },
    });
    expect(wrong.status).toBe(401);
  });

  it("is read-only: every non-GET method is 405", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect((await api("/api/sources", { method })).status).toBe(405);
    }
  });

  it("rejects a foreign Host header", async () => {
    const { port } = new URL(server.origin);
    const status = await new Promise<number | undefined>((done, fail) => {
      const req = request(
        {
          host: "127.0.0.1",
          port,
          path: "/api/sources",
          headers: { host: "evil.example", authorization: `Bearer ${token}` },
        },
        (res) => {
          res.resume();
          done(res.statusCode);
        },
      );
      req.on("error", fail);
      req.end();
    });
    expect(status).toBe(403);
  });

  it("serves the UI shell only with the token, assets freely, and never outside the UI dir", async () => {
    expect((await fetch(`${server.origin}/`)).status).toBe(401);
    const shell = await fetch(server.url);
    expect(shell.status).toBe(200);
    expect(await shell.text()).toContain("<title>Burrow</title>");
    expect(shell.headers.get("content-security-policy")).toContain("default-src 'self'");
    const asset = await fetch(`${server.origin}/assets/app.js`);
    expect(asset.headers.get("content-type")).toContain("javascript");
    expect((await fetch(`${server.origin}/assets/missing.js`)).status).toBe(404);
    expect((await fetch(`${server.origin}/..%2fsecret.txt`)).status).toBe(404);
  });
});
