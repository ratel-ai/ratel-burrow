from ratel_burrow.cli import parse_args


def test_defaults() -> None:
    a = parse_args([])
    assert (a.dirs, a.traces, a.intent_graphs, a.catalogs) == ([], [], [], [])
    assert (a.open, a.port) == (True, 0)


def test_repeated_flags() -> None:
    a = parse_args(
        [
            "--trace",
            "a.jsonl",
            "--trace",
            "logs/",
            "--intent-graph",
            "g.json",
            "--catalog",
            "c.json",
            "--dir",
            "d",
            "--no-open",
            "--port",
            "4377",
        ]
    )
    assert a.traces == ["a.jsonl", "logs/"] and a.intent_graphs == ["g.json"]
    assert a.catalogs == ["c.json"] and a.dirs == ["d"]
    assert (a.open, a.port) == (False, 4377)
