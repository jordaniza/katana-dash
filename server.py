#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sqlite3
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
DB_PATH = DATA_DIR / "katana_stats.db"
RPC_URL = "https://rpc.katanarpc.com"
REFRESH_INTERVAL_MS = 15_000
EXPECTED_CHAIN_ID = 747474
SCAN_BASE_URL = "https://katanascan.com/address/"
LOG_CHUNK_SIZE = 2_000_000
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

CONTRACTS = {
    "votingEscrow": "0x4d6fC15Ca6258b168225D283262743C623c13Ead",
    "lockNft": "0x106F7D67Ea25Cb9eFf5064CF604ebf6259Ff296d",
    "vault": "0x7231dbaCdFc968E07656D12389AB20De82FbfCeB",
    "exitQueue": "0x6dE9cAAb658C744aD337Ca5d92D084c97ffF578d",
}

SELECTORS = {
    "totalLocked": "0x56891412",
    "lockNFT": "0xbee26609",
    "totalSupply": "0x18160ddd",
    "totalAssets": "0x01e1d114",
    "masterTokenId": "0x24e6f15a",
    "strategy": "0xa8c62e76",
    "decimals": "0x313ce567",
    "token": "0xfc0c546a",
    "balanceOf": "0x70a08231",
    "currentExitingAmount": "0xbbd25c16",
    "ticketHolder": "0xafacc3a8",
}

TOPICS = {
    "vkatCreateLock": "0x7162984403f6c73c8639375d45a9187dfd04602231bd8e587c415718b5f7e5f9",
    "avkatDeposit": "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7",
    "exit": "0xc169549703555b9f5b8566740640a87ab6e0846b684e995beb625427c8d417c6",
    "transfer": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
}

DB_LOCK = threading.Lock()


def main() -> None:
    parser = argparse.ArgumentParser(description="Katana dashboard server with SQLite-backed snapshots.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind the local server to.")
    parser.add_argument("--port", type=int, default=8787, help="Port to bind the local server to.")
    parser.add_argument(
        "--refresh-once",
        action="store_true",
        help="Fetch the latest snapshot from Katana RPC, write it to SQLite, print it, then exit.",
    )
    args = parser.parse_args()

    initialize_db()

    if args.refresh_once:
        payload = get_stats_payload(force_refresh=True)
        print(json.dumps(payload, indent=2))
        return

    server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
    print(f"Serving Katana dashboard on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/stats":
            params = urllib.parse.parse_qs(parsed.query)
            force_refresh = params.get("refresh") == ["1"]
            self.respond_json(get_stats_payload(force_refresh=force_refresh))
            return

        if parsed.path == "/api/history":
            params = urllib.parse.parse_qs(parsed.query)
            limit = clamp_limit(params.get("limit", ["20"])[0])
            self.respond_json({"snapshots": read_snapshot_history(limit)})
            return

        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/refresh":
            self.respond_json(get_stats_payload(force_refresh=True))
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Unknown API endpoint")

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def respond_json(self, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def clamp_limit(raw_limit: str) -> int:
    try:
        limit = int(raw_limit)
    except ValueError:
        return 20

    return max(1, min(limit, 200))


def initialize_db() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recorded_at TEXT NOT NULL,
                chain_id INTEGER NOT NULL,
                block_number INTEGER NOT NULL,
                decimals INTEGER NOT NULL,
                total_locked TEXT NOT NULL,
                active_nfts INTEGER NOT NULL,
                avkat_supply TEXT NOT NULL,
                vault_assets TEXT NOT NULL,
                current_exiting_amount TEXT NOT NULL DEFAULT '0',
                exit_queue_fee_balance TEXT NOT NULL DEFAULT '0',
                vkat_create_lock_count INTEGER NOT NULL DEFAULT 0,
                avkat_deposit_count INTEGER NOT NULL DEFAULT 0,
                exit_fee_total TEXT NOT NULL DEFAULT '0',
                queued_token_ids INTEGER NOT NULL DEFAULT 0,
                unique_holder_count INTEGER NOT NULL DEFAULT 0,
                master_token_id INTEGER NOT NULL,
                strategy_address TEXT NOT NULL,
                kat_token_address TEXT NOT NULL,
                lock_nft_address TEXT NOT NULL
            )
            """
        )
        ensure_snapshot_column(connection, "current_exiting_amount", "TEXT NOT NULL DEFAULT '0'")
        ensure_snapshot_column(connection, "exit_queue_fee_balance", "TEXT NOT NULL DEFAULT '0'")
        ensure_snapshot_column(connection, "vkat_create_lock_count", "INTEGER NOT NULL DEFAULT 0")
        ensure_snapshot_column(connection, "avkat_deposit_count", "INTEGER NOT NULL DEFAULT 0")
        ensure_snapshot_column(connection, "exit_fee_total", "TEXT NOT NULL DEFAULT '0'")
        ensure_snapshot_column(connection, "queued_token_ids", "INTEGER NOT NULL DEFAULT 0")
        ensure_snapshot_column(connection, "unique_holder_count", "INTEGER NOT NULL DEFAULT 0")
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_snapshots_recorded_at ON snapshots(recorded_at DESC)"
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sync_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                last_synced_block INTEGER NOT NULL,
                vkat_create_lock_count INTEGER NOT NULL,
                avkat_deposit_count INTEGER NOT NULL,
                exit_fee_total TEXT NOT NULL DEFAULT '0'
            )
            """
        )
        sync_exit_fee_added = ensure_table_column(connection, "sync_state", "exit_fee_total", "TEXT NOT NULL DEFAULT '0'")
        connection.execute(
            """
            INSERT INTO sync_state (id, last_synced_block, vkat_create_lock_count, avkat_deposit_count, exit_fee_total)
            VALUES (1, -1, 0, 0, '0')
            ON CONFLICT(id) DO NOTHING
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS lock_nft_owners (
                token_id INTEGER PRIMARY KEY,
                owner_address TEXT NOT NULL
            )
            """
        )

        owner_count_row = connection.execute("SELECT COUNT(*) FROM lock_nft_owners").fetchone()
        sync_state_row = connection.execute(
            "SELECT last_synced_block FROM sync_state WHERE id = 1"
        ).fetchone()
        owner_count = int(owner_count_row[0]) if owner_count_row is not None else 0
        last_synced_block = int(sync_state_row[0]) if sync_state_row is not None else -1

        if sync_exit_fee_added or (owner_count == 0 and last_synced_block >= 0):
            connection.execute(
                """
                UPDATE sync_state
                SET last_synced_block = -1, vkat_create_lock_count = 0, avkat_deposit_count = 0, exit_fee_total = '0'
                WHERE id = 1
                """
            )
        connection.commit()


def ensure_snapshot_column(connection: sqlite3.Connection, name: str, definition: str) -> None:
    ensure_table_column(connection, "snapshots", name, definition)


def ensure_table_column(
    connection: sqlite3.Connection,
    table_name: str,
    column_name: str,
    definition: str,
) -> bool:
    try:
        connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")
    except sqlite3.OperationalError as error:
        if "duplicate column name" not in str(error).lower():
            raise
        return False
    return True


def get_stats_payload(force_refresh: bool) -> dict[str, Any]:
    with DB_LOCK:
        latest_snapshot = read_latest_snapshot()
        refreshed_from_rpc = False

        if force_refresh or latest_snapshot is None or snapshot_is_stale(latest_snapshot["recorded_at"]):
            snapshot = fetch_latest_snapshot()
            snapshot.update(sync_chain_state(snapshot["block_number"]))
            snapshot.update(compute_holder_metrics())
            write_snapshot(snapshot)
            latest_snapshot = snapshot
            refreshed_from_rpc = True

        if latest_snapshot is None:
            raise RuntimeError("No snapshot available")

        return {
            "snapshot": enrich_snapshot(latest_snapshot),
            "meta": {
                "dbPath": str(DB_PATH.relative_to(APP_DIR)),
                "refreshedFromRpc": refreshed_from_rpc,
                "refreshIntervalMs": REFRESH_INTERVAL_MS,
                "historyCount": count_snapshots(),
                "scanBaseUrl": SCAN_BASE_URL,
            },
        }


def snapshot_is_stale(recorded_at: str) -> bool:
    recorded_ts = datetime.fromisoformat(recorded_at.replace("Z", "+00:00")).timestamp()
    return (time.time() - recorded_ts) * 1000 >= REFRESH_INTERVAL_MS


def fetch_latest_snapshot() -> dict[str, Any]:
    responses = rpc_batch(
        [
            {"method": "eth_chainId", "params": []},
            {"method": "eth_blockNumber", "params": []},
            eth_call(CONTRACTS["votingEscrow"], SELECTORS["totalLocked"]),
            eth_call(CONTRACTS["votingEscrow"], SELECTORS["lockNFT"]),
            eth_call(CONTRACTS["lockNft"], SELECTORS["totalSupply"]),
            eth_call(CONTRACTS["vault"], SELECTORS["totalSupply"]),
            eth_call(CONTRACTS["vault"], SELECTORS["totalAssets"]),
            eth_call(CONTRACTS["vault"], SELECTORS["masterTokenId"]),
            eth_call(CONTRACTS["vault"], SELECTORS["strategy"]),
            eth_call(CONTRACTS["vault"], SELECTORS["decimals"]),
            eth_call(CONTRACTS["votingEscrow"], SELECTORS["token"]),
            eth_call(CONTRACTS["votingEscrow"], SELECTORS["currentExitingAmount"]),
        ]
    )
    kat_token_address = hex_to_address(responses[10])
    exit_queue_balance = rpc_batch(
        [eth_call_address(kat_token_address, SELECTORS["balanceOf"], CONTRACTS["exitQueue"])]
    )[0]

    return {
        "recorded_at": utc_now_iso(),
        "chain_id": hex_to_int(responses[0]),
        "block_number": hex_to_int(responses[1]),
        "decimals": hex_to_int(responses[9]),
        "total_locked": str(hex_to_int(responses[2])),
        "active_nfts": hex_to_int(responses[4]),
        "avkat_supply": str(hex_to_int(responses[5])),
        "vault_assets": str(hex_to_int(responses[6])),
        "current_exiting_amount": str(hex_to_int(responses[11])),
        "exit_queue_fee_balance": str(hex_to_int(exit_queue_balance)),
        "master_token_id": hex_to_int(responses[7]),
        "strategy_address": hex_to_address(responses[8]),
        "kat_token_address": kat_token_address,
        "lock_nft_address": hex_to_address(responses[3]),
    }


def rpc_batch(requests: list[dict[str, Any]]) -> list[str]:
    payload = json.dumps(
        [{"jsonrpc": "2.0", "id": index + 1, **request} for index, request in enumerate(requests)]
    ).encode("utf-8")
    request = urllib.request.Request(
        RPC_URL,
        data=payload,
        headers={
            "content-type": "application/json",
            "origin": "http://127.0.0.1:8787",
            "user-agent": "Mozilla/5.0 (compatible; KatanaDash/1.0; +https://katanascan.com/)",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=20) as response:
        raw_payload = response.read()

    decoded = json.loads(raw_payload)
    if not isinstance(decoded, list):
        raise RuntimeError("RPC batch response was not a list")

    ordered = sorted(decoded, key=lambda item: item["id"])
    rpc_error = next((item["error"] for item in ordered if "error" in item), None)
    if rpc_error is not None:
        raise RuntimeError(rpc_error.get("message", "RPC call failed"))

    return [item["result"] for item in ordered]


def eth_call(to: str, data: str) -> dict[str, Any]:
    return {"method": "eth_call", "params": [{"to": to, "data": data}, "latest"]}


def eth_call_uint256(to: str, selector: str, value: int) -> dict[str, Any]:
    encoded_value = hex(value)[2:].rjust(64, "0")
    return eth_call(to, f"{selector}{encoded_value}")


def eth_call_address(to: str, selector: str, address: str) -> dict[str, Any]:
    encoded_address = address.lower().removeprefix("0x").rjust(64, "0")
    return eth_call(to, f"{selector}{encoded_address}")


def get_logs(address: str, topic: str, from_block: int, to_block: int) -> dict[str, Any]:
    return {
        "method": "eth_getLogs",
        "params": [
            {
                "fromBlock": hex(from_block),
                "toBlock": hex(to_block),
                "address": address,
                "topics": [topic],
            }
        ],
    }


def hex_to_int(value: str) -> int:
    return int(value, 16)


def hex_to_address(value: str) -> str:
    return "0x" + value[-40:]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_snapshot(snapshot: dict[str, Any]) -> None:
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            INSERT INTO snapshots (
                recorded_at,
                chain_id,
                block_number,
                decimals,
                total_locked,
                active_nfts,
                avkat_supply,
                vault_assets,
                current_exiting_amount,
                exit_queue_fee_balance,
                vkat_create_lock_count,
                avkat_deposit_count,
                exit_fee_total,
                queued_token_ids,
                unique_holder_count,
                master_token_id,
                strategy_address,
                kat_token_address,
                lock_nft_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot["recorded_at"],
                snapshot["chain_id"],
                snapshot["block_number"],
                snapshot["decimals"],
                snapshot["total_locked"],
                snapshot["active_nfts"],
                snapshot["avkat_supply"],
                snapshot["vault_assets"],
                snapshot["current_exiting_amount"],
                snapshot["exit_queue_fee_balance"],
                snapshot["vkat_create_lock_count"],
                snapshot["avkat_deposit_count"],
                snapshot["exit_fee_total"],
                snapshot["queued_token_ids"],
                snapshot["unique_holder_count"],
                snapshot["master_token_id"],
                snapshot["strategy_address"],
                snapshot["kat_token_address"],
                snapshot["lock_nft_address"],
            ),
        )
        connection.commit()


def read_latest_snapshot() -> dict[str, Any] | None:
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute(
            """
            SELECT
                recorded_at,
                chain_id,
                block_number,
                decimals,
                total_locked,
                active_nfts,
                avkat_supply,
                vault_assets,
                current_exiting_amount,
                exit_queue_fee_balance,
                vkat_create_lock_count,
                avkat_deposit_count,
                exit_fee_total,
                queued_token_ids,
                unique_holder_count,
                master_token_id,
                strategy_address,
                kat_token_address,
                lock_nft_address
            FROM snapshots
            ORDER BY id DESC
            LIMIT 1
            """
        ).fetchone()

    return dict(row) if row is not None else None


def read_snapshot_history(limit: int) -> list[dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT
                recorded_at,
                chain_id,
                block_number,
                decimals,
                total_locked,
                active_nfts,
                avkat_supply,
                vault_assets,
                current_exiting_amount,
                exit_queue_fee_balance,
                vkat_create_lock_count,
                avkat_deposit_count,
                exit_fee_total,
                queued_token_ids,
                unique_holder_count,
                master_token_id,
                strategy_address,
                kat_token_address,
                lock_nft_address
            FROM snapshots
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [enrich_snapshot(dict(row)) for row in rows]


def count_snapshots() -> int:
    with sqlite3.connect(DB_PATH) as connection:
        row = connection.execute("SELECT COUNT(*) FROM snapshots").fetchone()

    return int(row[0]) if row is not None else 0


def read_sync_state() -> dict[str, Any]:
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute(
            """
            SELECT last_synced_block, vkat_create_lock_count, avkat_deposit_count, exit_fee_total
            FROM sync_state
            WHERE id = 1
            """
        ).fetchone()

    if row is None:
        return {
            "last_synced_block": -1,
            "vkat_create_lock_count": 0,
            "avkat_deposit_count": 0,
            "exit_fee_total": "0",
        }

    return dict(row)


def write_sync_state(state: dict[str, Any]) -> None:
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            UPDATE sync_state
            SET last_synced_block = ?, vkat_create_lock_count = ?, avkat_deposit_count = ?, exit_fee_total = ?
            WHERE id = 1
            """,
            (
                state["last_synced_block"],
                state["vkat_create_lock_count"],
                state["avkat_deposit_count"],
                state["exit_fee_total"],
            ),
        )
        connection.commit()


def sync_chain_state(target_block: int) -> dict[str, Any]:
    state = read_sync_state()
    exit_fee_total = int(state["exit_fee_total"])

    if exit_fee_total == 0 and state["last_synced_block"] >= 0:
        exit_fee_total = backfill_exit_fees(state["last_synced_block"])
        state["exit_fee_total"] = str(exit_fee_total)
        write_sync_state(state)

    if state["last_synced_block"] >= target_block:
        return {
            "vkat_create_lock_count": state["vkat_create_lock_count"],
            "avkat_deposit_count": state["avkat_deposit_count"],
            "exit_fee_total": state["exit_fee_total"],
        }

    next_block = max(state["last_synced_block"] + 1, 0)

    while next_block <= target_block:
        end_block = min(next_block + LOG_CHUNK_SIZE - 1, target_block)
        responses = rpc_batch(
            [
                get_logs(CONTRACTS["votingEscrow"], TOPICS["vkatCreateLock"], next_block, end_block),
                get_logs(CONTRACTS["vault"], TOPICS["avkatDeposit"], next_block, end_block),
                get_logs(CONTRACTS["exitQueue"], TOPICS["exit"], next_block, end_block),
                get_logs(CONTRACTS["lockNft"], TOPICS["transfer"], next_block, end_block),
            ]
        )

        state["vkat_create_lock_count"] += len(responses[0])
        state["avkat_deposit_count"] += len(responses[1])
        exit_fee_total += sum_exit_fees(responses[2])
        apply_lock_transfer_logs(responses[3])
        next_block = end_block + 1

    state["last_synced_block"] = target_block
    state["exit_fee_total"] = str(exit_fee_total)
    write_sync_state(state)

    return {
        "vkat_create_lock_count": state["vkat_create_lock_count"],
        "avkat_deposit_count": state["avkat_deposit_count"],
        "exit_fee_total": state["exit_fee_total"],
    }


def apply_lock_transfer_logs(logs: list[dict[str, Any]]) -> None:
    if not logs:
        return

    with sqlite3.connect(DB_PATH) as connection:
        for entry in logs:
            topics = entry.get("topics", [])
            if len(topics) < 4:
                continue

            token_id = hex_to_int(topics[3])
            owner_address = hex_to_address(topics[2]).lower()

            if owner_address == ZERO_ADDRESS:
                connection.execute("DELETE FROM lock_nft_owners WHERE token_id = ?", (token_id,))
                continue

            connection.execute(
                """
                INSERT INTO lock_nft_owners (token_id, owner_address)
                VALUES (?, ?)
                ON CONFLICT(token_id) DO UPDATE SET owner_address = excluded.owner_address
                """,
                (token_id, owner_address),
            )

        connection.commit()


def sum_exit_fees(logs: list[dict[str, Any]]) -> int:
    return sum(hex_to_int(entry["data"]) for entry in logs if entry.get("data") not in (None, "0x"))


def backfill_exit_fees(target_block: int) -> int:
    total = 0
    next_block = 0

    while next_block <= target_block:
        end_block = min(next_block + LOG_CHUNK_SIZE - 1, target_block)
        response = rpc_batch([get_logs(CONTRACTS["exitQueue"], TOPICS["exit"], next_block, end_block)])
        total += sum_exit_fees(response[0])
        next_block = end_block + 1

    return total


def compute_holder_metrics() -> dict[str, int]:
    with sqlite3.connect(DB_PATH) as connection:
        rows = connection.execute(
            "SELECT token_id, owner_address FROM lock_nft_owners ORDER BY token_id ASC"
        ).fetchall()

    queue_holder_address = CONTRACTS["votingEscrow"].lower()
    queued_token_ids = [
        int(token_id)
        for token_id, owner_address in rows
        if owner_address.lower() == queue_holder_address
    ]
    queue_wallets = fetch_ticket_holders(queued_token_ids) if queued_token_ids else set()

    return {
        "queued_token_ids": len(queued_token_ids),
        "unique_holder_count": len(queue_wallets),
    }


def fetch_ticket_holders(token_ids: list[int]) -> set[str]:
    responses = rpc_batch(
        [
            eth_call_uint256(CONTRACTS["exitQueue"], SELECTORS["ticketHolder"], token_id)
            for token_id in token_ids
        ]
    )
    return {hex_to_address(result).lower() for result in responses if hex_to_address(result) != ZERO_ADDRESS}


def enrich_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    total_locked = int(snapshot["total_locked"])
    vault_assets = int(snapshot["vault_assets"])
    avkat_supply = int(snapshot["avkat_supply"])
    current_exiting_amount = int(snapshot["current_exiting_amount"])
    external_locked = max(total_locked - vault_assets, 0)

    return {
        "recordedAt": snapshot["recorded_at"],
        "chainId": snapshot["chain_id"],
        "blockNumber": snapshot["block_number"],
        "decimals": snapshot["decimals"],
        "totalLocked": snapshot["total_locked"],
        "activeNfts": snapshot["active_nfts"],
        "avKatSupply": snapshot["avkat_supply"],
        "vaultAssets": snapshot["vault_assets"],
        "currentExitingAmount": snapshot["current_exiting_amount"],
        "exitQueueFeeBalance": snapshot["exit_queue_fee_balance"],
        "externalLocked": str(external_locked),
        "sharePrice": format_ratio(vault_assets, avkat_supply, 6) if avkat_supply > 0 else None,
        "vkatCreateLockCount": snapshot["vkat_create_lock_count"],
        "avkatDepositCount": snapshot["avkat_deposit_count"],
        "exitFeesCollected": snapshot["exit_fee_total"],
        "queuedTokenIds": snapshot["queued_token_ids"],
        "uniqueHolderCount": snapshot["unique_holder_count"],
        "masterTokenId": snapshot["master_token_id"],
        "strategyAddress": snapshot["strategy_address"],
        "katTokenAddress": snapshot["kat_token_address"],
        "lockNftAddress": snapshot["lock_nft_address"],
        "integrityOk": snapshot["lock_nft_address"].lower() == CONTRACTS["lockNft"].lower(),
        "exitQueueIsActive": current_exiting_amount > 0,
    }


def format_ratio(numerator: int, denominator: int, precision: int) -> str:
    scale = 10**precision
    scaled = numerator * scale // denominator
    whole = scaled // scale
    fraction = str(scaled % scale).zfill(precision).rstrip("0")
    return f"{whole}.{fraction}" if fraction else str(whole)


if __name__ == "__main__":
    main()
