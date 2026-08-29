# Migration parity

## Code parity

The reconstructed baseline through ST-028 contains the committed SharkTank code from three sources: the Worker host and governance code from `WizardGangLocal`, the exact referenced `ModuleReact3Fiber` states flattened under `vendor/ModuleReact3Fiber`, and both committed `ModulePHP` source states under `packages/php-runtime`. Private gitlinks and sibling-checkout assumptions are removed.

Two transformations are intentional: product identity is SharkTank, and local Worker identity is `sharktank-local`. ST-029 and ST-030 are forward changes for public CI, tests, current dependencies, release identity, and canonical documentation.

## Behavioral gates

On 2026-08-28, the final local state passed strict host and vendored TypeScript checking, nine unit tests, the PHP deterministic replay proof, the Vite production build, npm audit with zero vulnerabilities, and the route-specific evidence walk. The walk covered 46 distinct routes referenced across 489 rows, including 142 controls marked met and zero met rows without a route.

The existing production origin was inspected before reconstruction: public game, trust, status, documentation, logs, audit, policy, and spend routes answered successfully; unauthenticated admin access returned 401; a room route without a WebSocket upgrade returned 426; and legacy human-facing routes redirected while legacy API compatibility remained available.

## Remaining migration boundary

Production still runs its pre-publication deployment until an exact tagged release is separately approved and deployed. Runtime identity therefore must not be claimed as v1.0.0 until `https://sharktank.wizardgang.ai/version.json` returns that release after the controlled workflow. Legacy repository retirement remains out of scope until that parity check and an observation window pass.
