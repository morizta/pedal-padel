/**
 * Generator jadwal Americano (format individual) — ROUND-ROBIN PASANGAN.
 *
 * Inti Americano: tiap pemain BERPASANGAN dengan setiap pemain lain (sekali),
 * lalu pasangan-pasangan diadu sebagai match. Dibangun via circle method:
 *  - Tiap "ronde pasangan" membentuk pasangan disjoint yang menutup semua pemain.
 *  - Sepanjang N−1 ronde, tiap pemain berpasangan dengan tiap pemain tepat sekali.
 *  - Pasangan-pasangan lalu dijodohkan 2-2 menjadi match dan dipak ke lapangan;
 *    bila tak habis dibagi, ronde terakhir memakai lebih sedikit lapangan.
 *
 * Catatan: untuk N kelipatan 4 hasilnya sempurna. Untuk N ≡ 2 (mod 4), tiap
 * ronde tersisa satu pasangan yang beristirahat (mereka tetap tercatat sebagai
 * pasangan, namun tak selalu sempat bermain) — keterbatasan kombinatorik wajar.
 */

import type { PlayerId, Round } from "./types.js";

export interface AmericanoOptions {
  /** Jumlah lapangan. Default: sebanyak mungkin = floor(N/4). */
  courts?: number;
}

/**
 * Circle method: hasilkan daftar "ronde pasangan". Tiap ronde = pasangan
 * (indeks pemain) disjoint. Sepanjang semua ronde tiap pasangan muncul sekali.
 */
function partnershipRounds(n: number): [number, number][][] {
  const order: number[] = Array.from({ length: n }, (_, k) => k);
  if (n % 2 === 1) order.push(-1); // pemain "bye" semu bila ganjil
  const m = order.length;
  const half = m / 2;
  const rounds: [number, number][][] = [];

  for (let r = 0; r < m - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < half; i++) {
      const a = order[i]!;
      const b = order[m - 1 - i]!;
      if (a !== -1 && b !== -1) pairs.push([a, b]);
    }
    rounds.push(pairs);
    order.splice(1, 0, order.pop()!); // rotasi: pemain pertama tetap
  }
  return rounds;
}

export function generateAmericano(
  players: readonly PlayerId[],
  opts: AmericanoOptions = {}
): Round[] {
  const n = players.length;
  if (n < 4) throw new Error("Americano butuh minimal 4 pemain.");

  const courts = opts.courts ?? Math.floor(n / 4);
  if (courts < 1) throw new Error("Butuh minimal 1 lapangan (≥4 pemain).");
  if (courts * 4 > n) {
    throw new Error(
      `Lapangan terlalu banyak: butuh ${courts * 4} pemain untuk ${courts} lapangan, hanya ada ${n}.`
    );
  }

  // 1. Tentukan SEMUA match (4 pemain) dari round-robin pasangan, dengan
  //    pemilihan pasangan-istirahat yang adil (bila jumlah pasangan ganjil).
  const restCount = new Array<number>(n).fill(0);
  const allMatches: [number, number, number, number][] = [];

  for (const pairs of partnershipRounds(n)) {
    let active = pairs;
    if (pairs.length % 2 === 1) {
      // Pilih pasangan istirahat: minimkan max(rest) lalu total rest → adil.
      let dropIdx = 0;
      let bestMax = Infinity;
      let bestSum = Infinity;
      for (let i = 0; i < pairs.length; i++) {
        const [a, b] = pairs[i]!;
        const hi = Math.max(restCount[a]!, restCount[b]!);
        const sum = restCount[a]! + restCount[b]!;
        if (hi < bestMax || (hi === bestMax && sum < bestSum)) {
          bestMax = hi;
          bestSum = sum;
          dropIdx = i;
        }
      }
      const [ra, rb] = pairs[dropIdx]!;
      restCount[ra] = restCount[ra]! + 1;
      restCount[rb] = restCount[rb]! + 1;
      active = pairs.filter((_, i) => i !== dropIdx);
    }
    for (let i = 0; i + 1 < active.length; i += 2) {
      const [a, b] = active[i]!;
      const [c, d] = active[i + 1]!;
      allMatches.push([a, b, c, d]);
    }
  }

  // 2. Pak SEMUA match secara global ke lapangan: tiap ronde memaksimalkan
  //    lapangan (≤ courts) tanpa pemain main dua kali. Ronde parsial hanya di akhir.
  const buckets: { ms: [number, number, number, number][]; using: Set<number> }[] =
    [];
  for (const m of allMatches) {
    let placed = false;
    for (const bk of buckets) {
      if (bk.ms.length < courts && !m.some((p) => bk.using.has(p))) {
        bk.ms.push(m);
        for (const p of m) bk.using.add(p);
        placed = true;
        break;
      }
    }
    if (!placed) buckets.push({ ms: [m], using: new Set(m) });
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
