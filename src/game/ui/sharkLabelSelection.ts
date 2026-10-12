import type { Edibility } from "./edibility.js";

export interface SharkLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  me: boolean;
  apex: boolean;
  edibility: Edibility | null;
  distance: number;
}

export function sharkLabelOpacity(distance: number): number {
  return Number.isFinite(distance) ? Math.max(0, Math.min(1, (55 - distance) / 25)) : 0;
}

/** A new local life, round or connection starts one three-second orientation label. */
export class OwnLabelLifetime {
  private key: string | null = null;
  private since = 0;

  sample(id: string | null, alive: boolean, round: number, connected: boolean, nowMs: number): number {
    const next = id && alive && connected ? `${id}:${round}` : null;
    if (next !== this.key) { this.key = next; this.since = nowMs; }
    return next ? Math.max(0, nowMs - this.since) : Infinity;
  }
}

export function selectSharkLabels(labels: readonly SharkLabel[], ownAgeMs: number): SharkLabel[] {
  const priority = (label: SharkLabel) => label.apex ? 0 : label.edibility === "threat" ? 1 : 2;
  return labels.filter((label) => sharkLabelOpacity(label.distance) > 0 && (!label.me || ownAgeMs < 3000))
    .sort((a, b) => priority(a) - priority(b) || a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, 5);
}

/** SVG geometry keeps dynamic layout out of DOM inline-style surfaces. */
export function sharkLabelBox(label: SharkLabel, width: number, height: number, hudBottom: number, offsetX = 0, offsetY = 0) {
  const boxWidth = Math.max(0, Math.min(180, width - 12));
  const center = Math.max(boxWidth / 2 + 6, Math.min(width - boxWidth / 2 - 6, label.x - offsetX));
  return { x: center - boxWidth / 2, y: Math.max(hudBottom, Math.min(height - 32, label.y - offsetY - 38)), width: boxWidth, height: 32 };
}
