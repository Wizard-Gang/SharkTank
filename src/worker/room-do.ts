// Room Durable Object — the authoritative game host.
//
// Holds one RoomState in memory, runs the fixed-rate sim tick, accepts WebSocket
// players, applies their inputs, and broadcasts snapshots. Bots fill empty arenas.
// Server-safe: imports ONLY module-react3fiber/{engine,protocol} (never /client).

import {
  applyAction,
  createRoom,
  leaderboard,
  playerCount,
  replay,
  spawnBots,
  step,
  TICKS_PER_SECOND,
  type Action,
  type GameLogEntry,
  type RoomState,
} from "module-react3fiber/engine";
import {
  toNetState,
  type ClientMessage,
  type ServerMessage,
} from "module-react3fiber/protocol";

const BOT_COUNT = 23; // fill the arena to ~24 snakes with the first human
const CAPACITY = 24; // max human players per room
const LEADERBOARD_EVERY = 15; // ticks between leaderboard broadcasts
const REPORT_EVERY = TICKS_PER_SECOND; // report to lobby ~once/sec
const GAME_LOG_RETENTION_MS = 3 * 24 * 60 * 60 * 1000; // game logs kept 3 days
const GAME_LOG_CAP = 200_000; // hard cap on in-memory log entries

interface Env {
  LOBBY: DurableObjectNamespace;
}

interface Session {
  id: string;
  ws: WebSocket;
  name: string;
  skin: string;
  /** Last-seen alive flag, so we can fire a one-shot "died" on the transition. */
  wasAlive: boolean;
}

export class Room implements DurableObject {
  private room: RoomState;
  private readonly sessions = new Map<WebSocket, Session>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private roomId = "room-local";
  private roomName = "Arena";
  private booted = false;
  // Deterministic game log: seed (below) + these external actions fully reconstruct state.
  private readonly gameLog: Array<GameLogEntry & { ts: number }> = [];

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    // Deterministic-but-distinct seed per DO instance id.
    this.room = createRoom({ id: this.ctx.id.toString(), seed: `seed-${this.ctx.id.toString().slice(0, 8)}` });
    spawnBots(this.room, BOT_COUNT);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.roomId = url.searchParams.get("roomId") ?? this.roomId;
    this.roomName = url.searchParams.get("roomName") ?? this.roomName;

    // Game log (JSONL-ready) — seed + botCount + the external action stream. Everything
    // needed to deterministically replay this game.
    if (url.pathname.endsWith("/log")) {
      this.pruneGameLog();
      return roomJson({
        ok: true,
        roomId: this.roomId,
        seed: this.room.seed,
        botCount: BOT_COUNT,
        tick: this.room.tick,
        events: this.gameLog,
      });
    }

    // Deterministic reconstruction of state at ?tick=T (rollback / fast-forward).
    if (url.pathname.endsWith("/replay")) {
      const toTick = Math.max(0, Math.min(this.room.tick, Number(url.searchParams.get("tick") ?? this.room.tick)));
      const state = replay({ seed: this.room.seed, id: this.roomId, botCount: BOT_COUNT }, this.gameLog, toTick);
      return roomJson({ ok: true, roomId: this.roomId, tick: toTick, state: toNetState(state) });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    if (!this.booted) {
      this.booted = true;
      this.emitEvent("room-boot", this.roomName);
    }

    const id = `p-${crypto.randomUUID().slice(0, 8)}`;
    const session: Session = { id, ws: server, name: "Player", skin: "cyan", wasAlive: true };
    this.sessions.set(server, session);

    server.addEventListener("message", (ev) => this.onMessage(session, ev));
    server.addEventListener("close", () => this.onClose(session));
    server.addEventListener("error", () => this.onClose(session));

    this.ensureLoop();

    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(session: Session, ev: MessageEvent): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof ev.data === "string" ? ev.data : "") as ClientMessage;
    } catch {
      return;
    }

    switch (msg.t) {
      case "hello": {
        session.name = (msg.name || "Player").slice(0, 16);
        session.skin = msg.skin || "viridian";
        this.applyAndLog({ type: "join", playerId: session.id, name: session.name, skin: session.skin });
        this.send(session.ws, { t: "welcome", youId: session.id, roomId: this.roomId, state: toNetState(this.room) });
        this.reportToLobby();
        this.emitEvent("join", session.name);
        break;
      }
      case "input": {
        // Never trust a client-supplied id — bind the action to this session.
        this.applyAndLog({ ...msg.action, playerId: session.id });
        break;
      }
      case "ping":
        this.send(session.ws, { t: "pong", ts: msg.ts });
        break;
    }
  }

  private onClose(session: Session): void {
    if (!this.sessions.has(session.ws)) return;
    this.sessions.delete(session.ws);
    this.applyAndLog({ type: "leave", playerId: session.id });
    this.reportToLobby();
    this.emitEvent("leave", session.name);
    if (this.sessions.size === 0) this.stopLoop();
  }

  // ── Tick loop ──────────────────────────────────────────────────────────────
  private ensureLoop(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000 / TICKS_PER_SECOND);
  }

  private stopLoop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    step(this.room);

    // Fire a one-shot "died" when a human's snake transitions alive → dead.
    for (const session of this.sessions.values()) {
      const snake = this.room.snakes[session.id];
      const alive = snake?.alive ?? false;
      if (session.wasAlive && !alive && snake) {
        const respawnInMs = Math.max(0, (snake.respawnTick - this.room.tick) * (1000 / TICKS_PER_SECOND));
        this.send(session.ws, { t: "died", by: null, score: snake.score, respawnInMs });
        this.emitEvent("death", session.name, `score ${snake.score}`);
      }
      session.wasAlive = alive;
    }

    const net = toNetState(this.room);
    const payload = JSON.stringify({ t: "state", state: net } satisfies ServerMessage);
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(payload);
      } catch {
        /* dropped; close handler will clean up */
      }
    }

    if (this.room.tick % LEADERBOARD_EVERY === 0) {
      this.broadcast({ t: "leaderboard", entries: leaderboard(this.room, 10) });
    }
    if (this.room.tick % REPORT_EVERY === 0) {
      this.reportToLobby();
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }

  private broadcast(msg: ServerMessage): void {
    const s = JSON.stringify(msg);
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(s);
      } catch {
        /* ignore */
      }
    }
  }

  /** Push live counts + top score to the Lobby DO for the room list. */
  private reportToLobby(): void {
    const top = leaderboard(this.room, 1)[0];
    const body = {
      id: this.roomId,
      name: this.roomName,
      players: playerCount(this.room),
      capacity: CAPACITY,
      topScore: top?.score ?? 0,
      topName: top?.name ?? "—",
    };
    const stub = this.env.LOBBY.get(this.env.LOBBY.idFromName("global"));
    // Fire-and-forget; the lobby is best-effort presence, not authoritative.
    void stub.fetch("https://lobby/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /** Apply an external action AND record it (with its tick) to the deterministic game log. */
  private applyAndLog(action: Action): void {
    applyAction(this.room, action);
    this.gameLog.push({ ts: Date.now(), tick: this.room.tick, action });
    if (this.gameLog.length > GAME_LOG_CAP) this.gameLog.splice(0, this.gameLog.length - GAME_LOG_CAP);
  }

  /** Drop game-log entries older than the 3-day retention window. */
  private pruneGameLog(): void {
    const cutoff = Date.now() - GAME_LOG_RETENTION_MS;
    let drop = 0;
    while (drop < this.gameLog.length && this.gameLog[drop].ts < cutoff) drop += 1;
    if (drop > 0) this.gameLog.splice(0, drop);
  }

  /** Append an audit event to the Lobby's JSONL trail. Fire-and-forget. */
  private emitEvent(type: "room-boot" | "join" | "leave" | "death", subject?: string, detail?: string): void {
    const stub = this.env.LOBBY.get(this.env.LOBBY.idFromName("global"));
    void stub.fetch("https://lobby/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ts: Date.now(), type, room: this.roomId, subject, detail }),
    });
  }
}

function roomJson(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
