// Lobby: the list of joinable arenas with live player counts + top score. Polls
// /api/lobby every few seconds. Rendered as a semantic <table> (proper column
// headers, scope) with a keyboard-operable Join action per row; a live region
// announces the polled counts without stealing focus.

import { useEffect, useRef, useState } from "react";
import { API, type LobbyResponse, type LobbyRoom } from "../../protocol/index.js";
import { useAnnouncer } from "../a11y/announcer.js";

export function Lobby({
  playerName,
  onJoin,
  onBack,
  baseUrl = "",
}: {
  playerName: string;
  onJoin: (room: { id: string; name: string }) => void;
  onBack: () => void;
  baseUrl?: string;
}) {
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const { announce } = useAnnouncer();
  const firstLoad = useRef(true);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(baseUrl + API.lobby);
        const data = (await res.json()) as LobbyResponse;
        if (alive && data.ok) {
          setRooms(data.rooms);
          setLoading(false);
          if (firstLoad.current) {
            firstLoad.current = false;
            announce(`${data.rooms.length} arenas available.`);
          }
        }
      } catch {
        if (alive) setLoading(false);
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [announce]);

  return (
    <div className="center-screen">
      <div className="panel stack" style={{ width: "min(720px, 100%)" }}>
        <div className="spread">
          <h1 style={{ margin: 0, fontSize: "1.6rem" }}>Arenas</h1>
          <button className="btn" onClick={onBack}>Back</button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <caption className="sr-only">Available arenas with live player counts and top scores. Updated every three seconds.</caption>
            <thead>
              <tr>
                <th scope="col">Arena</th>
                <th scope="col">Players</th>
                <th scope="col">Top score</th>
                <th scope="col">Leader</th>
                <th scope="col"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody aria-busy={loading}>
              {loading && (
                <tr><td colSpan={5} style={{ color: "var(--text-muted)" }}>Loading arenas…</td></tr>
              )}
              {!loading && rooms.map((r) => (
                <tr key={r.id}>
                  <th scope="row" style={{ fontWeight: 700 }}>{r.name}</th>
                  <td>{r.players} / {r.capacity}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.topScore}</td>
                  <td>{r.topName}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="btn btn--primary"
                      onClick={() => onJoin({ id: r.id, name: r.name })}
                      aria-label={`Join ${r.name}, ${r.players} of ${r.capacity} players, top score ${r.topScore}`}
                    >
                      Join
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {rooms.map((r) => `${r.name}: ${r.players} players, top ${r.topScore}.`).join(" ")}
        </p>
      </div>
    </div>
  );
}
