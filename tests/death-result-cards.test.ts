import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyAction, createRoom } from "../src/engine/index.js";
import { toNetState } from "../src/protocol/index.js";
import { DeathCard } from "../src/game/ui/DeathOverlay.js";
import { RoundResult } from "../src/game/ui/GameScreen.js";
import { respawnCountdown, roundStandings, RoundStandingsTracker, type RoundUiState } from "../src/game/ui/roundPresentation.js";

function fixture() {
  const room = createRoom({ id: "cards", seed: "cards" });
  for (const [id, score] of [["alpha", 100], ["beta", 80], ["gamma", 80], ["pilot", 40]] as const) {
    applyAction(room, { type: "join", playerId: id, name: id });
    room.sharks[id].score = score;
  }
  room.sharks.pilot.length = 78;
  room.sharks.beta.alive = false;
  const state = toNetState(room);
  state.round.phase = "result";
  state.round.result = { roundNumber: 1, endedTick: state.tick, winner: { ...state.sharks[0] } };
  return state;
}

describe("ST-286 recovery and result cards", () => {
  it("derives countdown text and ring from elapsed time, including delayed mounts", () => {
    expect(respawnCountdown(1000, 3000, 1000)).toEqual({ remaining: 3, progress: 0 });
    expect(respawnCountdown(1000, 3000, 2500)).toEqual({ remaining: 2, progress: 0.5 });
    expect(respawnCountdown(1000, 3000, 3999).remaining).toBe(1);
    expect(respawnCountdown(1000, 3000, 4000)).toEqual({ remaining: 0, progress: 1 });
    expect(respawnCountdown(1000, 3000, 9000)).toEqual({ remaining: 0, progress: 1 });
    expect(respawnCountdown(1000, 0, 1000)).toEqual({ remaining: 0, progress: 1 });
    expect(respawnCountdown(1000, 3000, 500)).toEqual({ remaining: 3, progress: 0 });
  });

  it("uses all snapshot sharks for the podium and local rank, with dead rows and stable ties", () => {
    const state = fixture();
    const before = JSON.stringify(state);
    expect(roundStandings(state, "pilot")).toEqual({
      podium: [{ id: "alpha", name: "alpha", score: 100 }, { id: "beta", name: "beta", score: 80 }, { id: "gamma", name: "gamma", score: 80 }],
      localRank: 4, localScore: 40, localTier: "Great White",
    });
    expect(JSON.stringify(state)).toBe(before);
    state.sharks.reverse();
    expect(roundStandings(state, "beta").localRank).toBe(2);
  });

  it("retains the authoritative winner after departure and handles missing players/empty results", () => {
    const state = fixture();
    state.sharks = state.sharks.filter((shark) => shark.id !== "alpha");
    expect(roundStandings(state, "alpha")).toMatchObject({ localRank: 1, localScore: 100 });
    expect(roundStandings(state, null)).toMatchObject({ localRank: null, localScore: 0, localTier: null });
    state.sharks = [];
    expect(roundStandings(state, "pilot").podium).toHaveLength(1);
    state.round.result!.winner = null;
    expect(roundStandings(state, "pilot").podium).toEqual([]);
  });

  it("keeps first-seen results stable and resets for new rounds, identity and connections", () => {
    const state = fixture();
    const tracker = new RoundStandingsTracker();
    const first = tracker.sample(state, "pilot");
    state.sharks = state.sharks.filter((shark) => shark.id !== "beta");
    state.sharks.find((shark) => shark.id === "pilot")!.score = 0;
    expect(tracker.sample(state, "pilot")).toEqual(first);
    expect(tracker.sample(state, "gamma").localRank).toBe(2);
    state.round.number = 2;
    expect(tracker.sample(state, "pilot").localScore).toBe(0);
    state.round.phase = "active";
    tracker.sample(state, "pilot");
    state.round.phase = "result";
    expect(tracker.sample(state, "pilot").podium).toHaveLength(3);
    expect(new RoundStandingsTracker().sample(state, "pilot").localScore).toBe(0);
  });

  it("renders a non-modal death card with named cause, tier, score and a gated ring button", () => {
    const props = { death: { by: "<Big shark>", action: "bite" as const, tick: 20, score: 42, respawnInMs: 3000, at: 0 }, tier: "Tiger Shark", cause: "Bitten by <Big shark>.", remaining: 2, progress: 0.5, onRespawn() {}, onQuit() {} };
    const html = renderToStaticMarkup(createElement(DeathCard, props));
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain("aria-modal");
    expect(html).toContain("Bitten by &lt;Big shark&gt;.");
    expect(html).toContain("Tiger Shark");
    expect(html).toContain("42");
    expect(html).toContain('stroke-dashoffset="0.5"');
    expect(html).toContain("Respawn in 2…");
    expect(html).toContain('disabled=""');
    expect(html).toContain("Back to menu");
    expect(html).not.toContain("style=");
    const ready = renderToStaticMarkup(createElement(DeathCard, { ...props, remaining: 0, progress: 1 }));
    expect(ready).not.toContain('disabled=""');
    expect(ready).toContain("✓");
    expect(ready).toContain(">Respawn</span>");
  });

  it("renders ranked podium semantics, final score and Play again without motion or inline styles", () => {
    const state = fixture();
    const round: RoundUiState = { number: 1, phase: "result", secondsLeft: 8, apexName: null, winnerName: "alpha", winnerScore: 100, ...roundStandings(state, "pilot") };
    const html = renderToStaticMarkup(createElement(RoundResult, { round, onContinue() {} }));
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Top three sharks"');
    expect(html.indexOf("alpha</strong>")).toBeLessThan(html.indexOf("beta</strong>"));
    expect(html.indexOf("beta</strong>")).toBeLessThan(html.indexOf("gamma</strong>"));
    expect(html).toContain("Your rank: 4. Your final score: 40 points.");
    expect(html).toContain("Next round starts in 8s.");
    expect(html).toContain("Play again</button>");
    expect(html).not.toContain("style=");
    const empty = renderToStaticMarkup(createElement(RoundResult, { round: { ...round, winnerName: null, podium: [], localRank: null }, onContinue() {} }));
    expect(empty).toContain("Not ranked");
    expect(empty).not.toContain('aria-label="Top three sharks"');
  });
});
