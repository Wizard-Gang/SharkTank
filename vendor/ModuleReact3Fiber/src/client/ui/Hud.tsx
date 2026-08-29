// Heads-up display: score, length, rank, connection, and controls hint. Values are
// sampled from the socket snapshot at a low rate (not every frame) to keep the DOM
// cheap. Key changes are announced to screen readers via the announcer.

import { useEffect, useRef, useState } from "react";
import type { RoomSocket } from "../net/useRoomSocket.js";
import { useAnnouncer } from "../a11y/announcer.js";

export interface HudStats {
  score: number;
  length: number;
  rank: number;
  players: number;
  alive: boolean;
}

/** Sample the live snapshot ~5×/s for HUD display without per-frame re-renders. */
export function useHudStats(socket: RoomSocket): HudStats {
  const [stats, setStats] = useState<HudStats>({ score: 0, length: 0, rank: 0, players: 0, alive: false });
  useEffect(() => {
    const id = setInterval(() => {
      const s = socket.stateRef.current;
      if (!s) return;
      const alive = [...s.snakes].filter((x) => x.alive);
      const me = s.snakes.find((x) => x.id === socket.youId);
      // Rank among the living, so rank is always within 1..players.
      const ranked = alive.sort((a, b) => b.score - a.score);
      const rank = me?.alive ? ranked.findIndex((x) => x.id === me.id) + 1 : 0;
      setStats({
        score: me?.score ?? 0,
        length: Math.round(me?.length ?? 0),
        rank,
        players: alive.length,
        alive: me?.alive ?? false,
      });
    }, 200);
    return () => clearInterval(id);
  }, [socket]);
  return stats;
}

export function Hud({ socket }: { socket: RoomSocket }) {
  const stats = useHudStats(socket);
  const { announce } = useAnnouncer();
  const lastMilestone = useRef(0);

  // Announce every +25 score as a polite status.
  useEffect(() => {
    const milestone = Math.floor(stats.score / 25);
    if (milestone > lastMilestone.current && stats.score > 0) {
      lastMilestone.current = milestone;
      announce(`Score ${stats.score}, rank ${stats.rank} of ${stats.players}.`);
    }
  }, [stats.score, stats.rank, stats.players, announce]);

  return (
    <div style={wrap} aria-hidden={false}>
      <div style={card}>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Score</div>
        <div style={big} aria-label={`Score ${stats.score}`}>{stats.score}</div>
      </div>
      <div style={card}>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Rank</div>
        <div style={big}>
          {stats.rank || "—"}
          <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}> / {stats.players}</span>
        </div>
      </div>
      <div style={card}>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Length</div>
        <div style={big}>{stats.length}</div>
      </div>
      <div className="sr-only" role="status" aria-live="off">
        {/* Snapshot the SRs can query on demand; live milestones go through announce(). */}
        Score {stats.score}, length {stats.length}, rank {stats.rank} of {stats.players}.
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  display: "flex",
  gap: 8,
  zIndex: 10,
};
const card: React.CSSProperties = {
  background: "var(--overlay-scrim)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "8px 14px",
  color: "var(--text)",
  minWidth: 72,
  textAlign: "center",
};
const big: React.CSSProperties = { fontSize: "1.6rem", fontWeight: 800, lineHeight: 1.1 };
