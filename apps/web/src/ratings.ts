/**
 * Hitung rating ELO global dari urutan hasil match, mulai dari rating awal.
 * Dipakai untuk leaderboard ELO di UI (di produksi nanti ini disimpan di DB
 * lewat RatingHistory, bukan dihitung ulang dari nol).
 */
import {
  rateMatch,
  DEFAULT_RATING,
  type MatchResult,
  type PlayerId,
  type RatedPlayer,
} from "@pedal/engine";

export interface RatingRow extends RatedPlayer {
  name: PlayerId;
}

export function computeRatings(
  playerIds: readonly PlayerId[],
  results: readonly MatchResult[]
): RatingRow[] {
  const players: Record<PlayerId, RatedPlayer> = {};
  for (const id of playerIds) {
    players[id] = { id, rating: DEFAULT_RATING, matchesPlayed: 0 };
  }

  for (const res of results) {
    const changes = rateMatch(res, players);
    for (const id of Object.keys(changes)) {
      const p = players[id]!;
      p.rating = changes[id]!.after;
      p.matchesPlayed += 1;
    }
  }

  return Object.values(players)
    .map((p) => ({ ...p, name: p.id }))
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
}
