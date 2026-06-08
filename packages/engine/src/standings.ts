/**
 * Klasemen event (leaderboard individual dalam satu sesi).
 *
 * Menghitung statistik per pemain dari kumpulan hasil match:
 *  - points     : total poin game yang diraih
 *  - wins/losses/ties + winRate
 *  - gamesDiff  : selisih poin (untuk poin yang diraih − kebobolan)
 *  - played     : jumlah match dimainkan
 *
 * Fitur fairness `+M` (compensation): pemain yang main lebih SEDIKIT (karena
 * bye/istirahat) tidak dirugikan. Tiap match yang terlewat dikompensasi
 * dengan rata-rata poin per match pemain itu. Leaderboard final diurutkan
 * berdasarkan poin TERKOMPENSASI (points + compensation).
 *
 * Tie-breaker: poin terkompensasi → selisih game → menang → nama.
 */

import type { MatchResult, PlayerId } from "./types.js";

export interface Standing {
  playerId: PlayerId;
  points: number;
  /** Poin kompensasi (+M) karena main lebih sedikit dari pemain terbanyak. */
  compensation: number;
  /** points + compensation — dasar pemeringkatan. */
  adjustedPoints: number;
  gamesDiff: number;
  wins: number;
  losses: number;
  ties: number;
  played: number;
  /** wins / played (0..1); 0 bila belum main. */
  winRate: number;
}

export interface StandingsOptions {
  /**
   * Aktifkan poin kompensasi `+M`. Default true.
   * Pemain baru dipertimbangkan hanya jika muncul di results.
   */
  compensate?: boolean;
}

export function computeStandings(
  results: readonly MatchResult[],
  opts: StandingsOptions = {}
): Standing[] {
  const compensate = opts.compensate ?? true;
  const table = new Map<PlayerId, Standing>();

  const ensure = (id: PlayerId): Standing => {
    let s = table.get(id);
    if (!s) {
      s = {
        playerId: id,
        points: 0,
        compensation: 0,
        adjustedPoints: 0,
        gamesDiff: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        played: 0,
        winRate: 0,
      };
      table.set(id, s);
    }
    return s;
  };

  const apply = (
    id: PlayerId,
    scoreFor: number,
    scoreAgainst: number
  ): void => {
    const s = ensure(id);
    s.points += scoreFor;
    s.gamesDiff += scoreFor - scoreAgainst;
    s.played += 1;
    if (scoreFor > scoreAgainst) s.wins += 1;
    else if (scoreFor < scoreAgainst) s.losses += 1;
    else s.ties += 1;
  };

  for (const { match, scoreA, scoreB } of results) {
    for (const id of match.teamA) apply(id, scoreA, scoreB);
    for (const id of match.teamB) apply(id, scoreB, scoreA);
  }

  const rows = [...table.values()];
  const maxPlayed = rows.reduce((m, s) => Math.max(m, s.played), 0);

  for (const s of rows) {
    s.winRate = s.played > 0 ? s.wins / s.played : 0;
    if (compensate && s.played > 0 && s.played < maxPlayed) {
      const avgPerMatch = s.points / s.played;
      s.compensation = Math.round(avgPerMatch * (maxPlayed - s.played));
    }
    s.adjustedPoints = s.points + s.compensation;
  }

  return rows.sort(
    (a, b) =>
      b.adjustedPoints - a.adjustedPoints ||
      b.gamesDiff - a.gamesDiff ||
      b.wins - a.wins ||
      a.playerId.localeCompare(b.playerId)
  );
}
