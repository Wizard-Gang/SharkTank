import { describe, expect, it } from "vitest";
import { createRoom, nextRandom, seedToNumber } from "../vendor/ModuleReact3Fiber/src/engine/index.js";

describe("deterministic engine", () => {
  it("reproduces the cross-runtime seed and random sequence", () => {
    const seed = seedToNumber("seed-fixed");
    expect(seed).toBe(3325626751);
    const [, next] = nextRandom(seed);
    expect(next).toBe(862225268);
  });

  it("creates byte-equivalent rooms from the same seed", () => {
    const left = createRoom({ id: "test", seed: "repeatable" });
    const right = createRoom({ id: "test", seed: "repeatable" });
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
  });
});
