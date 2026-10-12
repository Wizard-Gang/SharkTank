// Share bounded projected cues with DOM without React updates on animation frames.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Matrix4 } from "three";
import type { RoomSocket } from "../net/useRoomSocket.js";
import { buildEdgeCues, edgeTargets, type EdgeCue } from "../ui/edgeNavigation.js";

export function EdgeNavigation({ socket, cuesRef }: {
  socket: RoomSocket;
  cuesRef?: React.MutableRefObject<EdgeCue[]>;
}) {
  const matrix = useMemo(() => new Matrix4(), []);
  const lastAt = useRef(-Infinity);
  useFrame(({ camera, size, clock }) => {
    if (!cuesRef || clock.elapsedTime - lastAt.current < 0.1) return;
    lastAt.current = clock.elapsedTime;
    camera.updateMatrixWorld();
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    cuesRef.current = socket.status === "open"
      ? buildEdgeCues(edgeTargets(socket.stateRef.current, socket.youId), matrix.elements, size)
      : [];
  });
  return null;
}
