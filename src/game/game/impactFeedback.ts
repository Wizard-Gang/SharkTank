import type { NetState } from "../../protocol/index.js";
import type { SceneVec3 } from "./sceneMath.js";

export const IMPACT_FX = {
  shakeMs: 180, flashMs: 120, vignetteMs: 280,
  flashIntervalMs: 400, maxSnapshotGap: 6, maxFrameGapMs: 300,
  biteStrength: 0.22, bittenStrength: 0.3, devourStrength: 0.36,
} as const;

/** One bounded impulse, never an accumulating camera displacement. */
export function impactEnvelope(now: number, startedAt: number, duration: number): number {
  const age = now - startedAt;
  return Number.isFinite(age) && age >= 0 && age < duration ? (1 - age / duration) ** 2 : 0;
}

export function impactShake(now: number, startedAt: number, strength: number,
  cameraMotion: boolean, reducedMotion: boolean, out: SceneVec3 = { x: 0, y: 0, z: 0 },
): SceneVec3 {
  const amplitude = cameraMotion && !reducedMotion
    ? impactEnvelope(now, startedAt, IMPACT_FX.shakeMs) * Math.max(0, Math.min(IMPACT_FX.devourStrength, strength)) : 0;
  const phase = (now - startedAt) * 0.065;
  out.x = amplitude ? Math.cos(phase) * amplitude : 0;
  out.y = amplitude ? Math.sin(phase + 0.8) * amplitude * 0.6 : 0;
  out.z = 0;
  return out;
}

/** Reads existing server truth only. Disabled effects still advance the baseline. */
export class ImpactFeedback {
  private previous: NetState | null = null;
  private youId: string | null = null;
  private lastAt = -Infinity;
  private shakeAt = -Infinity;
  private strength = 0;
  private vignetteAt = -Infinity;
  private flashAt = -Infinity;
  private flashes = new Map<string, number>();

  private clear(): void {
    this.shakeAt = this.vignetteAt = this.flashAt = -Infinity;
    this.strength = 0;
    this.flashes.clear();
  }

  sample(state: NetState | null, youId: string | null, now: number,
    cameraMotion: boolean, reducedMotion: boolean,
  ): void {
    const previous = this.previous;
    const before = previous?.sharks.find(shark => shark.id === youId);
    const me = state?.sharks.find(shark => shark.id === youId);
    const reset = !previous || !state || this.youId !== youId
      || state.round.number !== previous.round.number || state.round.startTick !== previous.round.startTick
      || state.tick < previous.tick || state.tick - previous.tick > IMPACT_FX.maxSnapshotGap
      || now < this.lastAt || now - this.lastAt > IMPACT_FX.maxFrameGapMs
      || state.round.phase === "result" || (me?.alive && !before?.alive);
    this.previous = state;
    this.youId = youId;
    this.lastAt = now;
    if (reset || !state || !previous || !cameraMotion || reducedMotion) { this.clear(); return; }
    for (const [id, at] of this.flashes) {
      if (now - at >= IMPACT_FX.flashMs || !state.sharks.some(shark => shark.id === id && shark.alive)) {
        this.flashes.delete(id);
      }
    }
    if (state.tick === previous.tick) return;

    let strength = 0;
    const canFlash = now - this.flashAt >= IMPACT_FX.flashIntervalMs;
    let flashed = false;
    for (const shark of state.sharks) {
      const prior = previous.sharks.find(actor => actor.id === shark.id);
      if (prior?.alive && shark.health < prior.health) {
        if (canFlash && shark.alive) { this.flashes.set(shark.id, now); flashed = true; }
        if (shark.id === youId) {
          strength = Math.max(strength, IMPACT_FX.bittenStrength);
          if (now - this.vignetteAt >= IMPACT_FX.flashIntervalMs) this.vignetteAt = now;
        }
      }
      if (!before?.alive || shark.id === youId) continue;
      // Exact ID comparison avoids parsing actor IDs (which may themselves contain hyphens).
      const landed = state.explosions.some(fx => fx.kind === "bite" && fx.tick > previous.tick && fx.tick <= state.tick
        && fx.id === `bite-${youId}-${shark.id}-${fx.tick}`);
      if (landed) strength = Math.max(strength, prior?.alive && !shark.alive
        ? IMPACT_FX.devourStrength : IMPACT_FX.biteStrength);
    }
    if (flashed) this.flashAt = now;
    if (strength > 0) { this.shakeAt = now; this.strength = strength; }
  }

  shake(now: number, cameraMotion: boolean, reducedMotion: boolean, out?: SceneVec3): SceneVec3 {
    return impactShake(now, this.shakeAt, this.strength, cameraMotion, reducedMotion, out);
  }

  flash(id: string, now: number): number {
    return 0.65 * impactEnvelope(now, this.flashes.get(id) ?? -Infinity, IMPACT_FX.flashMs);
  }

  vignette(now: number): number {
    return 0.48 * impactEnvelope(now, this.vignetteAt, IMPACT_FX.vignetteMs);
  }
}
