import { useRef } from "react";
import { useFocusTrap } from "../a11y/useFocusTrap.js";
import { keyLabel, useSettings } from "../settings/SettingsContext.js";
import { useTouchControls } from "./TouchControls.js";

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  const { settings } = useSettings();
  const k = settings.controls.keybinds;
  // Documenting keys to someone holding a phone is worse than documenting nothing.
  const touch = useTouchControls(settings);
  const stick = settings.controls.stickSide === "left" ? "left" : "right";
  const pads = stick === "left" ? "right" : "left";

  return (
    <div className="scrim">
      <div
        ref={ref}
        className="panel stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        style={{ width: "min(560px, 100%)", maxHeight: "86vh", overflow: "auto" }}
      >
        <div className="spread">
          <h2 id="help-title" style={{ margin: 0 }}>Controls</h2>
          <button className="btn" onClick={onClose} aria-label="Close help">Close</button>
        </div>

        {touch ? (
          <div className="control-grid">
            <Control icon="steer" label="Steer"><span>Hold the {stick} half</span><small>The stick appears under your thumb; the shark swims that way while you hold.</small></Control>
            <Control icon="dash" label="Dash"><span>{pads} pad</span><small>2s cooldown · half that during a frenzy</small></Control>
            <Control icon="rocket" label="Rocket"><span>{pads} pad</span><small>Lethal · 3s cooldown</small></Control>
            <Control icon="menu" label="Tools"><span>Gear button</span><small>Exit, audio, display, and full settings</small></Control>
          </div>
        ) : (
          <div className="control-grid">
            <Control icon="steer" label="Steer"><Key>{keyLabel(k.left)}</Key><Key>{keyLabel(k.right)}</Key><span>Pointer</span></Control>
            <Control icon="dash" label="Dash"><Key>{keyLabel(k.boost)}</Key><span>Click</span><small>2s cooldown · half that during a frenzy</small></Control>
            <Control icon="rocket" label="Rocket"><Key>Shift</Key><small>Lethal · 3s cooldown</small></Control>
            <Control icon="menu" label="Tools"><Key>Esc</Key><Key>?</Key><small>Exit and settings rail</small></Control>
          </div>
        )}
        <p className="help-note">
          Every 75 seconds a <strong>Feeding Frenzy</strong> drops chum in the middle of the tank:
          everyone swims faster and dashes twice as often for twenty seconds.
        </p>
      </div>
    </div>
  );
}

type ControlIcon = "steer" | "dash" | "rocket" | "menu";
function Control({ icon, label, children }: { icon: ControlIcon; label: string; children: React.ReactNode }) { return <section className="control-card"><ControlSvg name={icon} /><strong>{label}</strong><div>{children}</div></section>; }
function ControlSvg({ name }: { name: ControlIcon }) {
  const paths: Record<ControlIcon, React.ReactNode> = {
    steer: <><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/><circle cx="12" cy="12" r="2"/></>,
    dash: <><path d="M3 8h9M2 12h8M4 16h8M13 5l8 7-8 7Z"/></>,
    rocket: <><path d="M14 4c3-1 5-1 6-1 0 1 0 3-1 6l-7 7-4-4 6-8Z"/><path d="m8 12-4 1-1 4 5-1M12 16l-1 5 4-1 1-4M7 17l-3 3"/><circle cx="16" cy="7" r="2"/></>,
    menu: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></>,
  };
  return <svg className="control-card__icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd style={kbd}>{children}</kbd>;
}

const kbd: React.CSSProperties = {
  display: "inline-block",
  minWidth: 22,
  textAlign: "center",
  padding: "2px 6px",
  background: "var(--surface-3)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  color: "var(--text)",
  fontFamily: "ui-monospace, monospace",
  fontSize: "0.85rem",
};
