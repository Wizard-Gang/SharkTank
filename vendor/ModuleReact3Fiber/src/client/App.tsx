// App shell + screen state machine: Menu → Lobby → Game, with Customize and Settings
// reachable from the menu. Wraps everything in the Settings + Announcer providers,
// renders the skip link and the #main landmark, loads/saves the player profile, and
// manages focus on screen transitions (moving focus to the new screen's region).

import { useCallback, useEffect, useRef, useState } from "react";
import "./ui/theme.css";
import { SettingsProvider, useSettings } from "./settings/SettingsContext.js";
import { AnnouncerProvider, useAnnouncer } from "./a11y/announcer.js";
import { MainMenu } from "./ui/MainMenu.js";
import { Lobby } from "./ui/Lobby.js";
import { Customize } from "./ui/Customize.js";
import { Settings } from "./ui/Settings.js";
import { GameScreen } from "./ui/GameScreen.js";
import { logUserAction } from "./net/audit.js";
import { API, type ProfileResponse } from "../protocol/index.js";
import { DEFAULT_SKIN } from "../engine/index.js";

type Screen = "menu" | "lobby" | "customize" | "settings" | "game";

export interface AppProps {
  /** Base URL for the server API. Defaults to same origin. */
  baseUrl?: string;
}

export function App({ baseUrl = "" }: AppProps) {
  return (
    <SettingsProvider>
      <AnnouncerProvider>
        <Shell baseUrl={baseUrl} />
      </AnnouncerProvider>
    </SettingsProvider>
  );
}

function Shell({ baseUrl }: { baseUrl: string }) {
  const { settings } = useSettings();
  const { announce } = useAnnouncer();
  const [screen, setScreen] = useState<Screen>("menu");
  const [name, setName] = useState("Player");
  const [skin, setSkin] = useState(DEFAULT_SKIN);
  const [best, setBest] = useState(0);
  const [room, setRoom] = useState<{ id: string; name: string } | null>(null);
  const regionRef = useRef<HTMLDivElement>(null);

  // Load the persisted profile once.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(baseUrl + API.profile);
        const data = (await res.json()) as ProfileResponse;
        if (data.ok) {
          setName(data.profile.name);
          setSkin(data.profile.skin);
          setBest(data.profile.best);
        }
      } catch {
        /* offline / first run — defaults are fine */
      }
    })();
  }, [baseUrl]);

  // Persist profile (name/skin/settings) when they change, debounced.
  useEffect(() => {
    const id = setTimeout(() => {
      void fetch(baseUrl + API.profile, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, skin, settings: settings as unknown as Record<string, unknown> }),
      }).catch(() => {});
    }, 600);
    return () => clearTimeout(id);
  }, [name, skin, settings, baseUrl]);

  // Move focus to the new screen region and announce it (skip menu — it autofocuses Play).
  useEffect(() => {
    if (screen !== "menu" && screen !== "game") regionRef.current?.focus();
    const titles: Record<Screen, string> = {
      menu: "Main menu",
      lobby: "Arena list",
      customize: "Customize",
      settings: "Settings",
      game: "In game",
    };
    announce(titles[screen]);
  }, [screen, announce]);

  const join = useCallback(
    (r: { id: string; name: string }) => {
      logUserAction({ type: "play", subject: name || "Player", room: r.id, detail: r.name }, baseUrl);
      setRoom(r);
      setScreen("game");
    },
    [name, baseUrl],
  );

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>

      {/* Focusable region wrapper for screen transitions (except game, which is its own <main>). */}
      {screen !== "game" ? (
        <div id="main" ref={regionRef} tabIndex={-1} style={{ minHeight: "100%", outline: "none" }}>
          {screen === "menu" && (
            <MainMenu
              playerName={name}
              best={best}
              onPlay={() => setScreen("lobby")}
              onCustomize={() => setScreen("customize")}
              onSettings={() => setScreen("settings")}
            />
          )}
          {screen === "lobby" && <Lobby playerName={name} onJoin={join} onBack={() => setScreen("menu")} baseUrl={baseUrl} />}
          {screen === "customize" && (
            <Customize
              name={name}
              skin={skin}
              onConfirm={(n, sk) => {
                setName(n);
                setSkin(sk);
                logUserAction({ type: "customize", subject: n, detail: `skin ${sk}` }, baseUrl);
                setScreen("menu");
              }}
              onExit={() => setScreen("menu")}
            />
          )}
          {screen === "settings" && <SettingsScreen onBack={() => setScreen("menu")} />}
        </div>
      ) : (
        room && (
          <GameScreen
            room={room}
            identity={{ name: name || "Player", skin }}
            onQuit={() => setScreen("lobby")}
          />
        )
      )}
    </>
  );
}

/** Full-screen settings with a Back control (menu context). */
function SettingsScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="stack" style={{ padding: 24 }}>
      <div className="row">
        <button className="btn" onClick={onBack}>← Back</button>
      </div>
      <Settings />
    </div>
  );
}
