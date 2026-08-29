// In-game leaderboard (top snakes). Rendered as an accessible ordered list; the
// current player's row is marked with aria-current. Rank changes for the local
// player are announced politely.

import { useEffect, useRef } from "react";
import { SKINS } from "../../engine/index.js";
import type { RoomSocket } from "../net/useRoomSocket.js";
import { useAnnouncer } from "../a11y/announcer.js";

const skinColor = (id: string) => SKINS.find((s) => s.id === id)?.color ?? "#33b679";

export function Leaderboard({ socket }: { socket: RoomSocket }) {
  const { announce } = useAnnouncer();
  const lastRank = useRef<number>(0);
  const entries = socket.leaderboard;

  useEffect(() => {
    const idx = entries.findIndex((e) => e.id === socket.youId);
    const rank = idx >= 0 ? idx + 1 : 0;
    if (rank && rank !== lastRank.current) {
      if (rank <= 3 && (lastRank.current === 0 || rank < lastRank.current)) {
        announce(`You reached rank ${rank}.`);
      }
      lastRank.current = rank;
    }
  }, [entries, socket.youId, announce]);

  return (
    <nav className="game-leaderboard" aria-label="Leaderboard" style={wrap}>
      <h2 style={heading}>Top Sharks</h2>
      <ol style={list}>
        {entries.length === 0 && <li style={{ color: "var(--text-muted)" }}>Waiting for scores…</li>}
        {entries.map((e, i) => {
          const me = e.id === socket.youId;
          return (
            <li key={e.id} style={{ ...row, ...(me ? meRow : null) }} aria-current={me ? "true" : undefined}>
              <span style={rankNum}>{i + 1}</span>
              <span aria-hidden="true" style={{ ...dot, background: skinColor(e.skin) }} />
              <span style={name}>
                {e.name}
                {me && <span className="sr-only"> (you)</span>}
              </span>
              <span style={score}>{e.score}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const wrap: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  width: 220,
  maxWidth: "40vw",
  background: "var(--overlay-scrim)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "10px 12px",
  color: "var(--text)",
  zIndex: 10,
};
const heading: React.CSSProperties = { margin: "0 0 8px", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: 0.6, color: "var(--text-muted)" };
const list: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "20px 12px 1fr auto", alignItems: "center", gap: 8, padding: "3px 4px", borderRadius: 6, fontSize: "0.95rem" };
const meRow: React.CSSProperties = { background: "var(--surface-3)", fontWeight: 700 };
const rankNum: React.CSSProperties = { color: "var(--text-muted)", textAlign: "right" };
const dot: React.CSSProperties = { width: 10, height: 10, borderRadius: "50%" };
const name: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const score: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
