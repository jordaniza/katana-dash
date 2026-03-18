# Katana KAT Launch Dashboard

Static dashboard for live Katana mainnet launch metrics with a local SQLite cache.

## Metrics

- `Total KAT in escrow`: `VotingEscrow.totalLocked()`
- `Active vKAT NFTs`: `Lock.totalSupply()`
- `avKAT minted`: `AvKATVault.totalSupply()`

Supporting context is also shown from:

- `AvKATVault.totalAssets()`
- `AvKATVault.masterTokenId()`
- `AvKATVault.strategy()`
- cumulative exit fees from `DynamicExitQueue.Exit(tokenId, fee)` logs
- current unwithdrawn exit fees from `KAT.balanceOf(exitQueue)`
- `VotingEscrow.token()`
- `VotingEscrow.lockNFT()`
- `VotingEscrow.currentExitingAmount()`
- current queued tokenId count
- current unique holder count

The dashboard also stores cumulative counters for:

- vKAT create-lock events
- avKAT deposit events
- exit fees collected

## Run

Run the bundled server so the UI can read and write cached snapshots in SQLite:

```bash
cd /home/jordan/Documents/dev/crypto/aragon/katana-dash
python3 server.py --port 8787
```

Then open `http://127.0.0.1:8787`.

To fetch once from Katana RPC, write the latest snapshot into SQLite, and print the payload:

```bash
python3 server.py --refresh-once
```

## Static Build

Build a separate static deployment target under `static/`:

```bash
cd /home/jordan/Documents/dev/crypto/aragon/katana-dash
python3 build_static.py --refresh
```

That writes `static/data/dashboard.json`, which the static site reads directly.

To preview the static bundle locally:

```bash
cd /home/jordan/Documents/dev/crypto/aragon/katana-dash/static
python3 -m http.server 8787
```

Then open `http://127.0.0.1:8787`.

## Notes

- No build step and no third-party dependencies.
- Refresh interval is 15 seconds.
- RPC endpoint: `https://rpc.katanarpc.com`
- SQLite database path: `data/katana_stats.db`
- Event counters are synced incrementally from chain logs and cached locally.
- The static site can be deployed by publishing the `static/` directory to any static host.
