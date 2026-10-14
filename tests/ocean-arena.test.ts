import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createCurrentCurtain, currentCurtainProximity } from "../src/game/game/currentCurtain.js";
import {
  ENVIRONMENT_LANDMARKS,
  makeEnvironmentSeeds,
  resolveOceanArenaCues,
  resolveOceanEnvironmentQuality,
} from "../src/game/game/oceanArena.js";
import { OCEAN_CUES, resolveSceneQuality } from "../src/game/game/sceneMath.js";
import {
  OCEAN,
  createRoom,
  PREY_BUDGET,
  ROOM_SCHEMA_VERSION,
} from "../src/engine/index.js";
import { REALTIME_PROTOCOL_VERSION } from "../src/protocol/index.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("ST-118 stylized ocean arena", () => {
  it("derives presentation volume and warning geometry from authoritative ocean values", () => {
    const cues = resolveOceanArenaCues({ arenaRadius: 82, seabedY: -18, surfaceY: 14 });
    expect(cues.radius).toBe(82);
    expect(cues.seabedY).toBe(-18);
    expect(cues.surfaceY).toBe(14);
    expect(cues.height).toBe(32);
    expect(cues.midY).toBe(-2);
    expect(currentCurtainProximity(cues.radius, { x: 62, z: 0 })).toBe(0);
    expect(currentCurtainProximity(cues.radius, { x: 72, z: 0 })).toBe(0.5);
    expect(cues.frenzyRadius).toBeCloseTo(cues.radius * 0.3);
    expect(OCEAN).toEqual({ radius: 120, seabedY: -18, surfaceY: 18 });
    expect(createRoom().ocean).toEqual(OCEAN);
    expect(createRoom({ oceanRadius: NaN, seabedY: 9, surfaceY: 8 }).ocean).toEqual(OCEAN);
    expect(OCEAN_CUES.horizontalRadius).toBe(OCEAN.radius);
    expect(OCEAN_CUES.seabedY).toBe(OCEAN.seabedY);
    expect(OCEAN_CUES.surfaceY).toBe(OCEAN.surfaceY);
    expect(PREY_BUDGET).toMatchObject({ ambient: 480, max: 720, spawnPerTick: 8, schools: 24, frenzyChum: 60 });
  });

  it("quality presets scale only optional environment cost while preserving the world", () => {
    const low = resolveOceanEnvironmentQuality("low");
    const medium = resolveOceanEnvironmentQuality("medium");
    const high = resolveOceanEnvironmentQuality("high");
    expect(low.particulateBudget).toBeLessThan(medium.particulateBudget);
    expect(medium.particulateBudget).toBeLessThan(high.particulateBudget);
    expect(low.bubbleBudget).toBeLessThan(high.bubbleBudget);
    expect(low.lightShaftCount).toBeGreaterThan(0);
    expect(low.causticBands).toBeGreaterThan(0);
    expect(high.particulateBudget).toBeLessThanOrEqual(256);
    expect(low.kelpPerGap).toBeLessThan(medium.kelpPerGap);
    expect(medium.kelpPerGap).toBeLessThan(high.kelpPerGap);
  });

  it("keeps deterministic environment particles bounded and allocation counts explicit", () => {
    const first = makeEnvironmentSeeds(36, 118);
    const second = makeEnvironmentSeeds(36, 118);
    expect(first).toEqual(second);
    expect(first).toHaveLength(36);
    for (const particle of first) {
      expect(particle.radialShare).toBeGreaterThanOrEqual(0);
      expect(particle.radialShare).toBeLessThan(0.9);
      expect(particle.depthShare).toBeGreaterThan(0);
      expect(particle.depthShare).toBeLessThan(1);
      expect(particle.speed).toBeGreaterThan(0);
    }
    expect(makeEnvironmentSeeds(9999)).toHaveLength(256);
  });

  it("includes reef, wreck, and Feeding Frenzy landmark categories without changing game rules", () => {
    expect(ENVIRONMENT_LANDMARKS.some((landmark) => landmark.kind === "reef")).toBe(true);
    expect(ENVIRONMENT_LANDMARKS.some((landmark) => landmark.kind === "wreck")).toBe(true);
    expect(ENVIRONMENT_LANDMARKS.filter((landmark) => landmark.kind === "reef").every((landmark) => landmark.radialShare < 1)).toBe(true);
    expect(ENVIRONMENT_LANDMARKS.find((landmark) => landmark.kind === "wreck")?.radialShare).toBeLessThan(1);
    expect(ENVIRONMENT_LANDMARKS.some((landmark) => landmark.kind === "frenzy")).toBe(true);
    expect(ROOM_SCHEMA_VERSION).toBe(11);
    expect(REALTIME_PROTOCOL_VERSION).toBe(12);
  });

  it("reads live arena/frenzy authority and keeps the procedural environment client-only", () => {
    const scene = read("../src/game/game/Scene.tsx");
    const world = read("../src/game/game/WorldEnvironment.tsx");
    const worker = read("../src/worker/index.ts");

    expect(scene).toContain("<WorldEnvironment socket={socket} settings={settings}");
    expect(world).toContain("socket.stateRef.current");
    expect(world).toContain("state?.arenaRadius");
    expect(world).toContain("state?.seabedY");
    expect(world).toContain("state?.surfaceY");
    expect(world).toContain("state.frenzyUntilTick > state.tick");
    expect(world).toContain("reefBaseRef");
    expect(world).toContain("<instancedMesh ref={reefBaseRef}");
    expect(world).toContain("<WreckLandmark");
    expect(world).toContain("particulateBudget");
    expect(world).toContain("bubbleBudget");
    expect(world).not.toContain("http://");
    expect(world).not.toContain("https://");
    expect(world).not.toContain("fetch(");
    expect(world).not.toContain("setOrientation(");
    expect(world).not.toContain("setBoost(");
    expect(worker).not.toContain("@react-three/fiber");
    expect(worker).not.toContain('from "three"');
  });
});

describe("ST-295 current curtain", () => {
  it("brightens only over the final 20 horizontal units, including diagonal approaches", () => {
    for (const radius of [12, 82, 120, 160]) {
      expect(currentCurtainProximity(radius)).toBe(0);
      for (const angle of [0, Math.PI / 4, Math.PI, -Math.PI / 2]) {
        for (const distance of [0, 1, 10, 19, 20, 21]) {
          if (distance > radius) continue;
          const r = radius - distance;
          expect(currentCurtainProximity(radius, { x: Math.cos(angle) * r, z: Math.sin(angle) * r }))
            .toBeCloseTo(Math.max(0, 1 - distance / 20));
        }
      }
      expect(currentCurtainProximity(radius, { x: radius + 1, z: 0 })).toBe(1);
    }
    expect(currentCurtainProximity(NaN, { x: 1, z: 0 })).toBe(0);
    expect(currentCurtainProximity(120, { x: Infinity, z: 0 })).toBe(0);
  });

  it.each(["low", "medium", "high"] as const)("keeps a complete uncapped water-column cylinder at %s quality", quality => {
    const { curtainSegments, curtainFlowLines } = resolveOceanEnvironmentQuality(quality);
    expect(curtainSegments).toBe(({ low: 64, medium: 96, high: 128 })[quality]);
    expect(curtainFlowLines).toBe(curtainSegments / 2);
    const cues = resolveOceanArenaCues({ arenaRadius: 82, seabedY: -18, surfaceY: 14 });
    const geometry = new THREE.CylinderGeometry(1, 1, 1, curtainSegments, 1, true);
    geometry.scale(cues.radius, cues.height, cues.radius);
    geometry.translate(0, cues.midY, 0);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.y).toBe(cues.seabedY);
    expect(geometry.boundingBox!.max.y).toBe(cues.surfaceY);
    expect(geometry.boundingBox!.max.x).toBe(cues.radius);
    expect(geometry.index!.count / 3).toBe(curtainSegments * 2);
    expect(geometry.groups).toHaveLength(1);
    geometry.dispose();
  });

  it("adds gradient and slow flow to the standard fogged shader without textures or extra passes", () => {
    const curtain = createCurrentCurtain();
    const shader = { ...THREE.ShaderLib.basic, uniforms: {} };
    curtain.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain("vCurrentUv = uv");
    expect(shader.fragmentShader).toContain("currentTime * 0.075");
    expect(shader.fragmentShader).toContain("vec3 verticalTint = mix(");
    expect(shader.fragmentShader).toContain("currentProximity * (0.12 + line * 0.08)");
    expect(shader.fragmentShader).toContain("#include <fog_fragment>");
    expect(shader.uniforms).toMatchObject(curtain.uniforms);
    expect(curtain.material).toMatchObject({ transparent: true, depthWrite: false, forceSinglePass: true, fog: true, map: null });
    curtain.material.dispose();
  });
});

it("ST-241 fog hides the prey visibility boundary at every quality", () => {
  for (const quality of ["low", "medium", "high"] as const) {
    const fog = resolveSceneQuality(quality);
    expect(fog.fogFar).toBeLessThanOrEqual(70);
    expect(fog.fogNear).toBeLessThan(fog.fogFar);
  }
});
