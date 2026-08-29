// Systems menu: Graphics / Audio / Controls / Accessibility. Rendered either as a
// full screen (from the main menu) or as a modal overlay (from the in-game gear) when `onClose`
// is supplied. Tabs follow the WAI-ARIA tabs pattern (arrow-key navigation, roving
// focus); every control has a programmatic name and current value.

import { useId, useRef, useState } from "react";
import { keyLabel, useSettings, type Keybinds } from "../settings/SettingsContext.js";
import { useFocusTrap } from "../a11y/useFocusTrap.js";

type Tab = "graphics" | "audio" | "controls" | "accessibility";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "graphics", label: "Graphics" },
  { id: "audio", label: "Audio" },
  { id: "controls", label: "Controls" },
  { id: "accessibility", label: "Accessibility" },
];

export function Settings({ onClose }: { onClose?: () => void }) {
  const overlay = Boolean(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, overlay, onClose);

  const body = (
    <div ref={ref} className={overlay ? "panel stack" : "stack"} role={overlay ? "dialog" : undefined} aria-modal={overlay || undefined} aria-labelledby="settings-title" style={{ width: "min(720px, 100%)", maxHeight: overlay ? "86vh" : undefined, overflow: "auto" }}>
      <div className="spread">
        <h1 id="settings-title" style={{ margin: 0, fontSize: "1.6rem" }}>Settings</h1>
        {onClose && <button className="btn" onClick={onClose} aria-label="Close settings">Close</button>}
      </div>
      <SettingsTabs />
    </div>
  );

  if (overlay) return <div className="scrim">{body}</div>;
  return <div className="center-screen">{body}</div>;
}

function SettingsTabs() {
  const [tab, setTab] = useState<Tab>("graphics");
  const baseId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    const t = TABS[next].id;
    setTab(t);
    tabRefs.current[t]?.focus();
  };

  return (
    <div className="stack">
      <div role="tablist" aria-label="Settings categories" style={{ display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
        {TABS.map((t, i) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => (tabRefs.current[t.id] = el)}
              role="tab"
              id={`${baseId}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? "btn btn--primary" : "btn btn--ghost"}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${baseId}-panel-${tab}`} aria-labelledby={`${baseId}-tab-${tab}`} tabIndex={0}>
        {tab === "graphics" && <GraphicsPanel />}
        {tab === "audio" && <AudioPanel />}
        {tab === "controls" && <ControlsPanel />}
        {tab === "accessibility" && <AccessibilityPanel />}
      </div>
    </div>
  );
}

// ── Reusable fields ─────────────────────────────────────────────────────────────
function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="spread" style={{ cursor: "pointer", padding: "8px 0" }}>
      <span>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {hint && <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.9rem" }}>{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 24, height: 24 }} />
    </label>
  );
}

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  const id = useId();
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <div className="field">
      <label htmlFor={id}>{label}: {pct}%</label>
      <input id={id} className="range" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={`${pct}%`} />
    </div>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ v: T; l: string }>; onChange: (v: T) => void }) {
  return (
    <fieldset style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 12 }}>
      <legend style={{ padding: "0 6px", fontWeight: 600 }}>{label}</legend>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {options.map((o) => (
          <label key={o.v} className="row" style={{ gap: 6, cursor: "pointer" }}>
            <input type="radio" name={label} checked={value === o.v} onChange={() => onChange(o.v)} style={{ width: 20, height: 20 }} />
            {o.l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ── Panels ──────────────────────────────────────────────────────────────────────
function GraphicsPanel() {
  const { settings, update } = useSettings();
  const g = settings.graphics;
  return (
    <div className="stack">
      <Choice label="Quality" value={g.quality} onChange={(v) => update("graphics", { quality: v })} options={[{ v: "low", l: "Low" }, { v: "medium", l: "Medium" }, { v: "high", l: "High" }]} />
      <Toggle label="Show minimap" checked={g.showMinimap} onChange={(v) => update("graphics", { showMinimap: v })} />
      <Toggle label="Show ground grid" checked={g.showGrid} onChange={(v) => update("graphics", { showGrid: v })} />
      <Toggle label="Camera motion" hint="Smooth camera follow. Turn off to reduce motion." checked={g.cameraShake} onChange={(v) => update("graphics", { cameraShake: v })} />
    </div>
  );
}

function AudioPanel() {
  const { settings, update } = useSettings();
  const a = settings.audio;
  return (
    <div className="stack">
      <Slider label="Master volume" value={a.master} onChange={(v) => update("audio", { master: v })} />
      <Slider label="Sound effects" value={a.sfx} onChange={(v) => update("audio", { sfx: v })} />
      <Slider label="Music" value={a.music} onChange={(v) => update("audio", { music: v })} />
      <Toggle label="Captions for audio cues" hint="Show on-screen text for important sounds." checked={a.captions} onChange={(v) => update("audio", { captions: v })} />
    </div>
  );
}

const REBINDABLE: Array<{ key: keyof Keybinds; label: string }> = [
  { key: "left", label: "Turn left" },
  { key: "right", label: "Turn right" },
  { key: "boost", label: "Chomp dash" },
];

function ControlsPanel() {
  const { settings, update } = useSettings();
  const [listening, setListening] = useState<keyof Keybinds | null>(null);

  const capture = (which: keyof Keybinds, e: React.KeyboardEvent) => {
    e.preventDefault();
    if (e.key === "Escape") {
      setListening(null);
      return;
    }
    const code = e.code === "Space" ? "Space" : e.code;
    // Ignore keys with no physical code and lone modifiers — keep listening instead of
    // binding a control to nothing (which would leave it unusable).
    const MODIFIERS = ["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"];
    if (!code || MODIFIERS.includes(code)) return;
    update("controls", { keybinds: { ...settings.controls.keybinds, [which]: code } });
    setListening(null);
  };

  return (
    <div className="stack">
      <p style={{ margin: 0, color: "var(--text-muted)" }}>
        Both pointer and keyboard fully control the game. Click a binding, then press a key. Press Esc to cancel.
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {REBINDABLE.map(({ key, label }) => (
          <li key={key} className="spread">
            <span style={{ fontWeight: 600 }}>{label}</span>
            <button
              className={listening === key ? "btn btn--primary" : "btn"}
              aria-label={`${label}: currently ${keyLabel(settings.controls.keybinds[key])}. Activate to rebind.`}
              onClick={() => setListening(key)}
              onKeyDown={(e) => listening === key && capture(key, e)}
            >
              {listening === key ? "Press a key…" : keyLabel(settings.controls.keybinds[key])}
            </button>
          </li>
        ))}
      </ul>
      <Toggle label="Turn assist" hint="Gentler, slower steering." checked={settings.controls.turnAssist} onChange={(v) => update("controls", { turnAssist: v })} />
      <Toggle label="Invert steering" checked={settings.controls.invertSteer} onChange={(v) => update("controls", { invertSteer: v })} />
      <Choice
        label="On-screen controls"
        value={settings.controls.touchControls}
        onChange={(v) => update("controls", { touchControls: v })}
        options={[{ v: "auto", l: "Auto (touch devices)" }, { v: "on", l: "Always on" }, { v: "off", l: "Off" }]}
      />
      <Choice
        label="Thumbstick side"
        value={settings.controls.stickSide}
        onChange={(v) => update("controls", { stickSide: v })}
        options={[{ v: "right", l: "Right (dash and rocket left)" }, { v: "left", l: "Left (dash and rocket right)" }]}
      />
    </div>
  );
}

function AccessibilityPanel() {
  const { settings, update, reset } = useSettings();
  const a = settings.a11y;
  return (
    <div className="stack">
      <Choice label="Theme" value={a.theme} onChange={(v) => update("a11y", { theme: v })} options={[{ v: "system", l: "System" }, { v: "dark", l: "Dark" }, { v: "light", l: "Light" }]} />
      <Choice label="Contrast" value={a.contrast} onChange={(v) => update("a11y", { contrast: v })} options={[{ v: "normal", l: "Normal" }, { v: "high", l: "High" }]} />
      <Choice label="Motion" value={a.motion} onChange={(v) => update("a11y", { motion: v })} options={[{ v: "full", l: "Full" }, { v: "reduced", l: "Reduced" }]} />
      <Slider label="Text size" value={a.fontScale} min={0.9} max={1.6} step={0.1} onChange={(v) => update("a11y", { fontScale: v })} />
      <Toggle label="Show shark name labels" hint="Adds text names above sharks so colors aren't the only cue." checked={a.colorblindLabels} onChange={(v) => update("a11y", { colorblindLabels: v })} />
      <div>
        <button className="btn btn--ghost" onClick={reset}>Reset all settings to defaults</button>
      </div>
    </div>
  );
}
