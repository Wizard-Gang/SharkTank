import * as THREE from "three";

export const SHARK_JAW = { durationMs: 150, angle: 0.48, hinge: 1.3, blendEnd: 1.6 } as const;

export function sharkJawAngle(nowMs: number, startedAt: number, reducedMotion: boolean): number {
  const age = nowMs - startedAt;
  if (!Number.isFinite(age) || age < 0 || age >= SHARK_JAW.durationMs) return 0;
  if (reducedMotion) return SHARK_JAW.angle;
  // Open immediately, hold briefly, then close smoothly within the same window.
  const closing = Math.max(0, (age - 45) / 105);
  return SHARK_JAW.angle * (1 - closing * closing * (3 - 2 * closing));
}

/** One baseline per living actor. Duplicate/held snapshots never replay a bite. */
export class SharkJawCue {
  private cooldown: number | null = null;
  private startedAt = -Infinity;

  sample(cooldown: number, nowMs: number, reducedMotion: boolean, localPressedAt?: number): number {
    if (this.cooldown !== null && cooldown < this.cooldown) this.startedAt = -Infinity;
    if (localPressedAt === undefined && this.cooldown !== null && cooldown > this.cooldown) {
      this.startedAt = nowMs;
    }
    this.cooldown = cooldown;
    return sharkJawAngle(nowMs, localPressedAt ?? this.startedAt, reducedMotion);
  }
}

type Vertex = { position: THREE.Vector3; normal: THREE.Vector3; color: THREE.Vector3 };

/** Split the existing lit surface at its centre plane. Both mouth interiors and
 * the lower snout stay in the body batch, retaining the tapered closed silhouette.
 */
export function splitSharkJawGeometry(body: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = body.getAttribute("position");
  const normal = body.getAttribute("normal");
  const color = body.getAttribute("color");
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], jaws: number[] = [];
  const vertex = (i: number): Vertex => {
    const p = new THREE.Vector3().fromBufferAttribute(position, i);
    if (Math.abs(p.y) < 1e-6) p.y = 0;
    return { position: p, normal: new THREE.Vector3().fromBufferAttribute(normal, i),
      color: new THREE.Vector3().fromBufferAttribute(color, i) };
  };
  const emit = (vertices: Vertex[], jaw: number) => {
    for (let i = 1; i + 1 < vertices.length; i++) {
      const triangle = [vertices[0], vertices[i], vertices[i + 1]];
      const edge = triangle[1].position.clone().sub(triangle[0].position);
      if (edge.cross(triangle[2].position.clone().sub(triangle[0].position)).lengthSq() < 1e-16) continue;
      for (const v of triangle) {
        positions.push(...v.position.toArray());
        normals.push(...v.normal.clone().normalize().toArray());
        colors.push(...v.color.toArray());
        jaws.push(jaw);
      }
    }
  };
  const clip = (triangle: Vertex[], sign: number): Vertex[] => {
    const polygon: Vertex[] = [];
    for (let i = 0; i < triangle.length; i++) {
      const a = triangle[i], b = triangle[(i + 1) % triangle.length];
      if (sign * a.position.y >= 0) polygon.push(a);
      if (a.position.y * b.position.y < 0) {
        const t = a.position.y / (a.position.y - b.position.y);
        polygon.push({ position: a.position.clone().lerp(b.position, t),
          normal: a.normal.clone().lerp(b.normal, t), color: a.color.clone().lerp(b.color, t) });
      }
    }
    return polygon;
  };
  const index = body.getIndex()!;
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [0, 1, 2].map(offset => vertex(index.getX(i + offset)));
    emit(clip(triangle, 1), 0);
    emit(clip(triangle, -1), 1);
  }
  // Cross-sections of the same lathe profile give flush, opaque mouth interiors.
  const sections = new Map<number, number>();
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getY(i)) < 1e-6) {
      const x = position.getX(i);
      sections.set(x, Math.max(sections.get(x) ?? 0, Math.abs(position.getZ(i))));
    }
  }
  const rings = [...sections].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i + 1 < rings.length; i++) {
    let [x0, r0] = rings[i];
    const [x1, r1] = rings[i + 1];
    if (x1 <= SHARK_JAW.hinge) continue;
    if (x0 < SHARK_JAW.hinge) {
      r0 = THREE.MathUtils.lerp(r0, r1, (SHARK_JAW.hinge - x0) / (x1 - x0));
      x0 = SHARK_JAW.hinge;
    }
    for (const jaw of [0, 1]) {
      const points = [[x0, -r0], [x1, -r1], [x1, r1], [x0, r0]];
      if (jaw) points.reverse();
      emit(points.map(([x, z]) => ({ position: new THREE.Vector3(x, 0, z),
        normal: new THREE.Vector3(0, jaw ? 1 : -1, 0), color: new THREE.Vector3(0.18, 0.18, 0.18) })), jaw);
    }
  }
  const result = new THREE.BufferGeometry();
  for (const [name, values, size] of [["position", positions, 3], ["normal", normals, 3],
    ["color", colors, 3], ["sharkJawPart", jaws, 1]] as const) {
    result.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
  }
  body.dispose();
  return result;
}

export function applySharkJawShader(shader: Pick<THREE.WebGLProgramParametersWithUniforms, "vertexShader">): void {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>
      attribute float sharkJawPart;
      attribute float sharkJawAngle;
      mat2 sharkJawRotation() {
        float angle = -sharkJawAngle * sharkJawPart * smoothstep(${SHARK_JAW.hinge}, ${SHARK_JAW.blendEnd}, position.x);
        return mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
      }`)
    .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
      objectNormal.xy = sharkJawRotation() * objectNormal.xy;`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>
      transformed.xy = sharkJawRotation() * (transformed.xy - vec2(${SHARK_JAW.hinge}, 0.0)) + vec2(${SHARK_JAW.hinge}, 0.0);`);
}
