# CLAUDE.md — ModuleReact3Fiber

Portable R3F game engine + logic for Wizard Gang. Local play lives in the sibling repo
`WizardGangLocal`; the long-term target is **Cloudflare Workers / Durable Objects**.

## Hard design constraints (do not break)
1. **Engine purity.** `src/engine/**` and `src/store/**` and `src/protocol/**` must stay free of
   DOM, three.js, React, and node-only APIs. They run in the browser today and in a Worker/DO later —
   the same source, unchanged. Only `src/client/**` may use React/three.
2. **Deterministic + serializable.** `RoomState` is plain JSON. All randomness goes through the
   seeded RNG in `engine/rng.ts` with its state stored in the snapshot, so rooms are replayable and a
   server can be authoritative. No `Date.now()`/`Math.random()` inside simulation steps.
3. **One storage seam.** Persistence goes through the `BlobStore` interface only. Local uses
   `MemoryBlobStore`; Cloudflare will use an R2/KV/D1-backed implementation. Game code never talks to a
   concrete store.
4. **Entry-point hygiene.** The server bundle imports only `engine`/`store`/`protocol`, never `client`.

## Cloudflare port checklist (when we get there)
- Wrap the room in a Durable Object; feed actions over a WebSocket using `protocol` shapes.
- Implement `BlobStore` over R2 (or D1) — no engine changes.
- `nodejs_compat`, assets binding for the built client, service-binding auth via the gateway (old design).

## Conventions
- TypeScript, ESM, `.js` extensions in relative imports (NodeNext/Bundler friendly).
- Keep changes small and typed; `npm run typecheck` must pass.
