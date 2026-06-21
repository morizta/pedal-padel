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
  /**
   * Berapa kali tiap pemain SUDAH istirahat sejauh ini (id → jumlah). Dipakai
   * untuk **rotasi bye yang adil**: bila ada yang harus istirahat, pilih pemain
   * yang paling sedikit istirahat — bukan sekadar peringkat terbawah. Tanpa ini
   * (DEF-3), pemain yang sekali kena bye di awal bisa mandek di dasar klasemen
   * dan istirahat selamanya. Kosongkan untuk ronde pertama.
   */
  restCount?: Record<PlayerId, number>;
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
  const restN = rankedPlayers.length - perRound;

  let active: readonly PlayerId[];
  let resting: PlayerId[];
  if (restN <= 0) {
    active = rankedPlayers.slice(0, perRound);
    resting = rankedPlayers.slice(perRound);
  } else {
    // Rotasi bye adil: istirahatkan pemain yang PALING SEDIKIT istirahat.
    // Tie-break: peringkat lebih rendah (indeks besar) istirahat lebih dulu.
    const rc = opts.restCount ?? {};
    const restSet = new Set(
      rankedPlayers
        .map((id, rank) => ({ id, rank }))
        .sort((a, b) => (rc[a.id] ?? 0) - (rc[b.id] ?? 0) || b.rank - a.rank)
        .slice(0, restN)
        .map((x) => x.id)
    );
    resting = rankedPlayers.filter((id) => restSet.has(id));
    active = rankedPlayers.filter((id) => !restSet.has(id)); // tetap urut peringkat
  }

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
