// WebSocket client for a Room. Keeps the latest NetState in a ref (so the R3F render
// loop can read it every frame without triggering React re-renders) while surfacing
// low-frequency UI state (connection status, leaderboard, death) through React state.
// Auto-reconnects with backoff.

import { useCallback, useEffect, useRef, useState } from "react";
import { type ClientMessage, type NetState, type ScoreEntry, type ServerMessage } from "../../protocol/index.js";
import { getBackend } from "./backend.js";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface DeathInfo {
  score: number;
  respawnInMs: number;
  at: number; // client timestamp
}

/** A pair of buffered snapshots straddling the render time, plus the blend factor. */
export interface InterpFrame {
  older: NetState;
  newer: NetState;
  alpha: number; // 0 at `older`, 1 at `newer`
}

export interface RoomSocket {
  /** Latest authoritative snapshot; null until the first packet. Used by HUD/minimap/audio. */
  stateRef: React.MutableRefObject<NetState | null>;
  /** performance.now() when the newest snapshot arrived — for prediction reconciliation. */
  newestAtRef: React.MutableRefObject<number>;
  /**
   * Sample the snapshot buffer at (now − delayMs) and return the two snapshots that
   * bracket that render time with an interpolation factor. This is anchored to the
   * server tick timeline (buffer timestamps), NOT to jittery packet-arrival time, so
   * the 60fps render stays smooth. Returns null before the first packet.
   */
  frameAt: (delayMs: number) => InterpFrame | null;
  youId: string | null;
  status: ConnectionStatus;
  leaderboard: ScoreEntry[];
  death: DeathInfo | null;
  setHeading: (angle: number) => void;
  setBoost: (on: boolean) => void;
  respawn: () => void;
}

function wsUrl(roomId: string, roomName: string): string {
  return getBackend().socketUrl(roomId, roomName);
}

export function useRoomSocket(
  roomId: string | null,
  identity: { name: string; skin: string },
  roomName = "Arena",
): RoomSocket {
  const stateRef = useRef<NetState | null>(null);
  const newestAtRef = useRef<number>(0);
  // Ring of recent snapshots stamped with client receive time, ordered oldest→newest.
  const bufferRef = useRef<Array<{ t: number; state: NetState }>>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const lastHeadingRef = useRef<number>(Infinity);
  const lastBoostRef = useRef<boolean>(false);
  const identityRef = useRef(identity);
  identityRef.current = identity;

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [youId, setYouId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);
  const [death, setDeath] = useState<DeathInfo | null>(null);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  // Record a snapshot as the latest AND append it to the interpolation buffer.
  const pushSnapshot = useCallback((state: NetState) => {
    stateRef.current = state;
    const now = performance.now();
    newestAtRef.current = now;
    const buf = bufferRef.current;
    buf.push({ t: now, state });
    // Keep ~1.5s of history; always retain at least two to interpolate across.
    const cutoff = now - 1500;
    while (buf.length > 2 && buf[0].t < cutoff) buf.shift();
  }, []);

  const frameAt = useCallback((delayMs: number): InterpFrame | null => {
    const buf = bufferRef.current;
    const n = buf.length;
    if (n === 0) return null;
    const renderTime = performance.now() - delayMs;
    if (renderTime <= buf[0].t) return { older: buf[0].state, newer: buf[0].state, alpha: 0 };
    if (renderTime >= buf[n - 1].t) return { older: buf[n - 1].state, newer: buf[n - 1].state, alpha: 1 };
    // Find i such that buf[i].t <= renderTime < buf[i+1].t (scan from the newest end).
    let i = n - 2;
    while (i > 0 && buf[i].t > renderTime) i -= 1;
    const older = buf[i];
    const newer = buf[i + 1];
    const span = newer.t - older.t;
    const alpha = span > 0 ? (renderTime - older.t) / span : 0;
    return { older: older.state, newer: newer.state, alpha };
  }, []);

  useEffect(() => {
    if (!roomId) return;
    let closedByUs = false;
    let retry = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setStatus("connecting");
      const ws = new WebSocket(wsUrl(roomId, roomName));
      wsRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        setStatus("open");
        send({ t: "hello", name: identityRef.current.name, skin: identityRef.current.skin });
      };

      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data as string) as ServerMessage;
        } catch {
          return;
        }
        switch (msg.t) {
          case "welcome":
            setYouId(msg.youId);
            pushSnapshot(msg.state);
            setDeath(null);
            break;
          case "state":
            pushSnapshot(msg.state);
            break;
          case "leaderboard":
            setLeaderboard(msg.entries);
            break;
          case "died":
            setDeath({ score: msg.score, respawnInMs: msg.respawnInMs, at: performance.now() });
            break;
          case "pong":
            break;
        }
      };

      ws.onclose = () => {
        setStatus("closed");
        if (closedByUs) return;
        // Exponential backoff reconnect (cap ~4s).
        retry += 1;
        const delay = Math.min(4000, 250 * 2 ** retry);
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    // Closing/leaving the page ends the session immediately (server drops the player) and
    // prevents a reconnect — you're "locked out" until you come back through the menu.
    const onPageHide = () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      wsRef.current?.close();
      wsRef.current = null;
      stateRef.current = null;
      bufferRef.current = [];
    };
  }, [roomId, roomName, send, pushSnapshot]);

  const setHeading = useCallback(
    (angle: number) => {
      // Throttle: only send on a meaningful change (~1.7°).
      if (Math.abs(angle - lastHeadingRef.current) < 0.03) return;
      lastHeadingRef.current = angle;
      send({ t: "input", action: { type: "setHeading", playerId: "me", angle } });
    },
    [send],
  );

  const setBoost = useCallback(
    (on: boolean) => {
      if (on === lastBoostRef.current) return;
      lastBoostRef.current = on;
      send({ t: "input", action: { type: "setBoost", playerId: "me", on } });
    },
    [send],
  );

  const respawn = useCallback(() => {
    setDeath(null);
    send({ t: "input", action: { type: "respawn", playerId: "me" } });
  }, [send]);

  return {
    stateRef,
    newestAtRef,
    frameAt,
    youId,
    status,
    leaderboard,
    death,
    setHeading,
    setBoost,
    respawn,
  };
}
