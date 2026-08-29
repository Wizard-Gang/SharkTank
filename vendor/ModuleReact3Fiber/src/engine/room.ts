// Engine core — deterministic snake.io-style room simulation.
// Pure functions over serializable RoomState (no DOM, no three.js, no node APIs),
// so the exact same code runs in the browser (bots/preview) and in the authoritative
// Room Durable Object. RNG state lives in the snapshot, so the whole thing is replayable.

import { nextRandom, seedToNumber } from "./rng.js";
import type { Action, Food, RocketProjectile, RoomState, ScoreEntry, Snake, Vec2 } from "./types.js";

// ── Tuning ────────────────────────────────────────────────────────────────────
// Ticking at 30Hz (vs 20) means fresher snapshots → less perceived lag. Per-tick speeds
// are scaled so world-per-second speed/turn stay constant; client prediction derives its
// per-second rates from MOVE × TICKS_PER_SECOND, so it stays exactly in sync.
export const TICKS_PER_SECOND = 20; // responsive authority; shark snapshots contain only one body point
// 32 sharks share a tank, so the arena grew with the population — enough water that a
// full lobby is dense rather than a permanent scrum at the wall.
const ARENA_RADIUS = 82;
const BASE_SPEED = 0.556; // world units / tick (~11 u/s)
const BOOST_SPEED = 1.42; // (~28 u/s) — short, high-impact chomp dash
const TURN_RATE = 0.22; // max radians / tick (~4.4 rad/s)
const SEGMENT_SPACING = 0.62; // arc-length between body discs sampled off the head trail
const START_LENGTH = 10;
/** A fresh shark enters at the size of the field, not at the size of an empty tank.
 *  In a 32-shark arena the bots are already 3-5× a bare spawn by the time a human
 *  joins, so a flat START_LENGTH meant every new life was eaten within seconds by the
 *  middle of the pack. Spawn size now tracks the median living shark, capped so the
 *  biggest sharks still out-rank a newcomer and the tank cannot inflate itself. */
const SPAWN_MEDIAN_SHARE = 0.45;
const MAX_SPAWN_LENGTH = START_LENGTH * 2.6;
const MIN_LENGTH = 6; // can't boost below this
const TAIL_MARGIN = 1.5; // extra trail arc-length kept beyond the body (world units)
const HEAD_RADIUS = 0.7; // collision radius of the head
const EAT_RADIUS = 1.2;
const MAX_CHOMPS_PER_TICK = 2;
const RESPAWN_DELAY = TICKS_PER_SECOND; // one second dead before respawn is allowed
const SPAWN_GRACE = Math.round(TICKS_PER_SECOND * 6); // enough time to orient and use an ability before size combat starts
const AMBIENT_FOOD = 240;
const FOOD_SPAWN_PER_TICK = 6;
const MAX_TOTAL_FOOD = 620;
/** Share of ambient dots that spawn in the middle of the tank rather than anywhere.
 *  A uniform-area scatter over the larger arena left the centre visibly empty, which
 *  removed the reason to fight over the middle. */
const CENTER_FOOD_SHARE = 0.55;
const CENTER_FOOD_RADIUS = 0.3; // fraction of the arena radius that counts as "the middle"
// ── Feeding Frenzy ──
// Every FRENZY_PERIOD ticks a chum drop lands dead centre and the whole tank goes
// hungry for FRENZY_TICKS: faster sharks, halved dash cooldown, richer dots. Driven
// entirely off `state.tick`, so it replays deterministically like everything else.
const FRENZY_PERIOD = TICKS_PER_SECOND * 75;
const FRENZY_TICKS = TICKS_PER_SECOND * 20;
const FRENZY_SPEED = 1.16;
const FRENZY_CHUM = 46;
// With 24 bots in the tank, a high retire score let two or three monsters accumulate and
// farm every fresh spawn. A lower ceiling keeps the size ladder climbable.
const BOT_RETIRE_SCORE = 240;
const DASH_TICKS = 10;
const DASH_COOLDOWN_TICKS = TICKS_PER_SECOND * 2;
const ROCKET_SPEED = 3.1;
const ROCKET_LIFETIME_TICKS = TICKS_PER_SECOND * 3;
const ROCKET_COOLDOWN_TICKS = TICKS_PER_SECOND * 3;
const EXPLOSION_TICKS = 24;

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

const BOT_NAMES = [
  "Slinky", "Noodle", "Fang", "Zippy", "Coil", "Viper", "Wriggle", "Dash", "Boa", "Mamba",
  "Chomp", "Gill", "Reef", "Tide", "Bruce", "Nibbles", "Torpedo", "Barnacle", "Kelp", "Riptide",
  "Molar", "Anchor", "Squall", "Chowder", "Flotsam", "Bubbles", "Undertow", "Cutlass",
];

export interface CreateRoomOptions {
  id?: string;
  seed?: string;
  arenaRadius?: number;
}

export function createRoom(opts: CreateRoomOptions = {}): RoomState {
  const seed = opts.seed ?? "seed-fixed";
  const state: RoomState = {
    schemaVersion: 7,
    id: opts.id ?? "room-local",
    seed,
    tick: 0,
    rngState: seedToNumber(seed),
    arena: { radius: opts.arenaRadius ?? ARENA_RADIUS },
    snakes: {},
    food: [],
    rockets: [],
    explosions: [],
    frenzyUntilTick: 0,
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

/** A uniform random point inside the middle of the arena. */
function randomPointNearCenter(state: RoomState): Vec2 {
  const r = Math.sqrt(rand(state)) * state.arena.radius * CENTER_FOOD_RADIUS;
  const a = rand(state) * Math.PI * 2;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

function spawnAmbientFood(state: RoomState): void {
  // Most dots land in the middle so the centre of the tank is worth contesting; the
  // rest scatter across the whole disc so the outer water is never barren.
  const middle = rand(state) < CENTER_FOOD_SHARE;
  const p = middle ? randomPointNearCenter(state) : randomPointInArena(state);
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
  // Spread spawns across most of the disc: at 32 sharks a tight inner circle produced a
  // permanent scrum in the middle instead of an arena. Still clear of the lethal wall.
  const inner = state.arena.radius * 0.72;
  // Sample of all occupied points (every 3rd segment keeps this cheap for long bots).
  // Weight each occupied point by how dangerous its owner is: landing beside a minnow
  // is survivable, landing beside the tank's biggest shark is not.
  const occupied: Array<{ p: Vec2; weight: number }> = [];
  for (const s of Object.values(state.snakes)) {
    if (!s.alive) continue;
    const weight = 1 + Math.min(3, s.length / (START_LENGTH * 2));
    for (let i = 0; i < s.segments.length; i += 3) occupied.push({ p: s.segments[i], weight });
  }
  let best: Vec2 = { x: 0, z: 0 };
  let bestDist = -1;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const r = Math.sqrt(rand(state)) * inner;
    const a = rand(state) * Math.PI * 2;
    const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    let nearest = Infinity;
    for (const o of occupied) nearest = Math.min(nearest, Math.hypot(o.p.x - p.x, o.p.z - p.z) / o.weight);
    if (nearest > bestDist) {
      bestDist = nearest;
      best = p;
      if (nearest > 12 || occupied.length === 0) break; // good enough
    }
  }
  return best;
}

/** Number of body discs a snake of the given target length should show. */
export function segmentCount(length: number): number {
  return 1; // sharks grow by scale, not by adding a long segmented body
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

/** Median length across living sharks — the yardstick a fresh spawn is sized against. */
function medianLivingLength(state: RoomState): number {
  const lengths = Object.values(state.snakes).filter((s) => s.alive).map((s) => s.length).sort((a, b) => a - b);
  if (lengths.length === 0) return START_LENGTH;
  const middle = lengths.length >> 1;
  return lengths.length % 2 ? lengths[middle] : (lengths[middle - 1] + lengths[middle]) / 2;
}

function spawnLength(state: RoomState): number {
  return Math.min(MAX_SPAWN_LENGTH, Math.max(START_LENGTH, medianLivingLength(state) * SPAWN_MEDIAN_SHARE));
}

function makeSnake(state: RoomState, id: string, name: string, skin: string, isBot: boolean): Snake {
  const spawn = safeSpawn(state);
  const length = spawnLength(state);
  // Face toward arena center (+ slight jitter) so a still snake drifts inward, not into a wall.
  const heading = Math.atan2(-spawn.z, -spawn.x) + randRange(state, -0.5, 0.5);
  // Seed the trail heading backwards from the spawn so the body extends behind the head.
  const path: Vec2[] = [];
  const step = SEGMENT_SPACING;
  for (let i = 0; i < START_LENGTH + 3; i += 1) {  // trail seed only; body size comes from `length`
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
    length,
    boosting: false,
    chargeTicks: 0,
    lungeTicks: 0,
    dashCooldownTick: 0,
    rocketTicks: 0,
    rocketCooldownTick: 0,
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

// ── Feeding Frenzy ───────────────────────────────────────────────────────────────
/** True while the tank is in a Feeding Frenzy. Shared with the client HUD/renderer. */
export function isFrenzy(state: { tick: number; frenzyUntilTick?: number }): boolean {
  return (state.frenzyUntilTick ?? 0) > state.tick;
}

/** Ticks left in the current frenzy (0 when none is running). */
export function frenzyTicksLeft(state: { tick: number; frenzyUntilTick?: number }): number {
  return Math.max(0, (state.frenzyUntilTick ?? 0) - state.tick);
}

/** Fat, high-value chum shower dropped in the middle when a frenzy opens. */
function dropChum(state: RoomState): void {
  for (let i = 0; i < FRENZY_CHUM; i += 1) {
    const angle = (i / FRENZY_CHUM) * Math.PI * 2 + randRange(state, -0.3, 0.3);
    const radius = randRange(state, 0.8, state.arena.radius * CENTER_FOOD_RADIUS * 0.9);
    state.food.push({
      id: `chum-${state.tick}-${i}`,
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      value: i % 3 === 0 ? 5 : 3,
      r: i % 3 === 0 ? 0.95 : 0.72,
    });
  }
  state.explosions ??= [];
  state.explosions.push({ id: `chum-burst-${state.tick}`, x: 0, z: 0, tick: state.tick, skin: "gold", kind: "rocket" });
}

/** Open a frenzy on schedule. Purely tick-driven so replays reproduce it exactly. */
function stepFrenzy(state: RoomState): void {
  state.frenzyUntilTick ??= 0;
  if (state.tick % FRENZY_PERIOD !== 0 || state.tick === 0) return;
  state.frenzyUntilTick = state.tick + FRENZY_TICKS;
  dropChum(state);
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
      if (s && s.alive) {
        // Space/click is an immediate, server-timed impact dash. The two-second
        // cooldown is authoritative, so key repeat and packet spam cannot bypass it.
        s.dashCooldownTick ??= 0;
        if (action.on && state.tick >= s.dashCooldownTick) {
          s.lungeTicks = DASH_TICKS;
          // A frenzy halves the dash cooldown, which is what makes the twenty seconds
          // feel different rather than just looking different.
          s.dashCooldownTick = state.tick + Math.round(DASH_COOLDOWN_TICKS * (isFrenzy(state) ? 0.5 : 1));
        }
        s.chargeTicks = 0;
        s.boosting = false;
      }
      return state;
    }
    case "rocket": {
      const s = state.snakes[action.playerId];
      // Rockets are a player-only ability. Bot AI never fires one; this makes that a rule
      // rather than an accident of `steerBot`, so bots stay non-lethal at range.
      if (s?.alive && !s.isBot && s.segments[0] && state.tick >= (s.rocketCooldownTick ?? 0)) {
        const head = s.segments[0], lead = 2.5;
        state.rockets ??= [];
        state.rockets.push({
          id: `rocket-${s.id}-${state.tick}`,
          ownerId: s.id,
          x: head.x + Math.cos(s.heading) * lead,
          z: head.z + Math.sin(s.heading) * lead,
          heading: s.heading,
          expiresTick: state.tick + ROCKET_LIFETIME_TICKS,
        });
        s.rocketTicks = 6;
        s.rocketCooldownTick = state.tick + ROCKET_COOLDOWN_TICKS;
      }
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
  state.rockets ??= [];
  state.explosions ??= [];
  state.explosions = state.explosions.filter((burst) => state.tick - burst.tick < EXPLOSION_TICKS);

  // Frenzy scheduling runs first so this tick's movement already uses the new speed.
  stepFrenzy(state);

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

  // Rockets are real projectiles: server-authoritative, lethal, and swept against
  // each target so their deliberately high speed cannot tunnel through a shark.
  stepRockets(state);

  // Eating.
  for (const s of Object.values(state.snakes)) {
    if (s.alive) eat(state, s);
  }

  // Contact combat is size-ordered: the larger shark consumes the smaller. Rockets
  // are resolved first and remain lethal regardless of size or spawn protection.
  resolveSharkCollisions(state);

  // Always-on rivals must not snowball across a long-lived Durable Object until a
  // fresh player has no practical opening. A bot that clears the demo-scale score
  // target bursts into food, then returns through the normal fast respawn path.
  for (const s of Object.values(state.snakes)) {
    if (s.isBot && s.alive && s.score >= BOT_RETIRE_SCORE) killSnake(state, s);
  }

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

  // Holding charges a lunge and makes the shark glow; releasing launches it forward.
  let speed = BASE_SPEED;
  s.chargeTicks ??= 0;
  s.lungeTicks ??= 0;
  s.dashCooldownTick ??= 0;
  s.rocketTicks ??= 0;
  s.rocketCooldownTick ??= 0;
  if (s.boosting) s.chargeTicks = Math.min(16, s.chargeTicks + 1);
  if (s.lungeTicks > 0) {
    speed = BOOST_SPEED;
    s.lungeTicks -= 1;
  }
  if (s.rocketTicks > 0) s.rocketTicks -= 1;
  if (isFrenzy(state)) speed *= FRENZY_SPEED;

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
  // Bots get one pellet per tick. Human players may sweep two, which keeps the
  // arena lively without letting the always-on AI vacuum a corpse instantly.
  const maxChomps = s.isBot ? 1 : MAX_CHOMPS_PER_TICK;
  let chomps = 0;
  state.food = state.food.filter((f) => {
    if (chomps < maxChomps && Math.hypot(f.x - head.x, f.z - head.z) <= EAT_RADIUS + f.r) {
      chomps += 1;
      s.score += f.value;
      s.length += Math.min(0.6, f.value * 0.18);
      return false;
    }
    return true;
  });
}

function resolveSharkCollisions(state: RoomState): void {
  const living = Object.values(state.snakes).filter((shark) => shark.alive && shark.segments[0]);
  for (const shark of living) {
    if (shark.alive && Math.hypot(shark.segments[0].x, shark.segments[0].z) >= state.arena.radius) killSnake(state, shark);
  }
  for (let i = 0; i < living.length; i += 1) {
    const a = living[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < living.length; j += 1) {
      const b = living[j];
      if (!b.alive || state.tick < a.invulnTick || state.tick < b.invulnTick) continue;
      const radiusA = HEAD_RADIUS + Math.min(1.15, Math.sqrt(a.length) * .075);
      const radiusB = HEAD_RADIUS + Math.min(1.15, Math.sqrt(b.length) * .075);
      if (Math.hypot(a.segments[0].x - b.segments[0].x, a.segments[0].z - b.segments[0].z) > radiusA + radiusB) continue;
      const difference = a.length - b.length;
      const consumeAdvantage = Math.max(3, Math.min(a.length, b.length) * 0.2);
      if (Math.abs(difference) <= consumeAdvantage) {
        // Peers deflect instead of instantly deleting one another. This keeps dense
        // starting shoals playable while retaining a clear size hierarchy.
        const apart = Math.atan2(a.segments[0].z - b.segments[0].z, a.segments[0].x - b.segments[0].x);
        a.heading = a.targetHeading = apart;
        b.heading = b.targetHeading = apart + Math.PI;
        continue;
      }
      const winner = difference > 0 ? a : b, smaller = difference > 0 ? b : a;
      winner.score += Math.max(3, Math.round(smaller.length * 0.15));
      winner.length += Math.min(1.5, Math.max(0.5, smaller.length * 0.035));
      killSnake(state, smaller);
      if (!a.alive) break;
    }
  }
}

function killSnake(state: RoomState, s: Snake): void {
  const head = s.segments[0] ?? s.path[0];
  if (head) {
    state.explosions ??= [];
    state.explosions.push({ id: `shark-burst-${s.id}-${state.tick}`, x: head.x, z: head.z, tick: state.tick, skin: s.skin, kind: "shark" });
  }
  scatterAsFood(state, s);
  s.alive = false;
  s.boosting = false;
  s.chargeTicks = 0;
  s.lungeTicks = 0;
  s.rocketTicks = 0;
  s.respawnTick = state.tick + RESPAWN_DELAY;
  s.segments = [];
}

/** Turn a shark into a fat radial shower of collectible dots. */
function scatterAsFood(state: RoomState, s: Snake): void {
  const head = s.segments[0] ?? s.path[0];
  if (!head) return;
  const count = Math.min(42, 24 + Math.floor(Math.sqrt(Math.max(0, s.length)) * 2));
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + randRange(state, -0.16, 0.16);
    const radius = randRange(state, 0.6, 5.6);
    state.food.push({
      id: `d-${s.id}-${state.tick}-${i}`,
      x: head.x + Math.cos(angle) * radius,
      z: head.z + Math.sin(angle) * radius,
      value: i % 6 === 0 ? 2 : 1,
      r: i % 6 === 0 ? 0.72 : 0.4,
    });
  }
}

function stepRockets(state: RoomState): void {
  const active: RocketProjectile[] = [];
  for (const rocket of state.rockets) {
    const fromX = rocket.x, fromZ = rocket.z;
    const toX = fromX + Math.cos(rocket.heading) * ROCKET_SPEED;
    const toZ = fromZ + Math.sin(rocket.heading) * ROCKET_SPEED;
    let hit: Snake | null = null;
    for (const shark of Object.values(state.snakes)) {
      if (!shark.alive || shark.id === rocket.ownerId || !shark.segments[0]) continue;
      const head = shark.segments[0];
      const hitRadius = 1.25 + Math.min(1.35, Math.sqrt(shark.length) * 0.1);
      if (distanceToSegment(head.x, head.z, fromX, fromZ, toX, toZ) <= hitRadius) { hit = shark; break; }
    }
    if (hit) {
      const owner = state.snakes[rocket.ownerId];
      if (owner?.alive) owner.score += 10;
      killSnake(state, hit);
      continue;
    }
    rocket.x = toX;
    rocket.z = toZ;
    const expired = state.tick >= rocket.expiresTick || Math.hypot(toX, toZ) >= state.arena.radius;
    if (expired) {
      state.explosions.push({ id: `rocket-burst-${rocket.id}-${state.tick}`, x: toX, z: toZ, tick: state.tick, skin: "orange", kind: "rocket" });
    } else active.push(rocket);
  }
  state.rockets = active;
}

function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, lengthSq = dx * dx + dz * dz;
  const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// ── Bot AI ───────────────────────────────────────────────────────────────────────
function steerBot(state: RoomState, s: Snake): void {
  const head = s.segments[0];
  const distFromCenter = Math.hypot(head.x, head.z);

  // Near the wall? Steer back toward center (survival first).
  if (distFromCenter > state.arena.radius * 0.8) {
    s.targetHeading = Math.atan2(-head.z, -head.x);
    s.boosting = false;
    s.chargeTicks = 0;
    return;
  }

  // Otherwise head for the nearest food within sight. Sight widens during a frenzy so
  // bots actually commit to the chum drop instead of ignoring the event.
  const sight = isFrenzy(state) ? 34 : 22;
  let best: Food | null = null;
  let bestD = Infinity;
  for (const f of state.food) {
    const d = Math.hypot(f.x - head.x, f.z - head.z);
    if (d < bestD && d < sight) {
      bestD = d;
      best = f;
    }
  }
  if (best) {
    s.targetHeading = Math.atan2(best.z - head.z, best.x - head.x);
  } else if (isFrenzy(state)) {
    s.targetHeading = Math.atan2(-head.z, -head.x); // swim to the chum in the middle
  } else if ((state.tick + botPhase(s.id)) % 20 === 0) {
    // Wander: occasional random turn. Offset per shark so a whole tank of bots does not
    // pivot in unison on the same tick — with 24 of them that reads as a glitch.
    s.targetHeading = randRange(state, -Math.PI, Math.PI);
  }
  // Charge briefly, then lunge toward close high-value food.
  s.dashCooldownTick ??= 0;
  const wantsLunge = best !== null && bestD < 8 && best.value >= 2;
  if (wantsLunge && state.tick >= s.dashCooldownTick && !s.boosting && s.lungeTicks === 0) s.boosting = true;
  if (s.boosting && s.chargeTicks >= 6) {
    s.boosting = false;
    s.chargeTicks = 0;
    s.lungeTicks = 6;
    s.dashCooldownTick = state.tick + TICKS_PER_SECOND * 6;
  }
}

/** Stable per-bot offset so wander turns are staggered across the tank. */
function botPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 20;
  return h;
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
