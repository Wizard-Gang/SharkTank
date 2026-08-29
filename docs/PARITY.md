# Migration parity

## Code parity

The reconstructed baseline through ST-028 contains the committed SharkTank code from three sources: the Worker host and governance code from `WizardGangLocal`, the exact referenced `ModuleReact3Fiber` states flattened under `vendor/ModuleReact3Fiber`, and both committed `ModulePHP` source states under `packages/php-runtime`. Private gitlinks and sibling-checkout assumptions are removed.

Two transformations are intentional: product identity is SharkTank, and local Worker identity is `sharktank-local`. ST-029 and ST-030 are forward changes for public CI, tests, current dependencies, release identity, and canonical documentation.

## Behavioral gates

On 2026-08-28, the final local state passed strict host and vendored TypeScript checking, nine unit tests, the PHP deterministic replay proof, the Vite production build, npm audit with zero vulnerabilities, and the route-specific evidence walk. The walk covered 46 distinct routes referenced across 489 rows, including 142 controls marked met and zero met rows without a route.

The existing production origin was inspected before reconstruction: public game, trust, status, documentation, logs, audit, policy, and spend routes answered successfully; unauthenticated admin access returned 401; a room route without a WebSocket upgrade returned 426; and legacy human-facing routes redirected while legacy API compatibility remained available.

## Production cutover result

Release v1.0.1 was deployed from this public repository on 2026-08-29 at 01:37 UTC. The existing stateful names and bindings were retained. After cutover, the complete evidence walk passed against production, `/version.json` returned v1.0.1 in production, public APIs returned their expected contracts, an unauthenticated admin request returned 401, a non-upgraded room request returned 426, and a real WebSocket session received the authoritative `welcome` message.

WizardGang's public case-study page linked to the canonical game and trust origins, and its legacy human route redirected. The public repositories therefore own all active product and portfolio information needed to archive `WizardGangLocal`. The legacy source history remains preserved for provenance rather than deleted.
