// Colorblind name labels. Reads projected head positions written each frame by the
// Scene into a shared ref and renders DOM name tags over the canvas, so a snake's
// identity never depends on color alone (WCAG 1.4.1). Purely decorative for AT
// (aria-hidden) — the leaderboard already conveys names/scores semantically.

import { useEffect, useRef, useState } from "react";
import type { SnakeLabel } from "../game/Scene.js";

export function SnakeLabels({ labelsRef }: { labelsRef: React.MutableRefObject<SnakeLabel[]> }) {
  const [labels, setLabels] = useState<SnakeLabel[]>([]);
  const raf = useRef(0);

  useEffect(() => {
    const tick = () => {
      setLabels(labelsRef.current.slice(0, 24));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [labelsRef]);

  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 9, overflow: "hidden" }}>
      {labels.map((l) => (
        <span
          key={l.id}
          style={{
            position: "absolute",
            left: l.x,
            top: l.y,
            transform: "translate(-50%, -160%)",
            padding: "1px 6px",
            borderRadius: 6,
            fontSize: l.me ? "0.85rem" : "0.75rem",
            fontWeight: l.me ? 800 : 600,
            whiteSpace: "nowrap",
            color: "#0b0a14",
            background: l.color,
            border: l.me ? "2px solid #fff" : "1px solid rgba(0,0,0,0.35)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
          }}
        >
          {l.name}
        </span>
      ))}
    </div>
  );
}
