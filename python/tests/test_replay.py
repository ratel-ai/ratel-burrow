from pathlib import Path

import pytest

from ratel_burrow.replay import boost_turn_key, compute_replay, load_sdk

TRACE = (Path(__file__).parent / "replay.jsonl").read_text()
sdk = load_sdk()
needs_sdk = pytest.mark.skipif(sdk is None, reason="ratel-ai is not installed")


def test_turn_key_matches_the_model() -> None:
    assert boost_turn_key({"event_id": "E1", "session_id": "s", "ts": 5, "query": "q"}) == "E1"
    assert boost_turn_key({"session_id": "s", "ts": 5, "query": "q"}) == "s|5|q"


@needs_sdk
def test_ranks_every_tool_search_plain_and_boosted() -> None:
    replay = compute_replay([TRACE], None, sdk)
    assert "error" not in replay
    assert (replay["v"], replay["method"], replay["k"]) == (1, "bm25", 5)
    turns = replay["turns"]
    assert len(turns) == 7 and turns[0]["key"] == "E005"


@needs_sdk
def test_boosts_only_from_turns_learned_before_the_search() -> None:
    turns = compute_replay([TRACE], None, sdk)["turns"]
    first, last = turns[0], turns[5]
    assert first["boosted_ids"] == first["plain_ids"] and first["matched"] is False
    assert "stripe_refund" not in first["plain_ids"]
    assert last["matched"] is True and "stripe_refund" in last["boosted_ids"]
    assert last["plain_ids"] == first["plain_ids"]


@needs_sdk
def test_passes_reported_turns_through() -> None:
    turn = compute_replay([TRACE], None, sdk)["turns"][-1]
    assert turn["reported"] is True
    assert turn["plain_ids"] == ["email_send", "stripe_refund"]
    assert turn["boosted_ids"] == ["stripe_refund"]


@needs_sdk
def test_learns_one_graph_per_project() -> None:
    import re

    other = [
        re.sub(
            r'"event_id": ?"E',
            '"event_id":"O',
            re.sub(r'"source_id": ?"t"', '"source_id":"other"', line),
        )
        for line in TRACE.splitlines()
        if "catalog_definition" in line
    ]
    other.append(
        '{"v":2,"event_id":"O900","ts":1790000009000,"session_id":"s2","source_id":"other",'
        '"turn_id":"x1","type":"search","query":"give the customer their money back",'
        '"origin":"agent","top_k":5,"hits":[],"stages":[],"took_ms":1}'
    )
    turns = compute_replay([TRACE, "\n".join(other)], None, sdk)["turns"]
    from_other = next(t for t in turns if t["key"] == "O900")
    assert from_other["matched"] is False
    assert from_other["boosted_ids"] == from_other["plain_ids"]


@needs_sdk
def test_needs_tool_definitions() -> None:
    no_defs = "\n".join(line for line in TRACE.splitlines() if "catalog_definition" not in line)
    assert "definitions" in compute_replay([no_defs], None, sdk)["error"]
