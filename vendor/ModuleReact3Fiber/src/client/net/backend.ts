// Backend switcher — lets the SAME client talk to either the TypeScript/Cloudflare
// backend or the PHP backend, chosen by `?api=` (persisted to localStorage). This is the
// interchangeability made visible: identical protocol, two servers.
//
//   ?api=ts   (default) → same-origin HTTP + /room/:id/ws WebSocket (TS/Cloudflare)
//   ?api=php            → HTTP on :8080, plain WebSocket on :8081 (PHP/Workerman)

export type BackendId = "ts" | "php";

export interface Backend {
  id: BackendId;
  label: string;
  /** Prefix for HTTP API calls ("" = same origin). */
  apiBase: string;
  /** Build the room WebSocket URL for this backend. */
  socketUrl: (roomId: string, roomName: string) => string;
}

const STORAGE_KEY = "snakeio.backend";

export function supportsPhpBackend(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function resolveId(): BackendId {
  if (typeof window === "undefined") return "ts";
  const q = new URLSearchParams(window.location.search).get("api");
  if ((q === "php" && supportsPhpBackend()) || q === "ts") {
    try {
      localStorage.setItem(STORAGE_KEY, q);
    } catch {
      /* ignore */
    }
    return q;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if ((saved === "php" && supportsPhpBackend()) || saved === "ts") return saved;
  } catch {
    /* ignore */
  }
  return "ts";
}

export function getBackend(): Backend {
  const id = resolveId();
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const wsProto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";

  if (id === "php") {
    const local = host === "localhost" || host === "127.0.0.1";
    return {
      id,
      label: "PHP",
      apiBase: local ? `http://${host}:8080` : "/php-api",
      // The PHP PoC runs one plain-WS room server (no path routing).
      socketUrl: () => local ? `${wsProto}//${host}:8081` : `${wsProto}//${window.location.host}/php-room`,
    };
  }
  return {
    id: "ts",
    label: "TypeScript",
    apiBase: "",
    socketUrl: (roomId, roomName) =>
      `${wsProto}//${typeof window !== "undefined" ? window.location.host : "localhost"}/room/${encodeURIComponent(roomId)}/ws?roomName=${encodeURIComponent(roomName)}`,
  };
}

/** Reload the page pointed at a specific backend. */
export function switchBackend(id: BackendId): void {
  const url = new URL(window.location.href);
  url.searchParams.set("api", id);
  window.location.href = url.toString();
}
