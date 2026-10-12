// Share bounded projected cues with DOM without React updates on animation frames.
import { schoolCue, type SchoolCue } from "../ui/firstRunCoaching.js";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Matrix4 } from "three";
import type { RoomSocket } from "../net/useRoomSocket.js";
import { buildEdgeCues, edgeTargets, type EdgeCue } from "../ui/edgeNavigation.js";

export function EdgeNavigation({ socket, cuesRef, schoolCueRef }: {
  socket: RoomSocket;
  cuesRef?: React.MutableRefObject<EdgeCue[]>;
  schoolCueRef?: React.MutableRefObject<SchoolCue | null>;
}) {
  const matrix = useMemo(() => new Matrix4(), []);
  const lastAt = useRef(-Infinity);
  useFrame(({ camera, size, clock }) => {
    if ((!cuesRef && !schoolCueRef) || clock.elapsedTime - lastAt.current < 0.1) return;
    lastAt.current = clock.elapsedTime;
    camera.updateMatrixWorld();
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (schoolCueRef) schoolCueRef.current = socket.status === "open"
      ? schoolCue(socket.stateRef.current, socket.youId, matrix.elements, size) : null;
    if (cuesRef) cuesRef.current = socket.status === "open"
      ? buildEdgeCues(edgeTargets(socket.stateRef.current, socket.youId), matrix.elements, size)
      : [];
  });
  return null;
}
