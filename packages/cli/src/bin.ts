#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HELP, parseCliArgs } from "./args.js";
import { discoverSources, type Source } from "./discovery.js";
import { computeReplay, loadSdk } from "./replay.js";
import { type DerivedSource, startServer } from "./server.js";

const here = dirname(fileURLToPath(import.meta.url));

function version(): string {
  const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as {
    version: string;
  };
  return pkg.version;
}

function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  } catch {
    // The URL is printed; opening is a convenience.
  }
}

async function main() {
  const command = parseCliArgs(process.argv.slice(2));
  if (command.kind === "help") return console.log(HELP);
  if (command.kind === "version") return console.log(version());
  if (command.kind === "error") {
    console.error(`ratel-burrow: ${command.message}\n\n${HELP}`);
    process.exitCode = 2;
    return;
  }

  const uiDir = join(here, "ui");
  if (!existsSync(join(uiDir, "index.html"))) {
    console.error("ratel-burrow: the UI bundle is missing (run `pnpm build` from the repo root).");
    process.exitCode = 1;
    return;
  }
  const discover = () =>
    discoverSources({
      cwd: process.cwd(),
      dirs: command.dirs,
      traces: command.traces,
      intentGraphs: command.intentGraphs,
      catalogs: command.catalogs,
    });
  const derived: DerivedSource[] = [];
  const sdk = command.replay ? await loadSdk(process.cwd()) : null;
  if (sdk) derived.push(boostReplaySource(discover, sdk));

  const token = randomBytes(24).toString("base64url");
  let server: Awaited<ReturnType<typeof startServer>>;
  try {
    server = await startServer({ discover, uiDir, token, port: command.port, derived });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    console.error(
      code === "EADDRINUSE"
        ? `ratel-burrow: port ${command.port} is in use; pick another with --port, or omit it for a free one.`
        : `ratel-burrow: could not start the server: ${(err as Error).message}`,
    );
    process.exitCode = 1;
    return;
  }

  const sources = discover();
  console.log(`\n  Ratel Burrow ${version()} — read-only\n`);
  console.log(`  ${server.url}\n`);
  if (sources.length === 0) {
    console.log("  No Ratel data in ./.ratel/burrow yet. Add burrowConfig() to your Ratel");
    console.log("  config (or pass --trace / --dir); new files show up on refresh.\n");
  } else {
    const count = (k: string) => sources.filter((s) => s.kind === k).length;
    console.log(
      `  Found ${count("trace")} trace file(s), ${count("intent_graph")} intent graph(s), ${count("catalog_snapshot")} catalog snapshot(s).\n`,
    );
  }
  console.log(
    sdk
      ? "  Boost panel: replaying searches with this project's @ratel-ai/sdk (read-only).\n"
      : "  Boost panel: no @ratel-ai/sdk in this project, so searches are not replayed.\n",
  );
  console.log("  Press Ctrl-C to stop.\n");
  if (command.open) openBrowser(server.url);

  const stop = () => {
    void server.close().then(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

/**
 * The Boost replay as a derived source: recomputed only when the trace files (or the catalog
 * snapshot) change, and at most once at a time.
 */
function boostReplaySource(
  discover: () => Source[],
  sdk: NonNullable<Awaited<ReturnType<typeof loadSdk>>>,
): DerivedSource {
  const inputs = () =>
    discover().filter((s) => s.kind === "trace" || s.kind === "catalog_snapshot");
  const signature = () =>
    inputs()
      .map((s) => `${s.path}:${s.size}:${s.mtime}`)
      .join("|");
  let cached: { signature: string; body: Promise<string> } | null = null;
  return {
    id: "boost-replay",
    kind: "boost_replay",
    label: "Boost replay (your @ratel-ai/sdk)",
    describe: () => {
      const files = inputs();
      if (!files.some((s) => s.kind === "trace")) return null;
      return {
        size: files.reduce((n, s) => n + s.size, 0),
        mtime: Math.max(...files.map((s) => s.mtime)),
      };
    },
    read: () => {
      const sig = signature();
      if (cached?.signature !== sig) {
        cached = {
          signature: sig,
          body: (async () => {
            const files = inputs();
            const traces = await Promise.all(
              files.filter((s) => s.kind === "trace").map((s) => readFile(s.path, "utf8")),
            );
            const snapshotFile = files.find((s) => s.kind === "catalog_snapshot");
            const snapshot = snapshotFile
              ? JSON.parse(await readFile(snapshotFile.path, "utf8"))
              : null;
            return JSON.stringify(await computeReplay(traces, snapshot, sdk));
          })(),
        };
      }
      return cached.body;
    },
  };
}

void main();
