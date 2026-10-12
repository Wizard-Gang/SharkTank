import { OwnLabelLifetime, selectSharkLabels, sharkLabelBox, sharkLabelOpacity, type SharkLabel } from "../src/game/ui/sharkLabelSelection.js";
import { Matrix4, PerspectiveCamera } from "three";
import { buildEdgeCues, clipPoint, edgeTargets, projectEdgePoint } from "../src/game/ui/edgeNavigation.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { NetPrey } from "../src/protocol/index.js";
import type { ClientShark, ClientState } from "../src/game/net/clientState.js";
import {
  buildDepthNavigation,
  cueDescription,
  describeRelativeTarget,
} from "../src/game/ui/DepthRadar.js";
import {
  EDIBILITY_PRESENTATION,
  edibilityFor,
} from "../src/game/ui/edibility.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function shark(id: string, x: number, y: number, z: number, overrides: Partial<ClientShark> = {}): ClientShark {
  return {
    id,
    name: id,
    skin: "reef",
    position: { x, y, z },
    yaw: 0,
    pitch: 0,
    length: 10,
    lungeTicks: 0,
    dashCooldownTick: 0,
    health: 100,
    biteCooldownTick: 0,
    score: 0,
    alive: true,
    ...overrides,
  };
}

function prey(id: string, x: number, y: number, z: number, kind: NetPrey["kind"] = "reef"): NetPrey {
  return { id, kind, x, y, z, value: kind === "chum" ? 3 : 1, r: 0.6, yaw: 0, pitch: 0 };
}

function state(): ClientState {
  return {
    tick: 100,
    arenaRadius: 120,
    seabedY: -60,
    surfaceY: 20,
    sharks: [shark("you", 0, -8, 0)],
    food: [],
    explosions: [],
    frenzyUntilTick: 0,
    round: {
      number: 1,
      phase: "active",
      startTick: 0,
      apexStartTick: 5100,
      endTick: 6000,
      resultEndTick: 6200,
      apexId: null,
      result: null,
    },
  };
}

describe("ST-126 depth-aware competitive cues", () => {
  it("classifies the exact 1.5x edibility boundary with a non-color glyph for every state", () => {
    expect(edibilityFor({ length: 15 }, { length: 10 })).toBe("prey");
    expect(edibilityFor({ length: 14.99 }, { length: 10 })).toBe("even");
    expect(edibilityFor({ length: 10 }, { length: 15 })).toBe("threat");
    expect(edibilityFor({ length: 10 }, { length: 14.99 })).toBe("even");

    expect(EDIBILITY_PRESENTATION.prey).toMatchObject({ glyph: "▼", label: "eat" });
    expect(EDIBILITY_PRESENTATION.even).toMatchObject({ glyph: "■", label: "even" });
    expect(EDIBILITY_PRESENTATION.threat).toMatchObject({ glyph: "▲", label: "danger" });
  });

  it("describes heading-relative direction, vertical relationship and proximity in full XYZ", () => {
    expect(describeRelativeTarget(
      { x: 0, y: 0, z: 0 },
      0,
      { x: 10, y: 8, z: 10 },
    )).toMatchObject({ bearing: "ahead-right", vertical: "above", proximity: "near" });

    expect(describeRelativeTarget(
      { x: 0, y: 0, z: 0 },
      0,
      { x: -10, y: -8, z: 0 },
    )).toMatchObject({ bearing: "behind", vertical: "below", proximity: "near" });

    expect(describeRelativeTarget(
      { x: 0, y: 0, z: 0 },
      Math.PI / 2,
      { x: 0, y: 8, z: 12 },
    )).toMatchObject({ bearing: "ahead", vertical: "above" });
  });

  it("derives Apex, Frenzy, rival and prey cues only from authoritative snapshot truth", () => {
    const snapshot = state();
    snapshot.sharks.push(
      shark("Apex", -34, 10, 0, { length: 15, score: 90 }),
      shark("Hunter", 12, -15, 8, { length: 13 }),
    );
    snapshot.food.push(prey("reef-1", 10, 3, 2));
    snapshot.round.phase = "apex";
    snapshot.round.apexId = "Apex";
    snapshot.frenzyUntilTick = 400;

    const nav = buildDepthNavigation(snapshot, "you", false);
    expect(nav.depth).toBe(28);
    expect(nav.cues.map((item) => item.kind)).toEqual(expect.arrayContaining(["apex", "frenzy", "rival", "prey"]));
    expect(nav.cues.find((item) => item.kind === "apex")).toMatchObject({
      label: "Apex",
      bearing: "behind",
      vertical: "above",
    });
    expect(cueDescription(nav.cues.find((item) => item.kind === "rival")!)).toMatch(/■ even: Hunter.*below/i);
  });

  it("keeps the touch view bounded while preserving the same information hierarchy", () => {
    const snapshot = state();
    snapshot.round.phase = "apex";
    snapshot.round.apexId = "apex";
    snapshot.sharks.push(
      shark("apex", -45, 6, 0, { score: 100 }),
      shark("rival-1", 8, 0, 8, { length: 14 }),
      shark("rival-2", 14, -18, 2, { length: 12 }),
    );
    snapshot.food.push(prey("food-1", 6, 8, 3), prey("food-2", 18, -22, 2));
    snapshot.frenzyUntilTick = 300;

    const desktop = buildDepthNavigation(snapshot, "you", false);
    const touch = buildDepthNavigation(snapshot, "you", true);
    expect(desktop.cues.length).toBeLessThanOrEqual(5);
    expect(touch.cues.length).toBeLessThanOrEqual(3);
    expect(touch.cues[0]?.kind).toBe("apex");
    expect(touch.cues[1]?.kind).toBe("frenzy");
  });

  it("marks the local Apex without inventing another target or requiring color", () => {
    const snapshot = state();
    snapshot.round.phase = "apex";
    snapshot.round.apexId = "you";
    const nav = buildDepthNavigation(snapshot, "you");
    expect(nav.apexSelf).toBe(true);
    expect(nav.cues.some((item) => item.kind === "apex")).toBe(false);

    const radar = read("../src/game/ui/DepthRadar.tsx");
    expect(radar).toContain("◆ YOU ARE APEX");
    expect(radar).toContain("ABOVE ↑");
    expect(radar).toContain("BELOW ↓");
    expect(radar).toContain('aria-label="3D navigation cues"');
    expect(radar).not.toContain("getContext");
    expect(radar).not.toContain("socket.send");
  });

  it("removes the planar minimap, bounds labels and keeps touch radar clear of edge controls", () => {
    const screen = read("../src/game/ui/GameScreen.tsx");
    const actor = read("../src/game/game/ActorLayer.tsx");
    const labels = read("../src/game/ui/SharkLabels.tsx");
    const settings = read("../src/game/ui/Settings.tsx");
    const css = read("../src/game/ui/theme.css");

    expect(screen).toContain("<DepthRadar");
    expect(screen).not.toContain("<Minimap");
    expect(settings).toContain('label="Show text depth radar"');
    expect(actor).toContain("camera.getWorldDirection(cameraForward)");
    expect(actor).toContain("labelDistance < 55");
    expect(actor).toContain("selectSharkLabels(labels, ownLabelAge)");
    expect(labels).toContain('className="shark-label__apex">APEX');
    expect(labels).toContain("relation.glyph");
    expect(actor).toContain("edibilityFor(me, shark)");
    expect(actor).toContain("EDIBILITY_PRESENTATION[relation].color");
    expect(css).toContain(".game-screen--touch .game-depth-radar");
    expect(css).toContain("width:min(300px,36vw)");
    expect(css).toContain("bottom:calc(12px + var(--safe-b))");
    expect(css).not.toContain(".game-minimap");
  });

  it("keeps wire identity at 11 while the RoomState persistence schema field is retired", () => {
    const protocol = read("../src/protocol/index.ts");
    const engineTypes = read("../src/engine/types.ts");
    const pkg = JSON.parse(read("../package.json")) as { version: string };
    expect(protocol).toContain("REALTIME_PROTOCOL_VERSION = 12");
    expect(protocol).not.toContain("schemaVersion:");
    expect(engineTypes).not.toContain("schemaVersion: 11");
    expect(pkg.version).toBe("2.5.0");
  });
});

describe("ST-284 bounded camera-relative edge cues", () => {
  const viewport = { width: 740, height: 360 };
  const matrixFor = (look = { x: 0, y: 0, z: -1 }, width = 740, height = 360) => {
    const camera = new PerspectiveCamera(60, width / height, 0.1, 500);
    camera.lookAt(look.x, look.y, look.z);
    camera.updateMatrixWorld();
    return new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
  };
  const project = (x: number, y: number, z: number) => projectEdgePoint(clipPoint({ x, y, z }, matrixFor()), viewport);

  it("hides on-screen points and clamps side, vertical and diagonal directions to the inset ellipse", () => {
    expect(project(0, 0, -10)).toBeNull();
    expect(project(1, 1, -10)).toBeNull();
    expect(project(50, 0, -10)).toMatchObject({ x: 704, y: 180, angle: 0, behind: false });
    expect(project(-50, 0, -10)).toMatchObject({ x: 36, y: 180, behind: false });
    expect(project(0, 50, -10)).toMatchObject({ x: 370, y: 96, angle: -90 });
    expect(project(0, -50, -10)).toMatchObject({ x: 370, y: 264, angle: 90 });
    const diagonal = project(50, 50, -10)!;
    expect(diagonal.x).toBeGreaterThan(370);
    expect(diagonal.y).toBeLessThan(180);
    expect(((diagonal.x - 370) / 334) ** 2 + ((diagonal.y - 180) / 84) ** 2).toBeCloseTo(1);
  });

  it("does not mirror behind-camera left/right or above/below, including the exact rear axis and camera plane", () => {
    expect(project(50, 0, 10)).toMatchObject({ x: 704, y: 180, behind: true });
    expect(project(-50, 0, 10)).toMatchObject({ x: 36, y: 180, behind: true });
    expect(project(0, 50, 10)).toMatchObject({ x: 370, y: 96, behind: true });
    expect(project(0, -50, 10)).toMatchObject({ x: 370, y: 264, behind: true });
    expect(project(0, 0, 10)).toMatchObject({ x: 370, y: 264, angle: 90, behind: true });
    expect(project(50, 0, 0)).toMatchObject({ x: 704, y: 180 });
  });

  it("uses the actual yaw/pitch camera projection and remains finite across aspect ratios and invalid samples", () => {
    for (const [width, height] of [[375,667], [740,360], [844,390]]) {
      const matrix = matrixFor({ x: 1, y: 0.4, z: 0 }, width, height);
      expect(projectEdgePoint(clipPoint({ x: 10, y: 4, z: 0 }, matrix), { width, height })).toBeNull();
      const edge = projectEdgePoint(clipPoint({ x: -10, y: -4, z: 10 }, matrix), { width, height })!;
      expect(edge.behind).toBe(true);
      expect(edge.x).toBeGreaterThanOrEqual(36);
      expect(edge.x).toBeLessThanOrEqual(width - 36);
      expect(edge.y).toBeGreaterThanOrEqual(96);
      expect(edge.y).toBeLessThanOrEqual(height - 96);
      expect(((edge.x - width / 2) / (width / 2 - 36)) ** 2 + ((edge.y - height / 2) / (height / 2 - 96)) ** 2).toBeCloseTo(1);
    }
    const moved = new PerspectiveCamera(60, 740 / 360, 0.1, 500);
    moved.position.set(10, 5, 20); moved.lookAt(10, 5, 0); moved.updateMatrixWorld();
    const translated = new Matrix4().multiplyMatrices(moved.projectionMatrix, moved.matrixWorldInverse).elements;
    expect(projectEdgePoint(clipPoint({ x: 10, y: 5, z: 0 }, translated), viewport)).toBeNull();
    expect(projectEdgePoint(clipPoint({ x: 60, y: 5, z: 10 }, translated), viewport)).toMatchObject({ x: 704, y: 180 });
    expect(projectEdgePoint({ x: NaN, y: 0, z: 1, w: 1 }, viewport)).toBeNull();
    expect(projectEdgePoint({ x: 2, y: 0, z: 1, w: 1 }, { width: 50, height: 100 })).toBeNull();
  });

  it("selects exact devour and full-XYZ 40-unit boundaries, excludes dead/self and deduplicates Apex", () => {
    const snapshot = state();
    snapshot.sharks.push(
      shark("boundary", 40, -8, 0, { length: 15 }),
      shark("too-far", 40, -7, 0, { length: 15 }),
      shark("too-small", 10, -8, 0, { length: 14.99 }),
      shark("dead", 10, -8, 0, { length: 20, alive: false }),
      shark("apex", -70, -8, 0, { length: 20 }),
    );
    snapshot.round.phase = "apex"; snapshot.round.apexId = "apex";
    expect(edgeTargets(snapshot, "you").map((t) => [t.id, t.kind])).toEqual([["boundary", "threat"], ["apex", "apex"]]);
    snapshot.round.apexId = "you";
    expect(edgeTargets(snapshot, "you").some((t) => t.kind === "apex")).toBe(false);
    expect(edgeTargets(null, "you")).toEqual([]);
    expect(edgeTargets(snapshot, null)).toEqual([]);
    snapshot.sharks[0].alive = false;
    expect(edgeTargets(snapshot, "you")).toEqual([]);
    snapshot.sharks[0].alive = true; snapshot.round.phase = "result";
    expect(edgeTargets(snapshot, "you")).toEqual([]);
  });

  it("reserves four off-screen kind slots, preserves objectives amid threats and ignores on-screen slots", () => {
    const snapshot = state();
    snapshot.sharks[0].position = { x: 0, y: 0, z: 0 };
    snapshot.sharks.push(
      shark("z", 10, 0, 10, { length: 20 }), shark("a", 10, 0, 10, { length: 20 }),
      shark("on-screen", 0, 0, -2, { length: 20 }), shark("apex", -60, 0, 0),
    );
    snapshot.round.phase = "apex"; snapshot.round.apexId = "apex";
    snapshot.frenzyUntilTick = 200;
    snapshot.food.push(prey("gold", 0, 8, 10, "golden"), prey("ordinary", 0, 0, 10));
    const cues = buildEdgeCues(edgeTargets(snapshot, "you"), matrixFor(), viewport);
    expect(cues.map((t) => [t.id, t.kind])).toEqual([["a", "threat"], ["apex", "apex"], ["frenzy-center", "frenzy"], ["golden:gold", "golden"]]);
    snapshot.sharks.reverse(); snapshot.food.reverse();
    expect(buildEdgeCues(edgeTargets(snapshot, "you"), matrixFor(), viewport)).toEqual(cues);
    snapshot.frenzyUntilTick = snapshot.tick; snapshot.food = []; snapshot.round.apexId = null;
    expect(buildEdgeCues(edgeTargets(snapshot, "you"), matrixFor(), viewport).map((t) => t.id)).toEqual(["a", "z"]);
    for (let i = 0; i < 8; i++) snapshot.sharks.push(shark(`extra-${i}`, 20 + i, 0, 10, { length: 20 }));
    const bounded = buildEdgeCues(edgeTargets(snapshot, "you"), matrixFor(), viewport);
    expect(bounded).toHaveLength(4);
    expect(bounded.map((cue) => cue.id)).toEqual(["a", "z", "extra-0", "extra-1"]);
    for (let i = 0; i < bounded.length; i++) for (let j = i + 1; j < bounded.length; j++) {
      expect(Math.abs(bounded[i].x - bounded[j].x) >= 76 || Math.abs(bounded[i].y - bounded[j].y) >= 32).toBe(true);
    }
    expect(bounded[0].angle).toBe(bounded[1].angle);
  });
});

describe("ST-285 compact shark label selection", () => {
  const label = (id: string, distance: number, options: Partial<SharkLabel> = {}): SharkLabel => ({
    id, name: id, x: 100, y: 150, color: "#6ff0a3", me: false, apex: false, edibility: "even", distance, ...options,
  });

  it("prioritizes Apex, threats and nearest visible sharks within a five-tag cap", () => {
    const labels = [label("near", 2), label("far", 50), label("apex", 45, { apex: true }),
      label("threat-far", 40, { edibility: "threat" }), label("threat-near", 20, { edibility: "threat" }),
      label("medium", 10), label("hidden", 55, { apex: true })];
    const original = labels.slice();
    expect(selectSharkLabels(labels, 4000).map((item) => item.id)).toEqual(["apex", "threat-near", "threat-far", "near", "medium"]);
    expect(labels).toEqual(original);
    expect(selectSharkLabels([...labels].reverse(), 4000)).toEqual(selectSharkLabels(labels, 4000));
  });

  it("keeps deterministic ID ordering for equal-priority/equal-distance tags", () => {
    expect(selectSharkLabels([label("z", 15), label("a", 15), label("c", 15)], 0).map((item) => item.id)).toEqual(["a", "c", "z"]);
    expect(selectSharkLabels([], 0)).toEqual([]);
  });

  it("fades only between 30 and 55 units and excludes invisible/nonfinite distances", () => {
    expect(sharkLabelOpacity(0)).toBe(1); expect(sharkLabelOpacity(30)).toBe(1);
    expect(sharkLabelOpacity(42.5)).toBe(0.5); expect(sharkLabelOpacity(54)).toBeCloseTo(0.04);
    expect(sharkLabelOpacity(55)).toBe(0); expect(sharkLabelOpacity(100)).toBe(0);
    expect(sharkLabelOpacity(Infinity)).toBe(0); expect(sharkLabelOpacity(NaN)).toBe(0);
    expect(selectSharkLabels([label("far-apex", 55, { apex: true }), label("bad", NaN), label("near", 30)], 0).map((item) => item.id)).toEqual(["near"]);
  });

  it("hides the local name at exactly three seconds without hiding other names", () => {
    const labels = [label("you", 0, { me: true }), label("other", 10)];
    expect(selectSharkLabels(labels, 2999).map((item) => item.id)).toEqual(["you", "other"]);
    expect(selectSharkLabels(labels, 3000).map((item) => item.id)).toEqual(["other"]);
    expect(selectSharkLabels(labels, 9000).map((item) => item.id)).toEqual(["other"]);
  });

  it("starts a fresh three-second window for death/respawn, round, reconnect and identity changes", () => {
    const life = new OwnLabelLifetime();
    expect(life.sample("you", true, 1, true, 100)).toBe(0);
    expect(life.sample("you", true, 1, true, 3100)).toBe(3000);
    expect(life.sample("you", false, 1, true, 3200)).toBe(Infinity);
    expect(life.sample("you", true, 1, true, 4000)).toBe(0);
    expect(life.sample("you", true, 2, true, 8000)).toBe(0);
    expect(life.sample("you", true, 2, false, 9000)).toBe(Infinity);
    expect(life.sample("you", true, 2, true, 10000)).toBe(0);
    expect(life.sample("other", true, 2, true, 11000)).toBe(0);
    expect(life.sample(null, false, 0, false, 12000)).toBe(Infinity);
  });
});


describe("ST-285 measured label geometry", () => {
  const label: SharkLabel = { id: "name", name: "Name", x: 0, y: 0, distance: 0, color: "#fff", me: false, apex: false, edibility: null };
  it("keeps the full tag below enlarged HUD bounds and inside every supported viewport", () => {
    for (const [width, height] of [[375,667], [740,360], [844,390]]) {
      for (const hudBottom of [86,106,130]) for (const x of [-50,width / 2,width + 50]) for (const y of [-50,height / 2,height + 50]) {
        const box = sharkLabelBox({ ...label, x, y }, width, height, hudBottom);
        expect(box.x).toBeGreaterThanOrEqual(6);
        expect(box.x + box.width).toBeLessThanOrEqual(width - 6);
        expect(box.y).toBeGreaterThanOrEqual(hudBottom);
        expect(box.y + box.height).toBeLessThanOrEqual(height);
      }
    }
  });
  it("subtracts safe-area layer offsets and never puts a tag above a tall HUD", () => {
    const box = sharkLabelBox({ ...label, x: 200, y: 200 }, 700, 340, 86, 20, 10);
    expect(box).toEqual({ x: 90, y: 152, width: 180, height: 32 });
    expect(sharkLabelBox(label, 160, 180, 190).y).toBe(190);
    expect(sharkLabelBox(label, 160, 180, 86).width).toBe(148);
  });
});
