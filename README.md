# SharkTank

SharkTank is a realtime multiplayer game backed by authoritative Cloudflare Durable Objects. The same deployment publishes operational status, controls, incidents, logs, continuity evidence, and spend limits.

**[Overview](https://sharktank.wizardgang.ai)** · **[Play](https://sharktank.wizardgang.ai/play/)** · **[Evidence](https://sharktank.wizardgang.ai/evidence/)**

## Run locally

```bash
npm ci
npm run dev
```

The Worker and browser client run locally on port 8787. The optional PHP runtime is managed with the `php:*` scripts in `package.json`.

## Check

```bash
npm run check
```

`npm run check` is the complete credential-free repository acceptance gate.

## Repository map

- `src/worker/` — Worker routing, Durable Objects, controls, operations, and public evidence.
- `src/client/` — browser application entry and progressive enhancement.
- `vendor/ModuleReact3Fiber/` — first-party deterministic game engine and client source.
- `packages/php-runtime/` — optional cross-language protocol-parity runtime.
- `scripts/` — local development, verification, release, and deployment tooling.

## Current-state documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY-MODEL.md)
- [Operations](docs/OPERATIONS.md)
- [Continuity and recovery](docs/CONTINUITY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Release management](docs/RELEASE-MANAGEMENT.md)
- [Change management](docs/CHANGE-MANAGEMENT.md)
- [AI applicability](docs/AI-APPLICABILITY.md)
- [Runtime parity](docs/PARITY.md)
- [Security reporting](SECURITY.md)

These documents describe the current system and operating policy. Git/GitHub are authoritative for implementation and release history; provider evidence is authoritative for deployment/runtime provider state.
