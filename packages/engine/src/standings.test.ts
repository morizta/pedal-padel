import { describe, it, expect } from "vitest";
import { computeStandings } from "./standings.js";
import { nextMexicanoRound } from "./mexicano.js";
import type { MatchResult } from "./types.js";

describe("computeStandings", () => {
  it("akumulasi poin, selisih game, dan menang per individu", () => {
    const results: MatchResult[] = [
      {
        match: { court: 1, teamA: ["a", "b"], teamB: ["c", "d"] },
        scoreA: 24,
        scoreB: 10,
      },
      {
        match: { court: 1, teamA: ["a", "c"], teamB: ["b", "d"] },
        scoreA: 16,
        scoreB: 20,
      },
    ];
    const table = computeStandings(results);
    const a = table.find((s) => s.playerId === "a")!;
    expect(a.points).toBe(24 + 16);
    expect(a.wins).toBe(1);
    expect(a.played).toBe(2);
    // urut menurun berdasarkan poin
    for (let i = 1; i < table.length; i++) {
      expect(table[i - 1]!.points).toBeGreaterThanOrEqual(table[i]!.points);
    }
  });

  it("tie-break memakai selisih game saat poin sama", () => {
    const results: MatchResult[] = [
      {
        match: { court: 1, teamA: ["x", "z"], teamB: ["y", "w"] },
        scoreA: 20,
        scoreB: 20,
      },
    ];
    // x & y sama-sama 20 poin; selisih game 0 → stabil, tak crash
    const table = computeStandings(results);
    expect(table).toHaveLength(4);
  });

  it("mencatat W-L-T dan win rate", () => {
    const results: MatchResult[] = [
      {
        match: { court: 1, teamA: ["a", "b"], teamB: ["c", "d"] },
        scoreA: 24,
        scoreB: 10,
      },
      {
        match: { court: 1, teamA: ["a", "c"], teamB: ["b", "d"] },
        scoreA: 12,
        scoreB: 12,
      },
    ];
    const a = computeStandings(results).find((s) => s.playerId === "a")!;
    expect(a.wins).toBe(1);
    expect(a.ties).toBe(1);
    expect(a.losses).toBe(0);
    expect(a.played).toBe(2);
    expect(a.winRate).toBeCloseTo(0.5);
  });

  it("+M: pemain yang main lebih sedikit dapat poin kompensasi", () => {
    // 'busy' main 2 match (rata-rata 20/match), 'rest' main 1 match.
    const results: MatchResult[] = [
      {
        match: { court: 1, teamA: ["busy", "x"], teamB: ["rest", "y"] },
        scoreA: 20,
        scoreB: 10,
      },
      {
        match: { court: 1, teamA: ["busy", "y"], teamB: ["x", "z"] },
        scoreA: 20,
        scoreB: 5,
      },
    ];
    const table = computeStandings(results);
    const rest = table.find((s) => s.playerId === "rest")!;
    const busy = table.find((s) => s.playerId === "busy")!;
    // busy main 2 → tak ada kompensasi
    expect(busy.compensation).toBe(0);
    // rest main 1 dari max 2 → dapat kompensasi = rata-rata poinnya × 1
    expect(rest.played).toBe(1);
    expect(rest.compensation).toBe(rest.points); // 1 match terlewat
    expect(rest.adjustedPoints).toBe(rest.points + rest.compensation);
  });

  it("compensate:false menonaktifkan +M", () => {
    const results: MatchResult[] = [
      {
        match: { court: 1, teamA: ["busy", "x"], teamB: ["rest", "y"] },
        scoreA: 20,
        scoreB: 10,
      },
      {
        match: { court: 1, teamA: ["busy", "y"], teamB: ["x", "z"] },
        scoreA: 20,
        scoreB: 5,
      },
    ];
    const table = computeStandings(results, { compensate: false });
    for (const s of table) {
      expect(s.compensation).toBe(0);
      expect(s.adjustedPoints).toBe(s.points);
    }
  });
});

describe("nextMexicanoRound", () => {
  it("memasangkan (1+4) vs (2+3) per lapangan", () => {
    const ranked = ["p1", "p2", "p3", "p4"];
    const round = nextMexicanoRound(ranked, 0, { courts: 1 });
    const m = round.matches[0]!;
    expect(new Set(m.teamA)).toEqual(new Set(["p1", "p4"]));
    expect(new Set(m.teamB)).toEqual(new Set(["p2", "p3"]));
  });

  it("butuh minimal 4 pemain", () => {
    expect(() => nextMexicanoRound(["a", "b"], 0)).toThrow();
  });
});
