// Local input → steering. Two fully-independent control schemes, both remappable and
// both able to play the whole game (WCAG 2.1.1 keyboard operable):
//   • Pointer: the snake heads toward the cursor; press/hold to boost.
//   • Keyboard: left/right turn keys rotate heading; boost key sprints.
// Heading is smoothed and pushed to the socket (which throttles the wire traffic).

import { useEffect, useRef } from "react";
import type { RoomSocket } from "../net/useRoomSocket.js";
import type { Settings } from "../settings/SettingsContext.js";

const KEY_TURN_RATE = 0.16; // radians per frame while a turn key is held

/** The player's live intent, read by client-side prediction. */
export interface LocalInput {
  targetHeading: number;
  boosting: boolean;
}

/** Normalize a KeyboardEvent to the code strings we store in keybinds. */
function eventCode(e: KeyboardEvent): string {
  return e.code === "Space" ? "Space" : e.code;
}

export function useLocalInput(
  socket: RoomSocket,
  settings: Settings,
  enabled: boolean,
  inputRef?: React.MutableRefObject<LocalInput>,
): void {
  const headingRef = useRef(0);
  const boostRef = useRef(false);
  const pressed = useRef<Set<string>>(new Set());
  const usingPointer = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!enabled) {
      pressed.current.clear();
      socket.setBoost(false);
      return;
    }

    const binds = () => settingsRef.current.controls.keybinds;

    const onKeyDown = (e: KeyboardEvent) => {
      const code = eventCode(e);
      const b = binds();
      if ([b.left, b.right, b.boost].includes(code)) {
        e.preventDefault();
        usingPointer.current = false;
      }
      pressed.current.add(code);
      if (code === b.boost) {
        boostRef.current = true;
        socket.setBoost(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const code = eventCode(e);
      pressed.current.delete(code);
      if (code === binds().boost) {
        boostRef.current = false;
        socket.setBoost(false);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      usingPointer.current = true;
      // Cursor relative to screen center ≈ direction from the (centered) player head.
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      headingRef.current = Math.atan2(e.clientY - cy, e.clientX - cx);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0) {
        boostRef.current = true;
        socket.setBoost(true);
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 0) {
        boostRef.current = false;
        socket.setBoost(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);

    let raf = 0;
    const loop = () => {
      const s = settingsRef.current.controls;
      const b = s.keybinds;
      const assist = s.turnAssist ? 0.6 : 1;
      const dir = s.invertSteer ? -1 : 1;
      if (pressed.current.has(b.left)) headingRef.current -= KEY_TURN_RATE * assist * dir;
      if (pressed.current.has(b.right)) headingRef.current += KEY_TURN_RATE * assist * dir;
      socket.setHeading(headingRef.current);
      if (inputRef) inputRef.current = { targetHeading: headingRef.current, boosting: boostRef.current };
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      socket.setBoost(false);
    };
  }, [enabled, socket]);
}
