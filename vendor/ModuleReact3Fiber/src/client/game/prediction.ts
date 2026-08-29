// Client-side prediction for the LOCAL snake only. The server is authoritative and
// runs at 20Hz behind an interpolation delay, which makes remote snakes smooth but would
// make your OWN steering feel laggy. So we predict the local head forward from live input
// using the exact server movement model (imported from the engine), render it at zero
// delay, and gently reconcile toward the authoritative state each time a snapshot lands.
//
// Only the local snake is predicted; everyone else stays server-interpolated.

import { MOVE, TICKS_PER_SECOND, sampleTrail, segmentCount } from "../../engine/index.js";
import type { Vec2 } from "../../engine/index.js";
import type { NetSnake } from "../../protocol/index.js";
import type { LocalInput } from "./useLocalInput.js";

// Per-second rates derived from the per-tick model, so we can advance by real dt.
const SPEED = MOVE.BASE_SPEED * TICKS_PER_SECOND;
const BOOST = MOVE.BOOST_SPEED * TICKS_PER_SECOND;
const TURN = MOVE.TURN_RATE * TICKS_PER_SECOND;
const CRUMB_STEP = MOVE.SEGMENT_SPACING * 0.5; // drop a breadcrumb every half-spacing
const RECONCILE = 0.35; // fraction of positional error corrected per frame — hug the
// server tightly so what you SEE matches what the server collides (consistent deaths).

function rotateToward(cur: number, target: number, maxStep: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

export interface PredictionResult {
  segments: Vec2[];
  head: Vec2;
  heading: number;
}

/** Holds the predicted local snake between frames. One per game screen. */
export class LocalPredictor {
  private head: Vec2 = { x: 0, z: 0 };
  private crumbs: Vec2[] = []; // head-first breadcrumbs behind the head
  private heading = 0;
  private length: number = MOVE.MIN_LENGTH;
  private alive = false;

  reset(): void {
    this.alive = false;
    this.crumbs = [];
  }

  /** Seed prediction from the authoritative snake (spawn / first packet / respawn). */
  private seed(auth: NetSnake): void {
    this.head = { x: auth.segments[0].x, z: auth.segments[0].z };
    this.crumbs = auth.segments.slice(1).map((s) => ({ x: s.x, z: s.z }));
    this.heading = auth.heading;
    this.length = auth.length;
    this.alive = true;
  }

  /**
   * Advance one frame. `auth` is the newest authoritative local snake (or null/dead),
   * `staleness` is seconds since that snapshot arrived. Returns the predicted body to
   * render, or null when there's nothing to predict (dead / no data).
   */
  step(auth: NetSnake | null | undefined, input: LocalInput, dt: number, staleness: number): PredictionResult | null {
    if (!auth || !auth.alive || auth.segments.length === 0) {
      this.alive = false;
      return null;
    }
    if (!this.alive) {
      this.seed(auth);
      return this.build();
    }

    // Grow FORWARD: when the server reports we grew (ate), extend the head forward by the
    // gained length so new segments appear at the front and the tail stays put.
    const grew = auth.length - this.length;
    if (grew > 0.001) {
      this.head = { x: this.head.x + Math.cos(this.heading) * MOVE.SEGMENT_SPACING * grew, z: this.head.z + Math.sin(this.heading) * MOVE.SEGMENT_SPACING * grew };
    }
    this.length = auth.length;
    const step = Math.min(dt, 0.05); // clamp long frames (tab was backgrounded)

    // Turn toward the player's live target; move at the intended speed.
    this.heading = rotateToward(this.heading, input.targetHeading, TURN * step);
    const speed = input.boosting ? BOOST : SPEED;
    let nx = this.head.x + Math.cos(this.heading) * speed * step;
    let nz = this.head.z + Math.sin(this.heading) * speed * step;

    // Reconcile toward where the server head actually is *now* — the authoritative head
    // extrapolated forward by its own motion over the snapshot's staleness. Soft, so
    // small mispredictions ease out instead of snapping (no rubber-banding).
    const authSpeed = auth.boosting ? BOOST : SPEED;
    const authNowX = auth.segments[0].x + Math.cos(auth.heading) * authSpeed * staleness;
    const authNowZ = auth.segments[0].z + Math.sin(auth.heading) * authSpeed * staleness;
    nx += (authNowX - nx) * RECONCILE;
    nz += (authNowZ - nz) * RECONCILE;

    this.head = { x: nx, z: nz };

    // Drop a breadcrumb when the head has moved far enough (fps-independent density).
    const lead = this.crumbs[0];
    if (!lead || Math.hypot(nx - lead.x, nz - lead.z) >= CRUMB_STEP) {
      this.crumbs.unshift({ x: nx, z: nz });
    }
    // Trim breadcrumbs to just longer than the body needs (by arc length).
    const needLen = (segmentCount(this.length) + 2) * MOVE.SEGMENT_SPACING;
    let acc = 0;
    let cut = this.crumbs.length;
    for (let i = 1; i < this.crumbs.length; i += 1) {
      acc += Math.hypot(this.crumbs[i].x - this.crumbs[i - 1].x, this.crumbs[i].z - this.crumbs[i - 1].z);
      if (acc >= needLen) {
        cut = i + 1;
        break;
      }
    }
    if (this.crumbs.length > cut) this.crumbs.length = cut;

    return this.build();
  }

  private build(): PredictionResult {
    const path = [this.head, ...this.crumbs];
    const segments = sampleTrail(path, segmentCount(this.length), this.heading);
    return { segments, head: this.head, heading: this.heading };
  }
}
