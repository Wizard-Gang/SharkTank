// Main menu. The landing screen: primary Play action plus Customize and Settings.
// Focus lands on the heading region on mount (handled by App); the Play button is the
// first tab stop. Shows the player's personal best from their profile.

import { getBackend, supportsPhpBackend, switchBackend } from "../net/backend.js";

export function MainMenu({
  playerName,
  best,
  onPlay,
  onCustomize,
  onSettings,
}: {
  playerName: string;
  best: number;
  onPlay: () => void;
  onCustomize: () => void;
  onSettings: () => void;
}) {
  const backend = getBackend();
  return (
    <div className="center-screen">
      <div className="stack shark-menu" style={{ width: "min(620px, 100%)", textAlign: "center" }}>
        <div className="shark-menu__brand">
          <span className="wizardgang-menu-mark" aria-hidden="true" />
          <div>
            <span>WIZARDGANG</span>
            <h1>Shark Tank</h1>
          </div>
        </div>
        <p className="shark-menu__tagline">Realtime multiplayer Shark Tank</p>

        <div className="panel stack shark-menu__panel">
          <button className="btn btn--primary btn--lg btn--block" onClick={onPlay} autoFocus>Play</button>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn btn--block" onClick={onCustomize}>Customize</button>
            <button className="btn btn--block" onClick={onSettings}>Settings</button>
          </div>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>
            {playerName || "Player"}
            {best > 0 && <> · best {best}</>}
          </p>
        </div>

        {supportsPhpBackend() && <div className="stack" style={{ gap: 6 }}>
          <span id="backend-label" style={{ color: "var(--text-faint)", fontSize: "0.8rem" }}>Backend</span>
          <div role="group" aria-labelledby="backend-label" style={segWrap}>
            {(["ts", "php"] as const).map((id) => {
              const active = backend.id === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => !active && switchBackend(id)}
                  style={{ ...segBtn, ...(active ? segActive : null) }}
                >
                  {id === "ts" ? "TypeScript" : "PHP"}
                </button>
              );
            })}
          </div>
        </div>}

      </div>
    </div>
  );
}

const segWrap: React.CSSProperties = {
  display: "inline-flex",
  gap: 4,
  padding: 4,
  borderRadius: 999,
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
};
const segBtn: React.CSSProperties = {
  minHeight: 36,
  padding: "0 16px",
  borderRadius: 999,
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
};
const segActive: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--accent-contrast)",
};
