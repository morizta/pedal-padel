/**
 * Tipe data inti engine. Sengaja "polos" (tanpa ketergantungan DB/UI) supaya
 * bisa dipakai ulang di web (Vite) maupun mobile (Expo) nanti.
 */

/** ID pemain — string apa saja (UUID dari Supabase, dll). */
export type PlayerId = string;

/** Format event yang didukung. */
export type EventFormat =
  | "americano"
  | "mexicano"
  | "team_americano"
  | "team_mexicano";

/** Pemain dengan rating untuk keperluan engine. */
export interface RatedPlayer {
  id: PlayerId;
  /** Rating ELO. Pemain baru default DEFAULT_RATING. */
  rating: number;
  /** Jumlah match resmi yang sudah dimainkan (memengaruhi K-factor). */
  matchesPlayed: number;
}

/** Satu pasangan (2 pemain) dalam satu match. */
export type Pair = readonly [PlayerId, PlayerId];

/** Satu pertandingan di satu lapangan dalam satu ronde. */
export interface Match {
  court: number;
  teamA: Pair;
  teamB: Pair;
}

/** Satu ronde berisi beberapa match (satu per lapangan) + pemain yang "bye". */
export interface Round {
  index: number;
  matches: Match[];
  /** Pemain yang tidak kebagian main di ronde ini (jika jumlah ganjil/sisa). */
  resting: PlayerId[];
}

/** Skor satu match (poin game yang diraih masing-masing tim). */
export interface MatchResult {
  match: Match;
  scoreA: number;
  scoreB: number;
}
