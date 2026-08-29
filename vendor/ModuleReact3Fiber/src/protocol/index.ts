// Wire protocol between the client and the server. Kept JSON-only so the same shapes
// travel over HTTP (lobby/profile/leaderboard) and over the WebSocket (realtime play)
// into the Room Durable Object.

import type { Action, Food, RoomState, ScoreEntry, Snake } from "../engine/types.js";

// ── HTTP: health / lobby / profile / global leaderboard ────────────────────────
export interface HealthResponse {
  ok: true;
  module: "module-react3fiber";
  time: string;
}

/** One joinable room as shown in the lobby list, with live counts + top score. */
export interface LobbyRoom {
  id: string;
  name: string;
  players: number;
  capacity: number;
  topScore: number;
  topName: string;
}

export interface LobbyResponse {
  ok: true;
  rooms: LobbyRoom[];
}

/** Persisted per-player cosmetics + settings profile. */
export interface Profile {
  name: string;
  skin: string;
  /** Best score ever, for the local player's own record. */
  best: number;
  /** Opaque settings blob owned by the client (systems menu). */
  settings?: Record<string, unknown>;
}

export interface ProfileResponse {
  ok: true;
  profile: Profile;
}

export interface LeaderboardResponse {
  ok: true;
  entries: ScoreEntry[];
}

export interface ErrorResponse {
  ok: false;
  error: string;
}

// ── WebSocket: realtime play (client ⇄ Room DO) ───────────────────────────────
/** Client → server. `input` carries the same Action union the engine applies. */
export type ClientMessage =
  | { t: "hello"; name: string; skin: string }
  | { t: "input"; action: Action }
  | { t: "ping"; ts: number };

/** A trimmed snake for the wire — segments are the bulk of the payload. */
export type NetSnake = Pick<
  Snake,
  "id" | "name" | "skin" | "segments" | "heading" | "length" | "boosting" | "score" | "alive"
>;

/** The per-tick world snapshot broadcast to every connected client. */
export interface NetState {
  tick: number;
  arenaRadius: number;
  snakes: NetSnake[];
  food: Food[];
}

/** Server → client. */
export type ServerMessage =
  | { t: "welcome"; youId: string; roomId: string; state: NetState }
  | { t: "state"; state: NetState }
  | { t: "leaderboard"; entries: ScoreEntry[] }
  | { t: "died"; by: string | null; score: number; respawnInMs: number }
  | { t: "pong"; ts: number };

/** Build the on-the-wire snapshot from authoritative RoomState. */
export function toNetState(state: RoomState): NetState {
  return {
    tick: state.tick,
    arenaRadius: state.arena.radius,
    snakes: Object.values(state.snakes).map((s) => ({
      id: s.id,
      name: s.name,
      skin: s.skin,
      segments: s.segments,
      heading: s.heading,
      length: s.length,
      boosting: s.boosting,
      score: s.score,
      alive: s.alive,
    })),
    food: state.food,
  };
}

// ── Endpoint map ───────────────────────────────────────────────────────────────
export const API = {
  health: "/api/health",
  lobby: "/api/lobby",
  profile: "/api/profile",
  leaderboard: "/api/leaderboard",
} as const;

/** WebSocket path for a given room id, e.g. `/room/room-1/ws`. */
export function roomSocketPath(roomId: string): string {
  return `/room/${encodeURIComponent(roomId)}/ws`;
}

export type { Action, Food, RoomState, ScoreEntry, Snake };
