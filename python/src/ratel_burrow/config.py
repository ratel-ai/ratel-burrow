"""`burrow_config()`: point Ratel's own JSONL trace sink at a Burrow dir."""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .discovery import BURROW_DIR, CATALOG_SNAPSHOT_FILE, INTENT_GRAPH_FILE

try:  # Use Ratel's own type when the SDK is installed; the catalog duck-types it anyway.
    from ratel_ai import TraceSinkConfig  # type: ignore[import-not-found, unused-ignore]
except ImportError:  # pragma: no cover - exercised only without ratel-ai

    @dataclass
    class TraceSinkConfig:  # type: ignore[no-redef]
        """Same fields as `ratel_ai.TraceSinkConfig`."""

        kind: str
        session_id: str | None = None
        path: str | None = None


@dataclass(frozen=True)
class BurrowPaths:
    dir: str
    traces: str
    #: Pass to `LocalFileIntentGraphStorage(path)`.
    intent_graph: str
    #: Write `json.dumps(catalog.snapshot())` here to show definitions without events.
    catalog_snapshot: str


def burrow_paths(dir: str | os.PathLike[str] | None = None) -> BurrowPaths:  # noqa: A002
    d = Path(dir) if dir is not None else Path.cwd() / BURROW_DIR
    d = d if d.is_absolute() else Path.cwd() / d
    return BurrowPaths(
        dir=str(d),
        traces=str(d / "traces"),
        intent_graph=str(d / INTENT_GRAPH_FILE),
        catalog_snapshot=str(d / CATALOG_SNAPSHOT_FILE),
    )


def burrow_config(
    dir: str | os.PathLike[str] | None = None,  # noqa: A002
    session_id: str | None = None,
) -> dict[str, Any]:
    """Keyword arguments for `ToolCatalog(**burrow_config())` / `SkillCatalog(...)`.

    Writes nothing but the traces directory. For descriptions and schemas, also call
    `catalog.experimental_enable_catalog_definitions()`.
    """
    paths = burrow_paths(dir)
    sid = session_id or str(uuid.uuid4())
    Path(paths.traces).mkdir(parents=True, exist_ok=True)
    return {
        "trace": TraceSinkConfig(
            kind="jsonl", session_id=sid, path=str(Path(paths.traces) / f"{sid}.jsonl")
        )
    }
