// Death screen. Modal dialog shown when the local snake dies; offers respawn (after a
// short delay) or quit to the lobby. Announced assertively; focus moves in and is
// trapped until dismissed.

import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../a11y/useFocusTrap.js";
import { useAnnouncer } from "../a11y/announcer.js";
import type { DeathInfo } from "../net/useRoomSocket.js";

export function DeathOverlay({
  death,
  onRespawn,
  onQuit,
}: {
  death: DeathInfo;
  onRespawn: () => void;
  onQuit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { announce } = useAnnouncer();
  const [remaining, setRemaining] = useState(Math.ceil(death.respawnInMs / 1000));
  useFocusTrap(ref, true);

  useEffect(() => {
    announce(`You died. Final score ${death.score}.`, "assertive");
  }, [death.score, announce]);

  useEffect(() => {
    const end = death.at + death.respawnInMs;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - performance.now()) / 1000));
      setRemaining(left);
      if (left <= 0) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [death]);

  const ready = remaining <= 0;

  return (
    <div className="scrim">
      <div
        ref={ref}
        className="panel stack"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="death-title"
        aria-describedby="death-desc"
        style={{ maxWidth: 420, textAlign: "center" }}
      >
        <h2 id="death-title" style={{ margin: 0, fontSize: "1.8rem" }}>You died</h2>
        <p id="death-desc" style={{ margin: 0, color: "var(--text-muted)" }}>
          Final score <strong style={{ color: "var(--text)" }}>{death.score}</strong>.
        </p>
        <div className="stack">
          <button className="btn btn--primary btn--lg btn--block" onClick={onRespawn} disabled={!ready}>
            {ready ? "Respawn" : `Respawn in ${remaining}…`}
          </button>
          <button className="btn btn--block" onClick={onQuit}>
            Quit to lobby
          </button>
        </div>
      </div>
    </div>
  );
}
