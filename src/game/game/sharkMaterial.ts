import * as THREE from "three";

// Rest-pose height in shark space, before heading, pitch or bank. The pectoral
// coefficients include their existing X/Z rotations, so their undersides stay light.
const cx = Math.cos(Math.PI / 2 - 0.14);
const sx = Math.sin(Math.PI / 2 - 0.14);
const cz = Math.cos(0.22);
const sz = Math.sin(0.22);
const HEIGHT = {
  body: [0, 0.58, 0, 0],
  head: [0, 0.59, 0, 0.03],
  snout: [0, 0.42, 0, -0.04],
  peduncle: [0, 0.25, 0, 0],
  tail: [0, 0.98, 0, 0],
  dorsal: [0, 0.92, 0, 0.78],
  pectoralLeft: [-cx * sz * 0.36, cx * cz * 0.9, -sx * 0.25, -0.2],
  pectoralRight: [cx * sz * 0.36, cx * cz * 0.9, sx * 0.25, -0.2],
} as const;

export type SharkSurface = keyof typeof HEIGHT;

/** Neutral linear-space vertex colours multiply the existing per-instance skin.
 * Runs only when geometry or contrast changes; topology and draw count stay fixed.
 */
export function countershadeSharkGeometry(
  geometry: THREE.BufferGeometry,
  surface: SharkSurface,
  highContrast: boolean,
): void {
  const position = geometry.getAttribute("position");
  const [x, y, z, offset] = HEIGHT[surface];
  const colors = new Float32Array(position.count * 3);
  const dorsal = highContrast ? 0.72 : 0.58;
  for (let index = 0; index < position.count; index += 1) {
    const height = position.getX(index) * x + position.getY(index) * y
      + position.getZ(index) * z + offset;
    const blend = THREE.MathUtils.smoothstep(height, -0.45, 0.45);
    const shade = THREE.MathUtils.lerp(1, dorsal, blend);
    colors.fill(shade, index * 3, index * 3 + 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

export const SHARK_MATERIAL = {
  vertexColors: true,
  roughness: 0.82,
  metalness: 0,
  toneMapped: false,
} as const;
