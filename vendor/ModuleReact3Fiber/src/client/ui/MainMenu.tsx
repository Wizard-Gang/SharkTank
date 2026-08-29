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
          <SharkTankMark />
          <div>
            <span>Wizard Gang</span>
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

        <nav className="shark-menu__nav" aria-label="Shark Tank pages">
          <a href={`${backend.apiBase}/roadmap/`} target="_blank" rel="noopener noreferrer">Roadmap</a>
          <a href={`${backend.apiBase}/docs/`} target="_blank" rel="noopener noreferrer">API</a>
          <a href={`${backend.apiBase}/status/`} target="_blank" rel="noopener noreferrer">Status</a>
          <a href={`${backend.apiBase}/incidents/`} target="_blank" rel="noopener noreferrer">Incidents</a>
          <a href={`${backend.apiBase}/inquiry/`} target="_blank" rel="noopener noreferrer">Inquiry</a>
          <a href={`${backend.apiBase}/logs/`} target="_blank" rel="noopener noreferrer">Logs</a>
          <a href={`${backend.apiBase}/audit/`} target="_blank" rel="noopener noreferrer">Audit</a>
        </nav>
      </div>
    </div>
  );
}

function SharkTankMark() {
  return (
    <svg className="shark-menu__mark" viewBox="0 0 180 110" role="img" aria-label="Goofy Shark Tank mascot">
      <path d="M35 55 4 26l8 30-8 29 31-25c12 26 67 35 112 4 12-8 20-8 29-9-9-2-17-4-29-12C102 13 47 27 35 55Z" fill="#22e6ff" stroke="#070b14" strokeWidth="5" strokeLinejoin="round" />
      <path d="M76 29 91 5l19 28M76 75 90 102l14-29" fill="#0891b2" stroke="#070b14" strokeWidth="5" strokeLinejoin="round" />
      <path d="M41 48c24-15 62-22 106-5-43-8-79 1-105 19Z" fill="#fff" opacity=".18" />
      <circle cx="137" cy="40" r="13" fill="#fff" stroke="#070b14" strokeWidth="4" />
      <circle cx="142" cy="43" r="5" fill="#070b14" />
      <path d="M119 66q21 16 42-2-21 31-42 2Z" fill="#47142a" stroke="#070b14" strokeWidth="4" strokeLinejoin="round" />
      <path d="m126 69 5 10 6-8 6 8 5-11" fill="#fff" stroke="#070b14" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="158" cy="48" r="3" fill="#070b14" />
    </svg>
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
