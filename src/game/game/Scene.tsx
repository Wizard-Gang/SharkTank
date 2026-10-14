// Browser-only React Three Fiber composition for the production full-3D game world.
// It presents authoritative volumetric state without moving gameplay authority into Three.js.

import type { SchoolCue } from "../ui/firstRunCoaching.js";
import { EdgeNavigation } from "./EdgeNavigation.js";
import type { EdgeCue } from "../ui/edgeNavigation.js";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { REMOTE_INTERP_DELAY_MS } from "../net/snapshotTimeline.js";
import { ImpactFeedback } from "./impactFeedback.js";
import type { RoomSocket } from "../net/useRoomSocket.js";
import type { Settings } from "../settings/SettingsContext.js";
import { ActorLayer, type SharkLabel } from "./ActorLayer.js";
import { CameraRig, makeCameraFollowTarget } from "./CameraRig.js";
import { FxLayer } from "./FxLayer.js";
import { PreyLayer } from "./PreyLayer.js";
import { WorldEnvironment } from "./WorldEnvironment.js";
import type { LocalInput } from "./useLocalInput.js";

export type { SharkLabel } from "./ActorLayer.js";

export function Scene({
  socket,
  settings,
  labelsRef,
  cuesRef,
  schoolCueRef,
  inputRef,
  vignetteRef,
}: {
  socket: RoomSocket;
  settings: Settings;
  labelsRef?: React.MutableRefObject<SharkLabel[]>;
  cuesRef?: React.MutableRefObject<EdgeCue[]>;
  inputRef?: React.MutableRefObject<LocalInput>;
  schoolCueRef?: React.MutableRefObject<SchoolCue | null>;
  vignetteRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const followRef = useRef(makeCameraFollowTarget());
  const impacts = useMemo(() => new ImpactFeedback(), []);
  // Sample once before actors and camera consume the same presentation feedback.
  useFrame(() => {
    const now = performance.now();
    const state = socket.status === "open" && document.visibilityState !== "hidden"
      ? socket.frameAt(REMOTE_INTERP_DELAY_MS)?.newer ?? null : null;
    impacts.sample(state, socket.youId, now, settings.graphics.cameraShake, settings.a11y.motion === "reduced");
    if (vignetteRef?.current) vignetteRef.current.style.opacity = String(impacts.vignette(now));
  }, -2);

  return (
    <>
      <WorldEnvironment socket={socket} settings={settings} />
      <ActorLayer
        socket={socket}
        settings={settings}
        labelsRef={labelsRef}
        inputRef={inputRef}
        followRef={followRef}
        impacts={impacts}
      />
      <PreyLayer socket={socket} settings={settings} />
      <FxLayer socket={socket} settings={settings} followRef={followRef} />
      <CameraRig followRef={followRef} reducedMotion={settings.a11y.motion === "reduced"} cameraMotion={settings.graphics.cameraShake} impacts={impacts} inputRef={inputRef} />
      <EdgeNavigation socket={socket} cuesRef={cuesRef} schoolCueRef={schoolCueRef} />
    </>
  );
}
