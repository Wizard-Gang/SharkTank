// Engine core — deterministic snake.io-style room simulation.
// Pure functions over serializable RoomState (no DOM, no three.js, no node APIs),
// so the exact same code runs in the browser (bots/preview) and in the authoritative
// Room Durable Object. RNG state lives in the snapshot, so the whole thing is replayable.

import { nextRandom, seedToNumber } from "./rng.js";
import type { Action, Food, RoomState, ScoreEntry, Snake, Vec2 } from "./types.js";

// ── Tuning ────────────────────────────────────────────────────────────────────
// Ticking at 30Hz (vs 20) means fresher snapshots → less perceived lag. Per-tick speeds
// are scaled so world-per-second speed/turn stay constant; client prediction derives its
// per-second rates from MOVE × TICKS_PER_SECOND, so it stays exactly in sync.
export const TICKS_PER_SECOND = 40; // authoritative server tick rate (tighter timing)
const ARENA_RADIUS = 95;
const BASE_SPEED = 0.278; // world units / tick (~11 u/s — kept constant across tick rate)
const BOOST_SPEED = 0.525; // (~21 u/s)
const TURN_RATE = 0.11; // max radians / tick (~4.4 rad/s)
const SEGMENT_SPACING = 0.62; // arc-length between body discs sampled off the head trail
const START_LENGTH = 10;
const MIN_LENGTH = 6; // can't boost below this
const TAIL_MARGIN = 1.5; // extra trail arc-length kept beyond the body (world units)
const HEAD_RADIUS = 0.7; // collision radius of the head
const EAT_RADIUS = 1.2;
const BOOST_DRAIN_EVERY = 8; // ticks: lose 1 length per this many while boosting
const RESPAWN_DELAY = TICKS_PER_SECOND * 2; // ticks dead before respawn allowed
const SPAWN_GRACE = Math.round(TICKS_PER_SECOND * 1.6); // spawn invulnerability window
const AMBIENT_FOOD = 260; // target ambient pellet count (fewer, cleaner dots)
const FOOD_SPAWN_PER_TICK = 2;
const MAX_TOTAL_FOOD = 450; // hard cap incl. corpse drops — keeps the arena from filling with dots

/** Cosmetic catalog. Colorblind-safe, high-contrast hues; shared by server + client. */
export interface Skin {
  id: string;
  name: string;
  /** Body color (hex). Head is rendered brighter client-side. */
  color: string;
  /** Optional secondary color for banded patterns. */
  accent?: string;
  pattern: "solid" | "bands";
}

// Neon "Tron" palette — vivid, hue-distinct (colorblind-separable), glows on black.
export const SKINS: Skin[] = [
  { id: "cyan", name: "Cyan", color: "#22e6ff", accent: "#0891b2", pattern: "bands" },
  { id: "orange", name: "Orange", color: "#ff8a1f", accent: "#c2410c", pattern: "bands" },
  { id: "lime", name: "Lime", color: "#57ff5a", accent: "#15803d", pattern: "bands" },
  { id: "magenta", name: "Magenta", color: "#ff43d4", accent: "#a21caf", pattern: "bands" },
  { id: "gold", name: "Gold", color: "#ffe14d", accent: "#b8890a", pattern: "bands" },
  { id: "violet", name: "Violet", color: "#a78bff", accent: "#6d28d9", pattern: "bands" },
];

export const DEFAULT_SKIN = SKINS[0].id;

const BOT_NAMES = ["Slinky", "Noodle", "Fang", "Zippy", "Coil", "Viper", "Wriggle", "Dash", "Boa", "Mamba"];

export interface CreateRoomOptions {
  id?: string;
  seed?: string;
  arenaRadius?: number;
}

export function createRoom(opts: CreateRoomOptions = {}): RoomState {
  const seed = opts.seed ?? "seed-fixed";
  const state: RoomState = {
    schemaVersion: 2,
    id: opts.id ?? "room-local",
    seed,
    tick: 0,
    rngState: seedToNumber(seed),
    arena: { radius: opts.arenaRadius ?? ARENA_RADIUS },
    snakes: {},
    food: [],
  };
  for (let i = 0; i < AMBIENT_FOOD; i += 1) spawnAmbientFood(state);
  return state;
}

// ── RNG helpers (thread state through the snapshot) ─────────────────────────────
function rand(state: RoomState): number {
  const [v, next] = nextRandom(state.rngState);
  state.rngState = next;
  return v;
}
function randRange(state: RoomState, min: number, max: number): number {
  return min + rand(state) * (max - min);
}

/** A uniform random point inside the arena disc. */
function randomPointInArena(state: RoomState): Vec2 {
  const r = Math.sqrt(rand(state)) * (state.arena.radius - 2);
  const a = rand(state) * Math.PI * 2;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

function spawnAmbientFood(state: RoomState): void {
  const p = randomPointInArena(state);
  state.food.push({
    id: `f-${state.tick}-${Math.floor(rand(state) * 1e9).toString(36)}`,
    x: p.x,
    z: p.z,
    value: 1,
    r: 0.45,
  });
}

// ── Snake construction ──────────────────────────────────────────────────────────
/** Pick a spawn in the inner arena, as far as possible from any snake body segment. */
function safeSpawn(state: RoomState): Vec2 {
  const inner = state.arena.radius * 0.55; // never spawn near the deadly boundary
  // Sample of all occupied points (every 3rd segment keeps this cheap for long bots).
  const occupied: Vec2[] = [];
  for (const s of Object.values(state.snakes)) {
    if (!s.alive) continue;
    for (let i = 0; i < s.segments.length; i += 3) occupied.push(s.segments[i]);
  }
  let best: Vec2 = { x: 0, z: 0 };
  let bestDist = -1;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const r = Math.sqrt(rand(state)) * inner;
    const a = rand(state) * Math.PI * 2;
    const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    let nearest = Infinity;
    for (const o of occupied) nearest = Math.min(nearest, Math.hypot(o.x - p.x, o.z - p.z));
    if (nearest > bestDist) {
      bestDist = nearest;
      best = p;
      if (nearest > 10 || occupied.length === 0) break; // good enough
    }
  }
  return best;
}

/** Number of body discs a snake of the given target length should show. */
export function segmentCount(length: number): number {
  return Math.max(MIN_LENGTH, Math.round(length));
}

/** Movement model shared with the client so client-side prediction uses identical math.
 *  Values are per authoritative tick; multiply by TICKS_PER_SECOND for per-second rates. */
export const MOVE = {
  BASE_SPEED,
  BOOST_SPEED,
  TURN_RATE,
  SEGMENT_SPACING,
  MIN_LENGTH,
} as const;

/** Sample `count` evenly-spaced points by walking a head-first trail at SEGMENT_SPACING
 *  arc-length steps (interpolating between breadcrumbs). Pure — reused by the server
 *  simulation and by client-side prediction. `fallbackHeading` extends the tail when the
 *  trail is too short (fresh spawn). Returns points head-first. */
export function sampleTrail(path: Vec2[], count: number, fallbackHeading: number): Vec2[] {
  const out: Vec2[] = [{ x: path[0].x, z: path[0].z }];
  let seg = 1;
  let acc = 0; // distance accumulated along the current path edge budget
  for (let i = 0; i < path.length - 1 && seg < count; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const edge = Math.hypot(b.x - a.x, b.z - a.z);
    if (edge <= 1e-6) continue;
    let along = 0;
    while (acc + (edge - along) >= SEGMENT_SPACING && seg < count) {
      const need = SEGMENT_SPACING - acc;
      along += need;
      const f = along / edge;
      out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
      seg += 1;
      acc = 0;
    }
    acc += edge - along;
  }
  // Pad a too-short trail by extending straight back from the tail.
  while (out.length < count) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2] ?? last;
    const dx = last.x - prev.x || Math.cos(fallbackHeading + Math.PI);
    const dz = last.z - prev.z || Math.sin(fallbackHeading + Math.PI);
    const d = Math.hypot(dx, dz) || 1;
    out.push({ x: last.x + (dx / d) * SEGMENT_SPACING, z: last.z + (dz / d) * SEGMENT_SPACING });
  }
  return out;
}

/** Rebuild a snake's body segments from its head trail (server-side). */
function resampleSegments(snake: Snake): void {
  snake.segments = sampleTrail(snake.path, segmentCount(snake.length), snake.heading);
}

function makeSnake(state: RoomState, id: string, name: string, skin: string, isBot: boolean): Snake {
  const spawn = safeSpawn(state);
  // Face toward arena center (+ slight jitter) so a still snake drifts inward, not into a wall.
  const heading = Math.atan2(-spawn.z, -spawn.x) + randRange(state, -0.5, 0.5);
  // Seed the trail heading backwards from the spawn so the body extends behind the head.
  const path: Vec2[] = [];
  const step = SEGMENT_SPACING;
  for (let i = 0; i < START_LENGTH + 3; i += 1) {
    path.push({ x: spawn.x - Math.cos(heading) * i * step, z: spawn.z - Math.sin(heading) * i * step });
  }
  const snake: Snake = {
    id,
    name,
    skin: validSkin(skin),
    path,
    segments: [],
    heading,
    targetHeading: heading,
    length: START_LENGTH,
    boosting: false,
    score: 0,
    alive: true,
    isBot,
    respawnTick: 0,
    invulnTick: state.tick + SPAWN_GRACE,
  };
  resampleSegments(snake);
  return snake;
}

function validSkin(skin: string | undefined): string {
  return SKINS.some((s) => s.id === skin) ? (skin as string) : DEFAULT_SKIN;
}

/** Fill the arena with `n` bot snakes (server-side AI opponents). */
export function spawnBots(state: RoomState, n: number): void {
  for (let i = 0; i < n; i += 1) {
    const id = `bot-${i}`;
    if (state.snakes[id]) continue;
    const name = BOT_NAMES[i % BOT_NAMES.length] + (i >= BOT_NAMES.length ? ` ${Math.floor(i / BOT_NAMES.length) + 1}` : "");
    const skin = SKINS[Math.floor(rand(state) * SKINS.length)].id;
    state.snakes[id] = makeSnake(state, id, name, skin, true);
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────────
export function applyAction(state: RoomState, action: Action): RoomState {
  switch (action.type) {
    case "join": {
      if (!state.snakes[action.playerId]) {
        state.snakes[action.playerId] = makeSnake(
          state,
          action.playerId,
          (action.name ?? "Player").slice(0, 16),
          action.skin ?? DEFAULT_SKIN,
          action.isBot ?? false,
        );
      }
      return state;
    }
    case "leave": {
      const s = state.snakes[action.playerId];
      if (s) scatterAsFood(state, s); // dropping out feeds the arena, like a death
      delete state.snakes[action.playerId];
      return state;
    }
    case "setHeading": {
      const s = state.snakes[action.playerId];
      if (s && s.alive) s.targetHeading = action.angle;
      return state;
    }
    case "setBoost": {
      const s = state.snakes[action.playerId];
      if (s && s.alive) s.boosting = action.on;
      return state;
    }
    case "respawn": {
      const s = state.snakes[action.playerId];
      if (s && !s.alive && state.tick >= s.respawnTick) {
        const fresh = makeSnake(state, s.id, s.name, s.skin, s.isBot);
        state.snakes[s.id] = fresh;
      }
      return state;
    }
    default:
      return state;
  }
}

// ── Simulation step ────────────────────────────────────────────────────────────
/** Advance the simulation by one tick. Mutates and returns `state`. */
export function step(state: RoomState): RoomState {
  state.tick += 1;

  // Ambient food top-up.
  for (let i = 0; i < FOOD_SPAWN_PER_TICK && state.food.length < AMBIENT_FOOD; i += 1) {
    spawnAmbientFood(state);
  }

  // Bots choose a heading before movement.
  for (const s of Object.values(state.snakes)) {
    if (s.alive && s.isBot) steerBot(state, s);
  }

  // Move every living snake.
  for (const s of Object.values(state.snakes)) {
    if (s.alive) moveSnake(state, s);
  }

  // Eating.
  for (const s of Object.values(state.snakes)) {
    if (s.alive) eat(state, s);
  }

  // Collisions (heads vs other bodies, and walls). Resolve after movement so it's fair.
  const dead: Snake[] = [];
  for (const s of Object.values(state.snakes)) {
    if (s.alive && collides(state, s)) dead.push(s);
  }
  for (const s of dead) killSnake(state, s);

  // Bots auto-respawn after their delay so the arena stays populated (~24 snakes).
  for (const s of Object.values(state.snakes)) {
    if (s.isBot && !s.alive && state.tick >= s.respawnTick) {
      state.snakes[s.id] = makeSnake(state, s.id, s.name, s.skin, true);
    }
  }

  // Cap total food (corpse drops otherwise pile up into thousands of dots) — drop oldest.
  if (state.food.length > MAX_TOTAL_FOOD) state.food.splice(0, state.food.length - MAX_TOTAL_FOOD);

  return state;
}

function moveSnake(state: RoomState, s: Snake): void {
  // Rotate heading toward targetHeading, clamped by TURN_RATE.
  s.heading = rotateToward(s.heading, s.targetHeading, TURN_RATE);

  // Boost: costs length over time; disabled when too short.
  let speed = BASE_SPEED;
  if (s.boosting && s.length > MIN_LENGTH) {
    speed = BOOST_SPEED;
    if (state.tick % BOOST_DRAIN_EVERY === 0) {
      s.length = Math.max(MIN_LENGTH, s.length - 1);
      // Drop a pellet from the tail so boosting literally spends your body.
      const tail = s.segments[s.segments.length - 1];
      state.food.push({ id: `b-${s.id}-${state.tick}`, x: tail.x, z: tail.z, value: 1, r: 0.4 });
    }
  } else {
    s.boosting = false;
  }

  // Advance the head and drop a fresh breadcrumb at the front of the trail.
  const head = s.path[0];
  const nx = head.x + Math.cos(s.heading) * speed;
  const nz = head.z + Math.sin(s.heading) * speed;
  s.path.unshift({ x: nx, z: nz });

  // Trim the trail by ARC LENGTH (not point count) so the body always has enough trail
  // to sample — otherwise long snakes get a straight, janky padded tail. Tick-rate
  // independent, so raising the tick rate can't starve the trail.
  const needLen = segmentCount(s.length) * SEGMENT_SPACING + TAIL_MARGIN;
  let acc = 0;
  let cut = s.path.length;
  for (let i = 1; i < s.path.length; i += 1) {
    acc += Math.hypot(s.path[i].x - s.path[i - 1].x, s.path[i].z - s.path[i - 1].z);
    if (acc >= needLen) {
      cut = i + 1;
      break;
    }
  }
  if (s.path.length > cut) s.path.length = cut;

  // Rebuild evenly-spaced body discs from the smooth trail (no wobble).
  resampleSegments(s);
}

function eat(state: RoomState, s: Snake): void {
  const head = s.segments[0];
  let gained = 0;
  state.food = state.food.filter((f) => {
    if (Math.hypot(f.x - head.x, f.z - head.z) <= EAT_RADIUS + f.r) {
      s.score += f.value;
      s.length += f.value;
      gained += f.value;
      return false;
    }
    return true;
  });
  // Grow FORWARD: extend the head along the heading by the gained length so new segments
  // appear just behind the head and the tail stays anchored (not trailing backward).
  if (gained > 0) {
    const hx = s.path[0].x;
    const hz = s.path[0].z;
    const ext: Vec2[] = [];
    for (let k = gained; k >= 1; k -= 1) {
      ext.push({ x: hx + Math.cos(s.heading) * SEGMENT_SPACING * k, z: hz + Math.sin(s.heading) * SEGMENT_SPACING * k });
    }
    s.path.unshift(...ext);
    s.segments = sampleTrail(s.path, segmentCount(s.length), s.heading);
  }
}

function collides(state: RoomState, s: Snake): boolean {
  const head = s.segments[0];
  // Wall: crossing the arena boundary is death (classic snake.io) — applies even during grace.
  if (Math.hypot(head.x, head.z) >= state.arena.radius) return true;
  // Fresh spawns are briefly immune to body collisions so they can't die instantly.
  if (state.tick < s.invulnTick) return false;
  // Body: head within HEAD_RADIUS of any *other* snake's segment.
  for (const other of Object.values(state.snakes)) {
    if (other.id === s.id || !other.alive) continue;
    for (let i = 0; i < other.segments.length; i += 1) {
      const seg = other.segments[i];
      if (Math.hypot(seg.x - head.x, seg.z - head.z) <= HEAD_RADIUS + 0.45) return true;
    }
  }
  return false;
}

function killSnake(state: RoomState, s: Snake): void {
  scatterAsFood(state, s);
  s.alive = false;
  s.boosting = false;
  s.respawnTick = state.tick + RESPAWN_DELAY;
  s.segments = [];
}

/** Turn a snake's body into corpse pellets (bigger, worth more). */
function scatterAsFood(state: RoomState, s: Snake): void {
  for (let i = 0; i < s.segments.length; i += 2) {
    const seg = s.segments[i];
    state.food.push({
      id: `d-${s.id}-${state.tick}-${i}`,
      x: seg.x + randRange(state, -0.4, 0.4),
      z: seg.z + randRange(state, -0.4, 0.4),
      value: 3,
      r: 0.7,
    });
  }
}

// ── Bot AI ───────────────────────────────────────────────────────────────────────
function steerBot(state: RoomState, s: Snake): void {
  const head = s.segments[0];
  const distFromCenter = Math.hypot(head.x, head.z);

  // Near the wall? Steer back toward center (survival first).
  if (distFromCenter > state.arena.radius * 0.8) {
    s.targetHeading = Math.atan2(-head.z, -head.x);
    s.boosting = false;
    return;
  }

  // Otherwise head for the nearest food within sight.
  let best: Food | null = null;
  let bestD = Infinity;
  for (const f of state.food) {
    const d = Math.hypot(f.x - head.x, f.z - head.z);
    if (d < bestD && d < 22) {
      bestD = d;
      best = f;
    }
  }
  if (best) {
    s.targetHeading = Math.atan2(best.z - head.z, best.x - head.x);
  } else if (state.tick % 20 === 0) {
    // Wander: occasional random turn.
    s.targetHeading = randRange(state, -Math.PI, Math.PI);
  }
  // Occasional sprint toward close, juicy food.
  s.boosting = best !== null && bestD < 8 && best.value >= 3 && s.length > MIN_LENGTH + 4;
}

// ── Derived views ────────────────────────────────────────────────────────────────
/** Leaderboard rows, highest score first. */
export function leaderboard(state: RoomState, limit = 10): ScoreEntry[] {
  return Object.values(state.snakes)
    .map((s) => ({ id: s.id, name: s.name, skin: s.skin, score: s.score, alive: s.alive }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function playerCount(state: RoomState): number {
  return Object.values(state.snakes).filter((s) => !s.isBot).length;
}

// ── Deterministic replay ──────────────────────────────────────────────────────────
/** One recorded external action + the tick it was applied at. Bot behaviour is NOT
 *  logged — it's reproduced deterministically by re-running step() with the same seed. */
export interface GameLogEntry {
  tick: number;
  action: Action;
}

export interface ReplayOptions {
  seed: string;
  id?: string;
  botCount: number;
}

/**
 * Rebuild the exact RoomState at `toTick` from a game's seed + external action log.
 * Because the engine is fully deterministic (seeded RNG in the snapshot, no wall-clock
 * or Math.random), replaying the same seed + the same actions at the same ticks yields
 * byte-identical state — enabling per-game fast-forward and rollback. Pass a smaller
 * `toTick` to roll back; a larger one (≤ the last logged tick) to fast-forward.
 */
export function replay(opts: ReplayOptions, events: GameLogEntry[], toTick: number): RoomState {
  const state = createRoom({ seed: opts.seed, id: opts.id });
  spawnBots(state, opts.botCount);

  const byTick = new Map<number, Action[]>();
  for (const e of events) {
    const list = byTick.get(e.tick);
    if (list) list.push(e.action);
    else byTick.set(e.tick, [e.action]);
  }

  for (let t = 0; t <= toTick; t += 1) {
    const acts = byTick.get(t);
    if (acts) for (const a of acts) applyAction(state, a);
    if (t < toTick) step(state);
  }
  return state;
}

// ── Math helpers ───────────────────────────────────────────────────────────────
function rotateToward(current: number, target: number, maxStep: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

/** Deep clone a snapshot (structured, JSON-safe). Handy for React state updates. */
export function cloneRoom(state: RoomState): RoomState {
  return JSON.parse(JSON.stringify(state)) as RoomState;
}
