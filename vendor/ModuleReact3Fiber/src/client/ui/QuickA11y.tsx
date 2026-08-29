// In-game accessibility quick bar. Mirrors the most-used systems-menu toggles so they
// can be flipped mid-match without opening the pause menu. Each is a real toggle
// button (aria-pressed); the whole bar is keyboard reachable and pointer operable.

import { useSettings } from "../settings/SettingsContext.js";

export function QuickA11y({ onHelp }: { onHelp: () => void }) {
  const { settings, update } = useSettings();
  const a = settings.a11y;
  const au = settings.audio;

  return (
    <div role="group" aria-label="Quick accessibility controls" style={wrap}>
      <Toggle
        label="High contrast"
        pressed={a.contrast === "high"}
        onClick={() => update("a11y", { contrast: a.contrast === "high" ? "normal" : "high" })}
      />
      <Toggle
        label="Reduced motion"
        pressed={a.motion === "reduced"}
        onClick={() => update("a11y", { motion: a.motion === "reduced" ? "full" : "reduced" })}
      />
      <Toggle
        label="Name labels"
        pressed={a.colorblindLabels}
        onClick={() => update("a11y", { colorblindLabels: !a.colorblindLabels })}
      />
      <Toggle
        label="Captions"
        pressed={au.captions}
        onClick={() => update("audio", { captions: !au.captions })}
      />
      <Toggle
        label="Mute"
        pressed={au.master === 0}
        onClick={() => update("audio", { master: au.master === 0 ? 0.8 : 0 })}
      />
      <button className="btn" onClick={onHelp} aria-label="Show controls and hotkeys" aria-keyshortcuts="?" style={{ minWidth: 44 }}>
        ?
      </button>
    </div>
  );
}

function Toggle({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={pressed ? "btn btn--primary" : "btn"}
      aria-pressed={pressed}
      onClick={onClick}
      style={{ fontSize: "0.82rem", padding: "0 10px", minHeight: 40 }}
    >
      {label}
    </button>
  );
}

const wrap: React.CSSProperties = {
  position: "absolute",
  bottom: 12,
  left: 12,
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  maxWidth: "48vw",
  zIndex: 11,
  background: "var(--overlay-scrim)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: 8,
};
