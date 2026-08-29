# ModulePHP — Snake Arena, in PHP

A **proof-of-concept PHP backend** for the Snake Arena game, built to be a drop-in peer of
the TypeScript / Cloudflare Workers backend. It speaks the **same wire protocol**, runs the
**same deterministic engine**, and serves the **same ops pages** — so the same browser
client plays against either backend.

The point isn't "rewrite everything in PHP." It's to make the **seam** visible: what has to
stay (the browser client + the protocol) versus what's swappable (the whole server tier).

## The interchangeable seam

```
  Browser client  ──HTTP──▶  /api/*, /docs/, /status/, /audit/
  (unchanged)     ──WS────▶  the game server  ──▶  authoritative sim + tick loop
        ▲
        └─ talks ONLY via the protocol (JSON messages + endpoints).
           Any server that speaks it is interchangeable.
```

- **Fixed:** the R3F browser client (browsers run JS, not PHP).
- **Swappable:** the API, the realtime WebSocket server, the engine, storage.
- **The contract:** the protocol + the OpenAPI document. `public/openapi.json` here is the
  **byte-for-byte identical** file the TS backend serves — the shared contract.

## TypeScript/Cloudflare ⟺ PHP mapping

| Cloudflare / TS | PHP (this repo) | File |
| --- | --- | --- |
| Room **Durable Object** (one per arena, in-memory) | Workerman `Worker` with `->count = 1` | `src/Server/GameServer.php` |
| DO `setInterval(tick, 1000/30)` | `Timer::add(1/30, …)` | `src/Server/GameServer.php` |
| `WebSocketPair` / `ws.send` | `websocket://` worker, `$conn->send()` | `src/Server/GameServer.php` |
| Worker `fetch()` HTTP handler | Workerman `http://` worker | `src/Server/HttpServer.php` |
| Lobby DO (registry/leaderboard/audit) | shared `BlobStore` files | `HttpServer` + `GameServer` |
| `BlobStore` (Memory) | `FileBlobStore` (JSON files) | `src/Store/FileBlobStore.php` |
| deterministic engine `room.ts` | `Room.php` | `src/Engine/Room.php` |
| seeded RNG `rng.ts` (mulberry32) | `Rng.php` (32-bit masked) | `src/Engine/Rng.php` |
| `replay(seed, actions, tick)` | `Room::replay(…)` | `src/Engine/Room.php` |
| OpenAPI document | `public/openapi.json` (verbatim copy) | served by `HttpServer` |

## Byte-identical parts (where it's needed)

- **Wire protocol** — `hello / input / welcome / state / leaderboard / died / pong` and the
  `toNetState()` snapshot shape match field-for-field.
- **OpenAPI document** — `public/openapi.json` is the exact file the TS backend emits. Diff
  proves the contract is identical:
  ```bash
  diff <(curl -s http://localhost:8080/docs/openapi.json) \
       <(curl -s http://localhost:8787/docs/openapi.json)   # ← empty = identical
  ```
- **RNG stream** — `Rng.php` reproduces the TS mulberry32 **bit-for-bit** (`bin/selftest.php`
  checks captured reference vectors).

## The interesting PHP bit: 32-bit math

JS numbers are doubles whose bitwise ops act on 32-bit ints (`Math.imul`, `>>> 0`). PHP ints
are 64-bit, so we emulate 32-bit wraparound by masking to `0xFFFFFFFF`. That one detail is
what makes the RNG — and therefore replay — match across languages. See `src/Engine/Rng.php`.

## Run it

```bash
# 1. The byte-identical core, no dependencies needed:
php bin/selftest.php        # proves RNG parity with TS + deterministic replay

# 2. The full server (needs Composer for Workerman):
composer install
php start.php start          # HTTP :8080, WebSocket :8081
# open http://localhost:8080  → a no-build 2D canvas client, same protocol
```

Ops pages (same as the TS backend): `/docs/` · `/status/` · `/audit/`
Replay any game: `/audit/replay/room-1?tick=T`

## Honest caveat on cross-language determinism

The **integer RNG** is identical across TS and PHP. The sim also uses `cos/sin/atan2/hypot`
(libm) — on the same machine these are typically bit-identical, but transcendental functions
aren't guaranteed identical across platforms/languages at the last ULP. So **within-PHP**
replay is exact; **cross-language** byte-identical replay is "almost certainly, not
guaranteed." `bin/selftest.php` verifies the parts that *are* guaranteed.

## Layout

```
start.php                 boot both workers
public/index.html app.js  no-build 2D client (same protocol)
public/openapi.json       the shared contract (verbatim from TS)
src/Engine/Rng.php        deterministic RNG (byte-identical to rng.ts)
src/Engine/Room.php       the sim (port of room.ts) + replay()
src/Server/GameServer.php realtime game — the Room Durable Object in PHP
src/Server/HttpServer.php  API + ops pages — the Worker fetch() handler in PHP
src/Store/*.php           the BlobStore seam
bin/selftest.php          RNG parity + replay determinism
```
