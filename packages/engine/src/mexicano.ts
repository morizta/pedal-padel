/**
 * Generator ronde Mexicano (format individual, DINAMIS).
 *
 * Beda dari Americano: pasangan ditentukan berdasarkan KLASEMEN sementara.
 * Per lapangan, 4 pemain berurutan dipasangkan peringkat (1+4) vs (2+3) agar
 * tiap lapangan seimbang. Ronde pertama (belum ada skor) memakai urutan awal.
 *
 * Cara pakai: setelah tiap ronde dimainkan, hitung ulang standings lalu panggil
 * nextMexicanoRound() dengan urutan pemain hasil klasemen terbaru.
 */

import type { PlayerId, Round, Match } from "./types.js";

export interface MexicanoOptions {
  courts?: number;
}

/**
 * Buat satu ronde Mexicano dari urutan pemain yang SUDAH diurutkan
 * (peringkat terbaik di indeks 0). Untuk ronde pertama, lewatkan urutan awal.
 */
export function nextMexicanoRound(
  rankedPlayers: readonly PlayerId[],
  roundIndex: number,
  opts: MexicanoOptions = {}
): Round {
  if (rankedPlayers.length < 4) {
    throw new Error("Mexicano needs at least 4 players.");
  }

  const courts = opts.courts ?? Math.floor(rankedPlayers.length / 4);
  const perRound = courts * 4;
  const active = rankedPlayers.slice(0, perRound);
  const resting = rankedPlayers.slice(perRound);

  const matches: Match[] = [];
  for (let c = 0; c < courts; c++) {
    // 4 pemain berurutan menurut peringkat: [p1, p2, p3, p4]
    const [p1, p2, p3, p4] = active.slice(c * 4, c * 4 + 4) as [
      PlayerId,
      PlayerId,
      PlayerId,
      PlayerId,
    ];
    // Seimbangkan lapangan: (terbaik + terlemah) vs (dua tengah).
    matches.push({
      court: c + 1,
      teamA: [p1, p4],
      teamB: [p2, p3],
    });
  }

  return { index: roundIndex, matches, resting };
}
