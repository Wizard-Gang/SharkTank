// Serializable game state. Everything here is plain JSON so it can live in a
// Durable Object, be snapshotted to a blob store, and be replayed deterministically.

export interface Vec2 {
  x: number;
  z: number; // ground plane is X/Z (Y is up in three.js)
}

export interface Player extends Vec2 {
  id: string;
  score: number;
  color: string;
}

export interface Orb extends Vec2 {
  id: string;
}

export interface Arena {
  width: number;
  depth: number;
}

export interface RoomState {
  schemaVersion: 1;
  id: string;
  seed: string;
  tick: number;
  rngState: number;
  arena: Arena;
  players: Record<string, Player>;
  orbs: Orb[];
}

export type Action =
  | { type: "join"; playerId: string; color?: string }
  | { type: "leave"; playerId: string }
  | { type: "move"; playerId: string; dx: number; dz: number };
