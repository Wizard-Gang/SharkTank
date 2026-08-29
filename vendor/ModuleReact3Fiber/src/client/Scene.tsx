import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { EngineHandle } from "./useEngine.js";
import type { Orb } from "../engine/types.js";

/**
 * The 3D world. Positions are driven imperatively from the engine snapshot each
 * frame (no per-frame React state), so it stays smooth. Orb add/remove syncs to
 * React state only when the set actually changes.
 */
export function Scene({ engine }: { engine: EngineHandle }) {
  const playerRef = useRef<THREE.Mesh>(null);
  const [orbs, setOrbs] = useState<Orb[]>(() => [...engine.stateRef.current.orbs]);
  const lastOrbKey = useRef<string>("");
  const { camera } = useThree();
  const arena = engine.stateRef.current.arena;

  useFrame((_, dt) => {
    engine.advance(Math.min(dt, 0.05));
    const s = engine.stateRef.current;
    const me = s.players[engine.playerId];

    if (me && playerRef.current) {
      playerRef.current.position.set(me.x, 0.5, me.z);
      // camera follows from behind/above
      camera.position.lerp(new THREE.Vector3(me.x, 9, me.z + 11), 0.08);
      camera.lookAt(me.x, 0, me.z);
    }

    const key = s.orbs.map((o) => o.id).join(",");
    if (key !== lastOrbKey.current) {
      lastOrbKey.current = key;
      setOrbs([...s.orbs]);
    }
  });

  const gridArgs = useMemo<[number, number]>(() => [Math.max(arena.width, arena.depth), Math.max(arena.width, arena.depth)], [arena.width, arena.depth]);
  const me = engine.stateRef.current.players[engine.playerId];

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.1} castShadow />
      <gridHelper args={[gridArgs[0], gridArgs[1], "#3a3560", "#26223d"]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[arena.width, arena.depth]} />
        <meshStandardMaterial color="#141225" />
      </mesh>

      {/* player */}
      <mesh ref={playerRef} castShadow position={[me?.x ?? 0, 0.5, me?.z ?? 0]}>
        <capsuleGeometry args={[0.35, 0.6, 8, 16]} />
        <meshStandardMaterial color={me?.color ?? "#7c5cff"} emissive={me?.color ?? "#7c5cff"} emissiveIntensity={0.35} />
      </mesh>

      {/* orbs */}
      {orbs.map((orb) => (
        <mesh key={orb.id} position={[orb.x, 0.4, orb.z]}>
          <icosahedronGeometry args={[0.28, 0]} />
          <meshStandardMaterial color="#ffd93d" emissive="#ffb703" emissiveIntensity={0.6} />
        </mesh>
      ))}
    </>
  );
}
