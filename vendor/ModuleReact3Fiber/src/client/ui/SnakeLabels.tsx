// Colorblind name labels. Reads projected head positions written each frame by the
// Scene into a shared ref and renders DOM name tags over the canvas, so a snake's
// identity never depends on color alone (WCAG 1.4.1). Purely decorative for AT
// (aria-hidden) — the leaderboard already conveys names/scores semantically.

import { useEffect, useRef, useState } from "react";
import type { SnakeLabel } from "../game/Scene.js";

export function SnakeLabels({ labelsRef }: { labelsRef: React.MutableRefObject<SnakeLabel[]> }) {
  const [labels, setLabels] = useState<SnakeLabel[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const tick = () => {
      setLabels(labelsRef.current.slice(0, 12));
    };
    tick();
    timer.current = setInterval(tick, 100);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [labelsRef]);

  return (
    <svg className="snake-label-layer" width="100%" height="100%" aria-hidden="true">
      {labels.map((l) => (
        <g key={l.id} className={l.me ? "snake-label is-me" : "snake-label"} transform={`translate(${l.x} ${l.y - 28})`}>
          <rect x="-68" y="-12" width="136" height="24" rx="6" fill={l.color} stroke={l.me ? "#fff" : "rgba(0,0,0,0.35)"} strokeWidth={l.me ? 2 : 1} />
          <text x="0" y="4" textAnchor="middle">{l.name}</text>
        </g>
      ))}
    </svg>
  );
}
