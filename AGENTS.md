# AGENTS.md — working in the Ratel Burrow repo

Ratel Burrow is a **read-only**, localhost visualization layer for [Ratel](https://github.com/ratel-ai/ratel):
catalog explorer, search inspector, adaptive ranking / intent graph, and agent health, built
from data Ratel already writes. If you're a human, start with [README.md](README.md).

## Build & test

Prerequisites: Node 20.6+ (24 in CI), pnpm 10+, and for `python/`: Python 3.11+ and [`uv`](https://docs.astral.sh/uv/).

```bash
pnpm install
pnpm build        # model → ui → cli (cli bundles the ui dist)
pnpm typecheck
pnpm lint         # biome
pnpm test         # vitest

# Python launcher (from python/)
uv venv --python 3.11 .venv && uv pip install --python .venv -e '.[dev]'
.venv/bin/ruff check . && .venv/bin/mypy src && .venv/bin/pytest

# Contract suite against both launchers (after pnpm build and the Python install)
pnpm --filter @ratel-ai/burrow-conformance test
```

CI (`.github/workflows/ci.yml`) runs all of the above behind one required `ci-gate` job.

## Layout

- `packages/model` — `@ratel-ai/burrow-model`: pure TS parsers + view models. All analysis lives here.
- `packages/ui` — Vite + React app; consumes `model`. Built assets are bundled by both launchers.
- `packages/cli` — `@ratel-ai/burrow`: Node launcher (`ratel-burrow`) + `burrowConfig()` helper.
- `python/` — `ratel-burrow` on PyPI: stdlib launcher + `burrow_config()` helper.
- `conformance/` — shared fixtures and HTTP-contract tests run against both launchers.
- `examples/` — tiny Ratel agents that write a Burrow dir, for demoing every screen.

## Conventions

- **Read-only, always.** No launcher route may write, and Burrow never edits Ratel config. See [ADR 0002](docs/adr/0002-read-only-viewer-browser-side-parsing.md).
- **Logic goes in `model`, not in launchers or components.** Launchers only discover and serve files.
- **TDD** for `model`, `cli` and `python/`: failing test first. UI components without logic can skip.
- **Additive evolution**: tolerate unknown trace event types and fields; never fail a file on one bad line.
- **ADRs** in `docs/adr/`, next number, Nygard format; amend in place for drift.
- **Folder READMEs** describe only what's in that folder; update them in the same commit.
- **Commits**: concise, imperative, conventional prefixes (`feat(model):`, `fix(ui):`, `chore:`). **MUST NOT** add AI-attribution lines.
