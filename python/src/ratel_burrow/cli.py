"""`ratel-burrow` entry point. Mirrors packages/cli/src/bin.ts."""

from __future__ import annotations

import argparse
import os
import secrets
import signal
import sys
import webbrowser
from pathlib import Path

from . import __version__
from .discovery import Source, discover_sources
from .server import start_server

UI_DIR = Path(__file__).parent / "ui"

DESCRIPTION = """a read-only window into Ratel.

With no options, Burrow reads ratel-local's telemetry for this folder
(~/.ratel/telemetry/<project>/) and ./.ratel/burrow (see burrow_config()).
Any of --dir/--trace/--intent-graph/--catalog replaces the defaults.
Burrow binds 127.0.0.1 only and never writes anything."""


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="ratel-burrow",
        description=DESCRIPTION,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--dir",
        dest="dirs",
        action="append",
        default=[],
        metavar="PATH",
        help="a Burrow dir (traces/, intent-graph.json, catalog-snapshot.json)",
    )
    p.add_argument(
        "--trace",
        dest="traces",
        action="append",
        default=[],
        metavar="FILE|DIR",
        help="a Ratel JSONL trace file, or a dir of them",
    )
    p.add_argument(
        "--intent-graph",
        dest="intent_graphs",
        action="append",
        default=[],
        metavar="FILE",
        help="an intent graph saved by LocalFileIntentGraphStorage",
    )
    p.add_argument(
        "--catalog",
        dest="catalogs",
        action="append",
        default=[],
        metavar="FILE",
        help="a saved catalog.snapshot() JSON",
    )
    p.add_argument(
        "--all-projects",
        action="store_true",
        help="read every ratel-local project, not just this folder's",
    )
    p.add_argument("--port", type=int, default=0, help="bind this port (default: a free one)")
    p.add_argument(
        "--no-open",
        dest="open",
        action="store_false",
        help="print the URL without opening a browser",
    )
    p.add_argument("-v", "--version", action="version", version=__version__)
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    # The URL must show up even when stdout is piped to a file or another process.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if not (UI_DIR / "index.html").is_file():
        print("ratel-burrow: the UI bundle is missing from this install.", file=sys.stderr)
        return 1

    def discover() -> list[Source]:
        return discover_sources(
            cwd=Path.cwd(),
            home=Path.home(),
            env=os.environ,
            dirs=args.dirs,
            traces=args.traces,
            intent_graphs=args.intent_graphs,
            catalogs=args.catalogs,
            all_projects=args.all_projects,
        )

    token = secrets.token_urlsafe(24)
    try:
        server = start_server(discover=discover, ui_dir=UI_DIR, token=token, port=args.port)
    except OSError as err:
        print(f"ratel-burrow: could not bind port {args.port}: {err.strerror}", file=sys.stderr)
        return 1

    sources = discover()
    print(f"\n  Ratel Burrow {__version__} — read-only\n\n  {server.url}\n")
    if not sources:
        print("  No Ratel data found yet. Burrow looked in:")
        print("    ~/.ratel/telemetry/<this folder>/   (ratel-local)")
        print("    ./.ratel/burrow/                     (burrow_config() in your agent)")
        print("  It keeps looking; files that appear later show up on refresh.\n")
    else:

        def count(k: str) -> int:
            return sum(1 for s in sources if s.kind == k)

        print(
            f"  Found {count('trace')} trace file(s), {count('intent_graph')} intent graph(s), "
            f"{count('catalog_snapshot')} catalog snapshot(s).\n"
        )
    print("  Press Ctrl-C to stop.\n")
    if args.open:
        webbrowser.open(server.url)

    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
