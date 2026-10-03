"""`burrow_config()`: point Ratel's own JSONL trace sink at a Burrow dir."""

from __future__ import annotations

import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .discovery import BURROW_DIR, CATALOG_SNAPSHOT_FILE, INTENT_GRAPH_FILE, INTENT_GRAPHS_DIR

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


def project_file_name(project: str) -> str:
    """A project's intent-graph file name (`projectFileName` in the model)."""
    return re.sub(r"[^A-Za-z0-9._-]", "_", project) + ".json"


def burrow_paths(
    dir: str | os.PathLike[str] | None = None,  # noqa: A002
    project: str | None = None,
) -> BurrowPaths:
    """Where Burrow looks. With `project` (the runtime's source_id, `OTEL_SERVICE_NAME` in
    Python), the intent graph is that project's own file, as Ratel Cloud keeps one per project."""
    d = Path(dir) if dir is not None else Path.cwd() / BURROW_DIR
    d = d if d.is_absolute() else Path.cwd() / d
    graph = d / INTENT_GRAPHS_DIR / project_file_name(project) if project else d / INTENT_GRAPH_FILE
    return BurrowPaths(
        dir=str(d),
        traces=str(d / "traces"),
        intent_graph=str(graph),
        catalog_snapshot=str(d / CATALOG_SNAPSHOT_FILE),
    )


def burrow_config(
    dir: str | os.PathLike[str] | None = None,  # noqa: A002
    session_id: str | None = None,
    project: str | None = None,
) -> dict[str, Any]:
    """Keyword arguments for `ToolCatalog(**burrow_config())` / `SkillCatalog(...)`.

    `project` is this runtime's project: its `source_id` (set as `OTEL_SERVICE_NAME` when that
    is unset, which is where the SDK reads it from) and its own intent graph file
    (`burrow_paths(project=...).intent_graph`). Call it before creating the catalogs.

    Writes nothing but the traces (and intent-graphs) directories. For descriptions and
    schemas, also call `catalog.experimental_enable_catalog_definitions()`.
    """
    paths = burrow_paths(dir, project)
    sid = session_id or str(uuid.uuid4())
    Path(paths.traces).mkdir(parents=True, exist_ok=True)
    if project:
        os.environ.setdefault("OTEL_SERVICE_NAME", project)
        Path(paths.intent_graph).parent.mkdir(parents=True, exist_ok=True)
    return {
        "trace": TraceSinkConfig(
            kind="jsonl", session_id=sid, path=str(Path(paths.traces) / f"{sid}.jsonl")
        )
    }
