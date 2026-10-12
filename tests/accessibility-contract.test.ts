import { EdgeCueReadout } from "../src/game/ui/EdgeCues.js";
import { DEFAULT_SETTINGS } from "../src/game/settings/SettingsContext.js";
import { Leaderboard, LeaderboardReadout, rankedScores } from "../src/game/ui/Leaderboard.js";
import type { RoomSocket } from "../src/game/net/useRoomSocket.js";
import type { ScoreEntry } from "../src/protocol/index.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HudReadout, type HudStats } from "../src/game/ui/Hud.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createRoom,
  ROOM_SCHEMA_VERSION,
  step,
} from "../src/engine/index.js";
import { REALTIME_PROTOCOL_VERSION } from "../src/protocol/index.js";
import { DEFAULT_KEYBINDS } from "../src/game/settings/SettingsContext.js";
import { desktopAxesForPressed } from "../src/game/game/desktopControls.js";
import {
  CAMERA_PROJECTION,
  advanceBankRoll,
  cameraFovForSpeed,
  chaseCameraPose,
  makeChaseCameraPose,
  smoothChaseCameraPose,
} from "../src/game/game/sceneMath.js";
import { resolveSharkAnimation } from "../src/game/game/sharkPresentation.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const worker = read("../src/worker/index.ts");
const routes = read("../src/worker/routes.ts");
const app = read("../src/game/App.tsx");
const focusTrap = read("../src/game/a11y/useFocusTrap.ts");
const input = read("../src/game/game/useLocalInput.ts");
const theme = read("../src/game/ui/theme.css");
const settings = read("../src/game/ui/Settings.tsx");
const protocol = read("../src/protocol/index.ts");
const gameViewport = read("../src/game/game/GameViewport.tsx");
const gameScreen = read("../src/game/ui/GameScreen.tsx");
const help = read("../src/game/ui/HelpOverlay.tsx");
const death = read("../src/game/ui/DeathOverlay.tsx");
const quickA11y = read("../src/game/ui/QuickA11y.tsx");
const touchControls = read("../src/game/ui/TouchControls.tsx");
const leaderboard = read("../src/game/ui/Leaderboard.tsx");
const depthRadar = read("../src/game/ui/DepthRadar.tsx");
const sharkLabels = read("../src/game/ui/SharkLabels.tsx");
const edibility = read("../src/game/ui/edibility.ts");
const captions = read("../src/game/ui/Captions.tsx");
const gameAudio = read("../src/game/audio/useGameAudio.ts");
const cameraRig = read("../src/game/game/CameraRig.tsx");
const actorLayer = read("../src/game/game/ActorLayer.tsx");
const fxLayer = read("../src/game/game/FxLayer.tsx");
const worldEnvironment = read("../src/game/game/WorldEnvironment.tsx");

describe("public accessibility contract", () => {
  it("retires public evidence and operator routes while preserving the game accessibility surface", () => {
    expect(worker).toContain('if (path === "/" || path === "/play") return movedTo(url, "/play/");');
    expect(worker).not.toContain('if (path === "/evidence/")');
    expect(worker).not.toContain('renderOverviewDocument');
    expect(worker).not.toContain('renderNotFoundDocument');
  });

  it("keeps the game operable by keyboard with managed focus and reduced motion", () => {
    expect(app).toContain('className="skip-link" href="#main"');
    expect(app).toContain("regionRef.current?.focus()");
    expect(input).toContain('window.addEventListener("keydown", onKeyDown)');
    expect(input).toContain("preventDefault()");
    expect(focusTrap).toContain('document.addEventListener("keydown", onKeyDown)');
    expect(focusTrap).toContain("last.focus()");
    expect(focusTrap).toContain("first.focus()");
    expect(focusTrap).toContain("previouslyFocused?.focus?.()");
    expect(theme).toContain("@media (prefers-reduced-motion: reduce)");
    expect(theme).toContain(":focus-visible");
    expect(settings).toContain('formatValue={(value) => `${Math.round(value * 100)}%`}');
  });
});

describe("full-3D accessibility re-proof", () => {
  it("keeps a complete keyboard-only path through one authoritative round loop", () => {
    const flight = desktopAxesForPressed(
      new Set([DEFAULT_KEYBINDS.pitchUp, DEFAULT_KEYBINDS.yawRight, DEFAULT_KEYBINDS.lookLeft]),
      DEFAULT_KEYBINDS,
    );
    expect(flight).toMatchObject({ pitch: 1, yaw: 1, lookYaw: -1 });

    const state = createRoom({ id: "st-128-keyboard", seed: "st-128-keyboard" });
    applyAction(state, { type: "join", playerId: "pilot", name: "Pilot" });
    applyAction(state, {
      type: "setOrientation",
      playerId: "pilot",
      yaw: flight.yaw * 0.35,
      pitch: flight.pitch * 0.25,
    });
    applyAction(state, { type: "setBoost", playerId: "pilot", on: true });
    applyAction(state, { type: "bite", playerId: "pilot" });
    expect(state.sharks.pilot.targetYaw).toBeCloseTo(0.35);
    expect(state.sharks.pilot.targetPitch).toBeCloseTo(0.25);

    state.tick = state.round.apexStartTick - 1;
    step(state);
    expect(state.round.phase).toBe("apex");
    state.tick = state.round.endTick - 1;
    step(state);
    expect(state.round.phase).toBe("result");
    state.tick = state.round.resultEndTick - 1;
    step(state);
    expect(state.round).toMatchObject({ number: 2, phase: "active" });

    expect(input).toContain("b.pitchUp, b.pitchDown, b.yawLeft, b.yawRight");
    expect(input).toContain("b.lookUp, b.lookDown, b.lookLeft, b.lookRight");
    expect(input).toContain("if (code === b.boost && !e.repeat)");
    expect(input).toContain("if (code === b.bite && !e.repeat) bite()");
    expect(gameScreen).toContain("settings.controls.keybinds.pause");
    expect(gameScreen).toContain("<PauseMenu");
    expect(death).toContain("respawnRef.current?.focus()");
    expect(death).toContain("Back to menu");
    expect(quickA11y).toContain('label="Exit to menu"');
    expect(quickA11y).not.toContain("Exit to menu (Escape)");
  });

  it("reduces 3D presentation motion without removing state, steering, or camera orientation", () => {
    const goal = chaseCameraPose(
      { x: 12, y: -9, z: 7 },
      0.6,
      0.24,
      makeChaseCameraPose(),
      {
        reducedMotion: true,
        lookYawOffset: 0.3,
        lookPitchOffset: -0.2,
        arenaRadius: 120,
        seabedY: -60,
        surfaceY: 20,
      },
    );
    const snapped = smoothChaseCameraPose(
      makeChaseCameraPose(),
      goal,
      1 / 60,
      true,
      makeChaseCameraPose(),
    );
    for (const axis of ["x", "y", "z"] as const) {
      expect(snapped.position[axis]).toBeCloseTo(goal.position[axis], 12);
      expect(snapped.lookAt[axis]).toBeCloseTo(goal.lookAt[axis], 12);
    }
    expect(cameraFovForSpeed(28, 11, 28, true)).toBe(CAMERA_PROJECTION.fov);
    expect(Math.abs(advanceBankRoll(0, 10, 1 / 60, true))).toBeLessThanOrEqual(0.24);
    expect(resolveSharkAnimation({
      seconds: 5,
      actorId: "pilot",
      speed: 28,
      baseSpeed: 11,
      boostSpeed: 28,
      boosting: true,
      pitch: 0.3,
      reducedMotion: true,
    })).toEqual({ bodyYaw: 0, peduncleYaw: 0, tailYaw: 0, pectoralSweep: 0, intensity: 0 });

    expect(cameraRig).toContain("smoothChaseCameraPose(current, goal, dt, reducedMotion");
    expect(actorLayer).toContain("const alpha = reducedMotion ? 1 : frame.alpha");
    expect(fxLayer).toContain("reducedMotion ? 0.35");
    expect(worldEnvironment).toContain("const t = reducedMotion ? 0 : clock.elapsedTime");
    expect(worldEnvironment).toContain("kelpSway.value = reducedMotion ? 0 : 0.28");
    expect(worldEnvironment).toContain("transformed.x += kelpSway * kelpTip * kelpTip");
    expect(gameScreen).toContain('settings.a11y.motion === "reduced"');
  });

  it("keeps meaningful 3D state in semantic DOM with correct modal and touch ownership", () => {
    expect(gameViewport).toContain('role="img"');
    expect(gameViewport).toContain("keyLabel(k.pitchUp)");
    expect(gameViewport).toContain("surrounding DOM interface");
    expect(help).toContain('label="Fly"');
    expect(help).toContain('label="Look"');
    expect(help).toContain("Up/down pitches to climb or dive");
    expect(touchControls).toContain("setPointerCapture(e.pointerId)");
    expect(touchControls).toContain('aria-label={label}');

    expect(gameScreen).toContain("useFocusTrap(ref, true, onContinue)");
    expect(gameScreen).toContain("useFocusTrap(ref, true, onBack)");
    expect(gameScreen).toContain("Tank full — you'll join when a spot opens");
    expect(gameScreen).toContain("Can't reach the tank");
    expect(gameScreen).toContain('"assertive"');
    expect(gameScreen).toContain('aria-modal="true"');
    expect(gameScreen).toContain('aria-describedby="round-result-summary round-result-next"');
    expect(gameScreen).toContain("dismissedResultRound !== roundUi.number && !dialogOpen");
    expect(theme).toContain("position: fixed; inset: 0; z-index: 200");
    expect(theme).toContain(".scrim--respawn{z-index:100");
    expect(theme).toContain(".round-result-layer{position:absolute;inset:0;z-index:200");
    expect(theme).toContain("--tap-min: 44px");
    expect(theme).toContain(".game-screen--touch .ability-button{position:absolute;width:88px;height:88px;min-height:88px");
    for (const inset of ["top", "right", "bottom", "left"]) {
      expect(theme).toContain(`env(safe-area-inset-${inset}`);
    }

    expect(depthRadar).toContain('aria-label="3D navigation cues"');
    expect(depthRadar).toContain("game-depth-radar--semantic-only");
    expect(depthRadar).toContain("◆ YOU ARE APEX");
    expect(depthRadar).toContain("edibilityText(edibility)");
    expect(sharkLabels).toContain("relation.glyph");
    expect(edibility).toContain('glyph: "▼"');
    expect(edibility).toContain('glyph: "■"');
    expect(edibility).toContain('glyph: "▲"');
    expect(leaderboard).toContain("Apex target");
    expect(settings).toContain("Show shark name labels");
    expect(theme).toContain(':root[data-contrast="high"]');
  });

  it("keeps announcements bounded and captions available when audible playback is unavailable", () => {
    expect(leaderboard).toContain("rank <= 3");
    expect(leaderboard).toContain("rank < lastRank.current");
    expect(gameAudio).toContain("captionReachable");
    expect(gameAudio).toContain("return played || captioned");
    expect(gameAudio).toContain("AUDIO_LIMITS.captionRepeatMs");
    expect(captions).toContain('aria-hidden="true"');
    expect(app).toContain("<AnnouncerProvider>");
  });

  it("preserves the R3F-only renderer and state identities", () => {
    const pkg = JSON.parse(read("../package.json")) as { version: string };
    expect(gameViewport).toContain("<Canvas");
    expect(gameViewport).not.toContain("CanvasRenderingContext2D");
    expect(ROOM_SCHEMA_VERSION).toBe(11);
    expect(REALTIME_PROTOCOL_VERSION).toBe(12);
    expect(pkg.version).toBe("2.5.0");
  });
});

describe("canonical game surface", () => {
  it("routes the game explicitly and leaves retired paths unmatched", () => {
    expect(routes).toContain('path === "/play/"');
    expect(worker).toContain('if (path === "/" || path === "/play") return movedTo(url, "/play/");');
    expect(worker).toContain("if (!gameShell && !isStaticAssetPath(path)) return null");
    expect(worker).not.toContain('if (path === "/admin/status.json")');
    expect(worker).not.toContain('if (path === "/robots.txt")');
    expect(worker).not.toContain('if (path === "/sitemap.xml")');
    expect(protocol).not.toContain('leaderboard: "/api/leaderboard"');
    expect(worker).not.toContain('export { Lobby }');
  });
});


describe("ST-264 species motion accessibility", () => {
  it("keeps species shape and markings when reduced motion removes wobble", async () => {
    const { preyVisualFor, resolvePreyAnimation } = await import("../src/game/game/preyPresentation.js");
    const full = preyVisualFor("reef", 2, 0.58, "clownfish");
    const reduced = preyVisualFor("reef", 2, 0.58, "clownfish");
    expect(reduced).toEqual(full);
    expect(full.stripeCount).toBe(2);
    expect(resolvePreyAnimation({ seconds: 1.4, id: "fish-1", speed: 2, reducedMotion: true }).wobbleY).toBe(0);
    const layer = read("../src/game/game/PreyLayer.tsx");
    expect(layer).toContain('settings.a11y.motion === "reduced"');
    expect(layer).toContain("animation.wobbleY");
  });
});

it("ST-267 shows a bounded nearby-gold semantic caption and retains reduced-motion cues", () => {
  expect(gameScreen).toContain("<GoldenFishCaption socket={socket} />");
  expect(captions).toContain('role="status" aria-live="polite"');
  expect(captions).toContain("goldenFishNearby(state.food, self?.position)");
  expect(captions).toContain("setInterval(update, 250)");
  expect(captions).toContain("Golden fish nearby · 12 points");
  expect(theme).toContain(".game-golden-caption");
  expect(theme).toContain(':root[data-contrast="high"] .game-golden-caption');
  const preyRenderer = read("../src/game/game/PreyLayer.tsx");
  expect(preyRenderer).toContain("rayWingFlap(clock.elapsedTime, actor.id, reducedMotion)");
  expect(preyRenderer).toContain("const spin = reducedMotion ? 0 :");
});


describe("ST-282 compact semantic HUD", () => {
  const stats: HudStats = {
    points: 1234, size: 5, health: 42, rank: 4, players: 32, alive: true,
    roundNumber: 2, roundPhase: "active", roundSeconds: 122, frenzySeconds: 0,
  };
  const render = (overrides: Partial<HudStats> = {}, reducedMotion = false, frenzyEnded = false) =>
    renderToStaticMarkup(createElement(HudReadout, {
      stats: { ...stats, ...overrides }, reducedMotion, frenzyEnded,
      gainCue: { points: 7, streak: 3, key: 1 },
    }));

  it("renders authoritative tier progress, score, clock, rank and health with the on-demand snapshot", () => {
    const html = render();
    expect(html).toContain("Tiger Shark");
    expect(html).toMatch(/<progress[^>]*value="0.17647058823529413"[^>]*max="1"/);
    expect(html).toContain('aria-label="Tiger Shark, 18% to next tier"');
    expect(html).toContain('aria-label="1234 points"');
    expect(html).toContain("2:02");
    expect(html).toContain('aria-label="Rank 4 of 32"');
    expect(html).toMatch(/<meter[^>]*min="0"[^>]*max="100"[^>]*value="42"[^>]*aria-label="Health"/);
    expect(html).toContain('role="status" aria-live="off"');
    expect(html).toContain("42 health, Tiger Shark, size 5.0 times, rank 4 of 32");
    expect(html).not.toContain("hud-card");
    expect(html).not.toContain("APEX ");
    expect(html).not.toContain("FRENZY ");
  });

  it("keeps simultaneous phase chips and a motion-free streak without live countdown speech", () => {
    const html = render({ roundPhase: "apex", roundSeconds: 32, frenzySeconds: 12 }, true);
    expect(html).toContain("FRENZY 12s");
    expect(html).toContain("APEX 0:32");
    expect(html).toContain("Feeding Frenzy, 12 seconds. Central water column");
    expect(html).toContain("×3 streak");
    expect(html).not.toContain("hud-score-float");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('aria-live="polite"');
    expect(render()).toContain('aria-hidden="true">+7');
  });

  it("covers maximum tier, zero health, no living rank and end/result states", () => {
    const html = render({ size: 11.2, health: 0, alive: false, rank: 0, roundPhase: "result", roundSeconds: 0 }, true, true);
    expect(html).toContain('aria-label="Megalodon, maximum tier"');
    expect(html).toContain('value="1" max="1"');
    expect(html).toContain('value="0" aria-label="Health"');
    expect(html).toContain("—");
    expect(html).toContain("Next");
    expect(html).toContain("0:00");
    expect(html).toContain("FRENZY ENDED");
    expect(html).not.toContain("APEX ");
  });

  it("contracts five shrinkable tracks plus one chip row at 740×360 and 375px, with safe areas and contrast", () => {
    const bar = theme.match(/\.hud-bar \{([^}]+)\}/)?.[1] ?? "";
    expect(bar).toContain("display:grid");
    expect(bar).toContain("grid-template-columns:minmax(0,1.7fr) repeat(4,minmax(0,1fr))");
    expect(theme).toContain(".hud-metric { min-width:0;");
    expect(theme).toContain("width:min(620px, calc(100% - 12px - var(--safe-l) - var(--safe-r)))");
    expect(theme).toContain("top:calc(6px + var(--safe-t))");
    expect(theme).toContain(".hud-status-chips { display:flex; gap:4px; min-width:0; }");
    expect(theme).toMatch(/@media \(max-width: 560px\) \{\s*\.hud-bar \{ gap:4px; padding:5px 6px; \}/);
    expect(theme).not.toContain(".game-screen--portrait .game-hud");
    expect(theme).not.toContain("hud-card");
    expect(theme).toContain("top:calc(86px + var(--safe-t))");
    expect(theme).toContain(':root[data-contrast="high"] .hud-status-chip { background:#000; border-color:#fff; color:#fff; }');
    expect(theme).toContain(':root[data-motion="reduced"] .hud-score-float{display:none}');
  });
});


describe("ST-283 compact scores and native touch disclosure", () => {
  const entries: ScoreEntry[] = Array.from({ length: 12 }, (_, index) => ({
    id: `shark-${String(index + 1).padStart(2, "0")}`, name: `Shark ${index + 1}`,
    skin: "reef", score: 120 - index * 5, alive: true,
  }));
  const render = (youId: string | null, touch = false, scores = entries, apexId: string | null = "shark-01") =>
    renderToStaticMarkup(createElement(LeaderboardReadout, { entries: scores, youId, touch, apexId }));

  it("shows the top three plus your original rank, with no duplicate local row", () => {
    const html = render("shark-12");
    expect(html.match(/class="game-leaderboard__row/g)).toHaveLength(4);
    expect(html).toContain('value="12" class="game-leaderboard__row is-me" aria-current="true"');
    expect(html).toContain("Shark 12");
    expect(html).not.toContain("Shark 4<");
    expect(html).toContain("Apex target");
    expect(html).toContain('class="game-leaderboard__list" role="list"');
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    for (const youId of ["shark-01", "shark-02", "shark-03", null, "absent"]) {
      expect(render(youId).match(/class="game-leaderboard__row/g)).toHaveLength(3);
    }
  });

  it("derives your row below tenth from existing snapshot actors, not the truncated wire board", () => {
    const socket = {
      youId: "shark-12", leaderboard: entries.slice(0, 10),
      stateRef: { current: { sharks: entries, round: { phase: "apex", apexId: "shark-12" } } },
    } as unknown as RoomSocket;
    const html = renderToStaticMarkup(createElement(Leaderboard, { socket, touch: false }));
    expect(html).toContain('value="12"');
    expect(html).toContain('class="game-leaderboard__row is-me is-apex"');
    expect(html).toContain("Apex target");
    expect(html).toContain(" (you)");
  });

  it("matches deterministic Room tie ordering without filtering dead scores or mutating inputs", () => {
    const scores = [
      { ...entries[0], id: "z", score: 10, alive: false },
      { ...entries[1], id: "a", score: 10 },
      { ...entries[2], id: "m", score: 10 },
      { ...entries[3], id: "local", score: 2, alive: false },
    ];
    const original = [...scores];
    expect(rankedScores(scores).map((entry) => entry.id)).toEqual(["a", "m", "z", "local"]);
    expect(scores).toEqual(original);
    expect(render("local", false, scores, "local")).toContain('value="4" class="game-leaderboard__row is-me is-apex"');
    const respawned = scores.map((entry) => entry.id === "local" ? { ...entry, score: 20, alive: true } : entry);
    expect(render("local", false, respawned)).toContain('value="1" class="game-leaderboard__row is-me"');
  });

  it("starts touch collapsed with native tap/keyboard activation and leaves desktop scores expanded", () => {
    const html = render("shark-12", true);
    expect(html).toContain('<details class="game-leaderboard__disclosure">');
    expect(html).toContain('<summary class="game-leaderboard__toggle">');
    expect(html).toContain('aria-label="Your rank 12">#12');
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
    expect(html).not.toContain('aria-live=');
    expect(render("shark-12")).not.toContain("<details");
    expect(render(null, true, [])).toContain("Waiting for scores…");
    expect(render(null, true, [])).toContain('aria-label="Not ranked"');
    // React never writes an open prop or key: native expansion survives broadcasts.
    expect(leaderboard).toContain('<details className="game-leaderboard__disclosure">');
    expect(input).toContain("button, summary, a, input");
    expect(gameScreen).toContain("button, summary, a, input");
    expect(theme).toContain(".game-leaderboard__toggle:focus-visible");
  });

  it("keeps all four rows clear of the HUD and either ability arc, including short landscape", () => {
    expect(theme).toContain("top:calc(86px + var(--safe-t))");
    expect(theme).toContain("width:min(152px,calc(100% - 228px - var(--safe-l) - var(--safe-r)),calc(50% - 72px))");
    expect(theme).toContain(".game-screen--touch.game-screen--flight-right .game-leaderboard{left:auto;right:calc(6px + var(--safe-r))}");
    expect(theme).toContain(".game-leaderboard__toggle{min-height:48px;cursor:pointer;pointer-events:auto;touch-action:manipulation");
    expect(theme).not.toMatch(/\.game-leaderboard li:nth-child/);
    expect(theme).toContain(".game-leaderboard__apex{display:inline-block;flex-shrink:0;");
    expect(theme).toContain(".game-leaderboard__identity{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}");
    expect(theme).toContain(".game-leaderboard, .game-depth-radar, .conn-banner { pointer-events:none; }");
    expect(gameScreen).toContain('<Leaderboard socket={socket} touch={touch} />');
  });
});


describe("ST-284 edge cue accessibility", () => {
  it("renders named non-colour glyphs and distance without a live announcement stream", () => {
    const html = renderToStaticMarkup(createElement(EdgeCueReadout, { cues: [
      { id: "danger", kind: "threat", label: "Danger: Hunter", position: { x: 0, y: 0, z: 10 }, distance: 12.4, x: 36, y: 180, angle: 180, behind: true },
      { id: "gold", kind: "golden", label: "Golden fish", position: { x: 0, y: 0, z: 10 }, distance: 20, x: 704, y: 180, angle: 0, behind: false },
    ] }));
    expect(html).toContain('role="list"');
    expect(html).toContain('aria-label="Off-screen threats and objectives"');
    expect(html).toContain('aria-label="Danger: Hunter, 12 meters, left, behind the camera"');
    expect(html).toContain("▲ 12m"); expect(html).toContain("✦ 20m");
    expect(html).not.toContain("aria-live");
    expect(html).not.toContain("tabindex");
    expect(html).toContain("var(--safe-l)"); expect(html).toContain("var(--safe-b)");
  });

  it("keeps arrows pointer-transparent and static in Reduced motion and High contrast", () => {
    expect(theme).toContain(".edge-cue-layer{position:absolute");
    expect(theme).toContain("pointer-events:none;animation:none;transition:none");
    expect(theme).toContain(':root[data-contrast="high"] .edge-cue{background:#000;color:#fff;border-width:2px}');
    expect(theme).toContain('@media (forced-colors:active){.edge-cue{background:Canvas;color:CanvasText;border-color:CanvasText}}');
    expect(theme).toContain(':root[data-motion="reduced"] .edge-cue{animation:none;transition:none}');
    expect(theme).toContain("background:#06050c;color:#f3f1ff");
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
        .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    for (const color of ["#f3f1ff", "#ffb4ad", "#ffe18b", "#b6f4ed"]) {
      expect(theme).toContain(color);
      expect((luminance(color) + 0.05) / (luminance("#06050c") + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
    expect(DEFAULT_SETTINGS.graphics.showMinimap).toBe(false);
    expect(gameScreen).toContain("<EdgeCues cuesRef={cuesRef}");
    expect(depthRadar).toContain("game-depth-radar--semantic-only");
    const producer = read("../src/game/game/EdgeNavigation.tsx");
    const consumer = read("../src/game/ui/EdgeCues.tsx");
    expect(producer).toContain("clock.elapsedTime - lastAt.current < 0.1");
    expect(producer).not.toContain("setState");
    expect(consumer).toContain("setInterval(update, 100)");
    expect(consumer).toContain("clearInterval(timer)");
  });
});


describe("ST-287 menu accessibility", () => {
  it("retains native named radios, visible focus, reflow and non-animated preview", () => {
    const menu = read("../src/game/ui/MainMenu.tsx");
    const css = read("../src/game/ui/theme.css");
    expect(menu).toContain('<fieldset className="skin-fieldset">');
    expect(menu).toContain('<legend className="skin-legend">Skin</legend>');
    expect(menu).toContain('type="radio" name="skin"');
    expect(menu).toContain('<span>{option.name}</span>');
    expect(menu).toContain('role="img" aria-label={`${selectedSkin.name} shark preview`}');
    expect(menu).not.toContain('aria-live');
    expect(css).toContain('.skin-option:focus-within{outline:3px solid var(--focus-ring);outline-offset:4px}');
    expect(css).toContain('@media(max-width:560px){.shark-menu__identity{grid-template-columns:minmax(0,1fr)');
    expect(css).toContain(':root[data-contrast="high"] .skin-option{background:#000;color:#fff;border:1px solid #fff}');
    expect(css).toContain('.skin-option>span{max-width:100%;overflow-wrap:anywhere}');
    expect(css).toContain('--accent-contrast:#000');
    expect(css).not.toMatch(/\.menu-shark[^}]*animation/);
  });
});
