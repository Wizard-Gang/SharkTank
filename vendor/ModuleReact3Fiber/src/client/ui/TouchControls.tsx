// On-screen controls for touch devices.
//
// Tapping the water to steer was the whole problem on phones: every tap also spent the
// dash (pointer-down is the dash input), the shark only turned in discrete hops, and the
// thumb covered the very thing it was steering. So touch play gets a real virtual
// thumbstick instead: hold anywhere in the stick half and the shark swims that way, for
// as long as you hold it, with the dash and rocket pads under the other thumb.
//
// The stick is *floating*: the base re-centres wherever the thumb lands inside its half,
// so there is no small fixed target to hunt for mid-fight. It writes an angle into a ref
// (never React state) so steering never costs a re-render.

import { useCallback, useEffect, useRef, useState } from "react";
import type { StickState } from "../game/useLocalInput.js";
import type { Settings } from "../settings/SettingsContext.js";

const STICK_RADIUS = 56; // travel of the knob from the base centre, in CSS px
const BASE_RADIUS = 66; // outer ring radius, matched to .stick-base in theme.css
const DEAD_ZONE = 10; // below this the stick holds the previous heading

/**
 * Should the on-screen controls be shown? `auto` follows the pointer capability, which is
 * re-queried live so a tablet that gains a mouse (or a desktop opening device emulation)
 * switches without a reload.
 */
export function useTouchControls(settings: Settings): boolean {
  const mode = settings.controls.touchControls;
  const [coarse, setCoarse] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  if (mode === "on") return true;
  if (mode === "off") return false;
  return coarse;
}

export interface TouchControlsProps {
  stickRef: React.MutableRefObject<StickState>;
  side: "right" | "left";
  /** Hidden (and released) while a dialog owns the screen. */
  enabled: boolean;
}

export function TouchControls({ stickRef, side, enabled }: TouchControlsProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  // Base + knob offsets live in state because they are only written on touch-down and
  // at pointer-move rate for one element — cheap, and it keeps the markup declarative.
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const release = useCallback(() => {
    pointerId.current = null;
    stickRef.current = { ...stickRef.current, active: false };
    setBase(null);
    setKnob({ x: 0, y: 0 });
  }, [stickRef]);

  // A dialog opening mid-hold must not leave the shark locked on the last heading.
  useEffect(() => {
    if (!enabled) release();
  }, [enabled, release]);
  useEffect(() => () => release(), [release]);

  if (!enabled) return null;

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== null) return;
    const rect = zoneRef.current?.getBoundingClientRect();
    if (!rect) return;
    pointerId.current = e.pointerId;
    // Capture keeps the stick tracking a thumb that slides outside its half. It throws
    // if the pointer is already gone, which must not abort the rest of the gesture.
    try { zoneRef.current?.setPointerCapture(e.pointerId); } catch { /* pointer released */ }
    // Keep the whole base ring on screen even when the thumb lands near an edge.
    const x = clamp(e.clientX - rect.left, BASE_RADIUS + 4, rect.width - BASE_RADIUS - 4);
    const y = clamp(e.clientY - rect.top, BASE_RADIUS + 4, rect.height - BASE_RADIUS - 4);
    setBase({ x, y });
    setKnob({ x: 0, y: 0 });
    stickRef.current = { ...stickRef.current, active: true };
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointerId.current || !base) return;
    const rect = zoneRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = e.clientX - rect.left - base.x;
    const dy = e.clientY - rect.top - base.y;
    const distance = Math.hypot(dx, dy);
    const capped = Math.min(1, distance / STICK_RADIUS);
    setKnob({ x: (dx / (distance || 1)) * capped * STICK_RADIUS, y: (dy / (distance || 1)) * capped * STICK_RADIUS });
    // Screen X/Y maps straight onto world X/Z — the camera never rotates.
    if (distance >= DEAD_ZONE) stickRef.current = { active: true, angle: Math.atan2(dy, dx) };
  };

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointerId.current) return;
    release();
  };

  return (
    <div
      ref={zoneRef}
      className={`stick-zone stick-zone--${side}`}
      aria-hidden="true"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className={base ? "stick-base is-live" : "stick-base"} style={base ? { left: base.x, top: base.y } : undefined}>
        <div className="stick-knob" style={{ transform: `translate3d(${knob.x}px, ${knob.y}px, 0)` }} />
      </div>
      {!base && <p className="stick-hint">Hold to swim</p>}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  // A viewport narrower than the ring itself would invert the bounds; centre instead.
  if (max < min) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}
