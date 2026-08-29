// Local host Worker: serves the built R3F client (via ASSETS), a small JSON API
// (lobby / profile / global leaderboard) backed by the blob store + Lobby DO, and
// upgrades /room/:id/ws WebSockets into the Room Durable Object.
//
// Imports ONLY the server-safe entry points of module-react3fiber (never the client),
// so no browser libs leak into the Worker/DO bundle.

import { MemoryBlobStore, JsonStore } from "module-react3fiber/store";
import { API } from "module-react3fiber/protocol";
import type { Profile } from "module-react3fiber/protocol";
import { OPENAPI, openApiToHtml } from "./openapi.js";

export { Room } from "./room-do.js";
export { Lobby } from "./lobby-do.js";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ROOM: DurableObjectNamespace;
  LOBBY: DurableObjectNamespace;
}

// Module-global for local dev (persists across requests in one `wrangler dev` process).
const store = new JsonStore(new MemoryBlobStore());
const PROFILE_PREFIX = "profiles/";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/** `/room/:id/ws` → the matching Room DO. Returns the room id, or null if not a room path. */
function parseRoomPath(path: string): string | null {
  const m = path.match(/^\/room\/([^/]+)\/ws$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function lobbyStub(env: Env): DurableObjectStub {
  return env.LOBBY.get(env.LOBBY.idFromName("global"));
}

const PAGE_CSS = `
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:#0b0a14;color:#f3f1ff;font:15px/1.6 ui-sans-serif,system-ui,sans-serif}
  main{max-width:900px;margin:0 auto;padding:32px 20px}
  h1{font-size:1.8rem;margin:0 0 4px}
  p.sub{color:#b9b4d6;margin:0 0 24px}
  a{color:#a78bff}
  nav{margin:0 0 20px;display:flex;gap:14px;flex-wrap:wrap}
  nav a{padding:6px 12px;border:1px solid #3a355e;border-radius:8px;text-decoration:none}
  table{width:100%;border-collapse:collapse;margin:0 0 24px}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #3a355e;vertical-align:top}
  th{color:#b9b4d6}
  code{background:#201d3b;padding:2px 6px;border-radius:6px;font-family:ui-monospace,monospace}
  .m{font-weight:700;font-family:ui-monospace,monospace;font-size:.85rem}
  .g{color:#57ff5a}.o{color:#ff8a1f}.c{color:#22e6ff}.v{color:#a78bff}
  .card{background:#16142a;border:1px solid #3a355e;border-radius:12px;padding:16px 18px;margin:0 0 14px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
  .kpi{font-size:1.6rem;font-weight:800}
  .kpi small{display:block;font-size:.75rem;color:#b9b4d6;font-weight:600}
  pre{background:#16142a;border:1px solid #3a355e;border-radius:10px;padding:14px;overflow:auto}
`;

function shell(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${PAGE_CSS}</style></head><body><main><nav><a href="/">← Game</a><a href="/docs/">Docs</a><a href="/status/">Status</a><a href="/audit/">Audit</a></nav>${inner}</main></body></html>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

function ndjson(events: unknown[]): Response {
  const body = events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "");
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

/** Fetch a path on the Room DO instance for `roomId` (game log / replay). */
function roomFetch(env: Env, roomId: string, pathAndQuery: string): Promise<Response> {
  const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
  const u = new URL("https://room" + pathAndQuery);
  u.searchParams.set("roomId", roomId);
  return stub.fetch(u.toString());
}

const AUDIT_ROOMS = ["room-1", "room-2", "room-3", "room-4"];

/** Real-time audit viewer. Polls the user-action log and renders it XSS-safely (player
 *  names are untrusted), plus per-room replayable game-log links. */
function auditViewerHtml(): string {
  const roomRows = AUDIT_ROOMS.map(
    (r) => `<tr><td><code>${esc(r)}</code></td><td><a href="/audit/game/${esc(r)}.jsonl">game log</a></td><td><a href="/audit/replay/${esc(r)}">replay latest</a></td></tr>`,
  ).join("");
  // The viewer script builds rows with textContent (never innerHTML) so untrusted names
  // can't inject markup. No template literals / ${} inside, to stay valid in this string.
  const script = [
    "async function tick(){try{",
    "var r=await fetch('/audit.json?limit=200');var d=await r.json();var ev=d.events||[];",
    "var tb=document.getElementById('rows');tb.textContent='';",
    "ev.slice().reverse().forEach(function(e){var tr=document.createElement('tr');",
    "var cells=[new Date(e.ts).toLocaleTimeString(),e.type,e.subject||'',e.room||'',e.detail||''];",
    "cells.forEach(function(v,i){var td=document.createElement('td');if(i===1){var c=document.createElement('code');c.textContent=v;td.appendChild(c);}else{td.textContent=v;}tr.appendChild(td);});",
    "tb.appendChild(tr);});",
    "if(!ev.length){var tr=document.createElement('tr');var td=document.createElement('td');td.colSpan=5;td.style.color='#b9b4d6';td.textContent='No events yet…';tr.appendChild(td);tb.appendChild(tr);}",
    "document.getElementById('count').textContent='('+ev.length+')';",
    "}catch(err){}}",
    "tick();setInterval(tick,1500);",
  ].join("");
  return `<h1>Audit log</h1>
    <p class="sub">Real-time user-action log — updates every 1.5s · retained 90 days. Game logs are per-room, retained 3 days, and fully replayable.</p>
    <div class="card"><h2 style="margin:0 0 10px;font-size:1.1rem">User actions <span id="count" style="color:#b9b4d6;font-weight:600"></span></h2>
      <table><thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Room</th><th>Detail</th></tr></thead><tbody id="rows"></tbody></table>
    </div>
    <div class="card"><h2 style="margin:0 0 10px;font-size:1.1rem">Game logs (replayable)</h2>
      <table><thead><tr><th>Room</th><th>Log</th><th>Reconstruct</th></tr></thead><tbody>${roomRows}</tbody></table>
      <p class="sub" style="margin-top:10px">Replay reconstructs exact state from <code>seed</code> + the action stream: <code>/audit/replay/&lt;room&gt;?tick=T</code> (any past tick → rollback; latest → fast-forward).</p>
    </div>
    <script>${script}</script>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ── WebSocket → Room DO ────────────────────────────────────────────────
      const roomId = parseRoomPath(path);
      if (roomId) {
        const id = env.ROOM.idFromName(roomId);
        const stub = env.ROOM.get(id);
        const name = url.searchParams.get("roomName") ?? roomId;
        const fwd = new URL(request.url);
        fwd.searchParams.set("roomId", roomId);
        fwd.searchParams.set("roomName", name);
        return stub.fetch(new Request(fwd.toString(), request));
      }

      // ── HTTP API ───────────────────────────────────────────────────────────
      if (path === API.health) {
        return json({ ok: true, module: "module-react3fiber", time: new Date().toISOString() });
      }

      if (path === API.lobby) {
        const stub = env.LOBBY.get(env.LOBBY.idFromName("global"));
        return stub.fetch("https://lobby/list");
      }

      if (path === API.leaderboard) {
        const stub = env.LOBBY.get(env.LOBBY.idFromName("global"));
        return stub.fetch("https://lobby/leaderboard");
      }

      if (path === API.profile) {
        const owner = url.searchParams.get("id") ?? "local";
        const key = PROFILE_PREFIX + owner;
        if (request.method === "POST") {
          const body = (await request.json()) as Partial<Profile>;
          const prev = (await store.getJSON<Profile>(key)) ?? { name: "Player", skin: "cyan", best: 0 };
          const next: Profile = {
            name: (body.name ?? prev.name).slice(0, 16),
            skin: body.skin ?? prev.skin,
            best: Math.max(prev.best, body.best ?? 0),
            settings: body.settings ?? prev.settings,
          };
          await store.putJSON(key, next);
          return json({ ok: true, profile: next });
        }
        const profile = (await store.getJSON<Profile>(key)) ?? { name: "Player", skin: "cyan", best: 0 };
        return json({ ok: true, profile });
      }

      // Client-emitted user actions → the Lobby DO's 90-day user log.
      if (path === "/api/audit" && request.method === "POST") {
        const body = (await request.json()) as { type?: string; subject?: string; room?: string; detail?: string };
        if (!body.type) return json({ ok: false, error: "type required" }, 400);
        await lobbyStub(env).fetch("https://lobby/event", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ts: Date.now(), type: body.type, subject: body.subject, room: body.room, detail: body.detail }),
        });
        return json({ ok: true });
      }

      if (path.startsWith("/api/")) return json({ ok: false, error: "unknown endpoint" }, 404);

      // ── Ops pages: docs / status / audit ─────────────────────────────────────
      if (path === "/docs/openapi.json" || path === "/openapi.json") {
        return json(OPENAPI);
      }
      if (path === "/docs" || path === "/docs/") {
        return html(shell("Snake — API Docs", openApiToHtml(OPENAPI)));
      }

      if (path === "/status.json") {
        return lobbyStub(env).fetch("https://lobby/status");
      }
      if (path === "/status" || path === "/status/") {
        const res = await lobbyStub(env).fetch("https://lobby/status");
        const data = (await res.json()) as {
          usage: { uptimeMs: number; lobbyRequests: number; presenceReports: number; auditEvents: number; durableObjects: { lobby: number; rooms: number; total: number } };
          rooms: Array<{ name: string; players: number; capacity: number; topScore: number; topName: string }>;
        };
        const u = data.usage;
        const mins = Math.floor(u.uptimeMs / 60000);
        const secs = Math.floor((u.uptimeMs % 60000) / 1000);
        const kpi = (n: number | string, label: string) => `<div class="card"><div class="kpi">${n}<small>${label}</small></div></div>`;
        const roomRows = data.rooms
          .map((r) => `<tr><td>${esc(r.name)}</td><td>${r.players} / ${r.capacity}</td><td>${r.topScore}</td><td>${esc(r.topName)}</td></tr>`)
          .join("");
        return html(
          shell(
            "Snake — Status",
            `<h1>Server status</h1><p class="sub">Live Durable Object usage. Auto-refreshes every 3s. Raw JSON at <a href="/status.json">/status.json</a>.</p>
             <div class="grid">
               ${kpi(`${mins}m ${secs}s`, "uptime")}
               ${kpi(u.durableObjects.total, "durable objects")}
               ${kpi(u.durableObjects.rooms, "room DOs seen")}
               ${kpi(u.lobbyRequests, "lobby DO requests")}
               ${kpi(u.presenceReports, "presence reports")}
               ${kpi(u.auditEvents, "audit events")}
             </div>
             <div class="card"><h2 style="margin-top:0;font-size:1.1rem">Arenas</h2>
               <table><thead><tr><th>Arena</th><th>Players</th><th>Top score</th><th>Leader</th></tr></thead><tbody>${roomRows}</tbody></table>
             </div>
             <script>setTimeout(()=>location.reload(),3000)</script>`,
          ),
        );
      }

      // User action log (90-day retention) as JSON / JSONL.
      if (path === "/audit.json") {
        return lobbyStub(env).fetch("https://lobby/audit" + url.search);
      }
      if (path === "/audit.jsonl") {
        const res = await lobbyStub(env).fetch("https://lobby/audit" + url.search);
        const data = (await res.json()) as { events: unknown[] };
        return ndjson(data.events);
      }

      // Per-game deterministic log (3-day retention): seed + action stream.
      const gameLog = path.match(/^\/audit\/game\/([^/]+?)(\.jsonl|\.json)?$/);
      if (gameLog) {
        const roomId = decodeURIComponent(gameLog[1]);
        const res = await roomFetch(env, roomId, "/log");
        const data = (await res.json()) as { events: unknown[] };
        if (gameLog[2] === ".jsonl") return ndjson(data.events);
        return json(data);
      }

      // Deterministic replay of a game's state at ?tick=T (rollback / fast-forward).
      const replayMatch = path.match(/^\/audit\/replay\/([^/]+?)(\.json)?$/);
      if (replayMatch) {
        const roomId = decodeURIComponent(replayMatch[1]);
        return roomFetch(env, roomId, "/replay?tick=" + encodeURIComponent(url.searchParams.get("tick") ?? ""));
      }

      // Real-time log viewer (HTML).
      if (path === "/audit" || path === "/audit/") {
        return html(shell("Snake — Audit", auditViewerHtml()));
      }
    } catch (e) {
      return json({ ok: false, error: (e as Error).message }, 500);
    }

    // Non-API, non-WS: static assets.
    return env.ASSETS.fetch(request);
  },
};
