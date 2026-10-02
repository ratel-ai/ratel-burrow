import { parseArgs } from "node:util";

export type CliCommand =
  | {
      kind: "run";
      dirs: string[];
      traces: string[];
      intentGraphs: string[];
      catalogs: string[];
      /** Replay searches for the Boost panel with the project's Ratel SDK (ADR 0005). */
      replay: boolean;
      open: boolean;
      port: number;
    }
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string };

export const HELP = `ratel-burrow — a read-only window into Ratel

Usage: ratel-burrow [options]

With no options, Burrow reads ./.ratel/burrow: point your Ratel SDK at it
with burrowConfig() (TypeScript) or burrow_config() (Python).

Options:
  --dir <path>           a Burrow dir (traces/, intent-graph.json, catalog-snapshot.json)
  --trace <file|dir>     a Ratel JSONL trace file, or a dir of them
  --intent-graph <file>  an intent graph saved by LocalFileIntentGraphStorage
  --catalog <file>       a saved catalog.snapshot() JSON
  --port <n>             bind this port (default: a free one)
  --no-open              print the URL without opening a browser
  --no-replay            don't replay searches for the Boost panel (it uses your
                         project's @ratel-ai/sdk, read-only, when installed)
  -h, --help             show this help
  -v, --version          print the version

Any of --dir/--trace/--intent-graph/--catalog replaces the defaults.
Burrow binds 127.0.0.1 only and never writes anything.`;

export function parseCliArgs(argv: string[]): CliCommand {
  let values: ReturnType<typeof parse>["values"];
  try {
    values = parse(argv).values;
  } catch (err) {
    return { kind: "error", message: (err as Error).message };
  }
  if (values.help) return { kind: "help" };
  if (values.version) return { kind: "version" };
  const port = values.port === undefined ? 0 : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    return { kind: "error", message: `--port must be 0-65535, got "${values.port}"` };
  }
  return {
    kind: "run",
    dirs: values.dir ?? [],
    traces: values.trace ?? [],
    intentGraphs: values["intent-graph"] ?? [],
    catalogs: values.catalog ?? [],
    replay: !values["no-replay"],
    open: !values["no-open"],
    port,
  };
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      dir: { type: "string", multiple: true },
      trace: { type: "string", multiple: true },
      "intent-graph": { type: "string", multiple: true },
      catalog: { type: "string", multiple: true },
      "no-open": { type: "boolean" },
      "no-replay": { type: "boolean" },
      port: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
}
