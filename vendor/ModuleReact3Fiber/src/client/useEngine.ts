import { useCallback, useEffect, useRef, useState } from "react";
import { applyAction, cloneRoom, createRoom, step } from "../engine/room.js";
import type { RoomState } from "../engine/types.js";
import { API } from "../protocol/index.js";

const LOCAL_PLAYER = "you";
const TICKS_PER_SECOND = 30;

/** Held movement keys -> direction. */
function readDir(keys: Set<string>): { dx: number; dz: number } {
  let dx = 0;
  let dz = 0;
  if (keys.has("w") || keys.has("arrowup")) dz -= 1;
  if (keys.has("s") || keys.has("arrowdown")) dz += 1;
  if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
  if (keys.has("d") || keys.has("arrowright")) dx += 1;
  return { dx, dz };
}

export interface EngineHandle {
  stateRef: React.MutableRefObject<RoomState>;
  keysRef: React.MutableRefObject<Set<string>>;
  playerId: string;
  hud: { score: number; orbs: number; tick: number };
  /** call each frame with delta seconds */
  advance: (dt: number) => void;
  save: (slot: string) => Promise<void>;
  load: (slot: string) => Promise<boolean>;
  reset: (seed?: string) => void;
}

export function useEngine(baseUrl = ""): EngineHandle {
  const stateRef = useRef<RoomState>(createRoom());
  const keysRef = useRef<Set<string>>(new Set());
  const accRef = useRef(0);
  const [hud, setHud] = useState({ score: 0, orbs: 0, tick: 0 });

  // join the local player once
  useEffect(() => {
    applyAction(stateRef.current, { type: "join", playerId: LOCAL_PLAYER });
  }, []);

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => keysRef.current.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const advance = useCallback((dt: number) => {
    const s = stateRef.current;
    const dir = readDir(keysRef.current);
    if (dir.dx || dir.dz) applyAction(s, { type: "move", playerId: LOCAL_PLAYER, ...dir });

    accRef.current += dt;
    const stepDt = 1 / TICKS_PER_SECOND;
    while (accRef.current >= stepDt) {
      step(s);
      accRef.current -= stepDt;
    }

    const me = s.players[LOCAL_PLAYER];
    setHud((prev) => {
      const next = { score: me?.score ?? 0, orbs: s.orbs.length, tick: s.tick };
      return prev.score === next.score && prev.orbs === next.orbs && prev.tick === next.tick ? prev : next;
    });
  }, []);

  const save = useCallback(
    async (slot: string) => {
      await fetch(baseUrl + API.save, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slot, snapshot: stateRef.current }),
      });
    },
    [baseUrl],
  );

  const load = useCallback(
    async (slot: string): Promise<boolean> => {
      const res = await fetch(`${baseUrl}${API.load}?slot=${encodeURIComponent(slot)}`);
      if (!res.ok) return false;
      const data = (await res.json()) as { snapshot: RoomState | null };
      if (!data.snapshot) return false;
      stateRef.current = cloneRoom(data.snapshot);
      if (!stateRef.current.players[LOCAL_PLAYER]) {
        applyAction(stateRef.current, { type: "join", playerId: LOCAL_PLAYER });
      }
      return true;
    },
    [baseUrl],
  );

  const reset = useCallback((seed?: string) => {
    stateRef.current = createRoom(seed ? { seed } : {});
    applyAction(stateRef.current, { type: "join", playerId: LOCAL_PLAYER });
  }, []);

  return { stateRef, keysRef, playerId: LOCAL_PLAYER, hud, advance, save, load, reset };
}
