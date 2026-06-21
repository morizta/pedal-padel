/**
 * Format TIM (pasangan tetap).
 *
 * Beda dari Americano/Mexicano individual: tiap tim = pasangan 2 pemain yang
 * TETAP sepanjang sesi. Satu lapangan mempertemukan 2 tim. Leaderboard dihitung
 * per tim (lihat computeTeamStandings).
 *
 *  - Team Americano : tim dirotasi melawan tim lain (jadwal rotasi).
 *  - Team Mexicano  : tiap ronde, tim diadu berdasarkan peringkat (1v2, 3v4, …)
 *                     sehingga matchup seimbang.
 */

import type { Pair, PlayerId, Round, Match, MatchResult } from "./types.js";

export interface TeamFormatOptions {
  /** Jumlah lapangan. Default: floor(jumlahTim / 2). */
  courts?: number;
  /**
   * Rotasi bye adil untuk Team Mexicano: teamKey → berapa kali tim sudah
   * istirahat. Bila ada tim yang harus istirahat, pilih yang paling sedikit
   * istirahat (bukan peringkat terbawah). Mencegah tim mandek di-bench (DEF-3).
   */
  restCount?: Record<string, number>;
}

/** Bentuk tim (pasangan) dari daftar pemain berurutan: [p0,p1],[p2,p3],… */
export function pairUp(players: readonly PlayerId[]): Pair[] {
  const teams: Pair[] = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    teams.push([players[i]!, players[i + 1]!]);
  }
  return teams;
}

function resolveCourts(numTeams: number, opts: TeamFormatOptions): number {
  const courts = opts.courts ?? Math.floor(numTeams / 2);
  if (courts < 1) throw new Error("Needs at least 2 teams (4 players).");
  if (courts * 2 > numTeams) {
    throw new Error(
      `Too many courts: need ${courts * 2} teams for ${courts} courts, only ${numTeams} available.`
    );
  }
  return courts;
}

/** Pemain dari tim-tim yang tidak kebagian main (istirahat). */
function restingPlayers(teams: readonly Pair[]): PlayerId[] {
  return teams.flatMap((t) => [...t]);
}

/**
 * Semua pasangan lawan round-robin (tiap tim vs tiap tim sekali) via circle
 * method. Dikembalikan berurutan per "circle-round" (tiap kelompok bebas konflik).
 */
function roundRobinPairs(n: number): [number, number][] {
  const order: number[] = Array.from({ length: n }, (_, k) => k);
  if (n % 2 === 1) order.push(-1); // tim "bye" semu bila ganjil
  const m = order.length;
  const half = m / 2;
  const pairs: [number, number][] = [];

  for (let r = 0; r < m - 1; r++) {
    for (let i = 0; i < half; i++) {
      const a = order[i]!;
      const b = order[m - 1 - i]!;
      if (a !== -1 && b !== -1) pairs.push([a, b]);
    }
    // Rotasi: tim pertama tetap, sisanya berputar (circle method).
    order.splice(1, 0, order.pop()!);
  }
  return pairs;
}

/**
 * Jadwal Team Americano = ROUND-ROBIN PENUH: tiap tim melawan SEMUA tim lain
 * tepat sekali (tiap tim main n−1 kali). Pertandingan dipak ke lapangan yang
 * tersedia; bila tak habis dibagi, ronde TERAKHIR memakai lebih sedikit lapangan.
 */
export function generateTeamAmericano(
  teams: readonly Pair[],
  opts: TeamFormatOptions = {}
): Round[] {
  if (teams.length < 2) throw new Error("Team Americano needs at least 2 teams.");
  const courts = resolveCourts(teams.length, opts);
  const pairs = roundRobinPairs(teams.length);

  // Pak pertandingan ke ronde: maksimal `courts` per ronde, tanpa tim main
  // dua kali dalam satu ronde. First-fit → ronde sesedikit mungkin, sisa di akhir.
  const buckets: { pairs: [number, number][]; using: Set<number> }[] = [];
  for (const [a, b] of pairs) {
    let placed = false;
    for (const bk of buckets) {
      if (bk.pairs.length < courts && !bk.using.has(a) && !bk.using.has(b)) {
        bk.pairs.push([a, b]);
        bk.using.add(a);
        bk.using.add(b);
        placed = true;
        break;
      }
    }
    if (!placed) buckets.push({ pairs: [[a, b]], using: new Set([a, b]) });
  }

  return buckets.map((bk, idx) => ({
    index: idx,
    matches: bk.pairs.map(([i, j], c) => ({
      court: c + 1,
      teamA: teams[i]!,
      teamB: teams[j]!,
    })),
    resting: restingPlayers(teams.filter((_, ti) => !bk.using.has(ti))),
  }));
}

/**
 * Satu ronde Team Mexicano dari tim yang SUDAH diurut berdasarkan peringkat
 * (terbaik di indeks 0). Matchup seimbang: 1v2, 3v4, … per lapangan.
 */
export function nextTeamMexicanoRound(
  rankedTeams: readonly Pair[],
  roundIndex: number,
  opts: TeamFormatOptions = {}
): Round {
  if (rankedTeams.length < 2) throw new Error("Team Mexicano needs at least 2 teams.");
  const courts = resolveCourts(rankedTeams.length, opts);
  const perRound = courts * 2;
  const restN = rankedTeams.length - perRound;

  let active: readonly Pair[];
  let resting: readonly Pair[];
  if (restN <= 0) {
    active = rankedTeams.slice(0, perRound);
    resting = rankedTeams.slice(perRound);
  } else {
    // Rotasi bye adil: istirahatkan tim yang PALING SEDIKIT istirahat.
    const rc = opts.restCount ?? {};
    const restSet = new Set(
      rankedTeams
        .map((t, rank) => ({ k: teamKey(t), rank }))
        .sort((a, b) => (rc[a.k] ?? 0) - (rc[b.k] ?? 0) || b.rank - a.rank)
        .slice(0, restN)
        .map((x) => x.k)
    );
    resting = rankedTeams.filter((t) => restSet.has(teamKey(t)));
    active = rankedTeams.filter((t) => !restSet.has(teamKey(t))); // tetap urut peringkat
  }

  const matches: Match[] = [];
  for (let c = 0; c < courts; c++) {
    matches.push({
      court: c + 1,
      teamA: active[c * 2]!,
      teamB: active[c * 2 + 1]!,
    });
  }
  return { index: roundIndex, matches, resting: restingPlayers(resting) };
}

/* ---------- Klasemen per tim ---------- */

export interface TeamStanding {
  team: Pair;
  points: number;
  gamesDiff: number;
  wins: number;
  losses: number;
  ties: number;
  played: number;
  winRate: number;
}

/** Kunci tim yang stabil terhadap urutan pemain. */
export function teamKey(team: Pair): string {
  return [...team].sort().join(" | ");
}

export function computeTeamStandings(
  results: readonly MatchResult[]
): TeamStanding[] {
  const table = new Map<string, TeamStanding>();

  const ensure = (team: Pair): TeamStanding => {
    const key = teamKey(team);
    let s = table.get(key);
    if (!s) {
      s = {
        team,
        points: 0,
        gamesDiff: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        played: 0,
        winRate: 0,
      };
      table.set(key, s);
    }
    return s;
  };

  const apply = (team: Pair, scoreFor: number, scoreAgainst: number): void => {
    const s = ensure(team);
    s.points += scoreFor;
    s.gamesDiff += scoreFor - scoreAgainst;
    s.played += 1;
    if (scoreFor > scoreAgainst) s.wins += 1;
    else if (scoreFor < scoreAgainst) s.losses += 1;
    else s.ties += 1;
  };

  for (const { match, scoreA, scoreB } of results) {
    apply(match.teamA, scoreA, scoreB);
    apply(match.teamB, scoreB, scoreA);
  }

  const rows = [...table.values()];
  for (const s of rows) s.winRate = s.played > 0 ? s.wins / s.played : 0;

  return rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.gamesDiff - a.gamesDiff ||
      b.wins - a.wins ||
      teamKey(a.team).localeCompare(teamKey(b.team))
  );
}

/** Urutkan tim berdasarkan klasemen; tim yang belum main ditaruh di akhir. */
export function rankTeams(
  teams: readonly Pair[],
  results: readonly MatchResult[]
): Pair[] {
  const standings = computeTeamStandings(results);
  const rank = new Map(standings.map((s, i) => [teamKey(s.team), i]));
  return [...teams].sort((a, b) => {
    const ra = rank.get(teamKey(a)) ?? Number.POSITIVE_INFINITY;
    const rb = rank.get(teamKey(b)) ?? Number.POSITIVE_INFINITY;
    return ra - rb || teamKey(a).localeCompare(teamKey(b));
  });
}
