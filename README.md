<div align="center">
  <img src="assets/burrow.svg" alt="Ratel Burrow" width="320" />
  <h1>Ratel Burrow</h1>
  <p>A read-only window into <a href="https://github.com/ratel-ai/ratel">Ratel</a>: see your catalog, every search and invocation, adaptive ranking, and agent health — on localhost.</p>
</div>

Ratel is a library: it ranks your agent's tools, skills and facts in-process. Burrow shows you
what it's doing. It reads the files Ratel already writes — trace logs, catalog definitions and
the intent graph — and renders them in your browser. It never changes your Ratel config.

## Screens

- **Overview** — what Burrow found, and the headline numbers.
- **Catalog** — tools, skills and facts with their description, searchable text and schemas.
- **Search inspector** — every query, what it ranked, and what the agent invoked next.
- **Adaptive ranking** — the intent graph Ratel learns from usage, and whether it's helping.
- **Agent health** — latency, MCP servers, embedder status, dropped events, tokens saved.

## Quickstart

### Using ratel-local

Nothing to configure. From your project folder:

```bash
npx @ratel-ai/burrow        # or: pip install ratel-burrow && ratel-burrow
```

### Using the Ratel SDK

Point Ratel's existing sinks at a Burrow dir with one spread:

```ts
import { ratel } from "@ratel-ai/sdk";
import { burrowConfig } from "@ratel-ai/burrow";

const r = ratel({ ...yourConfig, ...burrowConfig() }); // writes to ./.ratel/burrow
```

```python
from ratel_burrow import burrow_config

catalog = ToolCatalog(**burrow_config())  # writes to ./.ratel/burrow
```

Then run `npx @ratel-ai/burrow` (or `ratel-burrow`) in the same folder.

Flags: `--dir <path>`, `--trace <file|dir>`, `--intent-graph <file>`, `--catalog <file>`,
`--all-projects`, `--port <n>`, `--no-open`.

## Repo

See [AGENTS.md](AGENTS.md) for build commands and conventions and [docs/adr](docs/adr) for decisions.

## License

MIT
