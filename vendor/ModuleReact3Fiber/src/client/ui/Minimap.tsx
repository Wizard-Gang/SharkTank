// Radar minimap. Decorative canvas (aria-hidden) sampling the live snapshot.
//
// The position summary lives in its own component because it is not part of the
// picture: it used to sit inside Minimap, so switching off a *visual* aid also
// removed the only non-visual statement of where you are. GameScreen renders
// MinimapSummary whether or not the canvas is shown.

import { useEffect, useRef, useState } from "react";
import { SKINS } from "../../engine/index.js";
import type { RoomSocket } from "../net/useRoomSocket.js";

const SIZE = 140;
const skinColor = (id: string) => SKINS.find((s) => s.id === id)?.color ?? "#33b679";

export function Minimap({ socket }: { socket: RoomSocket }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let drawTimer: ReturnType<typeof setInterval> | null = null;
    const draw = () => {
      const cv = canvasRef.current;
      const s = socket.stateRef.current;
      if (cv && s) {
        const ctx = cv.getContext("2d");
        if (ctx) {
          const R = s.arenaRadius;
          const toXY = (x: number, z: number) => [SIZE / 2 + (x / R) * (SIZE / 2 - 6), SIZE / 2 + (z / R) * (SIZE / 2 - 6)];
          ctx.clearRect(0, 0, SIZE, SIZE);
          // Arena disc
          ctx.beginPath();
          ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 4, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(20,18,40,0.85)";
          ctx.fill();
          ctx.strokeStyle = "#ff6b6b";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // Food (faint)
          ctx.fillStyle = "rgba(255,213,74,0.5)";
          for (let i = 0; i < s.food.length; i += 6) {
            const [px, py] = toXY(s.food[i].x, s.food[i].z);
            ctx.fillRect(px, py, 1, 1);
          }
          // Snakes (heads)
          for (const sn of s.snakes) {
            if (!sn.alive || !sn.segments[0]) continue;
            const [px, py] = toXY(sn.segments[0].x, sn.segments[0].z);
            const me = sn.id === socket.youId;
            ctx.beginPath();
            ctx.arc(px, py, me ? 3.5 : 2, 0, Math.PI * 2);
            ctx.fillStyle = me ? "#ffffff" : skinColor(sn.skin);
            ctx.fill();
          }
        }
      }
    };
    draw();
    drawTimer = setInterval(draw, 125);

    return () => {
      if (drawTimer) clearInterval(drawTimer);
    };
  }, [socket]);

  return (
    <div className="game-minimap" style={wrap}>
      <canvas ref={canvasRef} width={SIZE} height={SIZE} aria-hidden="true" style={{ display: "block" }} />
    </div>
  );
}

/** Spoken position, independent of whether the radar canvas is drawn. */
export function MinimapSummary({ socket }: { socket: RoomSocket }) {
  const [summary, setSummary] = useState("");

  useEffect(() => {
    const id = setInterval(() => {
      const s = socket.stateRef.current;
      const me = s?.snakes.find((x) => x.id === socket.youId && x.alive);
      if (me?.segments[0]) {
        const { x, z } = me.segments[0];
        const dir = z < -5 ? "north" : z > 5 ? "south" : "";
        const dir2 = x < -5 ? "west" : x > 5 ? "east" : "";
        setSummary(`You are near tank ${[dir, dir2].filter(Boolean).join("-") || "center"}.`);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [socket]);

  return <p className="sr-only" role="status">{summary}</p>;
}

const wrap: React.CSSProperties = {
  position: "absolute",
  bottom: 12,
  right: 12,
  width: SIZE,
  height: SIZE,
  borderRadius: "var(--radius)",
  overflow: "hidden",
  border: "1px solid var(--border)",
  zIndex: 10,
};
