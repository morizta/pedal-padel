import { describe, it, expect } from "vitest";
import {
  pairUp,
  generateTeamAmericano,
  nextTeamMexicanoRound,
  computeTeamStandings,
  rankTeams,
  teamKey,
} from "./teams.js";
import type { MatchResult, Pair, Round } from "./types.js";

const teams4 = pairUp(["a", "b", "c", "d"]); // 2 tim
const teams8 = pairUp(["a", "b", "c", "d", "e", "f", "g", "h"]); // 4 tim

function teamsInRound(r: Round): string[] {
  const keys: string[] = [];
  for (const m of r.matches) keys.push(teamKey(m.teamA), teamKey(m.teamB));
  return keys;
}

describe("pairUp", () => {
  it("memasangkan pemain berurutan", () => {
    expect(pairUp(["a", "b", "c", "d"])).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
  it("mengabaikan pemain ganjil terakhir", () => {
    expect(pairUp(["a", "b", "c"])).toEqual([["a", "b"]]);
  });
});

describe("generateTeamAmericano", () => {
  it("2 tim → 1 ronde, 1 match", () => {
    const rounds = generateTeamAmericano(teams4);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.matches).toHaveLength(1);
  });

  it("tak ada tim muncul dua kali dalam satu ronde", () => {
    const rounds = generateTeamAmericano(teams8, { courts: 2 });
    for (const r of rounds) {
      const keys = teamsInRound(r);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("4 tim → round-robin lengkap: tiap pasangan lawan tepat sekali", () => {
    const rounds = generateTeamAmericano(teams8, { courts: 2 });
    expect(rounds).toHaveLength(3); // 6 match / 2 lapangan = 3 ronde
    const seen = new Map<string, number>();
    for (const r of rounds) {
      expect(r.matches).toHaveLength(2);
      expect(r.resting).toHaveLength(0);
      for (const m of r.matches) {
        const key = [teamKey(m.teamA), teamKey(m.teamB)].sort().join(" vs ");
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    expect(seen.size).toBe(6); // C(4,2) = 6 pertandingan unik
    for (const c of seen.values()) expect(c).toBe(1);
  });

  it("menolak < 2 tim", () => {
    expect(() => generateTeamAmericano([["a", "b"]] as Pair[])).toThrow();
  });

  it("7 tim (ganjil), 2 lapangan → tiap tim lawan semua (main 6×), ronde akhir 1 lapangan", () => {
    const teams7 = pairUp([
      "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n",
    ]);
    const rounds = generateTeamAmericano(teams7, { courts: 2 });

    // 7 tim → C(7,2) = 21 pertandingan; 2 lapangan → 11 ronde (10×2 + 1×1).
    const totalMatches = rounds.reduce((s, r) => s + r.matches.length, 0);
    expect(totalMatches).toBe(21);

    // Tiap tim main melawan SEMUA 6 tim lain, tepat sekali.
    const played = new Map<string, number>();
    const seen = new Set<string>();
    for (const r of rounds)
      for (const m of r.matches) {
        for (const t of [m.teamA, m.teamB])
          played.set(teamKey(t), (played.get(teamKey(t)) ?? 0) + 1);
        seen.add([teamKey(m.teamA), teamKey(m.teamB)].sort().join("|"));
      }
    expect([...played.values()].every((c) => c === 6)).toBe(true);
    expect(seen.size).toBe(21);

    // Ronde terakhir memakai lebih sedikit lapangan (sisa ganjil).
    expect(rounds[rounds.length - 1]!.matches.length).toBeLessThan(2);
  });
});

describe("nextTeamMexicanoRound", () => {
  it("mengadu 1v2, 3v4 berdasarkan peringkat", () => {
    const ranked: Pair[] = [
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
      ["g", "h"],
    ];
    const round = nextTeamMexicanoRound(ranked, 0, { courts: 2 });
    expect(teamKey(round.matches[0]!.teamA)).toBe(teamKey(["a", "b"]));
    expect(teamKey(round.matches[0]!.teamB)).toBe(teamKey(["c", "d"]));
    expect(teamKey(round.matches[1]!.teamA)).toBe(teamKey(["e", "f"]));
    expect(teamKey(round.matches[1]!.teamB)).toBe(teamKey(["g", "h"]));
  });
});

describe("computeTeamStandings & rankTeams", () => {
  const results: MatchResult[] = [
    {
      match: { court: 1, teamA: ["a", "b"], teamB: ["c", "d"] },
      scoreA: 21,
      scoreB: 9,
    },
    {
      match: { court: 1, teamA: ["a", "b"], teamB: ["e", "f"] },
      scoreA: 15,
      scoreB: 15,
    },
  ];

  it("agregasi poin & W-L-T per tim (stabil terhadap urutan pemain)", () => {
    const table = computeTeamStandings(results);
    const ab = table.find((s) => teamKey(s.team) === teamKey(["b", "a"]))!;
    expect(ab.points).toBe(21 + 15);
    expect(ab.wins).toBe(1);
    expect(ab.ties).toBe(1);
    expect(ab.played).toBe(2);
    expect(table[0]!.team).toBeDefined();
  });

  it("rankTeams menaruh tim terbaik dulu, tim tanpa main di akhir", () => {
    const all: Pair[] = [
      ["c", "d"],
      ["a", "b"],
      ["x", "y"], // belum main
    ];
    const ranked = rankTeams(all, results);
    expect(teamKey(ranked[0]!)).toBe(teamKey(["a", "b"]));
    expect(teamKey(ranked[2]!)).toBe(teamKey(["x", "y"]));
  });
});
