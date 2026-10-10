// Compact semantic scores. The native touch disclosure keeps its open state across
// broadcasts; only its summary intercepts input, so dragging over rows still steers.

import { useEffect, useRef } from "react";
import { SKINS } from "../../engine/index.js";
import type { ScoreEntry } from "../../protocol/index.js";
import type { RoomSocket } from "../net/useRoomSocket.js";
import { useAnnouncer } from "../a11y/announcer.js";

const skinColor = (id: string) => SKINS.find((s) => s.id === id)?.color ?? "#33b679";

/** Match Room score ordering, including dead sharks and deterministic ID ties. */
export function rankedScores(entries: readonly ScoreEntry[]): ScoreEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function Leaderboard({ socket, touch }: { socket: RoomSocket; touch: boolean }) {
  const { announce } = useAnnouncer();
  const lastRank = useRef<number>(0);
  // Every snapshot already carries every shark. The separate wire board is limited
  // to ten rows, so it cannot supply your row when you rank below tenth.
  const entries = rankedScores(socket.stateRef.current?.sharks ?? socket.leaderboard);
  const round = socket.stateRef.current?.round;
  const apexId = round?.phase === "apex" ? round.apexId : null;

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

  return <LeaderboardReadout entries={entries} youId={socket.youId} apexId={apexId} touch={touch} />;
}

export function LeaderboardReadout({ entries, youId, apexId, touch }: {
  entries: readonly ScoreEntry[];
  youId: string | null;
  apexId: string | null;
  touch: boolean;
}) {
  const ranked = rankedScores(entries);
  const yourIndex = ranked.findIndex((entry) => entry.id === youId);
  const rows = ranked.map((entry, index) => ({ entry, rank: index + 1 }))
    .filter(({ entry, rank }) => rank <= 3 || entry.id === youId);
  const list = (
    <ol className="game-leaderboard__list" role="list">
      {rows.length === 0 && <li className="text-muted">Waiting for scores…</li>}
      {rows.map(({ entry: e, rank }) => {
        const me = e.id === youId;
        const apex = e.id === apexId;
        const classes = `game-leaderboard__row${me ? " is-me" : ""}${apex ? " is-apex" : ""}`;
        return (
          <li key={e.id} value={rank} className={classes} aria-current={me ? "true" : undefined}>
            <span className="game-leaderboard__rank">{rank}</span>
            <svg className="game-leaderboard__dot" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill={skinColor(e.skin)} /></svg>
            <span className="game-leaderboard__name">
              <span className="game-leaderboard__identity">{e.name}</span>
              {me && <span className="sr-only"> (you)</span>}
              {apex && (
                <>
                  <span className="game-leaderboard__apex" aria-hidden="true">APEX</span>
                  <span className="sr-only"> Apex target</span>
                </>
              )}
            </span>
            <span className="game-leaderboard__score">{e.score}</span>
          </li>
        );
      })}
    </ol>
  );
  return (
    <nav className="game-leaderboard" aria-label="Leaderboard">
      {touch ? (
        <details className="game-leaderboard__disclosure">
          <summary className="game-leaderboard__toggle">
            <span>Scores</span>
            <span className="game-leaderboard__your-rank" aria-label={yourIndex >= 0 ? `Your rank ${yourIndex + 1}` : "Not ranked"}>
              {yourIndex >= 0 ? `#${yourIndex + 1}` : "—"}
            </span>
          </summary>
          {list}
        </details>
      ) : <><h2 className="game-leaderboard__heading">Top Sharks</h2>{list}</>}
    </nav>
  );
}
