from pathlib import Path

import pytest

from ratel_burrow.discovery import discover_sources


@pytest.fixture
def cwd(tmp_path: Path) -> Path:
    d = tmp_path / "work" / "app"
    d.mkdir(parents=True)
    return d


def test_reads_burrow_dir_by_default(cwd: Path) -> None:
    burrow = cwd / ".ratel" / "burrow"
    (burrow / "traces").mkdir(parents=True)
    (burrow / "traces" / "s.jsonl").write_text("{}\n")
    (burrow / "traces" / "notes.txt").write_text("")
    (burrow / "intent-graph.json").write_text("{}")
    (burrow / "catalog-snapshot.json").write_text("{}")

    sources = discover_sources(cwd=cwd)
    assert [(s.kind, s.label) for s in sources] == [
        ("trace", ".ratel/burrow/traces/s.jsonl"),
        ("intent_graph", ".ratel/burrow/intent-graph.json"),
        ("catalog_snapshot", ".ratel/burrow/catalog-snapshot.json"),
    ]
    assert len({s.id for s in sources}) == 3
    assert sources[0].size == 3


def test_explicit_paths_replace_default(cwd: Path, tmp_path: Path) -> None:
    (cwd / ".ratel" / "burrow" / "traces").mkdir(parents=True)
    (cwd / ".ratel" / "burrow" / "traces" / "ignored.jsonl").write_text("")
    trace_dir = tmp_path / "t"
    trace_dir.mkdir()
    (trace_dir / "one.jsonl").write_text("")
    (trace_dir / "notes.txt").write_text("")
    graph = tmp_path / "g.json"
    graph.write_text("{}")
    sources = discover_sources(cwd=cwd, traces=[str(trace_dir)], intent_graphs=[str(graph)])
    assert [(s.kind, s.path) for s in sources] == [
        ("trace", str(trace_dir / "one.jsonl")),
        ("intent_graph", str(graph)),
    ]


def test_other_burrow_dirs(cwd: Path, tmp_path: Path) -> None:
    other = tmp_path / "other"
    (other / "traces").mkdir(parents=True)
    (other / "traces" / "a.jsonl").write_text("")
    assert [s.path for s in discover_sources(cwd=cwd, dirs=[str(other)])] == [
        str(other / "traces" / "a.jsonl")
    ]


def test_nothing_found_is_empty(cwd: Path) -> None:
    assert discover_sources(cwd=cwd) == []
