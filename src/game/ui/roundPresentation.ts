import { tierForLength } from "../../engine/index.js";
import type { NetState, ScoreEntry } from "../../protocol/index.js";
import { rankedScores } from "./Leaderboard.js";

/** Existing snapshots contain every shark; retain the server's winner if it left. */
export function roundStandings(state: NetState, youId: string | null) {
  const winner = state.round.result?.winner ?? null;
  const ranked = rankedScores(state.sharks.filter((shark) => shark.id !== winner?.id));
  if (winner) ranked.unshift(winner);
  const index = ranked.findIndex((shark) => shark.id === youId);
  const local = state.sharks.find((shark) => shark.id === youId);
  return {
    podium: state.round.result && winner ? ranked.slice(0, 3).map(({ id, name, score }) => ({ id, name, score })) : [],
    localRank: index >= 0 ? index + 1 : null,
    localScore: index >= 0 ? ranked[index].score : 0,
    localTier: local ? tierForLength(local.length) : null,
  };
}

/** Freeze only result presentation; a new round or connection starts a fresh view. */
export class RoundStandingsTracker {
  private result: { key: string; standings: ReturnType<typeof roundStandings> } | null = null;

  sample(state: NetState, youId: string | null) {
    if (state.round.phase !== "result") { this.result = null; return roundStandings(state, youId); }
    const key = `${state.round.number}:${youId}`;
    if (this.result?.key !== key) this.result = { key, standings: roundStandings(state, youId) };
    return this.result.standings;
  }
}

export interface RoundUiState {
  number: number;
  phase: "active" | "apex" | "result";
  secondsLeft: number;
  apexName: string | null;
  winnerName: string | null;
  winnerScore: number | null;
  localScore: number;
  localRank: number | null;
  localTier: string | null;
  podium: Array<Pick<ScoreEntry, "id" | "name" | "score">>;
}

export function respawnCountdown(at: number, durationMs: number, now: number) {
  const left = Math.max(0, Math.min(durationMs, at + durationMs - now));
  return { remaining: Math.ceil(left / 1000), progress: durationMs > 0 ? 1 - left / durationMs : 1 };
}
