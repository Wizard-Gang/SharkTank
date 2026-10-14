import { resolveQuality } from "./quality.js";
import { TICKS_PER_SECOND } from "../../engine/index.js";
type SharkPresentationQuality = import("./quality.js").QualityChoice;

export interface SharkPresentationProfile {
  radialSegments: number;
  lengthSegments: number;
  finSegments: number;
}

const QUALITY: Record<import("./quality.js").ResolvedQuality, SharkPresentationProfile> = {
  low: { radialSegments: 8, lengthSegments: 12, finSegments: 2 },
  medium: { radialSegments: 12, lengthSegments: 20, finSegments: 3 },
  high: { radialSegments: 16, lengthSegments: 32, finSegments: 4 },
};

export function resolveSharkPresentationQuality(
  quality: SharkPresentationQuality,
): SharkPresentationProfile {
  return QUALITY[resolveQuality(quality)];
}

interface SharkAnimationInput {
  seconds: number;
  actorId: string;
  speed: number;
  baseSpeed: number;
  boostSpeed: number;
  reducedMotion: boolean;
}

interface SharkAnimationPose {
  phase: number;
  amplitude: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function actorPhase(actorId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < actorId.length; index += 1) {
    hash ^= actorId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 6283) / 1000;
}

export function resolveSharkAnimation(input: SharkAnimationInput): SharkAnimationPose {
  if (input.reducedMotion) {
    return { phase: 0, amplitude: 0 };
  }

  const baseSpeed = Math.max(0.001, Number.isFinite(input.baseSpeed) ? input.baseSpeed : 0.001);
  const boostSpeed = Math.max(
    baseSpeed + 0.001,
    Number.isFinite(input.boostSpeed) ? input.boostSpeed : baseSpeed + 0.001,
  );
  const speed = Number.isFinite(input.speed) ? input.speed : baseSpeed;
  const speedRatio = clamp01((speed - baseSpeed) / (boostSpeed - baseSpeed));
  const seconds = Number.isFinite(input.seconds) ? input.seconds : 0;
  // Speed changes amplitude, never the clock: burst transitions cannot jump phase.
  return {
    phase: seconds * TICKS_PER_SECOND * 0.3 + actorPhase(input.actorId),
    amplitude: 0.12 + speedRatio * 0.28,
  };
}
