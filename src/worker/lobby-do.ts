// Lobby Durable Object — presence + global leaderboard + usage/audit aggregation.
//
// Rooms POST live {players, topScore} here (`/report`) and significant events (`/event`);
// the lobby merges presence onto a stable catalog of joinable arenas, keeps a running
// global top-scores table, records a capped JSONL-style audit trail, and tracks Durable
// Object usage counters. Single instance, addressed by idFromName("global").

import type { LobbyRoom, ScoreEntry } from "module-react3fiber/protocol";
import { DEFAULT_SKIN } from "module-react3fiber/engine";

/** Stable, always-joinable arenas. Live data is overlaid as rooms report in. */
const CATALOG: Array<{ id: string; name: string }> = [
  { id: "room-1", name: "Meadow" },
  { id: "room-2", name: "Canyon" },
  { id: "room-3", name: "Tundra" },
  { id: "room-4", name: "Nebula" },
];
const CAPACITY = 24;
const STALE_MS = 8000; // a report older than this is treated as "no one here"
const GLOBAL_TOP = 25;
const USER_LOG_CAP = 5000; // keep the most recent N user-action events
const USER_LOG_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // user logs kept 90 days

interface Report {
  players: number;
  topScore: number;
  topName: string;
  at: number;
}

/** One user-action audit record (JSONL). `type` covers both server-emitted lifecycle
 *  events (room-boot/join/leave/death) and client-emitted UI actions (play/rename/skin/
 *  settings/nav/quit). Kept 90 days. */
export interface AuditEvent {
  ts: number;
  type: string;
  room?: string;
  subject?: string; // player/actor name
  detail?: string; // human-readable detail
}

interface Usage {
  startedAt: number;
  requests: number; // total DO fetches handled
  reports: number; // presence reports received
  events: number; // audit events recorded
  roomsSeen: string[]; // distinct Room DO instance ids observed
}

export class Lobby implements DurableObject {
  private readonly reports = new Map<string, Report>();
  private global: ScoreEntry[] = [];
  private audit: AuditEvent[] = [];
  private usage: Usage = { startedAt: Date.now(), requests: 0, reports: 0, events: 0, roomsSeen: [] };

  constructor(private readonly ctx: DurableObjectState) {
    void this.ctx.blockConcurrencyWhile(async () => {
      this.global = (await this.ctx.storage.get<ScoreEntry[]>("global")) ?? [];
      this.audit = (await this.ctx.storage.get<AuditEvent[]>("audit")) ?? [];
      const savedUsage = await this.ctx.storage.get<Usage>("usage");
      if (savedUsage) this.usage = savedUsage;
    });
  }

  async fetch(request: Request): Promise<Response> {
    this.usage.requests += 1;
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.endsWith("/report") && request.method === "POST") {
      const b = (await request.json()) as LobbyRoom & { topName?: string };
      this.reports.set(b.id, { players: b.players, topScore: b.topScore, topName: b.topName ?? "—", at: Date.now() });
      this.usage.reports += 1;
      if (!this.usage.roomsSeen.includes(b.id)) this.usage.roomsSeen.push(b.id);
      this.mergeGlobal(b);
      void this.ctx.storage.put("usage", this.usage);
      return json({ ok: true });
    }

    if (path.endsWith("/event") && request.method === "POST") {
      const ev = (await request.json()) as AuditEvent;
      this.record(ev);
      return json({ ok: true });
    }

    if (path.endsWith("/leaderboard")) {
      return json({ ok: true, entries: this.global.slice(0, GLOBAL_TOP) });
    }

    if (path.endsWith("/audit")) {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? USER_LOG_CAP), USER_LOG_CAP);
      return json({ ok: true, events: this.audit.slice(-limit), retentionDays: 90 });
    }

    if (path.endsWith("/status")) {
      return json({ ok: true, ...this.status() });
    }

    // Default: the room list.
    return json({ ok: true, rooms: this.list() });
  }

  private record(ev: AuditEvent): void {
    this.audit.push({ ts: ev.ts || Date.now(), type: ev.type, room: ev.room, subject: ev.subject, detail: ev.detail });
    // Retention: drop entries older than 90 days, then cap the count.
    const cutoff = Date.now() - USER_LOG_RETENTION_MS;
    let drop = 0;
    while (drop < this.audit.length && this.audit[drop].ts < cutoff) drop += 1;
    if (drop > 0) this.audit.splice(0, drop);
    if (this.audit.length > USER_LOG_CAP) this.audit.splice(0, this.audit.length - USER_LOG_CAP);
    this.usage.events += 1;
    if (ev.room && !this.usage.roomsSeen.includes(ev.room)) this.usage.roomsSeen.push(ev.room);
    void this.ctx.storage.put("audit", this.audit);
    void this.ctx.storage.put("usage", this.usage);
  }

  private list(): LobbyRoom[] {
    const now = Date.now();
    return CATALOG.map(({ id, name }) => {
      const r = this.reports.get(id);
      const fresh = r && now - r.at < STALE_MS;
      return {
        id,
        name,
        players: fresh ? r!.players : 0,
        capacity: CAPACITY,
        topScore: fresh ? r!.topScore : 0,
        topName: fresh ? r!.topName : "—",
      };
    });
  }

  /** DO usage snapshot — the "durable object usage sim" surfaced by /status/. */
  private status() {
    const now = Date.now();
    const rooms = this.list();
    const activeRooms = rooms.filter((r) => r.players > 0).length;
    const totalPlayers = rooms.reduce((n, r) => n + r.players, 0);
    return {
      usage: {
        startedAt: this.usage.startedAt,
        uptimeMs: now - this.usage.startedAt,
        lobbyRequests: this.usage.requests,
        presenceReports: this.usage.reports,
        auditEvents: this.usage.events,
        // Durable Object instances in play: the single Lobby + one Room DO per distinct arena seen.
        durableObjects: { lobby: 1, rooms: this.usage.roomsSeen.length, total: 1 + this.usage.roomsSeen.length },
        storageKeys: ["global", "audit", "usage"],
      },
      rooms,
      global: this.global.slice(0, GLOBAL_TOP),
    };
  }

  private mergeGlobal(b: LobbyRoom & { topName?: string }): void {
    if (!b.topScore || !b.topName) return;
    const name = b.topName;
    const existing = this.global.find((e) => e.name === name);
    if (existing) {
      if (b.topScore > existing.score) existing.score = b.topScore;
    } else {
      this.global.push({ id: `${b.id}:${name}`, name, skin: DEFAULT_SKIN, score: b.topScore, alive: true });
    }
    this.global.sort((a, c) => c.score - a.score);
    this.global = this.global.slice(0, GLOBAL_TOP);
    void this.ctx.storage.put("global", this.global);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
