import * as THREE from "three";

export const CURRENT_WARNING_DISTANCE = 20;

/** Presentation only: the Room still owns the returning current and wall clamp. */
export function currentCurtainProximity(radius: number, position?: { x: number; z: number }): number {
  if (!position || !Number.isFinite(radius) || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return 0;
  return THREE.MathUtils.clamp(1 - (radius - Math.hypot(position.x, position.z)) / CURRENT_WARNING_DISTANCE, 0, 1);
}

/** One fogged, uncapped cylinder; flow adds no particles, textures or extra draws. */
export function createCurrentCurtain() {
  const uniforms = {
    currentTime: { value: 0 },
    currentProximity: { value: 0 },
    currentLines: { value: 32 },
    currentHighContrast: { value: 0 },
  };
  const material = new THREE.MeshBasicMaterial({
    color: "#45e7e0", transparent: true, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
varying vec2 vCurrentUv;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vCurrentUv = uv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec2 vCurrentUv;
uniform float currentTime;
uniform float currentProximity;
uniform float currentLines;
uniform float currentHighContrast;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
float depthShare = clamp(vCurrentUv.y, 0.0, 1.0);
// Integer lane counts and four turns of phase keep the cylinder seam continuous.
float lane = pow(0.5 + 0.5 * cos(6.2831853 * (vCurrentUv.x * currentLines + 0.08 * sin(depthShare * 6.2831853))), 24.0);
// Three long dashes drift upward at 0.025 cylinder heights per second.
float flow = pow(0.5 + 0.5 * cos(6.2831853 * (depthShare * 3.0 - currentTime * 0.075 + vCurrentUv.x * 4.0)), 6.0);
float line = lane * mix(0.18, 1.0, flow);
vec3 verticalTint = mix(vec3(0.35, 0.65, 0.75), vec3(0.85, 1.0, 1.0), depthShare);
diffuseColor.rgb *= verticalTint * (1.0 + currentProximity * 0.55 + line * 0.4);
diffuseColor.a = mix(0.07, 0.14, depthShare) + currentHighContrast * 0.05 + line * 0.12 + currentProximity * (0.12 + line * 0.08);`);
  };
  material.customProgramCacheKey = () => "sharktank-current-curtain-v1";
  return { material, uniforms };
}
