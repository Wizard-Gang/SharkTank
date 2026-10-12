import { useEffect, useState } from "react";
import { EDGE_GLYPHS, type EdgeCue } from "./edgeNavigation.js";

export function EdgeCues({ cuesRef }: { cuesRef: React.MutableRefObject<EdgeCue[]> }) {
  const [cues, setCues] = useState<EdgeCue[]>([]);
  useEffect(() => {
    const update = () => setCues(cuesRef.current);
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [cuesRef]);
  return <EdgeCueReadout cues={cues} />;
}

function directionName(angle: number): string {
  return ["right", "below right", "below", "below left", "left", "above left", "above", "above right"][(Math.round(angle / 45) + 8) % 8];
}

export function EdgeCueReadout({ cues }: { cues: readonly EdgeCue[] }) {
  return (
    <ul role="list" className="edge-cue-layer" aria-label="Off-screen threats and objectives">
      {cues.slice(0, 4).map((cue) => (
        <li key={cue.id} className={`edge-cue edge-cue--${cue.kind}`}
          style={{ left: `clamp(calc(36px + var(--safe-l)), ${cue.x}px, calc(100% - 36px - var(--safe-r)))`, top: `clamp(calc(96px + var(--safe-t)), ${cue.y}px, calc(100% - 96px - var(--safe-b)))` }}
          aria-label={`${cue.label}, ${Math.round(cue.distance)} meters, ${directionName(cue.angle)}${cue.behind ? ", behind the camera" : ""}`}>
          <span className="edge-cue__arrow" style={{ transform: `rotate(${cue.angle}deg)` }} aria-hidden="true">➜</span>
          <span aria-hidden="true">{EDGE_GLYPHS[cue.kind]} {Math.round(cue.distance)}m</span>
        </li>
      ))}
    </ul>
  );
}
