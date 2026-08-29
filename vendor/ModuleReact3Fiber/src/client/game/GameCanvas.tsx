import { useEffect, useRef } from "react";
import { SKINS } from "../../engine/index.js";
import type { NetSnake } from "../../protocol/index.js";
import type { RoomSocket } from "../net/useRoomSocket.js";
import type { Settings } from "../settings/SettingsContext.js";
import type { SnakeLabel } from "./Scene.js";
import { goofySharkSprite } from "./goofySharkSprite.js";
import { LocalPredictor } from "./prediction.js";
import { useLocalInput, type LocalInput, type StickState } from "./useLocalInput.js";

export interface GameCanvasProps {
  socket: RoomSocket;
  settings: Settings;
  inputEnabled: boolean;
  labelsRef?: React.MutableRefObject<SnakeLabel[]>;
  /** Live thumbstick heading, owned by <GameScreen/> and written by <TouchControls/>. */
  stickRef?: React.MutableRefObject<StickState>;
  touchControls?: boolean;
}
const colors = new Map(SKINS.map((skin) => [skin.id, skin.color]));

export function GameCanvas({ socket, settings, inputEnabled, labelsRef, stickRef, touchControls = false }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null), surfaceRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<LocalInput>({ targetHeading: 0, boosting: false });
  const predictorRef = useRef(new LocalPredictor());
  useLocalInput(socket, settings, inputEnabled, inputRef, surfaceRef, stickRef, touchControls);
  const { frameAt, stateRef, newestAtRef, youId } = socket;
  const motion = settings.a11y.motion;
  const showGrid = settings.graphics.showGrid;
  const colorblindLabels = settings.a11y.colorblindLabels;
  useEffect(() => {
    const canvas = canvasRef.current, surface = surfaceRef.current;
    if (!canvas || !surface) return;
    const ctx = canvas.getContext("2d", { alpha: false }); if (!ctx) return;
    let raf = 0, width = 1, height = 1, previousFrameAt = performance.now();
    const resize = () => {
      const nextWidth = Math.max(1, surface.clientWidth), nextHeight = Math.max(1, surface.clientHeight);
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      width = nextWidth; height = nextHeight;
      const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth; canvas.height = pixelHeight;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    const observer = new ResizeObserver(resize); observer.observe(surface); resize();
    predictorRef.current.reset();
    const draw = () => {
      ctx.fillStyle = "#050d16"; ctx.fillRect(0, 0, width, height);
      const frame = frameAt(motion === "reduced" ? 0 : 100);
      if (!frame) { raf = requestAnimationFrame(draw); return; }
      const state = frame.newer, older = new Map(frame.older.snakes.map((s) => [s.id, s]));
      const now = performance.now(), dt = Math.min(.05, (now - previousFrameAt) / 1000); previousFrameAt = now;
      const latestMe = stateRef.current?.snakes.find((s) => s.id === youId && s.alive);
      const staleness = Math.min(.2, (now - newestAtRef.current) / 1000);
      const predicted = motion === "reduced" ? null : predictorRef.current.step(latestMe, inputRef.current, dt, staleness);
      const latestHead = latestMe?.segments[0];
      const focus = predicted?.head ?? latestHead ?? { x: 0, z: 0 };
      // Keep roughly the same slice of water visible regardless of viewport: a phone
      // showing a 48-unit window was fine in a 55-unit tank and claustrophobic in an
      // 82-unit one, so the view widens as the screen shrinks.
      const view = width < 560 || height < 480 ? 58 : 48;
      const scale = Math.max(3.5, Math.min(width, height) / view);
      const project = (x: number, z: number) => ({ x: width / 2 + (x - focus.x) * scale, y: height / 2 + (z - focus.z) * scale });
      drawSeaDots(ctx, width, height, focus.x, focus.z, scale, now, motion === "reduced");
      ctx.strokeStyle = "rgba(49,84,104,.54)"; ctx.lineWidth = 1;
      if (showGrid && motion !== "reduced") for (let gx = -100; gx <= 100; gx += 10) { const a = project(gx, -100), b = project(gx, 100); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      drawArenaBounds(ctx, project, width, height, state.arenaRadius, scale, Math.hypot(focus.x, focus.z), now, motion === "reduced");
      for (let i = 0; i < state.food.length; i += 1) { const food = state.food[i], p = project(food.x, food.z); if (p.x < -8 || p.y < -8 || p.x > width + 8 || p.y > height + 8) continue; ctx.fillStyle = food.value > 1 ? "#ff8a1f" : i % 3 === 0 ? "#22e6ff" : "#ffd54a"; ctx.globalAlpha = food.value > 1 ? .98 : .8; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.2, food.r * scale * .46), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }

      for (const burst of state.explosions ?? []) drawExplosion(ctx, burst, state.tick + frame.alpha, project, motion === "reduced");
      const olderRockets = new Map((frame.older.rockets ?? []).map((rocket) => [rocket.id, rocket]));
      for (const rocket of state.rockets ?? []) {
        const prior = olderRockets.get(rocket.id) ?? rocket;
        const p = project(prior.x + (rocket.x - prior.x) * frame.alpha, prior.z + (rocket.z - prior.z) * frame.alpha);
        drawRocket(ctx, p.x, p.y, rocket.heading, scale, now, motion === "reduced");
      }
      const labels: SnakeLabel[] = [];
      for (const shark of state.snakes) {
        if (!shark.alive || !shark.segments[0]) continue;
        const prior = older.get(shark.id), blend = motion === "reduced" ? 1 : frame.alpha, old = prior?.segments[0] ?? shark.segments[0], cur = shark.segments[0];
        const local = shark.id === youId, p = local ? project(focus.x, focus.z) : project(old.x + (cur.x - old.x) * blend, old.z + (cur.z - old.z) * blend), size = Math.min(56, 18 + Math.sqrt(shark.length) * 4.1);
        drawShark(ctx, shark, p.x, p.y, size, local ? (predicted?.heading ?? shark.heading) : shark.heading);
        // Only label sharks actually on screen, and keep the tag inside the viewport —
        // an edge-hugging name used to be sliced in half by the overlay's clip.
        if (colorblindLabels && p.x > -60 && p.y > -60 && p.x < width + 60 && p.y < height + 60) {
          labels.push({
            id: shark.id,
            name: shark.id === youId ? `${shark.name} (you)` : shark.name,
            x: Math.max(52, Math.min(width - 52, p.x)),
            // Tags render 1.6 line-heights above their anchor, so a floor of ~52 keeps
            // them clear of the HUD chips and the leaderboard along the top edge.
            y: Math.max(52, Math.min(height - 6, p.y - size)),
            color: colors.get(shark.skin) ?? "#22e6ff",
            me: shark.id === youId,
          });
        }
      }
      // A full 32-shark tank produces a wall of overlapping tags. Keep the local shark
      // plus the closest rivals — the ones a name actually helps you react to.
      if (labels.length > 11) {
        const middle = { x: width / 2, y: height / 2 };
        labels.sort((a, b) => (a.me ? -1 : b.me ? 1 : Math.hypot(a.x - middle.x, a.y - middle.y) - Math.hypot(b.x - middle.x, b.y - middle.y)));
        labels.length = 11;
      }
      if (labelsRef) labelsRef.current = labels;
      if (state.frenzyUntilTick > state.tick) drawFrenzyTint(ctx, width, height, now, motion === "reduced");
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [frameAt, stateRef, newestAtRef, youId, motion, showGrid, colorblindLabels, labelsRef, stickRef, touchControls]);
  const label = touchControls
    ? "Shark Tank. Hold the on-screen stick to swim. The dash and rocket pads sit under your other thumb."
    : "Shark Tank. Steer with the pointer or arrow keys. Space or click dashes. Shift fires a rocket.";
  return <div ref={surfaceRef} tabIndex={-1} role="img" aria-label={label} style={{ position: "absolute", inset: 0, outline: "none" }}><canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} /></div>;
}

function drawShark(ctx: CanvasRenderingContext2D, shark: NetSnake, x: number, y: number, size: number, heading: number) {
  const color = colors.get(shark.skin) ?? "#22e6ff"; ctx.save(); ctx.translate(x, y); ctx.rotate(heading);
  if (shark.lungeTicks > 0) {
    for (let i = 1; i <= 9; i += 1) { ctx.globalAlpha = .5 * (1 - i / 10); ctx.fillStyle = i % 2 ? color : "#fff"; ctx.beginPath(); ctx.arc(-size * (1.4 + i * .36), Math.sin(i * 2.2) * size * .16, Math.max(2, size * (.16 - i * .008)), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  if (shark.lungeTicks > 0 || shark.rocketTicks > 0) { ctx.shadowColor = shark.rocketTicks > 0 ? "#ff8a1f" : "#fff"; ctx.shadowBlur = shark.rocketTicks > 0 ? 22 : 13; }
  const sprite = goofySharkSprite(shark);
  if (sprite?.complete && sprite.naturalWidth) {
    const wobble = shark.lungeTicks > 0 ? 1.08 : 1;
    ctx.drawImage(sprite, -size * 1.62, -size * .95, size * 3.24 * wobble, size * 1.9);
  } else {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, size * 1.15, size * .55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(-size * 1.65, -size * .72); ctx.lineTo(-size * 1.48, 0); ctx.lineTo(-size * 1.65, size * .72); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawSeaDots(ctx: CanvasRenderingContext2D, width: number, height: number, focusX: number, focusZ: number, scale: number, now: number, reduced: boolean) {
  const spacing = 34, drift = reduced ? 0 : now * .004;
  const offsetX = ((-focusX * scale + drift) % spacing + spacing) % spacing;
  const offsetY = ((-focusZ * scale + drift * .55) % spacing + spacing) % spacing;
  for (let y = offsetY - spacing; y < height + spacing; y += spacing) {
    for (let x = offsetX - spacing; x < width + spacing; x += spacing) {
      const band = (Math.round(x / spacing) + Math.round(y / spacing)) % 4;
      ctx.fillStyle = band === 0 ? "rgba(34,230,255,.16)" : band === 1 ? "rgba(143,123,255,.13)" : "rgba(255,255,255,.07)";
      ctx.beginPath(); ctx.arc(x, y, band === 0 ? 1.8 : 1.15, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/**
 * The arena wall. Crossing `arenaRadius` is an instant kill server-side, so the edge has to be
 * unmistakable: everything outside is filled as void, the ring itself is drawn, and the ring
 * turns red and pulses once the shark is inside the last few units. Without this the player
 * dies at an invisible boundary with no killer, which reads as a random explosion.
 */
const EDGE_WARNING_RANGE = 14;
function drawArenaBounds(ctx: CanvasRenderingContext2D, project: (x: number, z: number) => { x: number; y: number }, width: number, height: number, arenaRadius: number, scale: number, distFromCenter: number, now: number, reduced: boolean) {
  if (!arenaRadius) return;
  const center = project(0, 0), radius = arenaRadius * scale;
  // Void outside the playable circle (rect + counter-clockwise arc punches the hole).
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fillStyle = "#01040a";
  ctx.fill();
  ctx.restore();

  const margin = arenaRadius - distFromCenter;
  const danger = Math.max(0, Math.min(1, 1 - margin / EDGE_WARNING_RANGE));
  const pulse = reduced ? 1 : 0.75 + Math.sin(now / 160) * 0.25;
  // Inner danger band, so the wall is readable before it is reached.
  if (danger > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,107,107,${(0.16 + 0.5 * danger) * pulse})`;
    ctx.lineWidth = Math.max(6, EDGE_WARNING_RANGE * scale * 0.5 * danger);
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = danger > 0 ? `rgba(255,107,107,${0.55 + 0.45 * danger * pulse})` : "rgba(34,230,255,.62)";
  ctx.lineWidth = Math.max(2, scale * (danger > 0 ? 0.5 : 0.32));
  ctx.stroke();
}

/** Warm vignette while a Feeding Frenzy runs, so the event reads even with sound off. */
function drawFrenzyTint(ctx: CanvasRenderingContext2D, width: number, height: number, now: number, reduced: boolean) {
  const pulse = reduced ? 0.18 : 0.14 + Math.sin(now / 260) * 0.06;
  const radius = Math.hypot(width, height) / 2;
  const gradient = ctx.createRadialGradient(width / 2, height / 2, radius * 0.35, width / 2, height / 2, radius);
  gradient.addColorStop(0, "rgba(255,138,31,0)");
  gradient.addColorStop(1, `rgba(255,64,32,${pulse.toFixed(3)})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawRocket(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, scale: number, now: number, reduced: boolean) {
  const size = Math.max(10, scale * .95), flicker = reduced ? 1 : .8 + Math.sin(now * .03) * .2;
  ctx.save(); ctx.translate(x, y); ctx.rotate(heading); ctx.shadowColor = "#ff8a1f"; ctx.shadowBlur = 24;
  for (let i = 1; i <= 8; i += 1) { ctx.globalAlpha = (1 - i / 9) * flicker; ctx.fillStyle = i % 2 ? "#ffcf5c" : "#ff5a36"; ctx.beginPath(); ctx.arc(-size * (1 + i * .42), Math.sin(i * 2.4) * size * .12, Math.max(2, size * (.22 - i * .012)), 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.fillStyle = "#f3f1ff"; ctx.beginPath(); ctx.moveTo(size * 1.3, 0); ctx.lineTo(size * .45, -size * .44); ctx.lineTo(-size * .7, -size * .35); ctx.lineTo(-size * .7, size * .35); ctx.lineTo(size * .45, size * .44); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#ff5a36"; ctx.beginPath(); ctx.moveTo(-size * .4, -size * .32); ctx.lineTo(-size * 1.05, -size * .8); ctx.lineTo(-size * .72, 0); ctx.lineTo(-size * 1.05, size * .8); ctx.lineTo(-size * .4, size * .32); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#22e6ff"; ctx.beginPath(); ctx.arc(size * .42, 0, size * .2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function drawExplosion(ctx: CanvasRenderingContext2D, burst: { id: string; x: number; z: number; tick: number; skin: string; kind: "shark" | "rocket" }, renderTick: number, project: (x: number, z: number) => { x: number; y: number }, reduced: boolean) {
  const life = Math.max(0, Math.min(1, (renderTick - burst.tick) / 24)), count = burst.kind === "shark" ? 38 : 18;
  const color = colors.get(burst.skin) ?? (burst.kind === "rocket" ? "#ff8a1f" : "#22e6ff");
  for (let i = 0; i < count; i += 1) {
    const seed = hash(`${burst.id}-${i}`), angle = (seed % 6283) / 1000, speed = .15 + ((seed >>> 9) % 100) / 115;
    const distance = (reduced ? 2.2 : life * speed * (burst.kind === "shark" ? 13 : 8));
    const p = project(burst.x + Math.cos(angle) * distance, burst.z + Math.sin(angle) * distance);
    ctx.globalAlpha = Math.max(0, 1 - life) * (.55 + ((seed >>> 17) % 45) / 100);
    ctx.fillStyle = i % 4 === 0 ? "#fff" : i % 3 === 0 ? "#ffd54a" : color;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, (1 - life) * (2.5 + (seed % 5))), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function hash(value: string): number {
  let out = 2166136261;
  for (let i = 0; i < value.length; i += 1) { out ^= value.charCodeAt(i); out = Math.imul(out, 16777619); }
  return out >>> 0;
}
