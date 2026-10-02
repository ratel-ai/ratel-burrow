/**
 * The ADR 0002 HTTP contract, run against every launcher as a real process.
 * Node: packages/cli/dist/bin.js (run `pnpm build` first).
 * Python: $BURROW_PYTHON (default python/.venv/bin/python) running `-m ratel_burrow.cli`;
 * skipped when that interpreter is missing.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fixtures = join(here, "fixtures");
const python = process.env.BURROW_PYTHON ?? join(root, "python", ".venv", "bin", "python");

const launchers: { name: string; cmd: string; args: string[]; available: boolean }[] = [
  {
    name: "node",
    cmd: process.execPath,
    args: [join(root, "packages", "cli", "dist", "bin.js")],
    available: existsSync(join(root, "packages", "cli", "dist", "bin.js")),
  },
  {
    name: "python",
    cmd: python,
    args: ["-m", "ratel_burrow.cli"],
    available: existsSync(python),
  },
];

const flags = [
  "--trace",
  join(fixtures, "traces-v1.jsonl"),
  "--trace",
  join(fixtures, "traces-v2.jsonl"),
  "--intent-graph",
  join(fixtures, "intent-graph.json"),
  "--no-open",
];

function start(cmd: string, args: string[]): Promise<{ proc: ChildProcess; url: URL }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, [...args, ...flags], {
      cwd: fixtures,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const timer = setTimeout(() => reject(new Error(`no URL printed:\n${out}`)), 15_000);
    const onData = (chunk: Buffer) => {
      out += chunk.toString();
      const m = /http:\/\/127\.0\.0\.1:\d+\/\?t=[\w-]+/.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve({ proc, url: new URL(m[0]) });
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("exit", (code) => reject(new Error(`exited ${code}:\n${out}`)));
  });
}

function raw(
  url: URL,
  path: string,
  opts: { method?: string; host?: string; token?: string } = {},
) {
  return new Promise<{ status: number; headers: Record<string, string>; body: string }>(
    (resolve, reject) => {
      const headers: Record<string, string> = {};
      if (opts.token) headers.authorization = `Bearer ${opts.token}`;
      if (opts.host) headers.host = opts.host;
      const req = request(
        { host: url.hostname, port: url.port, path, method: opts.method ?? "GET", headers },
        (res) => {
          let body = "";
          res.on("data", (c) => {
            body += c;
          });
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers as Record<string, string>,
              body,
            }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    },
  );
}

for (const launcher of launchers) {
  describe.skipIf(!launcher.available)(`${launcher.name} launcher`, () => {
    let proc: ChildProcess;
    let url: URL;
    let token: string;

    beforeAll(async () => {
      ({ proc, url } = await start(launcher.cmd, launcher.args));
      token = url.searchParams.get("t") ?? "";
    }, 20_000);
    afterAll(() => {
      proc?.kill();
    });

    const get = (path: string, opts: { method?: string; host?: string; auth?: boolean } = {}) =>
      raw(url, path, { ...opts, token: opts.auth === false ? undefined : token });

    it("lists exactly the requested sources with the agreed fields", async () => {
      const res = await get("/api/sources");
      expect(res.status).toBe(200);
      const { sources } = JSON.parse(res.body) as { sources: Record<string, unknown>[] };
      expect(sources.map((s) => [s.kind, String(s.path).split("/").at(-1)])).toEqual([
        ["trace", "traces-v1.jsonl"],
        ["trace", "traces-v2.jsonl"],
        ["intent_graph", "intent-graph.json"],
      ]);
      for (const s of sources) {
        expect(Object.keys(s).sort()).toEqual(["id", "kind", "label", "mtime", "path", "size"]);
        expect(s.id).toMatch(/^[a-f0-9]{12}$/);
      }
    });

    it("serves bytes from an offset with the file size header", async () => {
      const { sources } = JSON.parse((await get("/api/sources")).body) as {
        sources: { id: string; size: number }[];
      };
      const first = sources[0];
      if (!first) throw new Error("no sources");
      const full = await get(`/api/sources/${first.id}`);
      expect(Buffer.byteLength(full.body)).toBe(first.size);
      const tail = await get(`/api/sources/${first.id}?offset=${first.size - 5}`);
      expect(tail.body).toBe(full.body.slice(-5));
      expect(tail.headers["x-burrow-size"]).toBe(String(first.size));
      expect((await get(`/api/sources/${first.id}?offset=${first.size + 10}`)).body).toBe("");
      expect((await get("/api/sources/000000000000")).status).toBe(404);
    });

    it("requires the token for the API and the shell", async () => {
      expect((await get("/api/sources", { auth: false })).status).toBe(401);
      expect((await get("/", { auth: false })).status).toBe(401);
      const shell = await get(`/?t=${token}`, { auth: false });
      expect(shell.status).toBe(200);
      expect(shell.body).toContain("<title>Ratel Burrow</title>");
      expect(shell.headers["content-security-policy"]).toContain("default-src 'self'");
    });

    it("is read-only and loopback-only", async () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        expect((await get("/api/sources", { method })).status).toBe(405);
      }
      expect((await get("/api/sources", { host: "evil.example" })).status).toBe(403);
      expect((await get("/..%2f..%2fpackage.json", { auth: false })).status).toBe(404);
    });
  });
}
