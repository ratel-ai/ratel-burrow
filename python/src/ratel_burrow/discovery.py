"""Finds the files Burrow serves (ADR 0003). Mirrors packages/cli/src/discovery.ts."""

from __future__ import annotations

import hashlib
import os
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal

SourceKind = Literal["trace", "intent_graph", "catalog_snapshot"]

BURROW_DIR = os.path.join(".ratel", "burrow")
INTENT_GRAPH_FILE = "intent-graph.json"
#: One intent graph per project: `intent-graphs/<project>.json`.
INTENT_GRAPHS_DIR = "intent-graphs"
CATALOG_SNAPSHOT_FILE = "catalog-snapshot.json"


@dataclass(frozen=True)
class Source:
    """One data file Burrow can serve."""

    id: str
    kind: SourceKind
    path: str
    label: str
    size: int
    mtime: float

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


def source_id(path: str) -> str:
    return hashlib.sha256(path.encode()).hexdigest()[:12]


def _list(d: Path) -> list[str]:
    try:
        return sorted(os.listdir(d))
    except OSError:
        return []


def _jsonl_in(d: Path) -> list[Path]:
    return [d / n for n in _list(d) if n.endswith(".jsonl") and (d / n).is_file()]


def discover_sources(
    *,
    cwd: Path | str,
    dirs: Sequence[str] = (),
    traces: Sequence[str] = (),
    intent_graphs: Sequence[str] = (),
    catalogs: Sequence[str] = (),
) -> list[Source]:
    cwd = Path(cwd).resolve()
    out: list[Source] = []
    seen: set[str] = set()

    def add(kind: SourceKind, path: Path | str, label: str) -> None:
        p = (cwd / path).resolve() if not Path(path).is_absolute() else Path(path)
        key = str(p)
        if key in seen or not p.is_file():
            return
        seen.add(key)
        st = p.stat()
        out.append(Source(source_id(key), kind, key, label, st.st_size, st.st_mtime * 1000))

    def display(p: Path) -> str:
        try:
            return str(p.resolve().relative_to(cwd))
        except ValueError:
            return str(p)

    def add_burrow_dir(d: str) -> None:
        root = (cwd / d).resolve()
        for p in [*_jsonl_in(root / "traces"), *_jsonl_in(root)]:
            add("trace", p, display(p))
        add("intent_graph", root / INTENT_GRAPH_FILE, display(root / INTENT_GRAPH_FILE))
        for name in _list(root / INTENT_GRAPHS_DIR):
            if name.endswith(".json"):
                add(
                    "intent_graph",
                    root / INTENT_GRAPHS_DIR / name,
                    display(root / INTENT_GRAPHS_DIR / name),
                )
        add("catalog_snapshot", root / CATALOG_SNAPSHOT_FILE, display(root / CATALOG_SNAPSHOT_FILE))

    explicit = bool(dirs or traces or intent_graphs or catalogs)

    if not explicit:
        add_burrow_dir(BURROW_DIR)

    for d in dirs:
        add_burrow_dir(d)
    for t in traces:
        p = (cwd / t).resolve()
        if p.is_dir():
            for f in _jsonl_in(p):
                add("trace", f, display(f))
        else:
            add("trace", p, display(p))
    for g in intent_graphs:
        add("intent_graph", g, display(cwd / g))
    for c in catalogs:
        add("catalog_snapshot", c, display(cwd / c))
    return out
