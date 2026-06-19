/**
 * Generator jadwal Americano (format individual) — ROUND-ROBIN PASANGAN PENUH.
 *
 * Inti Americano: tiap pemain BERPASANGAN dengan SETIAP pemain lain tepat sekali.
 * Algoritma:
 *  1. Bangkitkan SEMUA pasangan unik (C(n,2) "edge" dari graf lengkap K_n).
 *  2. Jodohkan pasangan-pasangan menjadi match (2 pasangan beda-pemain = 4 orang),
 *     greedy berdasar jumlah main → tiap pemain main merata.
 *  3. Pak match ke ronde/lapangan secara recency-aware (tak ada main beruntun).
 *
 * Sifat hasil:
 *  - N ≡ 0/1 (mod 4): C(n,2) genap → SEMUA pasangan terjodohkan; tiap pemain
 *    main n−1 kali (gap 0).
 *  - N ≡ 2/3 (mod 4): C(n,2) ganjil → TEPAT satu pasangan tak kebagian match;
 *    dua pemainnya main n−2, sisanya n−1 (gap 1) — optimal, sama seperti
 *    Americano "lengkap" pada aplikasi sejenis.
 */

import type { PlayerId, Round } from "./types.js";

export interface AmericanoOptions {
  /** Jumlah lapangan. Default: sebanyak mungkin = floor(N/4). */
  courts?: number;
}

export function generateAmericano(
  players: readonly PlayerId[],
  opts: AmericanoOptions = {}
): Round[] {
  const n = players.length;
  if (n < 4) throw new Error("Americano needs at least 4 players.");

  const courts = opts.courts ?? Math.floor(n / 4);
  if (courts < 1) throw new Error("Needs at least 1 court (≥4 players).");
  if (courts * 4 > n) {
    throw new Error(
      `Too many courts: need ${courts * 4} players for ${courts} courts, only ${n} available.`
    );
  }

  // 1. Semua pasangan unik (edge K_n).
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) edges.push([i, j]);

  // 2. Jodohkan pasangan → match (2 pasangan disjoint = 4 pemain). Greedy: mulai
  //    dari pasangan dgn pemain paling sedikit main, lalu cari pasangan disjoint
  //    yang juga paling sedikit main → distribusi main merata (gap ≤1). Pasangan
  //    yang tak bisa dijodohkan (hanya mungkin bila C(n,2) ganjil) dibiarkan —
  //    itulah satu-satunya pasangan yang "absen".
  const used = new Array<boolean>(edges.length).fill(false);
  const playCount = new Array<number>(n).fill(0);
  const allMatches: [number, number, number, number][] = [];

  for (;;) {
    // Seed: pasangan belum-terpakai dgn total main terkecil.
    let e1 = -1;
    let best1 = Infinity;
    for (let k = 0; k < edges.length; k++) {
      if (used[k]) continue;
      const [a, b] = edges[k]!;
      const s = playCount[a]! + playCount[b]!;
      if (s < best1) {
        best1 = s;
        e1 = k;
      }
    }
    if (e1 < 0) break; // semua pasangan terpakai

    const [a, b] = edges[e1]!;
    // Partner: pasangan disjoint (tak berbagi pemain) dgn total main terkecil.
    let e2 = -1;
    let best2 = Infinity;
    for (let k = 0; k < edges.length; k++) {
      if (used[k] || k === e1) continue;
      const [c, d] = edges[k]!;
      if (c === a || c === b || d === a || d === b) continue;
      const s = playCount[c]! + playCount[d]!;
      if (s < best2) {
        best2 = s;
        e2 = k;
      }
    }
    if (e2 < 0) {
      used[e1] = true; // tak ada pasangan disjoint → pasangan ini absen
      continue;
    }
    used[e1] = true;
    used[e2] = true;
    const [c, d] = edges[e2]!;
    allMatches.push([a, b, c, d]);
    playCount[a] = playCount[a]! + 1;
    playCount[b] = playCount[b]! + 1;
    playCount[c] = playCount[c]! + 1;
    playCount[d] = playCount[d]! + 1;
  }

  // 2. Penjadwalan RECENCY-AWARE: bangun ronde satu per satu; tiap ronde
  //    memprioritaskan pemain yang BARU istirahat → tak ada "main beruntun"
  //    panjang (memperbaiki DEF-1). Tetap memaksimalkan lapangan (ronde penuh
  //    kecuali yang terakhir) & tak ada pemain main dua kali per ronde.
  const remaining = allMatches.slice();
  const consec = new Array<number>(n).fill(0); // ronde main beruntun s/d ronde lalu
  const playedTotal = new Array<number>(n).fill(0); // total main (tie-break keadilan)
  const buckets: { ms: [number, number, number, number][]; using: Set<number> }[] =
    [];

  while (remaining.length) {
    const using = new Set<number>();
    const ms: [number, number, number, number][] = [];
    while (ms.length < courts) {
      // Pilih match bebas-konflik dgn "tekanan main" terkecil:
      //   utama  = Σ consec[p]  → utamakan pemain yang baru istirahat
      //   tie    = Σ playedTotal[p] → utamakan yang lebih jarang main
      let bestK = -1;
      let bestScore = Infinity;
      let bestTie = Infinity;
      for (let k = 0; k < remaining.length; k++) {
        const m = remaining[k]!;
        if (m.some((p) => using.has(p))) continue;
        let score = 0;
        let tie = 0;
        for (const p of m) {
          score += consec[p]!;
          tie += playedTotal[p]!;
        }
        if (score < bestScore || (score === bestScore && tie < bestTie)) {
          bestScore = score;
          bestTie = tie;
          bestK = k;
        }
      }
      if (bestK < 0) break; // tak ada match bebas-konflik lagi → ronde (parsial) selesai
      const picked = remaining.splice(bestK, 1)[0]!;
      ms.push(picked);
      for (const p of picked) using.add(p);
    }
    // Perbarui streak: yang main → consec++ & total++; yang istirahat → consec=0.
    for (let p = 0; p < n; p++) {
      if (using.has(p)) {
        consec[p] = consec[p]! + 1;
        playedTotal[p] = playedTotal[p]! + 1;
      } else {
        consec[p] = 0;
      }
    }
    buckets.push({ ms, using });
  }

  return buckets.map((bk, idx) => ({
    index: idx,
    matches: bk.ms.map((m, c) => ({
      court: c + 1,
      teamA: [players[m[0]]!, players[m[1]]!],
      teamB: [players[m[2]]!, players[m[3]]!],
    })),
    resting: players.filter((_, pi) => !bk.using.has(pi)),
  }));
}
