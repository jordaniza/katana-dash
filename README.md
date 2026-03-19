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

## Vercel

Deploy the repository root on Vercel, not the `static/` directory.

- `vercel.json` runs `python3 build_static.py --refresh` during the build.
- Vercel then serves the generated `static/` directory as the deployment output.
- `/data/dashboard.json` is served with `Cache-Control: no-store, max-age=0` so the browser and CDN revalidate the exported bundle.

This keeps the static deployment fresh on every new deployment, but it is still a static site. If you want the public Vercel site to refresh without a code push, you need a scheduled redeploy trigger such as a Vercel Deploy Hook, Vercel Cron-backed redeploy function, or CI job.

## Notes

- No third-party dependencies.
- Local previews can be served directly; Vercel production builds run `python3 build_static.py --refresh`.
- Refresh interval is 15 seconds.
- RPC endpoint: `https://rpc.katanarpc.com`
- SQLite database path: `data/katana_stats.db`
- Event counters are synced incrementally from chain logs and cached locally.
- The static site can be deployed by publishing the `static/` directory to any static host.
