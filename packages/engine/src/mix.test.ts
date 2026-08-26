import { describe, it, expect } from "vitest";
import { generateMixAmericano, nextMixicanoRound } from "./mix.js";
import type { PlayerId, Round } from "./types.js";

const men = (n: number): PlayerId[] =>
  Array.from({ length: n }, (_, i) => `M${i + 1}`);
const women = (n: number): PlayerId[] =>
  Array.from({ length: n }, (_, i) => `W${i + 1}`);

const isMan = (p: PlayerId) => p.startsWith("M");
const isWoman = (p: PlayerId) => p.startsWith("W");

/** Tiap tim harus 1 pria + 1 wanita. */
function teamsAreMixed(rounds: Round[]): boolean {
  for (const r of rounds)
    for (const m of r.matches)
      for (const team of [m.teamA, m.teamB]) {
        const oneEach =
          (isMan(team[0]) && isWoman(team[1])) ||
          (isWoman(team[0]) && isMan(team[1]));
        if (!oneEach) return false;
      }
  return true;
}

describe("generateMixAmericano", () => {
  it("menolak < 2 pria atau < 2 wanita", () => {
    expect(() => generateMixAmericano(men(1), women(3))).toThrow();
    expect(() => generateMixAmericano(men(3), women(1))).toThrow();
  });

  it("setiap tim 1 pria + 1 wanita; tak ada pemain dua kali dalam satu ronde", () => {
    const rounds = generateMixAmericano(men(3), women(3), { courts: 1 });
    expect(teamsAreMixed(rounds)).toBe(true);
    for (const r of rounds) {
      const ids = [...r.resting, ...r.matches.flatMap((m) => [...m.teamA, ...m.teamB])];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("genders seimbang (M=F): tiap pria partner tiap wanita ≤ 1×; main merata", () => {
    const M = men(4);
    const W = women(4);
    const rounds = generateMixAmericano(M, W, { courts: 2 });
    // partner campur unik ≤ 1
    const partner = new Map<string, number>();
    const play = new Map<string, number>();
    for (const r of rounds)
      for (const m of r.matches)
        for (const team of [m.teamA, m.teamB]) {
          const key = [...team].sort().join("|");
          partner.set(key, (partner.get(key) ?? 0) + 1);
          for (const p of team) play.set(p, (play.get(p) ?? 0) + 1);
        }
    for (const c of partner.values()) expect(c).toBeLessThanOrEqual(1);
    // M=F seimbang → tiap orang main jumlah sama (gap ≤ 1)
    const counts = [...M, ...W].map((p) => play.get(p) ?? 0);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

describe("nextMixicanoRound", () => {
  it("menolak < 2 pria atau < 2 wanita", () => {
    expect(() => nextMixicanoRound(men(1), women(3), 0)).toThrow();
  });

  it("tim campur & jumlah lapangan benar", () => {
    const r = nextMixicanoRound(men(2), women(2), 0, { courts: 1 });
    expect(r.matches.length).toBe(1);
    expect(teamsAreMixed([r])).toBe(true);
  });

  it("rotasi bye adil: istirahat per gender terdistribusi merata", () => {
    const M = men(3);
    const W = women(3); // 1 lapangan → 1 pria & 1 wanita istirahat tiap ronde
    const restCount: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const r = nextMixicanoRound(M, W, i, { courts: 1, restCount });
      for (const id of r.resting) restCount[id] = (restCount[id] ?? 0) + 1;
    }
    const mc = M.map((id) => restCount[id] ?? 0);
    const wc = W.map((id) => restCount[id] ?? 0);
    expect(Math.max(...mc) - Math.min(...mc)).toBeLessThanOrEqual(1);
    expect(Math.max(...wc) - Math.min(...wc)).toBeLessThanOrEqual(1);
  });
});

describe("generateMixAmericano — lawan tak menumpuk (regresi)", () => {
  // Bug lama (sama seperti Americano): pasangan campur dijodohkan tanpa melihat
  // lawan, jadi M1 selalu berhadapan dengan M2 di SEMUA pertandingannya.
  it("6 pria + 6 wanita: tak ada pasang yang berhadapan lebih dari 4×", () => {
    const males = Array.from({ length: 6 }, (_, i) => `m${i + 1}`);
    const females = Array.from({ length: 6 }, (_, i) => `f${i + 1}`);
    for (const courts of [1, 2, 3]) {
      const rounds = generateMixAmericano(males, females, { courts });
      const opp = new Map<string, number>();
      for (const r of rounds)
        for (const m of r.matches)
          for (const a of m.teamA)
            for (const b of m.teamB) {
              const key = [a, b].sort().join("-");
              opp.set(key, (opp.get(key) ?? 0) + 1);
            }
      expect(Math.max(...opp.values())).toBeLessThanOrEqual(4);
    }
  });

  it("6 pria + 6 wanita / 3 lapangan: 6 ronde penuh, tak ada yang istirahat", () => {
    const males = Array.from({ length: 6 }, (_, i) => `m${i + 1}`);
    const females = Array.from({ length: 6 }, (_, i) => `f${i + 1}`);
    const rounds = generateMixAmericano(males, females, { courts: 3 });
    expect(rounds.length).toBe(6);
    for (const r of rounds) {
      expect(r.matches.length).toBe(3);
      expect(r.resting).toHaveLength(0);
    }
  });
});
