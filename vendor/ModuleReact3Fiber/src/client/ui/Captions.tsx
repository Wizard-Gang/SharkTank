// Visual captions for sound effects (WCAG 1.2.1 — an alternative for audio cues, and
// a way to verify audio is firing without hearing it). Shown only when captions are on.

import type { Caption } from "../audio/useGameAudio.js";

export function Captions({ caption }: { caption: Caption | null }) {
  if (!caption) return null;
  return (
    <div aria-hidden="true" style={wrap}>
      <span style={pill} key={caption.id}>{caption.text}</span>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "absolute",
  bottom: 84,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 11,
  pointerEvents: "none",
};
const pill: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 14px",
  borderRadius: 999,
  background: "rgba(6,5,12,0.85)",
  border: "1px solid var(--border-strong)",
  color: "var(--text)",
  fontWeight: 700,
  letterSpacing: 0.4,
};
