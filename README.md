<div align="center">
  <img src="assets/burrow.png" alt="Ratel Burrow: a honey badger peering out of its burrow" width="420" />
  <h1>Ratel Burrow</h1>
  <p>A read-only window into <a href="https://github.com/ratel-ai/ratel">Ratel</a>: see your catalog, every search and invocation, adaptive ranking, and agent health — on localhost.</p>
</div>

Ratel is a library: it ranks your agent's tools, skills and facts in-process. Burrow shows you
what it's doing. It reads the files Ratel already writes — trace logs, catalog definitions and
the intent graph — and renders them in your browser. It never changes your Ratel config.

## Screens

- **Summary**: is Ratel working? Tokens kept out of your model's context, how often the first
  result was right, what search missed, and what to fix first.
- **Searches**: every query, what it returned (with each result's relevance), and what the agent
  called next. Problems come first.
- **Tools**: your catalog with per-tool health (first result %, misses) and a "needs attention"
  filter, plus each entry's description, searchable text and schemas.
- **Learning**: whether adaptive ranking helped, and the request patterns it learned in plain text.

Every page reads the same time range (24h, 7d, 30d or all), ending at the latest event.

## Quickstart

Burrow is for the open-source Ratel SDK (TypeScript and Python). Point Ratel's own trace sink
at a Burrow dir (`./.ratel/burrow`), then run Burrow there.

```ts
import { ratel } from "@ratel-ai/sdk";
import { burrowConfig, burrowPaths } from "@ratel-ai/burrow";

const r = ratel({ ...yourConfig, ...burrowConfig() }); // traces + catalog definitions
// Adaptive ranking: save the graph where Burrow looks for it
//   new LocalFileIntentGraphStorage({ path: burrowPaths().intentGraph })
```

```python
from ratel_ai import ToolCatalog
from ratel_burrow import burrow_config, burrow_paths

catalog = ToolCatalog(**burrow_config())
catalog.experimental_enable_catalog_definitions()  # descriptions + schemas
# Adaptive ranking: LocalFileIntentGraphStorage(burrow_paths().intent_graph)
```

```bash
npx @ratel-ai/burrow        # or: ratel-burrow
```

Flags: `--dir <path>`, `--trace <file|dir>`, `--intent-graph <file>`, `--catalog <file>`,
`--port <n>`, `--no-open`, `--no-replay`. Any path flag replaces the default `./.ratel/burrow`.

With the Ratel SDK installed in the project, Burrow replays your searches with it (read-only)
so the Boost panel can compare ranking with and without the intent graph on every turn, as
Ratel Cloud does.

Want to see every screen with data first? Run the example agent:
`pnpm --filter @ratel-ai/burrow-example-ts-sdk start`, then `ratel-burrow` in `examples/ts-sdk`.

## Projects

Like Ratel Cloud, Burrow keeps each project apart. A project is a runtime's `source_id`, which the
SDK takes from `OTEL_SERVICE_NAME`. `burrowConfig({ project: "billing-agent" })` (Python:
`burrow_config(project="billing-agent")`) sets it when unset and gives the project its own intent
graph (`burrowPaths({ project }).intentGraph`). Pick a project in the sidebar; every screen is
scoped to it. `#/overview?project=<id>` links straight to one.

## How it works

Burrow's launcher (Node or Python) only finds files and serves them raw, on `127.0.0.1`,
behind a token printed in the launch URL. Every route is a `GET`; nothing writes. The browser
does all the parsing with `@ratel-ai/burrow-model`, so both launchers show the same thing.
See [ADR 0002](docs/adr/0002-read-only-viewer-browser-side-parsing.md) and
[ADR 0003](docs/adr/0003-data-sources-and-discovery.md).

## Repo

See [AGENTS.md](AGENTS.md) for build commands and conventions and [docs/adr](docs/adr) for decisions.

## License

MIT
