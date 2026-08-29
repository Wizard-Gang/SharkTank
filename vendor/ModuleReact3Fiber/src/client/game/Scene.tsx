// The 3D world. Driven imperatively from the socket's NetState each frame — no
// per-frame React state — so it stays smooth at 60fps while the server ticks at 20Hz.
// Snakes read as creatures: a tapered body (pointy tail), a rounded head with eyes +
// pupils, and flat, vivid, high-contrast colors. Positions are interpolated between
// the previous and latest server snapshots.

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { SKINS } from "../../engine/index.js";
import type { NetSnake } from "../../protocol/index.js";
import type { RoomSocket } from "../net/useRoomSocket.js";
import type { Settings } from "../settings/SettingsContext.js";
import { LocalPredictor } from "./prediction.js";
import type { LocalInput } from "./useLocalInput.js";

const MAX_SEGMENTS = 6000;
const MAX_FOOD = 1200;
const MAX_EYES = 96; // 2 per snake, ~48 snakes
// Render slightly behind the newest snapshot so there are always two buffered snapshots
// to blend across (smooth 60fps despite packet jitter). At 30Hz this is ~2.7 ticks of
// buffer — small enough to feel responsive, large enough to stay smooth. The LOCAL snake
// is client-predicted (zero delay), so this only delays other snakes/food.
const INTERP_DELAY_MS = 45; // ~1.8 ticks at 40Hz — near-live so intersections read true
const TAIL_FADE = 6; // last N body discs taper smoothly to the tip

const WHITE = new THREE.Color("#ffffff");
// Two vivid band colors per skin: base hue + a lighter tint for subtle scales. Both
// stay bright for contrast against the dark arena (WCAG 1.4.11). Never mutated at render.
const skinBody = new Map(SKINS.map((s) => [s.id, new THREE.Color(s.color)]));
const skinBand = new Map(SKINS.map((s) => [s.id, new THREE.Color(s.color).lerp(WHITE, 0.28)]));
const FALLBACK = new THREE.Color("#33b679");
const EYE_WHITE = new THREE.Color("#ffffff");
const PUPIL = new THREE.Color("#0b0a14");
const FOOD_COLOR = new THREE.Color("#ffe14d");

/** Projected on-screen label for a snake head (colorblind name cue). */
export interface SnakeLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  me: boolean;
}

/** Linear interpolation of a snake segment between two snapshots (matched by index). */
function lerpSeg(prev: NetSnake | undefined, cur: NetSnake, i: number, a: number, out: THREE.Vector3): void {
  const c = cur.segments[i];
  const p = prev?.segments[i] ?? c;
  out.set(p.x + (c.x - p.x) * a, 0.5, p.z + (c.z - p.z) * a);
}

export function Scene({
  socket,
  settings,
  labelsRef,
  inputRef,
}: {
  socket: RoomSocket;
  settings: Settings;
  labelsRef?: React.MutableRefObject<SnakeLabel[]>;
  inputRef?: React.MutableRefObject<LocalInput>;
}) {
  const { camera, size } = useThree();
  const segMesh = useRef<THREE.InstancedMesh>(null);
  const foodMesh = useRef<THREE.InstancedMesh>(null);
  const eyeMesh = useRef<THREE.InstancedMesh>(null);
  const pupilMesh = useRef<THREE.InstancedMesh>(null);
  const boundaryRef = useRef<THREE.Mesh>(null);
  const predictor = useMemo(() => new LocalPredictor(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const p0 = useMemo(() => new THREE.Vector3(), []);
  const proj = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const seg = segMesh.current;
    const food = foodMesh.current;
    const eyes = eyeMesh.current;
    const pupils = pupilMesh.current;
    if (!seg || !food || !eyes || !pupils) return;

    // Sample the snapshot buffer at (now − 1/6s): `older`→`newer` blended by `a`.
    const frame = socket.frameAt(INTERP_DELAY_MS);
    if (!frame) return;
    const state = frame.newer; // entity set + food come from the newer of the pair
    const prev = frame.older;
    const a = frame.alpha;

    const prevById = new Map<string, NetSnake>(prev.snakes.map((s) => [s.id, s]));
    if (boundaryRef.current) boundaryRef.current.scale.setScalar(state.arenaRadius);

    // ── Client-side prediction for the LOCAL snake (rendered at zero delay) ──
    const auth = socket.stateRef.current?.snakes.find((s) => s.id === socket.youId) ?? null;
    const staleness = (performance.now() - socket.newestAtRef.current) / 1000;
    const predicted = inputRef ? predictor.step(auth, inputRef.current, dt, staleness) : null;

    const labels: SnakeLabel[] = [];
    const wantLabels = settings.a11y.colorblindLabels && labelsRef;

    // ── Snake bodies (tapered) + eyes/pupils on heads ──
    let n = 0;
    let e = 0;
    for (const s of state.snakes) {
      const isMe = s.id === socket.youId;
      // The local snake is drawn from the predictor (responsive); others are interpolated.
      const usePred = isMe && predicted != null;
      if (!usePred && (!s.alive || s.segments.length === 0)) continue;
      if (isMe && !usePred && !s.alive) continue;
      const p = prevById.get(s.id);
      const body = skinBody.get(s.skin) ?? FALLBACK;
      const band = skinBand.get(s.skin) ?? FALLBACK;
      const count = usePred ? predicted!.segments.length : s.segments.length;

      // Resolve a segment's render position into p0 (predicted or interpolated).
      const posAt = (i: number) => {
        if (usePred) {
          const q = predicted!.segments[i];
          p0.set(q.x, 0.5, q.z);
        } else {
          lerpSeg(p, s, i, a, p0);
        }
      };
      const heading = usePred ? predicted!.heading : s.heading;

      for (let i = 0; i < count && n < MAX_SEGMENTS; i += 1) {
        posAt(i);
        // Count-independent scale: slightly bigger head, uniform body, and only the last
        // TAIL_FADE discs taper smoothly to the tip — so body size doesn't pulse as the
        // snake grows and the tail fades cleanly (no janky pop).
        const fromTail = count - 1 - i;
        let r = i === 0 ? 0.9 : 0.72;
        if (fromTail < TAIL_FADE) r *= 0.18 + 0.82 * (fromTail / TAIL_FADE);
        dummy.position.copy(p0);
        dummy.scale.setScalar(r);
        dummy.updateMatrix();
        seg.setMatrixAt(n, dummy.matrix);
        // Subtle 2-on/2-off banding for a scaled look without high contrast noise.
        const c = i === 0 ? (isMe ? body.clone().lerp(WHITE, 0.22) : body) : i % 4 < 2 ? body : band;
        seg.setColorAt(n, c);
        n += 1;
      }

      // Eyes + pupils sit on the head, offset by heading.
      if (e < MAX_EYES - 1) {
        posAt(0);
        const fx = Math.cos(heading);
        const fz = Math.sin(heading);
        const px = -fz;
        const pz = fx; // perpendicular
        for (const sign of [-1, 1] as const) {
          // Eyes sit on top-front of the head so they read as a face from above,
          // clearly marking the leading end (fixes the "which way is it facing" look).
          const ex = p0.x + fx * 0.34 + px * sign * 0.34;
          const ez = p0.z + fz * 0.34 + pz * sign * 0.34;
          dummy.position.set(ex, 1.15, ez);
          dummy.scale.setScalar(0.4);
          dummy.updateMatrix();
          eyes.setMatrixAt(e, dummy.matrix);
          eyes.setColorAt(e, EYE_WHITE);
          // Pupil forward-facing (toward travel direction) + smaller.
          dummy.position.set(ex + fx * 0.16, 1.24, ez + fz * 0.16);
          dummy.scale.setScalar(0.2);
          dummy.updateMatrix();
          pupils.setMatrixAt(e, dummy.matrix);
          pupils.setColorAt(e, PUPIL);
          e += 1;
        }
      }

      // Colorblind name label: project the head to screen space.
      if (wantLabels) {
        posAt(0);
        proj.copy(p0);
        proj.y = 2;
        proj.project(camera);
        if (proj.z < 1) {
          labels.push({
            id: s.id,
            name: isMe ? `${s.name} (you)` : s.name,
            x: (proj.x * 0.5 + 0.5) * size.width,
            y: (-proj.y * 0.5 + 0.5) * size.height,
            color: `#${(skinBody.get(s.skin) ?? FALLBACK).getHexString()}`,
            me: isMe,
          });
        }
      }
    }
    seg.count = n;
    seg.instanceMatrix.needsUpdate = true;
    if (seg.instanceColor) seg.instanceColor.needsUpdate = true;
    eyes.count = e;
    eyes.instanceMatrix.needsUpdate = true;
    if (eyes.instanceColor) eyes.instanceColor.needsUpdate = true;
    pupils.count = e;
    pupils.instanceMatrix.needsUpdate = true;
    if (pupils.instanceColor) pupils.instanceColor.needsUpdate = true;

    if (wantLabels && labelsRef) labelsRef.current = labels;
    else if (labelsRef && labelsRef.current.length) labelsRef.current = [];

    // ── Food ──
    let m = 0;
    for (const f of state.food) {
      if (m >= MAX_FOOD) break;
      dummy.position.set(f.x, 0.4, f.z);
      dummy.scale.setScalar(f.r * 0.85);
      dummy.updateMatrix();
      food.setMatrixAt(m, dummy.matrix);
      food.setColorAt(m, FOOD_COLOR);
      m += 1;
    }
    food.count = m;
    food.instanceMatrix.needsUpdate = true;
    if (food.instanceColor) food.instanceColor.needsUpdate = true;

    // ── Camera: top-down follow of the local head (predicted → responsive) ──
    const meInterp = state.snakes.find((s) => s.id === socket.youId && s.alive);
    if (predicted) {
      p0.set(predicted.head.x, 0.5, predicted.head.z);
    } else if (meInterp && meInterp.segments[0]) {
      lerpSeg(prevById.get(meInterp.id), meInterp, 0, a, p0);
    }
    if (predicted || (meInterp && meInterp.segments[0])) {
      camTarget.set(p0.x, 26, p0.z + 12);
      camera.position.lerp(camTarget, settings.a11y.motion === "reduced" ? 1 : 0.12);
      camera.lookAt(p0.x, 0, p0.z);
    } else {
      camTarget.set(0, 42, 18);
      camera.position.lerp(camTarget, 0.05);
      camera.lookAt(0, 0, 0);
    }
  });

  const quality = settings.graphics.quality;
  // Small on-screen spheres don't need high tessellation; keeping this low lets 24 long
  // snakes render at 60fps (thousands of instances), which is what keeps handling smooth.
  const detail = quality === "low" ? 6 : quality === "medium" ? 8 : 12;

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[10, 20, 6]} intensity={0.6} />

      {/* Ground disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[400, 64]} />
        <meshBasicMaterial color="#0c0b18" />
      </mesh>

      {settings.graphics.showGrid && <gridHelper args={[400, 80, "#312c58", "#1c1836"]} position={[0, 0, 0]} />}

      {/* Arena boundary ring (scaled to arenaRadius each frame) */}
      <mesh ref={boundaryRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.98, 1.0, 128]} />
        <meshBasicMaterial color="#ff5a5a" side={THREE.DoubleSide} />
      </mesh>

      {/* Flat, vivid, unlit materials for a clean high-contrast look. */}
      <instancedMesh ref={segMesh} args={[undefined, undefined, MAX_SEGMENTS]} frustumCulled={false}>
        <sphereGeometry args={[1, detail, detail]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <instancedMesh ref={eyeMesh} args={[undefined, undefined, MAX_EYES]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={pupilMesh} args={[undefined, undefined, MAX_EYES]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <instancedMesh ref={foodMesh} args={[undefined, undefined, MAX_FOOD]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  );
}
