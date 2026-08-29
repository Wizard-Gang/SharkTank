// Wire protocol between the client and the local server (and, later, the Worker).
// Kept tiny and JSON-only. When realtime lands, these same shapes flow over a
// WebSocket to a Durable Object instead of HTTP.

import type { RoomState } from "../engine/types.js";

export interface HealthResponse {
  ok: true;
  module: "module-react3fiber";
  time: string;
}

export interface SeedResponse {
  ok: true;
  seed: string;
}

export interface SaveRequest {
  slot: string;
  snapshot: RoomState;
}

export interface SaveResponse {
  ok: true;
  slot: string;
}

export interface LoadResponse {
  ok: true;
  slot: string;
  snapshot: RoomState | null;
}

export interface ListSavesResponse {
  ok: true;
  slots: string[];
}

export interface ErrorResponse {
  ok: false;
  error: string;
}

export const API = {
  health: "/api/health",
  seed: "/api/seed",
  save: "/api/save",
  load: "/api/load",
  saves: "/api/saves",
} as const;
