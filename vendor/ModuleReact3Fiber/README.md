# ModuleReact3Fiber

Portable game engine + React Three Fiber client for the new Wizard Gang game.
Consumed by [`WizardGangLocal`](https://github.com/SouthernGentlemen/WizardGangLocal) (as a git submodule)
for local play; designed to port to **Cloudflare Workers / Durable Objects** later.

## Design (continuity with the previous iteration)
- **Deterministic engine** (`src/engine/`) — pure functions over a serializable `RoomState`.
  No DOM / three.js / node APIs, so the *same* code runs in the browser now and in a
  Worker or Durable Object later. Seeded RNG (`rng.ts`) lives in the snapshot → replayable.
  - `createRoom()`, `step(state)` (tick), `applyAction(state, action)` (join/leave/move + orb pickup).
- **Generic blob store** (`src/store/`) — one storage seam (`BlobStore` interface + `JsonStore`).
  `MemoryBlobStore` for local dev; swap an R2/KV/D1-backed store on Cloudflare without touching game code.
- **Protocol** (`src/protocol/`) — tiny JSON contract; becomes the WebSocket/DO message shape when realtime lands.
- **R3F client** (`src/client/`) — `<GameCanvas/>`: a live 3D arena where you (WASD) collect orbs.
  Positions are driven imperatively from the engine each frame; save/load exercise the blob store.

## Entry points (package `exports`)
| import | contents | server-safe? |
|---|---|---|
| `module-react3fiber/engine` | engine core + types + RNG | ✅ (no browser deps) |
| `module-react3fiber/store`  | BlobStore, JsonStore, MemoryBlobStore | ✅ |
| `module-react3fiber/protocol` | API paths + request/response types | ✅ |
| `module-react3fiber/client` | `<GameCanvas/>`, `useEngine`, `Scene` | ❌ (needs react/three) |

> Keep the Worker importing only `engine`/`store`/`protocol` — never `client` — so browser
> libraries never end up in the server bundle.

## Roadmap
1. **Now:** local play via WizardGangLocal (`npm run local`), HTTP save/load, in-memory store.
2. **Next:** authoritative Durable Object room + WebSocket sync (protocol shapes already fit).
3. **Then:** deploy as a Cloudflare Worker; swap `MemoryBlobStore` → R2/KV/D1.
