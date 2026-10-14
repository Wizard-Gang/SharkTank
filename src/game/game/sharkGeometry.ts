import * as THREE from "three";
import { SHARK_GEOMETRY } from "../../engine/sharkGeometry.js";
import type { SharkPresentationProfile } from "./sharkPresentation.js";

/** Bake the original part placement into shark rest space so every surface
 * samples the same spine, before the shared instance heading/scale is applied.
 */
export function sharkSurfaceRestMatrix(surface: "body" | "tail" | "dorsal" | "pectoralLeft" | "pectoralRight"): THREE.Matrix4 {
  const part = new THREE.Object3D();
  if (surface === "tail") {
    part.position.set(SHARK_GEOMETRY.tail, 0, 0);
    part.scale.set(0.5, 0.98, 1);
  } else if (surface === "dorsal") {
    part.position.set(-0.18, 0.78, 0);
    part.scale.set(0.65, 0.92, 1);
  } else if (surface === "pectoralLeft" || surface === "pectoralRight") {
    const sign = surface === "pectoralLeft" ? 1 : -1;
    part.position.set(0.38, -0.2, sign * 0.72);
    part.rotation.set(sign * (Math.PI / 2 - 0.14), 0, -sign * 0.22);
    part.scale.set(0.7, 1.5, 1);
  }
  part.updateMatrix();
  return part.matrix;
}

// Tail -> shoulder -> pointed snout. A single smooth surface includes the
// peduncle and head; these are presentation coordinates, not collision volumes.
const PROFILE = new THREE.CatmullRomCurve3([
  [SHARK_GEOMETRY.tail, 0], [-2.25, 0.14], [-1.7, 0.24], [-0.9, 0.48],
  [0, 0.66], [0.9, 0.65], [1.6, 0.53], [2.15, 0.35],
  [2.45, 0.16], [SHARK_GEOMETRY.snoutTip, 0],
].map(([x, radius]) => new THREE.Vector3(x, radius, 0)));

export function createSharkBodyGeometry(quality: SharkPresentationProfile): THREE.BufferGeometry {
  const points = PROFILE.getPoints(quality.lengthSegments)
    .map(point => new THREE.Vector2(Math.max(0, point.y), point.x));
  const geometry = new THREE.LatheGeometry(points, quality.radialSegments);
  geometry.rotateZ(-Math.PI / 2);
  geometry.scale(1, 0.9, 1);
  return geometry;
}

/** Closed, thin blades retain visible front/back faces with an opaque material. */
export function createSharkFinGeometry(tail: boolean, curveSegments: number): THREE.BufferGeometry {
  const blade = new THREE.Shape();
  blade.moveTo(0.9, -0.5);
  if (tail) {
    blade.lineTo(-0.8, -0.95);
    blade.quadraticCurveTo(-0.35, -0.25, -0.1, 0);
    blade.quadraticCurveTo(-0.45, 0.4, -0.9, 1);
    blade.quadraticCurveTo(0.5, 0.55, 0.9, -0.5);
  } else {
    blade.lineTo(-0.9, -0.5);
    blade.quadraticCurveTo(-0.45, -0.1, -0.65, 0.65);
    blade.quadraticCurveTo(0.2, 0.4, 0.9, -0.5);
  }
  const geometry = new THREE.ExtrudeGeometry(blade, {
    depth: 0.06, steps: 1, bevelEnabled: false, curveSegments,
  });
  geometry.translate(0, 0, -0.03);
  // One material / draw, including both faces and the narrow edge.
  geometry.clearGroups();
  return geometry;
}
