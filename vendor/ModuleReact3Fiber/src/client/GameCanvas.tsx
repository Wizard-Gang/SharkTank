import { Canvas } from "@react-three/fiber";
import { useEngine } from "./useEngine.js";
import { Scene } from "./Scene.js";

export interface GameCanvasProps {
  /** Base URL for the server API (save/load). Defaults to same origin. */
  baseUrl?: string;
}

/**
 * Self-contained game view: the R3F canvas + a minimal HUD overlay with
 * save/load (which exercise the server's generic blob store) and reset.
 */
export function GameCanvas({ baseUrl = "" }: GameCanvasProps) {
  const engine = useEngine(baseUrl);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas shadows camera={{ position: [0, 9, 11], fov: 55 }} style={{ background: "#0b0a14" }}>
        <Scene engine={engine} />
      </Canvas>

      <div style={hudStyle}>
        <div style={{ fontWeight: 700, letterSpacing: 0.4 }}>ModuleReact3Fiber</div>
        <div>score <b>{engine.hud.score}</b> · orbs {engine.hud.orbs} · tick {engine.hud.tick}</div>
        <div style={{ opacity: 0.7, fontSize: 12 }}>WASD / arrows to move · collect the orbs</div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button style={btn} onClick={() => engine.save("slot-1")}>Save</button>
          <button style={btn} onClick={() => engine.load("slot-1")}>Load</button>
          <button style={btn} onClick={() => engine.reset()}>Reset</button>
        </div>
      </div>
    </div>
  );
}

const hudStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(18,16,34,0.72)",
  color: "#e9e6ff",
  font: "14px/1.5 ui-sans-serif, system-ui, sans-serif",
  backdropFilter: "blur(6px)",
  border: "1px solid rgba(124,92,255,0.35)",
};

const btn: React.CSSProperties = {
  background: "#2a2450",
  color: "#e9e6ff",
  border: "1px solid rgba(124,92,255,0.5)",
  borderRadius: 8,
  padding: "4px 10px",
  cursor: "pointer",
  font: "13px ui-sans-serif, system-ui, sans-serif",
};
