/**
 * Format MIX (gender campur) — tiap tim = 1 pria + 1 wanita.
 *
 *  - Mix Americano (statik): tiap pria berpasangan dgn SETIAP wanita (sekali);
 *    pasangan campur diadu sebagai match. Analog Americano tapi pada graf
 *    bipartit (pria × wanita).
 *  - Mixicano (dinamis): tiap ronde pasangan campur dibentuk dari peringkat,
 *    matchup diseimbangkan; istirahat dirotasi adil (seperti Mexicano).
 *
 * Catatan: setiap match memakai 2 pria + 2 wanita. Bila jumlah pria ≠ wanita,
 * gender yang lebih sedikit otomatis main lebih sering (sifat alami mix).
 */

import type { PlayerId, Round, Match } from "./types.js";

/* Pemaket ronde recency-aware (berbasis PlayerId) — sama prinsip dgn Americano:
   tiap ronde utamakan pemain yang baru istirahat → tak ada main beruntun. */
function packMatchesIntoRounds(
  matches: readonly (readonly [PlayerId, PlayerId, PlayerId, PlayerId])[],
  players: readonly PlayerId[],
  courts: number
): Round[] {
  const remaining = matches.slice();
  const consec = new Map<PlayerId, number>();
  const played = new Map<PlayerId, number>();
  for (const p of players) {
    consec.set(p, 0);
    played.set(p, 0);
  }
  const buckets: {
    ms: (readonly [PlayerId, PlayerId, PlayerId, PlayerId])[];
    using: Set<PlayerId>;
  }[] = [];

  while (remaining.length) {
    const using = new Set<PlayerId>();
    const ms: (readonly [PlayerId, PlayerId, PlayerId, PlayerId])[] = [];
    while (ms.length < courts) {
      let bestK = -1;
      let bestScore = Infinity;
      let bestTie = Infinity;
      for (let k = 0; k < remaining.length; k++) {
        const m = remaining[k]!;
        if (m.some((p) => using.has(p))) continue;
        let score = 0;
        let tie = 0;
        for (const p of m) {
          score += consec.get(p)!;
          tie += played.get(p)!;
        }
        if (score < bestScore || (score === bestScore && tie < bestTie)) {
          bestScore = score;
          bestTie = tie;
          bestK = k;
        }
      }
      if (bestK < 0) break;
      const picked = remaining.splice(bestK, 1)[0]!;
      ms.push(picked);
      for (const p of picked) using.add(p);
    }
    for (const p of players) {
      if (using.has(p)) {
        consec.set(p, consec.get(p)! + 1);
        played.set(p, played.get(p)! + 1);
      } else {
        consec.set(p, 0);
      }
    }
    buckets.push({ ms, using });
  }

  // Rapikan: ronde yang belum penuh (bukan yang terakhir) ditambal dengan match
  // dari ronde berikutnya yang tak bentrok; yang tetap tak penuh digeser ke
  // belakang. Hasilnya ronde lebih sedikit & lapangan tak menganggur di tengah.
  for (let i = 0; i < buckets.length; i++) {
    const here = buckets[i]!;
    for (let j = i + 1; j < buckets.length && here.ms.length < courts; j++) {
      const later = buckets[j]!;
      for (let k = 0; k < later.ms.length && here.ms.length < courts; k++) {
        const mm = later.ms[k]!;
        if (mm.some((p) => here.using.has(p))) continue;
        here.ms.push(mm);
        for (const p of mm) here.using.add(p);
        later.ms.splice(k, 1);
        for (const p of mm) later.using.delete(p);
        k -= 1;
      }
    }
  }
  const nonEmpty = buckets.filter((bk) => bk.ms.length > 0);
  const ordered = [
    ...nonEmpty.filter((bk) => bk.ms.length >= courts),
    ...nonEmpty.filter((bk) => bk.ms.length < courts),
  ];

  return ordered.map((bk, idx) => ({
    index: idx,
    matches: bk.ms.map((m, c) => ({
      court: c + 1,
      teamA: [m[0], m[1]] as [PlayerId, PlayerId],
      teamB: [m[2], m[3]] as [PlayerId, PlayerId],
    })),
    resting: players.filter((p) => !bk.using.has(p)),
  }));
}

export interface MixOptions {
  courts?: number;
}

/**
 * Mix Americano: round-robin pasangan campur PENUH. Tiap pria berpasangan
 * dengan tiap wanita sekali; pasangan dijodohkan jadi match (2 pasangan,
 * pria & wanita berbeda). Tim selalu [pria, wanita].
 */
export function generateMixAmericano(
  males: readonly PlayerId[],
  females: readonly PlayerId[],
  opts: MixOptions = {}
): Round[] {
  if (males.length < 2 || females.length < 2) {
    throw new Error("Mix Americano needs at least 2 men and 2 women.");
  }
  const maxCourts = Math.min(
    Math.floor(males.length / 2),
    Math.floor(females.length / 2)
  );
  const courts = opts.courts ?? Math.max(1, maxCourts);
  if (courts < 1 || courts > maxCourts) {
    throw new Error(
      `Invalid courts: max ${maxCourts} for ${males.length} men & ${females.length} women.`
    );
  }

  // 1. GELOMBANG pasangan campur: pewarnaan sisi graf bipartit pria×wanita —
  //    pasangan (i,j) masuk gelombang (i+j) mod L, L = max(#pria, #wanita).
  //    Satu gelombang berisi pasangan yang SALING LEPAS dan seluruhnya menutup
  //    semua kombinasi pria×wanita tepat sekali.
  const L = Math.max(males.length, females.length);
  const waves: [PlayerId, PlayerId][][] = Array.from({ length: L }, () => []);
  males.forEach((m, i) =>
    females.forEach((f, j) => waves[(i + j) % L]!.push([m, f]))
  );

  // 2. Pasangan dalam satu gelombang dijodohkan jadi match, memilih kombinasi
  //    dengan pengulangan lawan TERKECIL (dikuadratkan supaya menyebar, bukan
  //    menumpuk di segelintir orang). Sisa gelombang ganjil ditunda.
  const opp = new Map<string, number>();
  const oppKey = (a: PlayerId, b: PlayerId) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  const oppOf = (a: PlayerId, b: PlayerId) => opp.get(oppKey(a, b)) ?? 0;
  const matches: [PlayerId, PlayerId, PlayerId, PlayerId][] = [];

  const cost = (x: [PlayerId, PlayerId], y: [PlayerId, PlayerId]): number => {
    let c = 0;
    for (const a of x) for (const b of y) c += oppOf(a, b) ** 2;
    return c;
  };
  const commit = (x: [PlayerId, PlayerId], y: [PlayerId, PlayerId]) => {
    matches.push([x[0], x[1], y[0], y[1]]);
    for (const a of x)
      for (const b of y) opp.set(oppKey(a, b), oppOf(a, b) + 1);
  };
  /** Pria & wanita harus berbeda antar dua tim dalam satu match. */
  const compatible = (
    x: [PlayerId, PlayerId],
    y: [PlayerId, PlayerId]
  ): boolean => x[0] !== y[0] && x[1] !== y[1];

  const drain = (pool: [PlayerId, PlayerId][]) => {
    for (;;) {
      let bi = -1;
      let bj = -1;
      let best = Infinity;
      for (let i = 0; i < pool.length; i++)
        for (let j = i + 1; j < pool.length; j++) {
          if (!compatible(pool[i]!, pool[j]!)) continue;
          const c = cost(pool[i]!, pool[j]!);
          if (c < best) {
            best = c;
            bi = i;
            bj = j;
          }
        }
      if (bi < 0) break;
      commit(pool[bi]!, pool[bj]!);
      pool.splice(bj, 1);
      pool.splice(bi, 1);
    }
  };

  const pending: [PlayerId, PlayerId][] = [];
  for (const wave of waves) {
    const pool = [...wave, ...pending.splice(0)];
    drain(pool);
    pending.push(...pool);
  }
  drain(pending);

  return packMatchesIntoRounds(matches, [...males, ...females], courts);
}

/**
 * Satu ronde Mixicano dari pria & wanita yang SUDAH diurut peringkat
 * (terbaik di indeks 0). Tim campur dibentuk seimbang; istirahat dirotasi adil.
 */
export function nextMixicanoRound(
  rankedMales: readonly PlayerId[],
  rankedFemales: readonly PlayerId[],
  roundIndex: number,
  opts: MixOptions & { restCount?: Record<PlayerId, number> } = {}
): Round {
  if (rankedMales.length < 2 || rankedFemales.length < 2) {
    throw new Error("Mixicano needs at least 2 men and 2 women.");
  }
  const maxCourts = Math.min(
    Math.floor(rankedMales.length / 2),
    Math.floor(rankedFemales.length / 2)
  );
  const courts = opts.courts ?? Math.max(1, maxCourts);
  const perGender = courts * 2; // pria & wanita aktif per ronde

  const rc = opts.restCount ?? {};
  // Pilih yang AKTIF per gender: istirahatkan yang paling sedikit istirahat.
  const pick = (ranked: readonly PlayerId[]): PlayerId[] => {
    if (ranked.length <= perGender) return [...ranked];
    const restSet = new Set(
      ranked
        .map((id, rank) => ({ id, rank }))
        .sort((a, b) => (rc[a.id] ?? 0) - (rc[b.id] ?? 0) || b.rank - a.rank)
        .slice(0, ranked.length - perGender)
        .map((x) => x.id)
    );
    return ranked.filter((id) => !restSet.has(id)); // tetap urut peringkat
  };
  const m = pick(rankedMales);
  const f = pick(rankedFemales);

  const matches: Match[] = [];
  for (let c = 0; c < courts; c++) {
    // Per lapangan: 2 pria & 2 wanita berurutan. Seimbangkan: pria kuat + wanita
    // lemah vs pria lemah + wanita kuat.
    const [m1, m2] = [m[c * 2]!, m[c * 2 + 1]!];
    const [f1, f2] = [f[c * 2]!, f[c * 2 + 1]!];
    matches.push({ court: c + 1, teamA: [m1, f2], teamB: [m2, f1] });
  }
  const active = new Set([...m, ...f]);
  const resting = [...rankedMales, ...rankedFemales].filter(
    (p) => !active.has(p)
  );
  return { index: roundIndex, matches, resting };
}
