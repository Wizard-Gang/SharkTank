// Pure presentation selection/projection. Competitive state always comes from snapshots.
import type { ClientState } from "../net/clientState.js";
import { edibilityFor } from "./edibility.js";

export type EdgeKind = "threat" | "apex" | "frenzy" | "golden";
export interface EdgeTarget {
  id: string;
  kind: EdgeKind;
  label: string;
  position: { x: number; y: number; z: number };
  distance: number;
}
export interface EdgeCue extends EdgeTarget {
  x: number;
  y: number;
  angle: number;
  behind: boolean;
}
export interface ClipPoint { x: number; y: number; z: number; w: number }
export interface EdgeViewport { width: number; height: number }
export const EDGE_GLYPHS: Record<EdgeKind, string> = { threat: "▲", apex: "◆", frenzy: "◎", golden: "✦" };
const order: Record<EdgeKind, number> = { threat: 0, apex: 1, frenzy: 2, golden: 3 };

export function edgeTargets(state: ClientState | null, youId: string | null): EdgeTarget[] {
  const me = state?.sharks.find((s) => s.id === youId && s.alive);
  if (!state || !me || state.round.phase === "result") return [];
  const targets: EdgeTarget[] = [];
  const add = (id: string, kind: EdgeKind, label: string, position: EdgeTarget["position"]) => {
    const distance = Math.hypot(position.x - me.position.x, position.y - me.position.y, position.z - me.position.z);
    if (Number.isFinite(distance)) targets.push({ id, kind, label, position, distance });
  };
  const apexId = state.round.phase === "apex" ? state.round.apexId : null;
  for (const shark of state.sharks) {
    if (!shark.alive || shark.id === me.id) continue;
    if (shark.id === apexId) add(shark.id, "apex", `Apex: ${shark.name}`, shark.position);
    else if (edibilityFor(me, shark) === "threat"
      && Math.hypot(shark.position.x - me.position.x, shark.position.y - me.position.y, shark.position.z - me.position.z) <= 40) {
      add(shark.id, "threat", `Danger: ${shark.name}`, shark.position);
    }
  }
  if (state.frenzyUntilTick > state.tick) {
    add("frenzy-center", "frenzy", "Feeding Frenzy", { x: 0, y: (state.seabedY + state.surfaceY) / 2, z: 0 });
  }
  for (const fish of state.food) {
    if (fish.kind === "golden") add(`golden:${fish.id}`, "golden", "Golden fish", fish);
  }
  return targets;
}

/** Column-major camera projection × view matrix, with homogeneous W retained. */
export function clipPoint(point: EdgeTarget["position"], matrix: readonly number[]): ClipPoint {
  const { x, y, z } = point;
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    w: matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15],
  };
}

/** Clamp off-screen directions to an inset ellipse; never mirror targets behind the camera. */
export function projectEdgePoint(clip: ClipPoint, { width, height }: EdgeViewport) {
  if (![clip.x, clip.y, clip.z, clip.w, width, height].every(Number.isFinite) || width <= 72 || height <= 192) return null;
  if (clip.w > 0 && Math.abs(clip.x) <= clip.w && Math.abs(clip.y) <= clip.w && clip.z >= -clip.w && clip.z <= clip.w) return null;
  // Dividing by signed W would reverse left/right for targets behind the camera.
  const divisor = Math.max(Math.abs(clip.w), 0.0001);
  let dx = clip.x / divisor * width / 2;
  let dy = -clip.y / divisor * height / 2;
  if (Math.hypot(dx, dy) < 0.0001) { dx = 0; dy = 1; } // Exactly behind: turn around, indicated below.
  const rx = width / 2 - 36;
  const ry = height / 2 - 96;
  const scale = 1 / Math.hypot(dx / rx, dy / ry);
  return { x: width / 2 + dx * scale, y: height / 2 + dy * scale, angle: Math.atan2(dy, dx) * 180 / Math.PI || 0, behind: clip.w <= 0 };
}

export function buildEdgeCues(targets: readonly EdgeTarget[], matrix: readonly number[], viewport: EdgeViewport): EdgeCue[] {
  const projected = targets.flatMap((target) => {
    const edge = projectEdgePoint(clipPoint(target.position, matrix), viewport);
    return edge ? [{ ...target, ...edge }] : [];
  }).sort((a, b) => order[a.kind] - order[b.kind] || a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Reserve one slot per available kind before filling spare slots with nearby threats.
  const primary = projected.filter((cue, index) => projected.findIndex((other) => other.kind === cue.kind) === index);
  const selected = [...primary, ...projected.filter((cue) => !primary.includes(cue))].slice(0, 4);
  const placed: EdgeCue[] = [];
  const rx = viewport.width / 2 - 36;
  const ry = viewport.height / 2 - 96;
  for (const cue of selected) {
    const bearing = Math.atan2((cue.y - viewport.height / 2) / ry, (cue.x - viewport.width / 2) / rx);
    // Nearby directions share an edge: separate their cards along the ellipse while
    // keeping each arrow's original direction. Four cards bound this search.
    for (let attempt = 0; attempt < 33; attempt++) {
      const offset = Math.ceil(attempt / 2) * (attempt % 2 ? 1 : -1) * Math.PI / 16;
      const x = viewport.width / 2 + rx * Math.cos(bearing + offset);
      const y = viewport.height / 2 + ry * Math.sin(bearing + offset);
      if (placed.every((other) => Math.abs(other.x - x) >= 76 || Math.abs(other.y - y) >= 32)) {
        placed.push({ ...cue, x, y });
        break;
      }
    }
  }
  return placed;
}
