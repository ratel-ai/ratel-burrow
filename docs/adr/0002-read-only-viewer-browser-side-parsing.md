# 2. Read-only viewer with browser-side parsing and two thin launchers

Date: 2026-10-02

## Status

Accepted

## Context

Ratel ships to TypeScript and Python users. A visualization tool for it must be installable
from either ecosystem without asking a Python user to install Node, and it must never be able
to change a Ratel configuration — Burrow observes, it does not manage (configuration is
ratel-local's job).

## Decision

- **The browser does all the work.** Parsing trace lines, building the catalog, the search
  inspector timeline, health aggregates, savings estimates, and the intent-graph view models
  live in `@ratel-ai/burrow-model`, a pure TypeScript package with no DOM or Node APIs, bundled
  into the UI.
- **Launchers are dumb.** A launcher discovers data files, serves them raw, and serves the
  prebuilt UI. Two implementations exist: Node (`@ratel-ai/burrow`, `packages/cli`) and Python
  (`ratel-burrow`, `python/`, standard library only). Both implement one HTTP contract:

  | Route | Response |
  |---|---|
  | `GET /api/sources` | `{ sources: [{ id, kind, path, size, mtime }] }`, `kind` ∈ `trace` \| `intent_graph` \| `catalog_snapshot` |
  | `GET /api/sources/:id?offset=N` | the file's raw bytes from byte `N` (default 0) |

  The UI polls with an advancing `offset` to tail live trace files.
- **Read-only by construction.** No route accepts a write; anything but `GET`/`HEAD` is `405`.
  The server binds `127.0.0.1`, rejects a foreign `Host` header, and gates `/api/*` on a
  random bearer token handed to the browser in the launch URL (`?t=`), the pattern ratel-mcp's
  `ui` command uses.
- The shared `conformance/` suite runs the same contract checks against both launchers.

## Consequences

- Adding a screen never touches a launcher. Python and TypeScript users always see the same UI.
- Very large trace logs are parsed in the browser; fine for local, per-project logs. If that
  ever bites, a launcher may add a filtered route — additively.

## Rejected

- **Server-side aggregation API**: would be written twice (Node + Python) and drift.
- **An in-process `ratel.inspect()` hook in the Ratel SDKs**: couples Burrow to every SDK's
  release cycle and only sees one process.
