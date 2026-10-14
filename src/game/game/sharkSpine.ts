import type * as THREE from "three";
import { SHARK_GEOMETRY } from "../../engine/sharkGeometry.js";

// The head/eyes/mouth stay steady. A quadratic envelope grows smoothly aft,
// continuing through the tail blade without a clamped derivative at its root.
export const SHARK_SPINE = { anchor: 0.9, length: 0.9 - SHARK_GEOMETRY.tail, waveNumber: 4.2 } as const;

const SPINE_GLSL = `
attribute vec2 sharkSpine;
vec2 sharkSpineWave(float x) {
  if (sharkSpine.y == 0.0) return vec2(0.0);
  float aft = max(0.0, (${SHARK_SPINE.anchor.toFixed(2)} - x) / ${SHARK_SPINE.length.toFixed(2)});
  float angle = sharkSpine.x - aft * ${SHARK_SPINE.waveNumber.toFixed(2)};
  float offset = sharkSpine.y * aft * aft * sin(angle);
  float slope = -sharkSpine.y / ${SHARK_SPINE.length.toFixed(2)}
    * (2.0 * aft * sin(angle) - ${SHARK_SPINE.waveNumber.toFixed(2)} * aft * aft * cos(angle));
  return vec2(offset, slope);
}
`;

/** Deform positions and inverse-transpose normals before instance transforms.
 * Vertex/instance colours remain in rest space; no extra material pass is added.
 */
export function applySharkSpineShader(shader: Pick<THREE.WebGLProgramParametersWithUniforms, "vertexShader">): void {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${SPINE_GLSL}`)
    .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
      objectNormal.x -= sharkSpineWave(position.x).y * objectNormal.z;`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>
      transformed.z += sharkSpineWave(position.x).x;`);
}
