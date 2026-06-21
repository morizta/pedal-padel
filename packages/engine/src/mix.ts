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

  return buckets.map((bk, idx) => ({
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

  // Semua pasangan campur (edge bipartit pria×wanita).
  const edges: [PlayerId, PlayerId][] = [];
  for (const m of males) for (const f of females) edges.push([m, f]);

  // Jodohkan pasangan → match: 2 pasangan dgn pria BERBEDA & wanita BERBEDA.
  // Greedy: prioritas pemain paling sedikit main → distribusi merata.
  const used = new Array<boolean>(edges.length).fill(false);
  const play = new Map<PlayerId, number>();
  for (const p of [...males, ...females]) play.set(p, 0);
  const matches: [PlayerId, PlayerId, PlayerId, PlayerId][] = [];

  for (;;) {
    let e1 = -1;
    let best1 = Infinity;
    for (let k = 0; k < edges.length; k++) {
      if (used[k]) continue;
      const [m, f] = edges[k]!;
      const s = play.get(m)! + play.get(f)!;
      if (s < best1) {
        best1 = s;
        e1 = k;
      }
    }
    if (e1 < 0) break;
    const [m1, f1] = edges[e1]!;
    let e2 = -1;
    let best2 = Infinity;
    for (let k = 0; k < edges.length; k++) {
      if (used[k] || k === e1) continue;
      const [m2, f2] = edges[k]!;
      if (m2 === m1 || f2 === f1) continue; // pria & wanita harus beda
      const s = play.get(m2)! + play.get(f2)!;
      if (s < best2) {
        best2 = s;
        e2 = k;
      }
    }
    if (e2 < 0) {
      used[e1] = true; // tak ada pasangan pelengkap → pasangan ini absen
      continue;
    }
    used[e1] = true;
    used[e2] = true;
    const [m2, f2] = edges[e2]!;
    matches.push([m1, f1, m2, f2]);
    for (const p of [m1, f1, m2, f2]) play.set(p, play.get(p)! + 1);
  }

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
