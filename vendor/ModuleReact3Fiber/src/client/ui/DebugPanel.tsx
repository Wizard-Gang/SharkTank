import { useEffect, useState } from "react";
import { DEBUG_CODE, type DebugEvent, type DebugLanguage } from "../debug/debugActions.js";
import type { RoomSocket } from "../net/useRoomSocket.js";

const INITIAL_EVENT: DebugEvent = { action: "GAME_STATE_SYNC", event: "waiting for authoritative state", at: 0 };

export function DebugPanel({ socket, onClose }: { socket: RoomSocket; onClose: () => void }) {
  const [active, setActive] = useState<DebugEvent>(INITIAL_EVENT);
  const language: DebugLanguage = socket.captureLanguage;
  const example = DEBUG_CODE[active.action];

  useEffect(() => {
    const sample = () => setActive(debugEvent(socket));
    sample();
    const timer = setInterval(sample, 200);
    return () => clearInterval(timer);
  }, [socket]);

  return (
    <aside className="debug-panel debug-drawer" aria-label="Live browser JavaScript, TypeScript, and PHP game inspector">
      <div className="debug-panel__head">
        <span><span className="debug-live-dot" aria-hidden="true" /> LIVE · {language === "php" ? "PHP" : "TYPESCRIPT"} · {active.action}</span>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close code inspector" title="Close code inspector"><CloseIcon /></button>
      </div>
      <div className="debug-language" role="group" aria-label="Captured log language">
        {(["ts", "php"] as const).map((id) => <button key={id} aria-pressed={language === id} onClick={() => socket.setCaptureLanguage(id)}>{id === "php" ? "PHP" : "TypeScript"}</button>)}
      </div>
      <p className="debug-event" aria-live="polite">{active.event}</p>
      <DataBlock label="Input / Before" values={active.input} />
      <CodeBlock language={language} lines={example[language]} highlight={example.highlight} />
      <DataBlock label="Result / After" values={active.result} />
      <CaptureRecord socket={socket} event={active} language={language} />
    </aside>
  );
}

function CaptureRecord({ socket, event, language }: { socket: RoomSocket; event: DebugEvent; language: DebugLanguage }) {
  const arena = socket.stateRef.current;
  const shark = arena?.snakes.find((item) => item.id === socket.youId);
  const details = Object.entries({ ...(event.input ?? {}), ...(event.result ?? {}) }).map(([key, value]) => `${key}=${String(value)}`).join(";");
  const fields = [new Date(event.at || Date.now()).toISOString(), arena?.tick ?? 0, event.action, language === "ts" ? "typescript" : "php", shark?.name ?? "", details];
  return <section className="debug-code debug-capture"><span className="debug-label">Matching log record</span><pre><code><span>timestamp,tick,action,language,name,details{"\n"}</span><span className="is-active">{fields.map(csvField).join(",")}{"\n"}</span></code></pre></section>;
}

function csvField(value: string | number): string {
  const plain = String(value).replace(/[\r\n]+/g, " ");
  return /[",]/.test(plain) ? `"${plain.replace(/"/g, '""')}"` : plain;
}

function debugEvent(socket: RoomSocket): DebugEvent {
  const arena = socket.stateRef.current;
  const shark = arena?.snakes.find((item) => item.id === socket.youId);
  if (!arena || !shark) return INITIAL_EVENT;
  const sharkHead = shark.segments[0];
  if (!shark.alive) return { action: "PLAYER_COLLISION", event: "authoritative shark state is dead", input: { alive: true }, result: { alive: false }, at: Date.now() };
  if (shark.rocketTicks > 0) return { action: "ROCKET_FIRE", event: "server created a lethal rocket", input: { heading: round(shark.heading), rockets: Math.max(0, arena.rockets.length - 1) }, result: { rockets: arena.rockets.length, cooldownSeconds: Math.max(0, Math.ceil((shark.rocketCooldownTick - arena.tick) / 20)) }, at: Date.now() };
  if (shark.lungeTicks > 0) return { action: "SHARK_DASH", event: "server applied the chomp dash", input: { tick: arena.tick, heading: round(shark.heading) }, result: { lungeTicks: shark.lungeTicks, cooldownSeconds: Math.max(0, Math.ceil((shark.dashCooldownTick - arena.tick) / 20)) }, at: Date.now() };
  return { action: "PLAYER_MOVE", event: "server advanced the shark", input: { x: round(sharkHead?.x ?? 0), z: round(sharkHead?.z ?? 0), heading: round(shark.heading) }, result: { tick: arena.tick, score: shark.score }, at: Date.now() };
}

const round = (value: number) => Math.round(value * 100) / 100;

function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>; }

function CodeBlock({ language, lines, highlight }: { language: DebugLanguage; lines: string[]; highlight: number[] }) {
  return <section className="debug-code"><span className="debug-label">{language === "php" ? "PHP" : "TypeScript"}</span><pre><code>{lines.map((line, i) => <span key={`${i}-${line}`} className={highlight.includes(i) ? "is-active" : undefined}>{highlight.includes(i) ? "> " : "  "}{line}{"\n"}</span>)}</code></pre></section>;
}
function DataBlock({ label, values }: { label: string; values?: DebugEvent["input"] }) {
  if (!values || Object.keys(values).length === 0) return null;
  return <section className="debug-data"><span className="debug-label">{label}</span><dl>{Object.entries(values).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></section>;
}
