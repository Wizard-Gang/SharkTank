// Composes a live game: the R3F canvas + HUD/leaderboard/minimap overlays + pause and
// death dialogs. Owns the room socket for its lifetime and coordinates when gameplay
// input is live (disabled whenever a modal is open — pause, settings, or death).

import { useCallback, useEffect, useRef, useState } from "react";
import { GameCanvas } from "../game/GameCanvas.js";
import type { SnakeLabel } from "../game/Scene.js";
import { useRoomSocket } from "../net/useRoomSocket.js";
import { useSettings } from "../settings/SettingsContext.js";
import { useAnnouncer } from "../a11y/announcer.js";
import { useGameAudio } from "../audio/useGameAudio.js";
import { Hud } from "./Hud.js";
import { Leaderboard } from "./Leaderboard.js";
import { Minimap } from "./Minimap.js";
import { PauseMenu } from "./PauseMenu.js";
import { DeathOverlay } from "./DeathOverlay.js";
import { Settings } from "./Settings.js";
import { QuickA11y } from "./QuickA11y.js";
import { HelpOverlay } from "./HelpOverlay.js";
import { SnakeLabels } from "./SnakeLabels.js";
import { Captions } from "./Captions.js";

export interface GameScreenProps {
  room: { id: string; name: string };
  identity: { name: string; skin: string };
  onQuit: () => void;
}

export function GameScreen({ room, identity, onQuit }: GameScreenProps) {
  const { settings } = useSettings();
  const { announce } = useAnnouncer();
  const socket = useRoomSocket(room.id, identity, room.name);
  const caption = useGameAudio(socket, settings);
  const labelsRef = useRef<SnakeLabel[]>([]);
  const [paused, setPaused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    announce(`Entered ${room.name}. Playing as ${identity.name}.`);
  }, [room.name, identity.name, announce]);

  // Pause on the bound key (default Esc); "?" toggles the hotkeys overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const code = e.code === "Space" ? "Space" : e.code;
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((h) => !h);
        return;
      }
      if (code === settings.controls.keybinds.pause) {
        if (settingsOpen) return; // Settings handles its own Esc
        if (helpOpen) {
          setHelpOpen(false);
          return;
        }
        if (socket.death) return;
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.controls.keybinds.pause, settingsOpen, helpOpen, socket.death]);

  const inputEnabled = !paused && !settingsOpen && !helpOpen && !socket.death;

  const handleQuit = useCallback(() => {
    announce("Left the arena.");
    onQuit();
  }, [announce, onQuit]);

  return (
    <main id="main" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <GameCanvas socket={socket} settings={settings} inputEnabled={inputEnabled} labelsRef={labelsRef} />

      {settings.a11y.colorblindLabels && <SnakeLabels labelsRef={labelsRef} />}

      <Hud socket={socket} />
      <Leaderboard socket={socket} />
      {settings.graphics.showMinimap && <Minimap socket={socket} />}
      <QuickA11y onHelp={() => setHelpOpen(true)} />
      {settings.audio.captions && <Captions caption={caption} />}

      {/* Connection banner */}
      {socket.status !== "open" && (
        <div role="status" style={connBanner}>
          {socket.status === "connecting" ? "Connecting…" : "Reconnecting…"}
        </div>
      )}

      {/* Pause button (pointer users) — keyboard uses the pause key */}
      <button
        className="btn"
        style={{ position: "absolute", top: 12, right: 244, zIndex: 11 }}
        onClick={() => setPaused(true)}
        aria-label="Pause game"
      >
        Pause
      </button>

      {socket.death && !paused && (
        <DeathOverlay death={socket.death} onRespawn={socket.respawn} onQuit={handleQuit} />
      )}

      {paused && (
        <PauseMenu
          onResume={() => setPaused(false)}
          onSettings={() => setSettingsOpen(true)}
          onQuit={handleQuit}
        />
      )}

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
    </main>
  );
}

const connBanner: React.CSSProperties = {
  position: "absolute",
  bottom: 12,
  left: "50%",
  transform: "translateX(-50%)",
  background: "var(--overlay-scrim)",
  border: "1px solid var(--warning)",
  color: "var(--text)",
  padding: "8px 16px",
  borderRadius: "var(--radius)",
  zIndex: 12,
};
