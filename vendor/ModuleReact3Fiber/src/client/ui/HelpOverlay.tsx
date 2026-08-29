// Controls & hotkeys reference. Opened with "?" or the ? button. Lists the three
// control schemes (mouse-only, keyboard-only, combo) and the live keybinds, so every
// player can discover how to play regardless of input device. Modal with focus trap.

import { useRef } from "react";
import { useFocusTrap } from "../a11y/useFocusTrap.js";
import { keyLabel, useSettings } from "../settings/SettingsContext.js";

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  const { settings } = useSettings();
  const k = settings.controls.keybinds;

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
          <h2 id="help-title" style={{ margin: 0 }}>Controls &amp; hotkeys</h2>
          <button className="btn" onClick={onClose} aria-label="Close help">Close</button>
        </div>

        <section aria-labelledby="help-mouse">
          <h3 id="help-mouse" style={h3}>Mouse only</h3>
          <ul style={ul}>
            <li>Move the cursor — the snake steers toward it.</li>
            <li>Hold the left button — boost (spends length for speed).</li>
            <li>All menus, pause, respawn and these toggles are clickable.</li>
          </ul>
        </section>

        <section aria-labelledby="help-kbd">
          <h3 id="help-kbd" style={h3}>Keyboard only</h3>
          <ul style={ul}>
            <li><Key>{keyLabel(k.left)}</Key> / <Key>{keyLabel(k.right)}</Key> — turn left / right</li>
            <li><Key>{keyLabel(k.boost)}</Key> — boost</li>
            <li><Key>{keyLabel(k.pause)}</Key> — pause / resume</li>
            <li><Key>?</Key> — this help · <Key>Tab</Key> — move between controls</li>
          </ul>
        </section>

        <section aria-labelledby="help-combo">
          <h3 id="help-combo" style={h3}>Combo</h3>
          <p style={{ margin: 0, color: "var(--text-muted)" }}>
            Mouse and keyboard work at the same time — steer with the mouse and boost with a key, or
            any mix. Bindings are remappable in Settings → Controls.
          </p>
        </section>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd style={kbd}>{children}</kbd>;
}

const h3: React.CSSProperties = { margin: "0 0 6px", fontSize: "1rem" };
const ul: React.CSSProperties = { margin: 0, paddingLeft: 18, display: "grid", gap: 4, color: "var(--text-muted)" };
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
