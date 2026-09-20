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
      <div className="stack shark-menu shark-menu--centered">
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
          <div className="row row--center">
            <button className="btn btn--block" onClick={onCustomize}>Customize</button>
            <button className="btn btn--block" onClick={onSettings}>Settings</button>
          </div>
          <p className="menu-player-summary">
            {playerName || "Player"}
            {best > 0 && <> · best {best}</>}
          </p>
        </div>

        {supportsPhpBackend() && <div className="stack backend-switcher">
          <span id="backend-label" className="backend-label">Backend</span>
          <div role="group" aria-labelledby="backend-label" className="backend-segments">
            {(["ts", "php"] as const).map((id) => {
              const active = backend.id === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => !active && switchBackend(id)}
                  className={active ? "backend-segment is-active" : "backend-segment"}
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
