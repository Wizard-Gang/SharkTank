// Engine core — deterministic room simulation.
// Pure functions over serializable RoomState (no DOM, no three.js, no node APIs),
// so the exact same code runs in the browser now and in a Worker / Durable Object later.
//
// Design continuity with the previous iteration: a "room" owns authoritative state,
// advances on ticks, and applies player actions; RNG state lives in the snapshot so
// the whole thing is replayable.

import { seedToNumber, nextRandom } from "./rng.js";
import type { Action, Orb, Player, RoomState } from "./types.js";

const PLAYER_COLORS = ["#7c5cff", "#37d67a", "#ff6b6b", "#ffd93d", "#4dabf7"];
const MOVE_SPEED = 0.35; // world units per move action
const PICKUP_RADIUS = 0.9;
const MAX_ORBS = 12;
const ORB_SPAWN_EVERY = 20; // ticks

export interface CreateRoomOptions {
  id?: string;
  seed?: string;
  arena?: { width: number; depth: number };
}

export function createRoom(opts: CreateRoomOptions = {}): RoomState {
  const seed = opts.seed ?? `seed-${Date.now()}`;
  const state: RoomState = {
    schemaVersion: 1,
    id: opts.id ?? "room-local",
    seed,
    tick: 0,
    rngState: seedToNumber(seed),
    arena: opts.arena ?? { width: 16, depth: 16 },
    players: {},
    orbs: [],
  };
  // seed a few orbs up front
  for (let i = 0; i < 5; i += 1) spawnOrb(state);
  return state;
}

function spawnOrb(state: RoomState): void {
  if (state.orbs.length >= MAX_ORBS) return;
  const [rx, s1] = nextRandom(state.rngState);
  const [rz, s2] = nextRandom(s1);
  state.rngState = s2;
  const orb: Orb = {
    id: `orb-${state.tick}-${state.orbs.length}-${Math.floor(rx * 1e6)}`,
    x: (rx - 0.5) * state.arena.width,
    z: (rz - 0.5) * state.arena.depth,
  };
  state.orbs.push(orb);
}

/** Advance the simulation by one tick. Mutates and returns `state`. */
export function step(state: RoomState): RoomState {
  state.tick += 1;
  if (state.tick % ORB_SPAWN_EVERY === 0) spawnOrb(state);
  return state;
}

/** Apply a player action. Mutates and returns `state`. */
export function applyAction(state: RoomState, action: Action): RoomState {
  switch (action.type) {
    case "join": {
      if (!state.players[action.playerId]) {
        const color = action.color ?? PLAYER_COLORS[Object.keys(state.players).length % PLAYER_COLORS.length];
        const player: Player = { id: action.playerId, x: 0, z: 0, score: 0, color };
        state.players[action.playerId] = player;
      }
      return state;
    }
    case "leave": {
      delete state.players[action.playerId];
      return state;
    }
    case "move": {
      const p = state.players[action.playerId];
      if (!p) return state;
      const halfW = state.arena.width / 2;
      const halfD = state.arena.depth / 2;
      p.x = clamp(p.x + action.dx * MOVE_SPEED, -halfW, halfW);
      p.z = clamp(p.z + action.dz * MOVE_SPEED, -halfD, halfD);
      collectOrbs(state, p);
      return state;
    }
    default:
      return state;
  }
}

function collectOrbs(state: RoomState, p: Player): void {
  state.orbs = state.orbs.filter((orb) => {
    const hit = Math.hypot(orb.x - p.x, orb.z - p.z) <= PICKUP_RADIUS;
    if (hit) p.score += 1;
    return !hit;
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Deep clone a snapshot (structured, JSON-safe). Handy for React state updates. */
export function cloneRoom(state: RoomState): RoomState {
  return JSON.parse(JSON.stringify(state)) as RoomState;
}
