// Compact decorative identity tags; the leaderboard and depth cues carry semantic state.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { resolveClientPerformanceProfile } from "../game/performance.js";
import type { SceneQuality } from "../game/sceneMath.js";
import { sharkLabelBox, sharkLabelOpacity, type SharkLabel } from "./sharkLabelSelection.js";
import { EDIBILITY_PRESENTATION } from "./edibility.js";

export function SharkLabels({ labelsRef, quality }: {
  labelsRef: React.MutableRefObject<SharkLabel[]>;
  quality: SceneQuality;
}) {
  const [labels, setLabels] = useState<SharkLabel[]>([]);
  const [bounds, setBounds] = useState({ width: 0, height: 0, offsetX: 0, offsetY: 0, hudBottom: 86 });
  const layerRef = useRef<HTMLDivElement>(null);

  // Measure before paint, including HUD font scaling/status chips and safe-area insets.
  // No layout reads or React state on animation frames.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const parent = layer?.parentElement;
    const hud = parent?.querySelector(".game-hud");
    if (!layer || !parent || !hud) return;
    const measure = () => {
      const rect = layer.getBoundingClientRect();
      const screen = parent.getBoundingClientRect();
      setBounds({ width: rect.width, height: rect.height, offsetX: rect.left - screen.left, offsetY: rect.top - screen.top,
        hudBottom: Math.max(86, hud.getBoundingClientRect().bottom - rect.top + 8) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(hud);
    observer.observe(layer);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  useEffect(() => {
    const tick = () => setLabels(labelsRef.current.slice(0, 5));
    tick();
    const timer = setInterval(tick, resolveClientPerformanceProfile(quality).labelUpdateMs);
    return () => clearInterval(timer);
  }, [labelsRef, quality]);

  return <SharkLabelReadout labels={labels} {...bounds} layerRef={layerRef} />;
}

export function SharkLabelReadout({ labels, hudBottom = 86, width = 375, height = 667, offsetX = 0, offsetY = 0, layerRef }: {
  labels: readonly SharkLabel[];
  hudBottom?: number;
  width?: number;
  height?: number;
  offsetX?: number;
  offsetY?: number;
  layerRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={layerRef} className="shark-label-layer" aria-hidden="true">
      <svg width="100%" height="100%">
        {width > 0 && labels.slice(0, 5).map((l) => {
          const relation = l.edibility ? EDIBILITY_PRESENTATION[l.edibility] : null;
          const box = sharkLabelBox(l, width, height, hudBottom, offsetX, offsetY);
          return (
            <g key={l.id} opacity={sharkLabelOpacity(l.distance)}>
              <foreignObject {...box}>
                <div className="shark-label-slot">
                  <span className={`shark-label${relation ? ` shark-label--${l.edibility}` : ""}${l.me ? " is-me" : ""}${l.apex ? " is-apex" : ""}`}>
                    {relation && <span className="shark-label__relation">{relation.glyph}</span>}
                    <span className="shark-label__name">{l.name}</span>
                    {l.apex && <span className="shark-label__apex">APEX</span>}
                  </span>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
