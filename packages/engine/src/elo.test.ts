import { describe, it, expect } from "vitest";
import {
  expectedScore,
  actualScore,
  rateMatch,
  kFactor,
  reliability,
  DEFAULT_RATING,
  K_PROVISIONAL,
  K_STABLE,
} from "./elo.js";
import type { MatchResult, RatedPlayer } from "./types.js";

const mk = (id: string, rating = DEFAULT_RATING, matchesPlayed = 0): RatedPlayer => ({
  id,
  rating,
  matchesPlayed,
});

describe("expectedScore", () => {
  it("memberi 0.5 saat rating sama", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
  });

  it("simetris: E_A + E_B = 1", () => {
    expect(expectedScore(1200, 900) + expectedScore(900, 1200)).toBeCloseTo(1);
  });

  it("rating lebih tinggi → ekspektasi lebih besar", () => {
    expect(expectedScore(1400, 1000)).toBeGreaterThan(0.5);
  });
});

describe("actualScore", () => {
  it("rasio skor (margin-aware)", () => {
    expect(actualScore(24, 8)).toBeCloseTo(0.75);
  });
  it("0-0 dianggap seri", () => {
    expect(actualScore(0, 0)).toBe(0.5);
  });
});

describe("kFactor & reliability", () => {
  it("K besar saat provisional, kecil saat established", () => {
    expect(kFactor(0)).toBe(K_PROVISIONAL);
    expect(kFactor(50)).toBe(K_STABLE);
  });
  it("reliability naik dari 0 ke 1", () => {
    expect(reliability(0)).toBe(0);
    expect(reliability(10)).toBeCloseTo(0.5);
    expect(reliability(100)).toBe(1);
  });
});

describe("rateMatch", () => {
  const players: Record<string, RatedPlayer> = {
    a1: mk("a1"),
    a2: mk("a2"),
    b1: mk("b1"),
    b2: mk("b2"),
  };
  const result: MatchResult = {
    match: { court: 1, teamA: ["a1", "a2"], teamB: ["b1", "b2"] },
    scoreA: 24,
    scoreB: 8,
  };

  it("pemenang naik, yang kalah turun", () => {
    const ch = rateMatch(result, players);
    expect(ch.a1!.delta).toBeGreaterThan(0);
    expect(ch.b1!.delta).toBeLessThan(0);
  });

  it("zero-sum: total delta = 0 saat K & match sama", () => {
    const ch = rateMatch(result, players);
    const sum = ch.a1!.delta + ch.a2!.delta + ch.b1!.delta + ch.b2!.delta;
    expect(sum).toBeCloseTo(0);
  });

  it("kedua rekan setim mendapat delta sama", () => {
    const ch = rateMatch(result, players);
    expect(ch.a1!.delta).toBeCloseTo(ch.a2!.delta);
  });

  it("upset (underdog menang) menggeser lebih banyak poin", () => {
    const strong: Record<string, RatedPlayer> = {
      a1: mk("a1", 1400),
      a2: mk("a2", 1400),
      b1: mk("b1", 900),
      b2: mk("b2", 900),
    };
    // underdog (B) menang telak
    const upset: MatchResult = {
      match: { court: 1, teamA: ["a1", "a2"], teamB: ["b1", "b2"] },
      scoreA: 6,
      scoreB: 24,
    };
    const ch = rateMatch(upset, strong);
    expect(ch.b1!.delta).toBeGreaterThan(15); // lonjakan besar untuk underdog
  });

  it("melempar error bila pemain tak ada di map", () => {
    expect(() => rateMatch(result, { a1: mk("a1") })).toThrow();
  });
});
