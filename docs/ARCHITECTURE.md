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

The Worker has four canonical human destinations: the governance overview at `/`, the complete ISO/IEC 27001 and ISO/IEC 42001 control and policy record at `/controls/`, consolidated live operational evidence at `/evidence/`, and the governed workload at `/play/`. Former human destinations redirect directly to their owning section without redirect chains. Machine-readable evidence remains available at its stable JSON and text routes, public APIs live under `/api/`, and authenticated operations remain under `/admin/`. WebSockets at `/room/:id/ws` terminate in a room object. The Lobby object is addressed by the stable name `global`; room objects use stable room identifiers.

Accessibility is part of the application architecture. The server-rendered governance pages, menu, settings, and supported game controls use semantic structure, keyboard operation, visible focus, managed focus, alternative status output, configurable contrast and text scale, and reduced-motion support. The WCAG 2.0 AA target is scoped to those implemented interfaces rather than to every spatial visual interaction in the realtime game.

`vendor/ModuleReact3Fiber` is first-party source, not a downloaded or private git dependency. Both the Worker and client import its deterministic engine and protocol. `packages/php-runtime` independently reproduces the seed and replay contract as an optional cross-language proof.

The production Durable Object names, migration tag, environment name, and storage bindings are intentionally stable. Changing them is a state migration, not a rename.
