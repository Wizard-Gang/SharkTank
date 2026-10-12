// Respawn card, shown when the local shark dies.
//
// Deliberately NOT a modal. Being dead is not a dialog you are trapped in: you still
// need the tools rail to mute the music, open settings, or leave the tank while the
// respawn timer runs. So the scrim is click-through, the card itself is the only thing
// that takes pointer events, and there is no focus trap — focus is placed on Respawn
// (the primary action) and Tab walks out of the card normally. It is still announced
// assertively, while the always-reachable tools rail keeps the explicit exit action available.

import { useEffect, useRef, useState } from "react";
import { useAnnouncer } from "../a11y/announcer.js";
import type { DeathInfo } from "../net/useRoomSocket.js";
import { respawnCountdown } from "./roundPresentation.js";

export function DeathOverlay({
  death,
  tier,
  onRespawn,
  onQuit,
}: {
  death: DeathInfo;
  tier: string | null;
  onRespawn: () => void;
  onQuit: () => void;
}) {
  const respawnRef = useRef<HTMLButtonElement>(null);
  const { announce } = useAnnouncer();
  const [countdown, setCountdown] = useState(() => respawnCountdown(death.at, death.respawnInMs, performance.now()));

  const cause = death.action === "bite"
    ? death.by ? `Bitten by ${death.by}.` : "Defeated by a bite."
    : death.action === "retire"
      ? "This shark retired from the round."
      : "Shark eliminated.";

  useEffect(() => {
    announce(`${cause} Final score ${death.score} points.`, "assertive");
  }, [cause, death.score, announce]);

  useEffect(() => {
    const update = () => respawnCountdown(death.at, death.respawnInMs, performance.now());
    setCountdown(update());
    const id = setInterval(() => {
      const next = update();
      setCountdown(next);
      if (next.remaining <= 0) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [death]);

  const ready = countdown.remaining <= 0;

  // Move focus to Respawn as soon as it becomes usable, so a keyboard player can come
  // straight back with Enter without hunting for the button.
  useEffect(() => {
    if (ready) respawnRef.current?.focus();
  }, [ready]);

  return <DeathCard death={death} tier={tier} cause={cause} {...countdown} onRespawn={onRespawn} onQuit={onQuit} respawnRef={respawnRef} />;
}

export function DeathCard({ death, tier, cause, remaining, progress, onRespawn, onQuit, respawnRef }: {
  death: DeathInfo;
  tier: string | null;
  cause: string;
  remaining: number;
  progress: number;
  onRespawn: () => void;
  onQuit: () => void;
  respawnRef?: React.Ref<HTMLButtonElement>;
}) {
  const ready = remaining <= 0;
  return (
    <div className="scrim scrim--respawn">
      <div
        className="panel stack respawn-card"
        role="dialog"
        aria-labelledby="death-title"
        aria-describedby="death-desc"
      >
        <p className="round-result-kicker">BACK INTO THE BLUE</p>
        <h2 id="death-title">Shark eliminated</h2>
        <p id="death-desc" className="death-cause">{cause}</p>
        <dl className="life-summary">
          <div><dt>Your tier</dt><dd>{tier ?? "Unavailable"}</dd></div>
          <div><dt>Life score</dt><dd>{death.score} <span>points</span></dd></div>
        </dl>
        <div className="stack">
          <button ref={respawnRef} className="btn btn--primary btn--lg btn--block respawn-primary" onClick={onRespawn} disabled={!ready}>
            <svg className="respawn-ring" viewBox="0 0 40 40" aria-hidden="true">
              <circle className="respawn-ring__track" cx="20" cy="20" r="16" />
              <circle className="respawn-ring__fill" cx="20" cy="20" r="16" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} transform="rotate(-90 20 20)" />
              <text x="20" y="25" textAnchor="middle">{ready ? "✓" : remaining}</text>
            </svg>
            <span>{ready ? "Respawn" : `Respawn in ${remaining}…`}</span>
          </button>
          <button className="btn btn--block" onClick={onQuit}>
            Back to menu
          </button>
        </div>
        <p className="respawn-note">The tools below stay live while you wait.</p>
      </div>
    </div>
  );
}
