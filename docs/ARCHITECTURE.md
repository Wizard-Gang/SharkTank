# Architecture

SharkTank is one Cloudflare Worker deployment with a static React client, a routing and governance Worker, two Durable Object classes, and one R2 binding. The repository also carries an optional PHP protocol-parity runtime; it is not required to build or operate the TypeScript deployment.

```text
browser ── HTTPS ──> Worker router ──> Lobby Durable Object
   │                    │             profiles, presence, logs,
   │                    │             receipts, spend, backups
   │                    ├───────────> Room Durable Objects
   └── WebSocket ───────┘             authoritative simulation
                        │
                        ├───────────> static Vite assets
                        └───────────> R2 state copies
```

The Worker serves the game under `/play/`, public APIs under `/api/`, public assurance surfaces under `/trust/`, `/status/`, `/spend/`, `/logs/`, `/audit/`, and `/policies/`, and authenticated operations under `/admin/`. WebSockets at `/room/:id/ws` terminate in a room object. The Lobby object is addressed by the stable name `global`; room objects use stable room identifiers.

`vendor/ModuleReact3Fiber` is first-party source, not a downloaded or private git dependency. Both the Worker and client import its deterministic engine and protocol. `packages/php-runtime` independently reproduces the seed and replay contract as an optional cross-language proof.

The production Durable Object names, migration tag, environment name, and storage bindings are intentionally stable. Changing them is a state migration, not a rename.
