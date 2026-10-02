# @ratel-ai/burrow

The Node launcher for Ratel Burrow, plus the `burrowConfig()` helper for Ratel SDK users.

```bash
npx @ratel-ai/burrow          # read-only UI on 127.0.0.1, opens your browser
```

```ts
import { ratel } from "@ratel-ai/sdk";
import { burrowConfig, burrowPaths } from "@ratel-ai/burrow";

const r = ratel({ ...config, ...burrowConfig() }); // JSONL traces + catalog definitions → ./.ratel/burrow
// Adaptive ranking: new LocalFileIntentGraphStorage({ path: burrowPaths().intentGraph })
```

## Layout

| File | Purpose |
|---|---|
| `src/bin.ts` | `ratel-burrow` entry: parse flags, discover, serve, open the browser |
| `src/args.ts` | flag parsing and `--help` text |
| `src/discovery.ts` | finds trace files, intent graphs and catalog snapshots ([ADR 0003](../../docs/adr/0003-data-sources-and-discovery.md)) |
| `src/server.ts` | the read-only HTTP contract ([ADR 0002](../../docs/adr/0002-read-only-viewer-browser-side-parsing.md)) |
| `src/config.ts` | `burrowConfig()` / `burrowPaths()` |
| `scripts/copy-ui.mjs` | copies `packages/ui/dist` into `dist/ui` at build time |

```bash
pnpm test && pnpm typecheck
pnpm build     # needs packages/ui built first (root `pnpm build` orders it)
```
