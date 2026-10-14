import { mouthPoint, SHARK_GEOMETRY, sharkScaleForLength } from "../../engine/sharkGeometry.js";
import type { NetPrey, NetShark, NetState } from "../../protocol/index.js";
import type { InterpFrame } from "../net/snapshotTimeline.js";
import { preyVisualFor } from "./preyPresentation.js";
import { forwardFromYawPitch, interpolateOrientedPose } from "./sceneMath.js";

export const FEEDING_FX = { popSeconds: 0.32, popParticles: 6, maxSnapshotGap: 6 } as const;

export interface FeedingParticle {
  kind: "wake" | "prey";
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  radius: number; stretch: number;
  color: string;
}

/** Cosmetic inference only: use the oriented shared mouth, never the body centre. */
export function nearLivingMouth(prey: NetPrey, sharks: readonly NetShark[]): boolean {
  return sharks.some(shark => {
    if (!shark.alive) return false;
    const mouth = mouthPoint(shark);
    return (prey.x - mouth.x) ** 2 + (prey.y - mouth.y) ** 2 + (prey.z - mouth.z) ** 2 <= 12 ** 2;
  });
}

interface PreyPop { prey: NetPrey; at: number; color: string }

/** Retains only a quality-bounded set of short-lived pops, plus one snapshot baseline. */
export class FeedingParticles {
  private previous: NetState | null = null;
  private pops: PreyPop[] = [];
  private lastSeconds = -Infinity;
  private pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private particle: FeedingParticle = {
    kind: "wake", x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
    radius: 0, stretch: 1, color: "#b5eaf4",
  };

  reset(): void {
    this.previous = null;
    this.pops.length = 0;
    this.lastSeconds = -Infinity;
  }

  /** Each new cue gets at most a third of the shared budget, leaving room for impacts.
   * The writer consumes a scratch object synchronously; no per-particle allocation. */
  sample(frame: InterpFrame, seconds: number, budget: number, reducedMotion: boolean,
    write: (particle: FeedingParticle, index: number) => void,
    local?: { id: string; position: { x: number; y: number; z: number }; yaw: number; pitch: number },
  ): number {
    const state = frame.newer;
    const previous = this.previous;
    const cueBudget = Math.floor(budget / 3);
    const popLimit = Math.floor(cueBudget / FEEDING_FX.popParticles);
    const reset = !previous || state.round.number !== previous.round.number
      || state.round.startTick !== previous.round.startTick || state.tick < previous.tick
      || state.tick - previous.tick > FEEDING_FX.maxSnapshotGap
      || seconds - this.lastSeconds > 0.3 || seconds < this.lastSeconds
      || state.frenzyUntilTick !== previous.frenzyUntilTick || state.round.phase === "result";
    this.lastSeconds = seconds;
    this.pops = this.pops.filter(pop => seconds - pop.at < FEEDING_FX.popSeconds).slice(0, popLimit);
    if (reset || reducedMotion) this.pops.length = 0;
    if (!reset && !reducedMotion && state.tick > previous!.tick) {
      const present = new Set(state.food.map(prey => prey.id));
      for (const prey of previous!.food) {
        if (this.pops.length >= popLimit) break;
        if (present.has(prey.id) || !nearLivingMouth(prey, state.sharks)) continue;
        this.pops.push({ prey, at: seconds,
          color: preyVisualFor(prey.kind, prey.value, prey.r, prey.species).bodyColor });
      }
    }
    this.previous = state;
    if (reducedMotion || state.round.phase === "result") return 0;

    const particle = this.particle;
    let count = 0;
    for (const pop of this.pops) {
      const life = (seconds - pop.at) / FEEDING_FX.popSeconds;
      for (let i = 0; i < FEEDING_FX.popParticles; i++) {
        const angle = i * Math.PI / 3;
        const travel = life * 0.85;
        Object.assign(particle, { kind: "prey", x: pop.prey.x + Math.cos(angle) * travel,
          y: pop.prey.y + (i % 2 ? 1 : -1) * travel * 0.45,
          z: pop.prey.z + Math.sin(angle) * travel, yaw: 0, pitch: 0,
          radius: 0.14 * (1 - life), stretch: 1, color: pop.color });
        write(particle, count++);
      }
    }

    const lunging = state.sharks.filter(shark => shark.alive && shark.lungeTicks > 0);
    const perShark = Math.min(8, Math.floor(cueBudget / Math.max(1, lunging.length)));
    for (const shark of lunging) {
      const prior = frame.older.sharks.find(actor => actor.id === shark.id) ?? shark;
      const pose = interpolateOrientedPose({ ...prior.position, yaw: prior.yaw, pitch: prior.pitch },
        { ...shark.position, yaw: shark.yaw, pitch: shark.pitch }, frame.alpha, this.pose);
      if (local?.id === shark.id) Object.assign(pose, local.position, { yaw: local.yaw, pitch: local.pitch });
      const forward = forwardFromYawPitch(pose.yaw, pose.pitch);
      const scale = sharkScaleForLength(shark.length);
      for (let i = 0; i < perShark; i++) {
        const life = (seconds * 3 + i / perShark) % 1;
        const behind = -SHARK_GEOMETRY.tail * scale + 0.25 + life * 3.5;
        const side = (i % 2 ? 1 : -1) * (0.18 + life * 0.24) * scale;
        Object.assign(particle, { kind: "wake",
          x: pose.x - forward.x * behind - Math.sin(pose.yaw) * side,
          y: pose.y - forward.y * behind + life * 0.3,
          z: pose.z - forward.z * behind + Math.cos(pose.yaw) * side,
          yaw: pose.yaw, pitch: pose.pitch, radius: 0.08 + (1 - life) * 0.08,
          stretch: 2.8, color: "#b5eaf4" });
        write(particle, count++);
      }
    }
    return count;
  }
}
