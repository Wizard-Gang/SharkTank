import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createSharkBodyGeometry, createSharkFinGeometry } from "../src/game/game/sharkGeometry.js";
import { SKINS } from "../src/engine/index.js";
import { countershadeSharkGeometry, SHARK_MATERIAL } from "../src/game/game/sharkMaterial.js";
import { ROOM_SCHEMA_VERSION } from "../src/engine/room.js";
import { REALTIME_PROTOCOL_VERSION } from "../src/protocol/index.js";
import {
  resolveSharkAnimation,
  resolveSharkPresentationQuality,
} from "../src/game/game/sharkPresentation.js";

import { sharkScaleForLength, mouthPoint, bodySegment } from "../src/engine/sharkGeometry.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("ST-289 lit shark countershading", () => {
  it("uses a lit, opaque skin-multiplying material without a second pass", () => {
    const material = new THREE.MeshStandardMaterial(SHARK_MATERIAL);
    expect(material.isMeshStandardMaterial).toBe(true);
    expect(material.vertexColors).toBe(true);
    expect(material.color.getHex()).toBe(0xffffff);
    expect(material.metalness).toBe(0);
    expect(material.roughness).toBe(0.82);
    expect(material.transparent).toBe(false);
    expect(material.side).toBe(THREE.FrontSide);
    // The actual pinned Three shader multiplies vertex AND instance colours.
    expect(THREE.ShaderChunk.color_vertex).toContain("vColor *= color");
    expect(THREE.ShaderChunk.color_vertex).toContain("vColor.xyz *= instanceColor.xyz");
    expect(THREE.ShaderChunk.color_fragment).toContain("diffuseColor.rgb *= vColor");
    material.dispose();
  });

  it("keeps every skin's channel ratios while darkening the back and lifting High contrast", () => {
    for (const quality of ["low", "medium", "high"] as const) {
      const geometry = createSharkBodyGeometry(resolveSharkPresentationQuality(quality));
      const positions = geometry.getAttribute("position").array.slice();
      const indices = geometry.index!.array.slice();
      const shades: number[] = [];
      for (const highContrast of [false, true]) {
        countershadeSharkGeometry(geometry, "body", highContrast);
        const colors = geometry.getAttribute("color");
        const top = Math.min(...Array.from(colors.array));
        const bottom = Math.max(...Array.from(colors.array));
        expect(top).toBeCloseTo(highContrast ? 0.72 : 0.58);
        expect(bottom).toBe(1);
        expect(bottom).toBeGreaterThan(top);
        shades.push(top);
        for (let i = 0; i < colors.count; i++) {
          const shade = colors.getX(i);
          expect(shade).toBeGreaterThanOrEqual(highContrast ? 0.71 : 0.57);
          expect(shade).toBeLessThanOrEqual(1);
          expect(colors.getY(i)).toBe(shade);
          expect(colors.getZ(i)).toBe(shade);
          for (const skin of SKINS) {
            const base = new THREE.Color(skin.color);
            const shaded = base.clone().multiply(new THREE.Color(shade, shade, shade));
            for (const channel of ["r", "g", "b"] as const) {
              expect(shaded[channel] / base[channel]).toBeCloseTo(shade);
            }
          }
        }
      }
      expect(shades[1]).toBeGreaterThan(shades[0]);
      expect(geometry.getAttribute("position").array).toEqual(positions);
      expect(geometry.index!.array).toEqual(indices);
      expect(geometry.groups).toHaveLength(0);
      geometry.dispose();
    }
  });

  it("shades fins in shark rest space, including mirrored rotated pectorals", () => {
    for (const sign of [-1, 1] as const) {
      const geometry = createSharkFinGeometry(false, 3);
      countershadeSharkGeometry(geometry, sign === 1 ? "pectoralLeft" : "pectoralRight", false);
      const rest = new THREE.Object3D();
      rest.position.set(0.38, -0.2, sign * 0.72);
      rest.rotation.set(sign * (Math.PI / 2 - 0.14), 0, -sign * 0.22);
      rest.scale.set(0.7, 1.5, 1);
      rest.updateMatrix();
      const position = geometry.getAttribute("position");
      const colors = geometry.getAttribute("color");
      for (let i = 0; i < position.count; i++) {
        const height = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(rest.matrix).y;
        expect(colors.getX(i)).toBeCloseTo(THREE.MathUtils.lerp(1, 0.58, THREE.MathUtils.smoothstep(height, -0.45, 0.45)));
      }
      countershadeSharkGeometry(geometry, "dorsal", false);
      for (let i = 0; i < colors.count; i++) {
        expect(geometry.getAttribute("color").getX(i)).toBeLessThan(0.61);
      }
      geometry.dispose();
    }
  });
});

describe("ST-119 animated shark models", () => {
  it("replaces the single stretched actor primitive with a recognizable composed shark silhouette", () => {
    const actors = read("../src/game/game/ActorLayer.tsx");
    for (const refName of [
      "bodyMesh",
      "tailFinMesh",
      "dorsalFinMesh",
      "pectoralLeftMesh",
      "pectoralRightMesh",
    ]) {
      expect(actors).toContain(`const ${refName} = useRef<THREE.InstancedMesh>(null);`);
      expect(actors).toContain(`ref={${refName}}`);
    }
    for (const removed of ["headMesh", "snoutMesh", "peduncleMesh"]) expect(actors).not.toContain(removed);
    expect(actors).toContain("geometry={geometries.body}");
    expect(actors).not.toContain("<coneGeometry");
    expect(actors).not.toContain("const sharkMesh =");
    expect(actors).not.toContain("dummy.scale.set(sharkScale * 1.75");
  });

  it("keeps local prediction, remote interpolation, orientation bank and authoritative length scaling", () => {
    const actors = read("../src/game/game/ActorLayer.tsx");
    expect(actors).toContain("LocalPredictor");
    expect(actors).toContain("frameAt(REMOTE_INTERP_DELAY_MS)");
    expect(actors).toContain("interpolateOrientedPose(");
    expect(actors).toContain("root.rotation.set(motion.roll, -yaw, pitch)");
    expect(actors).toContain("sharkScaleForLength(shark.length)");
    expect(sharkScaleForLength(64)).toBeCloseTo(Math.min(2.5, 0.32 + Math.sqrt(64) * 0.2));
  });

  it("derives deterministic swim animation from continuous seconds, speed, boost and pitch state", () => {
    const base = {
      seconds: 42 / 20,
      actorId: "shark-alpha",
      speed: 11,
      baseSpeed: 11,
      boostSpeed: 28,
      boosting: false,
      pitch: 0.3,
      reducedMotion: false,
    };
    const cruise = resolveSharkAnimation(base);
    const cruiseAgain = resolveSharkAnimation(base);
    const boosted = resolveSharkAnimation({
      ...base,
      speed: 28,
      boosting: true,
    });
    expect(cruiseAgain).toEqual(cruise);
    let last = cruise;
    for (let frame = 1; frame <= 60; frame += 1) {
      const next = resolveSharkAnimation({ ...base, seconds: base.seconds + frame / 60 });
      expect(next).not.toEqual(last);
      last = next;
    }
    expect(read("../src/game/game/ActorLayer.tsx")).toContain("seconds: clock.elapsedTime");
    expect(boosted.intensity).toBeGreaterThan(cruise.intensity);
    expect(Math.abs(boosted.tailYaw)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(boosted.pectoralSweep)).toBeLessThanOrEqual(0.22);
  });

  it("keeps reduced motion playable by suppressing decorative flex while bank remains an orientation cue", () => {
    const reduced = resolveSharkAnimation({
      seconds: 42 / 20,
      actorId: "shark-alpha",
      speed: 28,
      baseSpeed: 11,
      boostSpeed: 28,
      boosting: true,
      pitch: 0.5,
      reducedMotion: true,
    });
    expect(reduced).toEqual({
      bodyYaw: 0,
      peduncleYaw: 0,
      tailYaw: 0,
      pectoralSweep: 0,
      intensity: 0,
    });

    const sceneMath = read("../src/game/game/sceneMath.ts");
    expect(sceneMath).toContain("const maxBank = reducedMotion ? 0.24 : 0.42");
    expect(sceneMath).not.toContain("if (reducedMotion) return 0;");
  });

  it("scales optional geometry detail without removing the essential shark anatomy", () => {
    const low = resolveSharkPresentationQuality("low");
    const medium = resolveSharkPresentationQuality("medium");
    const high = resolveSharkPresentationQuality("high");
    expect(low.radialSegments).toBeLessThan(medium.radialSegments);
    expect(medium.radialSegments).toBeLessThan(high.radialSegments);
    expect(low.radialSegments).toBeGreaterThanOrEqual(6);

    const actors = read("../src/game/game/ActorLayer.tsx");
    expect(low.lengthSegments).toBeLessThan(medium.lengthSegments);
    expect(medium.lengthSegments).toBeLessThan(high.lengthSegments);
    expect(low.finSegments).toBeLessThan(high.finSegments);
    expect(actors).toContain("createSharkBodyGeometry(sharkQuality)");
    expect(actors).toContain("resolveSharkPresentationQuality(settings.graphics.quality)");
  });

  it("keeps shark presentation browser-only with protocol, persistence and package identities unchanged", () => {
    const worker = read("../src/worker/index.ts");
    const packageJson = JSON.parse(read("../package.json")) as { version: string };
    const actors = read("../src/game/game/ActorLayer.tsx");

    expect(ROOM_SCHEMA_VERSION).toBe(11);
    expect(REALTIME_PROTOCOL_VERSION).toBe(12);
    expect(packageJson.version).toBe("2.5.0");
    expect(worker).not.toContain("sharkPresentation");
    expect(worker).not.toContain("@react-three/fiber");
    expect(worker).not.toContain('from "three"');
    expect(actors).not.toContain("http://");
    expect(actors).not.toContain("https://");
    expect(actors).not.toContain("fetch(");
  });
});


describe("shared shark geometry", () => {
  it("keeps geometry server-safe and shares rest landmarks with renderer and camera", () => {
    const geometry = read("../src/engine/sharkGeometry.ts");
    expect(geometry).not.toMatch(/three|document|window|react|src\/game/);
    const actors = read("../src/game/game/ActorLayer.tsx");
    const model = read("../src/game/game/sharkGeometry.ts");
    expect(model).toContain("SHARK_GEOMETRY.snoutTip");
    expect(model).toContain("SHARK_GEOMETRY.tail");
    expect(actors).toContain("SHARK_GEOMETRY.tail");
    expect(read("../src/game/game/sceneMath.ts")).toContain("SHARK_GEOMETRY.mouth * size");
  });
  it("preserves the full size curve including invalid lengths and the cap", () => {
    for (const length of [-1, 0, 1, 12, 64, 220, 1000, NaN, Infinity]) {
      const safe = Number.isFinite(length) ? Math.max(0, length) : 0;
      expect(sharkScaleForLength(length)).toBe(Math.min(2.5, 0.32 + Math.sqrt(safe) * 0.2));
    }
  });
  it("places mouth and body endpoints along yaw and pitch without mutating the pose", () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      for (const pitch of [-0.7, 0, 0.7]) {
        const shark = { position: { x: 4, y: 2, z: -3 }, yaw, pitch, length: 64 };
        const before = structuredClone(shark);
        const scale = sharkScaleForLength(shark.length);
        const segment = bodySegment(shark);
        for (const [point, offset] of [[mouthPoint(shark), 1.9], [segment.start, 2.56], [segment.end, -2.45]] as const) {
          expect(point.x).toBeCloseTo(4 + Math.cos(yaw) * Math.cos(pitch) * offset * scale);
          expect(point.y).toBeCloseTo(2 + Math.sin(pitch) * offset * scale);
          expect(point.z).toBeCloseTo(-3 + Math.sin(yaw) * Math.cos(pitch) * offset * scale);
        }
        expect(shark).toEqual(before);
      }
    }
  });
});


describe("ST-290 tapered body and blade geometry", () => {
  it("keeps one continuous, outward-lit body with tapered ends at shared landmarks", () => {
    let previousVertices = 0;
    for (const quality of ["low", "medium", "high"] as const) {
      const detail = resolveSharkPresentationQuality(quality);
      const body = createSharkBodyGeometry(detail);
      body.computeBoundingBox();
      expect(body.boundingBox!.min.x).toBeCloseTo(-2.45);
      expect(body.boundingBox!.max.x).toBeCloseTo(2.56);
      const position = body.getAttribute("position");
      const normal = body.getAttribute("normal");
      expect(position.count).toBeGreaterThan(previousVertices);
      previousVertices = position.count;
      expect(body.groups).toHaveLength(0);
      for (let ring = 0; ring <= detail.lengthSegments; ring++) {
        const radii = Array.from({ length: detail.radialSegments + 1 }, (_, segment) => {
          const i = segment * (detail.lengthSegments + 1) + ring;
          const y = position.getY(i), z = position.getZ(i);
          expect(Number.isFinite(normal.getX(i) + normal.getY(i) + normal.getZ(i))).toBe(true);
          expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1);
          // Side normals face away from the axis, keeping the opaque surface visible.
          expect(y * normal.getY(i) + z * normal.getZ(i)).toBeGreaterThanOrEqual(-0.00001);
          return Math.hypot(y / 0.9, z);
        });
        expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.00001);
        if (ring === 0 || ring === detail.lengthSegments) expect(Math.max(...radii)).toBeLessThan(0.00001);
      }
      // Broad shoulder, narrow tail and snout; no overlapping head/body seams.
      const radii = Array.from({ length: detail.lengthSegments + 1 }, (_, i) => Math.abs(position.getZ(i)));
      expect(Math.max(...radii)).toBeGreaterThan(0.64);
      expect(radii[1]).toBeLessThan(0.25);
      expect(radii.at(-2)).toBeLessThan(0.3);
      expect(Array.from(body.index!.array).every(i => i < position.count)).toBe(true);
      body.dispose();
    }
  });

  it("uses thin, closed fin blades with finite normals and one material draw", () => {
    for (const tail of [false, true]) {
      let previousVertices = 0;
      for (const quality of ["low", "medium", "high"] as const) {
        const fin = createSharkFinGeometry(tail, resolveSharkPresentationQuality(quality).finSegments);
        fin.computeBoundingBox();
        const bounds = fin.boundingBox!;
        expect(bounds.max.z - bounds.min.z).toBeCloseTo(0.06);
        expect(bounds.max.x - bounds.min.x).toBeGreaterThan(1);
        expect(bounds.max.y - bounds.min.y).toBeGreaterThan(1);
        expect(fin.groups).toHaveLength(0);
        expect(fin.getAttribute("position").count).toBeGreaterThan(previousVertices);
        previousVertices = fin.getAttribute("position").count;
        expect(Array.from(fin.getAttribute("normal").array).every(Number.isFinite)).toBe(true);
        const normals = fin.getAttribute("normal");
        expect(Array.from({ length: normals.count }, (_, i) => normals.getZ(i))).toContain(1);
        expect(Array.from({ length: normals.count }, (_, i) => normals.getZ(i))).toContain(-1);
        fin.dispose();
      }
    }
  });
});
