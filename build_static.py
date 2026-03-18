#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import server


STATIC_DIR = server.APP_DIR / "static"
DEFAULT_OUTPUT = STATIC_DIR / "data" / "dashboard.json"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build the static Katana dashboard data bundle from the local SQLite cache."
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="Path to write the exported JSON bundle to.",
    )
    parser.add_argument(
        "--history-limit",
        type=int,
        default=240,
        help="Maximum number of historical snapshots to include in the static bundle.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Fetch a fresh on-chain snapshot before exporting the static bundle.",
    )
    args = parser.parse_args()

    server.initialize_db()
    payload = server.get_stats_payload(force_refresh=args.refresh)
    history = normalize_history(payload["snapshot"], server.read_snapshot_history(args.history_limit), args.history_limit)

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        data_path = str(output_path.relative_to(STATIC_DIR.resolve()))
    except ValueError:
        data_path = str(output_path)

    export_payload = {
        "snapshot": payload["snapshot"],
        "history": history,
        "meta": {
            **payload["meta"],
            "builtAt": server.utc_now_iso(),
            "buildMode": "static-export",
            "dataPath": data_path,
            "historyCount": len(history),
        },
    }

    output_path.write_text(json.dumps(export_payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote static dashboard bundle to {output_path}")


def normalize_history(
    latest_snapshot: dict[str, Any],
    history_snapshots: list[dict[str, Any]],
    limit: int,
) -> list[dict[str, Any]]:
    deduped: dict[tuple[str, int], dict[str, Any]] = {}

    for snapshot in [latest_snapshot, *history_snapshots]:
        deduped[(snapshot["recordedAt"], int(snapshot["blockNumber"]))] = snapshot

    ordered = sorted(
        deduped.values(),
        key=lambda snapshot: (snapshot["recordedAt"], int(snapshot["blockNumber"])),
    )
    return ordered[-limit:]


if __name__ == "__main__":
    main()
