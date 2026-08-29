# SharkTank

SharkTank is a realtime multiplayer workload and a governed production-system
case study. The deployed product remains at
[sharktank.wizardgang.ai](https://sharktank.wizardgang.ai).

At this point in the reconstructed history, the repository contains authoritative
realtime rooms, Durable Objects, WebSockets, public APIs and operational pages, the
React Three Fiber client, and an optional PHP protocol-parity runtime. Its public
history is reconstructed from the private legacy implementation and does not pretend
reconstructed commits were the original commits.

See [`docs/RECONSTRUCTION.md`](docs/RECONSTRUCTION.md) for the method and
[`docs/history/CHANGE-MAP.csv`](docs/history/CHANGE-MAP.csv) for provenance.

## Local development

```bash
npm run local
```

The loop clears prior local runtime state, builds the client, starts Wrangler on
port 8787, and opens the application. The same `wrangler.jsonc` remains deploy-valid.

## Validate this state

```bash
npm install
npm run typecheck
npm run build
```

No test suite exists at this point in the reconstructed history.

## Layout

- `src/worker/index.ts` — Worker routes and blob-store API.
- `src/worker/room-do.ts` — authoritative room simulation and WebSocket sessions.
- `src/worker/lobby-do.ts` — durable presence, profiles, leaderboard, and usage.
- `src/client/main.tsx` — React client entry.
- `vendor/ModuleReact3Fiber` — ordinary tracked first-party engine/client source.
- `packages/php-runtime` — optional PHP protocol-parity proof.
- `scripts/local.mjs` — one-command local loop.
- `wrangler.jsonc` — Worker and static-asset configuration.
