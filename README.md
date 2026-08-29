# SharkTank

SharkTank is a self-contained realtime multiplayer workload and governed
production-system case study. It contains the Cloudflare Worker host, authoritative
Durable Object rooms, WebSockets, public APIs and operational evidence, the React
Three Fiber client and deterministic engine, and an optional PHP protocol-parity
runtime. The deployed product remains at
[sharktank.wizardgang.ai](https://sharktank.wizardgang.ai).

The public history is reconstructed from the private legacy implementation and does
not pretend reconstructed commits were the original commits. Former private module
dependencies are normal tracked files, so a public clone contains all product code.

See [`docs/RECONSTRUCTION.md`](docs/RECONSTRUCTION.md) for the method and
[`docs/history/CHANGE-MAP.csv`](docs/history/CHANGE-MAP.csv) for provenance.

## Validate

```bash
npm ci
npm run verify
```

This runs strict TypeScript checks, unit tests, the PHP cross-runtime replay proof,
the production build, and the dependency audit. Node.js 24 and PHP 8.2 or newer are
recommended.

## Local development

Start the Worker with ignored local credentials:

```bash
npm run dev
```

Then verify all evidence-bearing routes:

```bash
npm run check:evidence -- http://127.0.0.1:8787
```

## Production

The production environment is historically named `wizardgangprod`. Its name and
Durable Object migration identities remain stable because changing them would create
new state namespaces rather than migrate the existing product. Release v1.0.1 was
deployed from this public repository on 2026-08-28 and verified at the canonical
origin. Future production automation remains exact-tag-only and protected. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) and
[`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md).

## Layout

- `src/worker/index.ts` — Worker routes and blob-store API.
- `src/worker/room-do.ts` — authoritative room simulation and WebSocket sessions.
- `src/worker/lobby-do.ts` — durable presence, profiles, leaderboard, and usage.
- `src/client/main.tsx` — React client entry.
- `vendor/ModuleReact3Fiber` — ordinary tracked first-party engine/client source.
- `packages/php-runtime` — optional PHP protocol-parity proof.
- `scripts/local.mjs` — one-command local loop.
- `wrangler.jsonc` — Worker and static-asset configuration.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components and state boundaries.
- [`docs/SECURITY-MODEL.md`](docs/SECURITY-MODEL.md) — assets, trust boundaries, and limitations.
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) and [`docs/CONTINUITY.md`](docs/CONTINUITY.md) — operating and recovering the service.
- [`docs/RELEASE-MANAGEMENT.md`](docs/RELEASE-MANAGEMENT.md) and [`docs/CHANGE-MANAGEMENT.md`](docs/CHANGE-MANAGEMENT.md) — controlled delivery.
- [`docs/AI-APPLICABILITY.md`](docs/AI-APPLICABILITY.md) — why the deterministic agents are in the AI readiness scope.
- [`docs/PARITY.md`](docs/PARITY.md) and [`docs/history/LEGACY-INVENTORY.md`](docs/history/LEGACY-INVENTORY.md) — migration verification and scope.
