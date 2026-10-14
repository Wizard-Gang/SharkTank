import type { ClientState } from "../net/clientState.js";
import { clipPoint, projectEdgePoint, type EdgeViewport } from "./edgeNavigation.js";

export const HINT_WINDOW_MS = 30_000;
export const HINTS = ["Drag to swim", "Eat fish to grow", "Bite smaller sharks ▼"] as const;
export interface HintProgress { step: number; startedAt: number | null }
export const NEW_HINT_PROGRESS: HintProgress = { step: 0, startedAt: null };
type HintEvent = { type: "start" | "tick" | "skip"; now: number }
  | { type: "success"; step: number; now: number };

export function normalizeHintProgress(value: unknown): HintProgress {
  if (!value || typeof value !== "object") return { ...NEW_HINT_PROGRESS };
  const { step, startedAt } = value as Partial<HintProgress>;
  if (!Number.isInteger(step) || step! < 0 || step! > HINTS.length
    || (startedAt !== null && (typeof startedAt !== "number" || !Number.isFinite(startedAt) || startedAt < 0))) {
    return { ...NEW_HINT_PROGRESS };
  }
  return { step: step!, startedAt: startedAt ?? null };
}

/** Monotonic device progress: stale callbacks cannot replay a completed/skipped hint. */
export function mergeHintProgress(previous: HintProgress, next: HintProgress): HintProgress {
  return {
    step: Math.max(previous.step, next.step),
    startedAt: previous.startedAt === null ? next.startedAt : next.startedAt === null
      ? previous.startedAt : Math.min(previous.startedAt, next.startedAt),
  };
}

export function advanceHints(progress: HintProgress, event: HintEvent): HintProgress {
  if (!Number.isFinite(event.now) || event.now < 0 || progress.step === HINTS.length) return progress;
  if (event.type === "skip" || (progress.startedAt !== null && event.now - progress.startedAt >= HINT_WINDOW_MS)) {
    return { ...progress, step: HINTS.length };
  }
  if (event.type === "start" && progress.startedAt === null) return { ...progress, startedAt: event.now };
  if (event.type === "success" && progress.startedAt !== null && event.step === progress.step) {
    return { ...progress, step: progress.step + 1 };
  }
  return progress;
}

/** Existing authoritative snapshots prove growth and a hit on a devourable shark. */
export function hintSuccess(previous: ClientState | null, current: ClientState, youId: string) {
  const before = previous?.sharks.find((shark) => shark.id === youId);
  const me = current.sharks.find((shark) => shark.id === youId);
  if (!previous || !before?.alive || !me?.alive || current.tick <= previous.tick
    || current.round.number !== previous.round.number || current.round.phase === "result") {
    return { ate: false, bit: false };
  }
  const localHits = current.explosions.filter((fx) => fx.kind === "bite" && fx.tick > previous.tick
    && fx.tick <= current.tick && previous.sharks.some((other) => other.id !== youId
      && fx.id === `bite-${youId}-${other.id}-${fx.tick}`));
  return {
    ate: me.length > before.length && me.score > before.score && localHits.length === 0,
    bit: localHits.some((fx) => previous.sharks.some((other) => other.alive && other.id !== youId
      && before.length >= other.length * 1.5 && fx.id === `bite-${youId}-${other.id}-${fx.tick}`)),
  };
}

export interface SchoolCue { x: number; y: number; angle: number; distance: number; width: number; height: number; behind: boolean }

// School membership stays server-only. The nearest visible bait/reef fish anchors its school.
export function nearestSchoolFish(state: ClientState | null, youId: string | null) {
  const me = state?.sharks.find((shark) => shark.id === youId && shark.alive);
  if (!state || !me || state.round.phase === "result") return null;
  let nearest: ClientState["food"][number] | null = null;
  let distance = Infinity;
  for (const fish of state.food) {
    if (fish.kind !== "bait" && fish.kind !== "reef") continue;
    const next = Math.hypot(fish.x - me.position.x, fish.y - me.position.y, fish.z - me.position.z);
    if (Number.isFinite(next) && (next < distance || (next === distance && (!nearest || fish.id < nearest.id)))) {
      nearest = fish;
      distance = next;
    }
  }
  return nearest ? { position: nearest, distance } : null;
}

export function schoolCue(state: ClientState | null, youId: string | null, matrix: readonly number[], viewport: EdgeViewport): SchoolCue | null {
  const target = nearestSchoolFish(state, youId);
  if (!target || ![viewport.width, viewport.height].every(Number.isFinite) || viewport.width <= 72 || viewport.height <= 192) return null;
  const clip = clipPoint(target.position, matrix);
  if (![clip.x, clip.y, clip.z, clip.w].every(Number.isFinite)) return null;
  const edge = projectEdgePoint(clip, viewport);
  const x = edge?.x ?? viewport.width * (1 + clip.x / clip.w) / 2;
  const y = edge?.y ?? viewport.height * (1 - clip.y / clip.w) / 2;
  return { x, y, angle: edge?.angle ?? Math.atan2(y - viewport.height / 2, x - viewport.width / 2) * 180 / Math.PI,
    distance: target.distance, width: viewport.width, height: viewport.height, behind: clip.w <= 0 };
}
