// R3F canvas host: mounts the Scene and wires local input to the socket. The <canvas>
// itself is not screen-reader-operable (it's a real-time 3D game), so it's labeled as
// an image and all actionable status is mirrored to live regions + the HUD elsewhere.

import { Canvas } from "@react-three/fiber";
import { useRef } from "react";
import { Scene, type SnakeLabel } from "./Scene.js";
import { useLocalInput, type LocalInput } from "./useLocalInput.js";
import type { RoomSocket } from "../net/useRoomSocket.js";
import type { Settings } from "../settings/SettingsContext.js";

export interface GameCanvasProps {
  socket: RoomSocket;
  settings: Settings;
  /** Input is disabled while a modal (pause/settings) is open. */
  inputEnabled: boolean;
  /** Scene writes projected head positions here for the colorblind name-label layer. */
  labelsRef?: React.MutableRefObject<SnakeLabel[]>;
}

export function GameCanvas({ socket, settings, inputEnabled, labelsRef }: GameCanvasProps) {
  // Shared live-input ref: written by the input hook, read by client-side prediction.
  const inputRef = useRef<LocalInput>({ targetHeading: 0, boosting: false });
  useLocalInput(socket, settings, inputEnabled, inputRef);

  const dpr = settings.graphics.quality === "low" ? 1 : settings.graphics.quality === "medium" ? 1.5 : [1, 2];

  return (
    <div
      role="img"
      aria-label="Snake arena. Steer with the pointer or the arrow keys; live scores are announced and shown in the heads-up display."
      style={{ position: "absolute", inset: 0 }}
    >
      <Canvas
        shadows={false}
        dpr={dpr as number | [number, number]}
        camera={{ position: [0, 26, 12], fov: 55, near: 0.1, far: 500 }}
        style={{ background: "#0b0a14", touchAction: "none" }}
      >
        <Scene socket={socket} settings={settings} labelsRef={labelsRef} inputRef={inputRef} />
      </Canvas>
    </div>
  );
}
