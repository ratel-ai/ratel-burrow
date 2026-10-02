# ratel-burrow (Python)

The Python launcher for Ratel Burrow, plus `burrow_config()` for Ratel SDK users. Standard
library only: no Node needed. It serves the same UI and the same read-only HTTP contract as
`@ratel-ai/burrow` ([ADR 0002](../docs/adr/0002-read-only-viewer-browser-side-parsing.md)).

```bash
pip install ratel-burrow
ratel-burrow                 # read-only UI on 127.0.0.1, opens your browser
```

```python
from ratel_ai import ToolCatalog
from ratel_burrow import burrow_config, burrow_paths

catalog = ToolCatalog(**burrow_config())  # JSONL traces → ./.ratel/burrow/traces
catalog.experimental_enable_catalog_definitions()  # descriptions + schemas for the Catalog screen
# Adaptive ranking: LocalFileIntentGraphStorage(burrow_paths().intent_graph)
```

## Layout

| Path | Purpose |
|---|---|
| `src/ratel_burrow/cli.py` | `ratel-burrow` entry point |
| `src/ratel_burrow/discovery.py` | finds trace files, intent graphs and catalog snapshots |
| `src/ratel_burrow/server.py` | the read-only HTTP server |
| `src/ratel_burrow/config.py` | `burrow_config()` / `burrow_paths()` |
| `src/ratel_burrow/replay.py` | the Boost replay with the installed `ratel-ai` ([ADR 0005](../docs/adr/0005-boost-replay-in-launchers.md)) |
| `src/ratel_burrow/ui/` | the built UI, copied in by `scripts/bundle_ui.py` (git-ignored) |

## Develop

```bash
uv venv --python 3.11 .venv && uv pip install --python .venv -e '.[dev]'
.venv/bin/ruff check . && .venv/bin/mypy src && .venv/bin/pytest
python scripts/bundle_ui.py && uv build    # after `pnpm build` at the repo root
```
