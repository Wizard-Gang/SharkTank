// Local host Worker: serves the built R3F client (via the ASSETS binding) and a
// small JSON API backed by the generic blob store. Imports ONLY the server-safe
// entry points of module-react3fiber (never the client) so no browser libs leak in.
//
// State note: the MemoryBlobStore is module-global, so saves persist across requests
// within a single `wrangler dev` process and reset when `npm run local` restarts it.
// Swap MemoryBlobStore -> an R2/KV/D1-backed BlobStore to persist on Cloudflare.

import { MemoryBlobStore, JsonStore } from "module-react3fiber/store";
import { API } from "module-react3fiber/protocol";
import type { RoomState } from "module-react3fiber/engine";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const store = new JsonStore(new MemoryBlobStore());
const SAVE_PREFIX = "saves/";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === API.health) {
        return json({ ok: true, module: "module-react3fiber", time: new Date().toISOString() });
      }

      if (path === API.seed) {
        return json({ ok: true, seed: `seed-${crypto.randomUUID().slice(0, 8)}` });
      }

      if (path === API.save && request.method === "POST") {
        const body = (await request.json()) as { slot?: string; snapshot?: RoomState };
        if (!body.slot || !body.snapshot) return json({ ok: false, error: "slot and snapshot required" }, 400);
        await store.putJSON(SAVE_PREFIX + body.slot, body.snapshot);
        return json({ ok: true, slot: body.slot });
      }

      if (path === API.load) {
        const slot = url.searchParams.get("slot") ?? "slot-1";
        const snapshot = await store.getJSON<RoomState>(SAVE_PREFIX + slot);
        return json({ ok: true, slot, snapshot });
      }

      if (path === API.saves) {
        const slots = (await store.list(SAVE_PREFIX)).map((k) => k.slice(SAVE_PREFIX.length));
        return json({ ok: true, slots });
      }

      if (path.startsWith("/api/")) return json({ ok: false, error: "unknown endpoint" }, 404);
    } catch (e) {
      return json({ ok: false, error: (e as Error).message }, 500);
    }

    // Non-API: static assets (only reached if run_worker_first matched; otherwise assets serve directly).
    return env.ASSETS.fetch(request);
  },
};
