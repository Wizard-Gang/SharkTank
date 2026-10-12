import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoom, applyAction } from "../src/engine/index.js";
import { decodeState, toNetState, type NetState, type NetPrey } from "../src/protocol/index.js";
import { advanceHints, HINT_WINDOW_MS, HINTS, hintSuccess, mergeHintProgress, nearestSchoolFish, NEW_HINT_PROGRESS, normalizeHintProgress, schoolCue } from "../src/game/ui/firstRunCoaching.js";
import { FirstRunHints, hintText } from "../src/game/ui/FirstRunHints.js";
import { DEFAULT_KEYBINDS } from "../src/game/settings/SettingsContext.js";

function snapshot(): NetState {
  const room = createRoom({ seed: "first-run" });
  applyAction(room, { type: "join", playerId: "pilot", name: "Pilot" });
  applyAction(room, { type: "join", playerId: "small", name: "Small" });
  room.tick = 20;
  room.sharks.pilot.length = 30;
  room.sharks.small.length = 20;
  return decodeState(toNetState(room));
}
const fish = (id: string, x: number, kind: NetPrey["kind"] = "bait"): NetPrey => ({
  id, x, y: 0, z: 0, kind, yaw: 0, pitch: 0, value: 1, r: 0.42,
});
const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe("ST-288 one-time first-run state machine", () => {
  it("starts only on play, advances only the current success and survives serialized reloads", () => {
    let progress = { ...NEW_HINT_PROGRESS };
    expect(advanceHints(progress, { type: "success", step: 0, now: 1000 })).toEqual(progress);
    progress = advanceHints(progress, { type: "start", now: 1000 });
    expect(advanceHints(progress, { type: "start", now: 3000 })).toBe(progress);
    expect(advanceHints(progress, { type: "success", step: 2, now: 3000 })).toBe(progress);
    for (let step = 0; step < 3; step++) {
      progress = normalizeHintProgress(JSON.parse(JSON.stringify(progress)));
      expect(progress.step).toBe(step);
      progress = advanceHints(progress, { type: "success", step, now: 4000 + step * 1000 });
      expect(advanceHints(progress, { type: "success", step, now: 5000 + step * 1000 })).toBe(progress);
    }
    expect(progress.step).toBe(3);
    expect(advanceHints(progress, { type: "start", now: 999999 })).toBe(progress);
    expect(mergeHintProgress(progress, NEW_HINT_PROGRESS)).toEqual(progress);
  });

  it.each([0, 1, 2])("skips all remaining hints from step %i and cannot be rewound", (step) => {
    const progress = advanceHints({ step, startedAt: 1000 }, { type: "skip", now: 2000 });
    expect(progress.step).toBe(HINTS.length);
    expect(mergeHintProgress(progress, { step: 0, startedAt: 9000 })).toEqual(progress);
  });

  it("expires at exactly thirty seconds including reload, pause and disconnect time", () => {
    const progress = { step: 1, startedAt: 1000 };
    expect(advanceHints(progress, { type: "tick", now: 1000 + HINT_WINDOW_MS - 1 })).toBe(progress);
    const loaded = normalizeHintProgress(JSON.parse(JSON.stringify(progress)));
    const expired = advanceHints(loaded, { type: "tick", now: 1000 + HINT_WINDOW_MS });
    expect(expired.step).toBe(3);
    expect(advanceHints(expired, { type: "success", step: 0, now: 5000 })).toBe(expired);
    expect(advanceHints(progress, { type: "success", step: 1, now: 31000 }).step).toBe(3);
  });

  it("validates legacy/corrupt storage and merges stale callbacks without restarting the window", () => {
    for (const invalid of [undefined, null, "bad", {}, { step: -1, startedAt: 1 }, { step: 1.2, startedAt: 1 }, { step: 4, startedAt: 1 }, { step: 0, startedAt: Infinity }]) {
      expect(normalizeHintProgress(invalid)).toEqual(NEW_HINT_PROGRESS);
    }
    expect(normalizeHintProgress({ step: 3, startedAt: null })).toEqual({ step: 3, startedAt: null });
    expect(mergeHintProgress({ step: 2, startedAt: 1000 }, { step: 1, startedAt: 2000 })).toEqual({ step: 2, startedAt: 1000 });
    expect(advanceHints(NEW_HINT_PROGRESS, { type: "start", now: NaN })).toBe(NEW_HINT_PROGRESS);
  });
});

describe("ST-288 snapshot-derived success", () => {
  it("recognizes a real Room devour after protocol-12 encoding and decoding", () => {
    const room = createRoom({ seed: "coach-hit" });
    applyAction(room, { type: "join", playerId: "pilot", name: "Pilot" });
    applyAction(room, { type: "join", playerId: "small", name: "Small" });
    room.tick = 100;
    room.sharks.pilot.length = 30;
    room.sharks.small.length = 20;
    for (const shark of Object.values(room.sharks)) {
      shark.position = { x: shark.id === "pilot" ? 0 : 3, y: 0, z: 0 };
      shark.yaw = shark.targetYaw = shark.pitch = shark.targetPitch = 0;
      shark.invulnTick = shark.biteCooldownTick = 0;
    }
    const before = decodeState(toNetState(room));
    room.tick++;
    applyAction(room, { type: "bite", playerId: "pilot" });
    expect(room.sharks.small.alive).toBe(false);
    expect(hintSuccess(before, decodeState(toNetState(room)), "pilot")).toEqual({ ate: false, bit: true });
  });
  it("recognizes fish growth but never a join, repeated/late packet or reset as eating", () => {
    const before = snapshot();
    const after = structuredClone(before);
    after.tick++;
    after.sharks[0].length++;
    after.sharks[0].score++;
    expect(hintSuccess(before, after, "pilot")).toEqual({ ate: true, bit: false });
    expect(hintSuccess(null, after, "pilot").ate).toBe(false);
    expect(hintSuccess(before, { ...after, tick: before.tick }, "pilot").ate).toBe(false);
    expect(hintSuccess(after, before, "pilot").ate).toBe(false);
    expect(hintSuccess(before, { ...after, round: { ...after.round, number: 2 } }, "pilot").ate).toBe(false);
    before.sharks[0].alive = false;
    expect(hintSuccess(before, after, "pilot").ate).toBe(false);
    after.sharks[0].alive = false;
    expect(hintSuccess(before, after, "pilot").ate).toBe(false);
  });

  it("requires a server hit on a smaller shark; a miss/cooldown, old hit or somebody else's hit never clears it", () => {
    const before = snapshot();
    const after = structuredClone(before);
    after.tick++;
    after.sharks[0].biteCooldownTick += 14;
    expect(hintSuccess(before, after, "pilot").bit).toBe(false);
    after.explosions = [{ id: `bite-pilot-small-${after.tick}`, tick: after.tick, kind: "bite", skin: "cyan", x: 0, y: 0, z: 0 }];
    after.sharks[0].score += 5;
    after.sharks[0].length += 2;
    expect(hintSuccess(before, after, "pilot")).toEqual({ ate: false, bit: true });
    before.sharks[1].length = 20.01;
    expect(hintSuccess(before, after, "pilot").bit).toBe(false);
    before.sharks[1].length = 20;
    after.explosions[0].id = `bite-small-pilot-${after.tick}`;
    expect(hintSuccess(before, after, "pilot").bit).toBe(false);
    after.explosions[0].id = `bite-pilot-small-${before.tick}`;
    after.explosions[0].tick = before.tick;
    expect(hintSuccess(before, after, "pilot").bit).toBe(false);
  });
});

describe("ST-288 visible school arrow", () => {
  it("selects the nearest visible schooling fish with deterministic ties, excluding other prey", () => {
    const state = snapshot();
    state.sharks[0].position = { x: 0, y: 0, z: 0 };
    state.food = [fish("gold", 0.1, "golden"), fish("b", 2), fish("a", -2, "reef"), fish("far", 3)];
    expect(nearestSchoolFish(state, "pilot")?.position.id).toBe("a");
    state.food = state.food.filter((fish) => fish.kind === "golden");
    expect(nearestSchoolFish(state, "pilot")).toBeNull();
    state.sharks[0].alive = false;
    expect(nearestSchoolFish(state, "pilot")).toBeNull();
    expect(nearestSchoolFish(null, "pilot")).toBeNull();
  });

  it("projects an on-screen fish, clamps an off-screen target and preserves behind-camera direction", () => {
    const state = snapshot();
    state.sharks[0].position = { x: 0, y: 0, z: 0 };
    state.food = [fish("school", 0.5)];
    const viewport = { width: 375, height: 667 };
    const front = schoolCue(state, "pilot", identityMatrix, viewport)!;
    expect(front.x).toBe(281.25);
    expect(front.y).toBe(333.5);
    expect(front.behind).toBe(false);
    state.food[0].x = 2;
    const edge = schoolCue(state, "pilot", identityMatrix, viewport)!;
    expect(edge.x).toBe(339);
    const behind = schoolCue(state, "pilot", [...identityMatrix.slice(0, 15), -1], viewport)!;
    expect(behind.x).toBe(339);
    expect(behind.behind).toBe(true);
    expect(schoolCue(state, "pilot", identityMatrix, { width: NaN, height: 667 })).toBeNull();
    expect(schoolCue(state, "pilot", identityMatrix, { width: 375, height: 100 })).toBeNull();
  });
});

describe("ST-288 accessible hint readout", () => {
  it("uses desktop remaps or the touch instruction, one polite live region and an optional skip", () => {
    expect(hintText(0, true, DEFAULT_KEYBINDS)).toBe("Drag to swim");
    expect(hintText(0, false, { ...DEFAULT_KEYBINDS, yawLeft: "KeyJ", yawRight: "KeyL" })).toContain("J/L");
    const html = renderToStaticMarkup(<FirstRunHints step={1} touch binds={DEFAULT_KEYBINDS} cue={null} onSkip={() => {}} />);
    expect(html).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(html).toContain("Eat fish to grow");
    expect(html).toContain("Skip hints");
    expect(html).not.toContain('role="dialog"');
    const done = renderToStaticMarkup(<FirstRunHints step={null} touch binds={DEFAULT_KEYBINDS} cue={null} onSkip={() => {}} />);
    expect(done).not.toContain("Skip hints");
    expect(done).not.toContain("first-run-hint\"");
  });
});
