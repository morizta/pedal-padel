/**
 * Sistem rating ELO individual untuk olahraga GANDA (padel).
 *
 * Karena padel selalu 2v2, rating tim = rata-rata rating 2 pemainnya.
 * Setelah match, tiap pemain di sebuah tim mendapat delta yang sama.
 *
 * Keputusan desain (lihat DESIGN.md §9):
 *  - Margin-aware: hasil aktual memakai RASIO skor, bukan sekadar menang/kalah.
 *    Menang 32-10 menggeser rating lebih besar daripada menang 32-30.
 *  - K-factor dinamis: pemain baru (sedikit match) bergerak lebih cepat.
 */

import type { MatchResult, PlayerId, RatedPlayer } from "./types.js";

/** Rating awal untuk pemain baru. */
export const DEFAULT_RATING = 1000;

/** Ambang "match" sebelum rating dianggap stabil → di bawah ini K besar. */
export const PROVISIONAL_MATCHES = 20;

/** K-factor saat masih provisional (rating belum stabil). */
export const K_PROVISIONAL = 40;

/** K-factor setelah established. */
export const K_STABLE = 20;

/**
 * Reliability 0..1 — proporsi menuju "validated".
 * Naik linear sampai PROVISIONAL_MATCHES, lalu mentok 1.
 */
export function reliability(matchesPlayed: number): number {
  return Math.min(1, matchesPlayed / PROVISIONAL_MATCHES);
}

/** K-factor berdasarkan jumlah match yang sudah dimainkan. */
export function kFactor(matchesPlayed: number): number {
  return matchesPlayed < PROVISIONAL_MATCHES ? K_PROVISIONAL : K_STABLE;
}

/**
 * Ekspektasi skor tim A vs tim B (0..1) memakai kurva logistik ELO standar.
 * E_A = 1 / (1 + 10^((R_B - R_A)/400))
 */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Hasil aktual tim A (0..1) dari skor pertandingan.
 * Margin-aware: rasio poin. Jika seri 0-0 (match belum main) → 0.5.
 */
export function actualScore(scoreA: number, scoreB: number): number {
  const total = scoreA + scoreB;
  if (total <= 0) return 0.5;
  return scoreA / total;
}

/** Perubahan rating satu pemain pada satu match. */
export interface RatingChange {
  playerId: PlayerId;
  before: number;
  after: number;
  delta: number;
}

/**
 * Hitung perubahan rating untuk keempat pemain dari satu match.
 * Mengembalikan map playerId → RatingChange.
 *
 * Catatan: kedua pemain dalam satu tim mendapat delta sama (rata-rata).
 * matchesPlayed dibaca dari masing-masing pemain → K-factor per pemain.
 */
export function rateMatch(
  result: MatchResult,
  players: Record<PlayerId, RatedPlayer>
): Record<PlayerId, RatingChange> {
  const { match, scoreA, scoreB } = result;
  const [a1, a2] = match.teamA;
  const [b1, b2] = match.teamB;

  const pa1 = required(players, a1);
  const pa2 = required(players, a2);
  const pb1 = required(players, b1);
  const pb2 = required(players, b2);

  const ratingA = (pa1.rating + pa2.rating) / 2;
  const ratingB = (pb1.rating + pb2.rating) / 2;

  const expA = expectedScore(ratingA, ratingB);
  const expB = 1 - expA;
  const actA = actualScore(scoreA, scoreB);
  const actB = 1 - actA;

  const change = (
    p: RatedPlayer,
    exp: number,
    act: number
  ): RatingChange => {
    const delta = kFactor(p.matchesPlayed) * (act - exp);
    return {
      playerId: p.id,
      before: p.rating,
      after: p.rating + delta,
      delta,
    };
  };

  return {
    [a1]: change(pa1, expA, actA),
    [a2]: change(pa2, expA, actA),
    [b1]: change(pb1, expB, actB),
    [b2]: change(pb2, expB, actB),
  };
}

function required(
  players: Record<PlayerId, RatedPlayer>,
  id: PlayerId
): RatedPlayer {
  const p = players[id];
  if (!p) throw new Error(`Pemain tidak ditemukan di rating map: ${id}`);
  return p;
}
