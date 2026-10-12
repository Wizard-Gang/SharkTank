import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomSocket } from "../net/useRoomSocket.js";
import type { ClientState } from "../net/clientState.js";
import { keyLabel, useSettings, type Settings } from "../settings/SettingsContext.js";
import { advanceHints, HINTS, HINT_WINDOW_MS, hintSuccess, type SchoolCue } from "./firstRunCoaching.js";

export function hintText(step: number, touch: boolean, binds: Settings["controls"]["keybinds"]) {
  return step === 0 && !touch
    ? `Swim with ${keyLabel(binds.pitchUp)}/${keyLabel(binds.pitchDown)} and ${keyLabel(binds.yawLeft)}/${keyLabel(binds.yawRight)}`
    : HINTS[step] ?? "";
}

export function useFirstRunHints(socket: RoomSocket, enabled: boolean) {
  const { hints, saveHints } = useSettings();
  const progressRef = useRef(hints);
  progressRef.current = hints;
  const steered = useRef(false);
  const schoolCueRef = useRef<SchoolCue | null>(null);
  const [cue, setCue] = useState<SchoolCue | null>(null);
  const onSteer = useCallback(() => { steered.current = true; }, []);

  const finished = hints.step >= HINTS.length;
  useEffect(() => {
    if (finished) return;
    let previous: ClientState | null = null;
    const update = () => {
      const now = Date.now();
      let progress = advanceHints(progressRef.current, { type: "tick", now });
      const state = socket.stateRef.current;
      const me = state?.sharks.find((shark) => shark.id === socket.youId);
      const active = enabled && document.visibilityState !== "hidden" && socket.status === "open" && me?.alive && state?.round.phase !== "result";
      if (active && state && socket.youId) {
        progress = advanceHints(progress, { type: "start", now });
        const success = hintSuccess(previous, state, socket.youId);
        if (steered.current) progress = advanceHints(progress, { type: "success", step: 0, now });
        if (success.ate) progress = advanceHints(progress, { type: "success", step: 1, now });
        if (success.bit) progress = advanceHints(progress, { type: "success", step: 2, now });
        if (!previous || state.round.number !== previous.round.number || state.tick > previous.tick) previous = state;
      } else {
        previous = null;
        steered.current = false;
      }
      if (progress !== progressRef.current) {
        progressRef.current = progress;
        saveHints(progress);
      }
      setCue(active && progress.step === 1 ? schoolCueRef.current : null);
    };
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [enabled, socket.status, socket.stateRef, socket.youId, saveHints, finished]);

  const skip = useCallback(() => saveHints(advanceHints(progressRef.current, { type: "skip", now: Date.now() })), [saveHints]);
  const active = enabled && hints.startedAt !== null && hints.step < HINTS.length
    && Date.now() - hints.startedAt < HINT_WINDOW_MS;
  return { step: active ? hints.step : null, cue, schoolCueRef: active && hints.step === 1 ? schoolCueRef : undefined, onSteer, skip };
}

export function FirstRunHints({ step, touch, binds, cue, onSkip }: {
  step: number | null;
  touch: boolean;
  binds: Settings["controls"]["keybinds"];
  cue: SchoolCue | null;
  onSkip: () => void;
}) {
  const text = step === null ? "" : hintText(step, touch, binds);
  const lastAnnounced = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (step === null) { setAnnouncement(""); return; }
    if (step === lastAnnounced.current) return;
    lastAnnounced.current = step;
    setAnnouncement(text);
  }, [step, text]);
  return <>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
    {text && <section className="first-run-hint" aria-label="First-run hint">
      <p>{text}</p>
      {step === 1 && cue && <span className="first-run-hint__distance">School fish · {Math.round(cue.distance)}m{cue.behind ? " · behind you" : ""}</span>}
      <button type="button" onClick={(event) => {
        onSkip();
        event.currentTarget.closest("main")?.querySelector<HTMLElement>(".game-viewport")?.focus();
      }}>Skip hints</button>
    </section>}
    {step === 1 && cue && <svg className="first-run-school-arrow" viewBox={`0 0 ${cue.width} ${cue.height}`} aria-hidden="true">
      <g transform={`translate(${cue.x} ${cue.y}) rotate(${cue.angle})`}>
        <path d="M-34-7H-15V-15L0 0-15 15V7H-34Z" />
      </g>
    </svg>}
  </>;
}
