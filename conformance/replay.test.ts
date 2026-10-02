/**
 * The Boost replay (ADR 0005) must be identical from both launchers: same events, same
 * order, same keys, same rankings. Each launcher runs with an SDK it can import: Node from
 * packages/cli (where @ratel-ai/sdk is a devDependency), Python from python/.venv (with
 * ratel-ai installed). Skipped when either is missing.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const trace = join(here, "fixtures", "replay.jsonl");
const nodeBin = join(root, "packages", "cli", "dist", "bin.js");
const python = process.env.BURROW_PYTHON ?? join(root, "python", ".venv", "bin", "python");
const nodeSdk = existsSync(join(root, "packages", "cli", "node_modules", "@ratel-ai", "sdk"));
const available = existsSync(nodeBin) && existsSync(python) && nodeSdk;

const procs: ChildProcess[] = [];
afterAll(() => {
  for (const p of procs) p.kill();
});

function start(cmd: string, args: string[], cwd: string): Promise<URL> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, [...args, "--trace", trace, "--no-open"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    procs.push(proc);
    let out = "";
    const timer = setTimeout(() => reject(new Error(`no URL printed:\n${out}`)), 15_000);
    const onData = (chunk: Buffer) => {
      out += chunk.toString();
      const m = /http:\/\/127\.0\.0\.1:\d+\/\?t=[\w-]+/.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve(new URL(m[0]));
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
  });
}

function getJson(url: URL, path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: url.hostname,
        port: url.port,
        path,
        headers: { authorization: `Bearer ${url.searchParams.get("t")}` },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => resolve(JSON.parse(body)));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe.skipIf(!available)("Boost replay", () => {
  it("is listed and identical from the Node and Python launchers", async () => {
    const [nodeUrl, pyUrl] = await Promise.all([
      start(process.execPath, [nodeBin], join(root, "packages", "cli")),
      start(python, ["-m", "ratel_burrow.cli"], join(root, "python")),
    ]);
    for (const url of [nodeUrl, pyUrl]) {
      const { sources } = (await getJson(url, "/api/sources")) as {
        sources: { id: string; kind: string }[];
      };
      expect(sources.find((s) => s.id === "boost-replay")?.kind).toBe("boost_replay");
    }
    const [fromNode, fromPython] = await Promise.all([
      getJson(nodeUrl, "/api/sources/boost-replay"),
      getJson(pyUrl, "/api/sources/boost-replay"),
    ]);
    expect((fromNode as { turns: unknown[] }).turns).toHaveLength(7);
    expect(fromPython).toEqual(fromNode);
  }, 30_000);
});
