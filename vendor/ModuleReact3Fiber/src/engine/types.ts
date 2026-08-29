// Serializable game state for the snake.io-style arena. Everything here is plain
// JSON so it can live in a Durable Object, be snapshotted to a blob store, and be
// replayed deterministically. No DOM / three.js / node types leak in here.

export interface Vec2 {
  x: number;
  z: number; // ground plane is X/Z (Y is up in three.js). Angles are measured in this plane.
}

/** A single living (or recently dead) snake — player or bot. */
export interface Snake {
  id: string;
  name: string;
  /** Skin id from the cosmetics catalog (see SKINS). Drives color/pattern on the client. */
  skin: string;
  /** Head breadcrumb trail, newest first. Body segments are sampled from this at a fixed
   *  arc-length, which keeps the body smooth (no follow-the-leader wobble). */
  path: Vec2[];
  /** Body points, head first: segments[0] is the head. Derived from `path` each tick;
   *  used for collision + rendering. Rendered as a chain of discs. */
  segments: Vec2[];
  /** Current facing angle in radians (atan2(dz, dx) convention in the X/Z plane). */
  heading: number;
  /** Angle the snake is steering toward; `heading` rotates to meet it at TURN_RATE. */
  targetHeading: number;
  /** Desired number of segments. The chain grows/shrinks toward this each tick. */
  length: number;
  /** True while the boost input is held AND the snake is long enough to pay for it. */
  boosting: boolean;
  /** Score = cumulative food value eaten. Drives the leaderboard. */
  score: number;
  alive: boolean;
  isBot: boolean;
  /** Tick at which a dead snake becomes eligible to respawn (0 when alive). */
  respawnTick: number;
  /** Body collisions are ignored while tick < invulnTick (brief spawn protection). */
  invulnTick: number;
}

/** A collectible pellet. Big values come from dead snakes; small ones are ambient spawns. */
export interface Food {
  id: string;
  x: number;
  z: number;
  value: number;
  /** Visual/collision radius. Larger for corpse drops. */
  r: number;
}

/** Circular arena, like snake.io. Death on crossing `radius`. */
export interface Arena {
  radius: number;
}

export interface RoomState {
  schemaVersion: 2;
  id: string;
  seed: string;
  tick: number;
  rngState: number;
  arena: Arena;
  /** Keyed by snake id (player id or bot id). */
  snakes: Record<string, Snake>;
  food: Food[];
}

/** Player/bot intents applied to authoritative state on the server. */
export type Action =
  | { type: "join"; playerId: string; name?: string; skin?: string; isBot?: boolean }
  | { type: "leave"; playerId: string }
  | { type: "setHeading"; playerId: string; angle: number }
  | { type: "setBoost"; playerId: string; on: boolean }
  | { type: "respawn"; playerId: string };

/** One leaderboard row — derived from state, sent to clients and persisted globally. */
export interface ScoreEntry {
  id: string;
  name: string;
  skin: string;
  score: number;
  alive: boolean;
}
