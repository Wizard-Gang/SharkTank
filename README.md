# SharkTank

SharkTank is a realtime multiplayer game backed by authoritative Cloudflare Durable Objects. The same deployment publishes its operational status, controls, incidents, logs, recovery records, and spend limits.

**[Overview](https://sharktank.wizardgang.ai)** · **[Play](https://sharktank.wizardgang.ai/play/)** · **[Evidence](https://sharktank.wizardgang.ai/evidence/)**

## Run locally

```bash
npm ci
npm run dev
```

The Worker and browser client run locally on port 8787. The optional PHP runtime is managed with the `php:*` scripts in `package.json`.

## Verify

```bash
npm run verify
```

This runs TypeScript checks, unit tests, the PHP replay check, the production build, and the dependency audit.

## Structure

- `src/worker/` contains routes, Durable Objects, controls, and public evidence.
- `src/client/` contains the browser entry.
- `vendor/ModuleReact3Fiber/` contains the game client and deterministic engine.
- `packages/php-runtime/` contains the optional protocol-parity runtime.
- `scripts/` contains local, verification, and release commands.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY-MODEL.md)
- [Operations](docs/OPERATIONS.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Release management](docs/RELEASE-MANAGEMENT.md)

## Deployment

Production releases are deployed from exact semantic-version tags. The deploy script verifies the tag, runs the build, and records the release and current Git commit metrics.
