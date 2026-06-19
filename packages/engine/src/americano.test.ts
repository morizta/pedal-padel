import { describe, it, expect } from "vitest";
import { generateAmericano } from "./americano.js";
import type { PlayerId, Round } from "./types.js";

const players = (n: number): PlayerId[] =>
  Array.from({ length: n }, (_, i) => `p${i + 1}`);

/** Semua pemain dalam satu ronde (main + istirahat). */
function playersInRound(r: Round): PlayerId[] {
  const ids: PlayerId[] = [...r.resting];
  for (const m of r.matches) ids.push(...m.teamA, ...m.teamB);
  return ids;
}

describe("generateAmericano — validitas", () => {
  it("menolak < 4 pemain", () => {
    expect(() => generateAmericano(players(3))).toThrow();
  });

  it("tak ada pemain muncul dua kali dalam satu ronde", () => {
    const rounds = generateAmericano(players(8), { courts: 2 });
    for (const r of rounds) {
      const ids = playersInRound(r);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("tiap ronde memakai jumlah lapangan yang benar", () => {
    const rounds = generateAmericano(players(8), { courts: 2 });
    for (const r of rounds) expect(r.matches.length).toBe(2);
  });

  it("semua pemain ter-cover tiap ronde (main atau istirahat)", () => {
    const rounds = generateAmericano(players(10), { courts: 2 });
    for (const r of rounds) {
      expect(new Set(playersInRound(r)).size).toBe(10);
      expect(r.matches.length * 4 + r.resting.length).toBe(10);
    }
  });
});

describe("generateAmericano — 4 pemain (jadwal sempurna)", () => {
  it("3 ronde, tiap orang berpasangan dengan tiap orang persis sekali", () => {
    const rounds = generateAmericano(players(4));
    expect(rounds.length).toBe(3);

    const partnerCount = new Map<string, number>();
    for (const r of rounds) {
      for (const m of r.matches) {
        for (const team of [m.teamA, m.teamB]) {
          const key = [...team].sort().join("-");
          partnerCount.set(key, (partnerCount.get(key) ?? 0) + 1);
        }
      }
    }
    // 6 kemungkinan pasangan, masing-masing tepat sekali
    expect(partnerCount.size).toBe(6);
    for (const c of partnerCount.values()) expect(c).toBe(1);
  });
});

describe("generateAmericano — round-robin pasangan", () => {
  function partnerCounts(rounds: ReturnType<typeof generateAmericano>) {
    const c = new Map<string, number>();
    for (const r of rounds)
      for (const m of r.matches)
        for (const team of [m.teamA, m.teamB]) {
          const key = [...team].sort().join("-");
          c.set(key, (c.get(key) ?? 0) + 1);
        }
    return c;
  }

  it("8 pemain (kelipatan 4): tiap pemain berpasangan dengan semua, tepat sekali", () => {
    const rounds = generateAmericano(players(8), { courts: 2 });
    const counts = partnerCounts(rounds);
    // C(8,2) = 28 pasangan unik, masing-masing tepat sekali
    expect(counts.size).toBe(28);
    for (const c of counts.values()) expect(c).toBe(1);
  });

  function playCounts(n: number, courts = 1): number[] {
    const rounds = generateAmericano(players(n), { courts });
    const played = new Map<string, number>();
    for (const r of rounds)
      for (const m of r.matches)
        for (const id of [...m.teamA, ...m.teamB])
          played.set(id, (played.get(id) ?? 0) + 1);
    return players(n).map((id) => played.get(id) ?? 0);
  }

  it("kelipatan 4: jumlah main SAMA persis untuk semua (selisih 0)", () => {
    for (const n of [8, 12, 16]) {
      const c = playCounts(n);
      expect(Math.max(...c) - Math.min(...c)).toBe(0);
    }
  });

  it("N ≡ 2 (mod 4): jumlah main hampir rata (selisih ≤ 2)", () => {
    for (const n of [6, 10, 14]) {
      const c = playCounts(n);
      expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(2);
    }
  });

  it("memaksimalkan lapangan: hanya ronde TERAKHIR yang boleh < courts", () => {
    const courts = 2;
    const rounds = generateAmericano(players(14), { courts });
    rounds.forEach((r, i) => {
      if (i < rounds.length - 1) expect(r.matches.length).toBe(courts);
      else expect(r.matches.length).toBeLessThanOrEqual(courts);
    });
  });

  it("ronde terakhir boleh memakai 1 lapangan saat tak habis dibagi", () => {
    // 6 pemain, 1 lapangan → tiap ronde pasangan jadi 1 match (1 lapangan).
    const rounds = generateAmericano(players(6), { courts: 1 });
    // tak ada pasangan diulang (≤ sekali)
    for (const c of partnerCounts(rounds).values()) expect(c).toBeLessThanOrEqual(1);
    for (const r of rounds) expect(r.matches.length).toBeLessThanOrEqual(1);
  });
});

describe("generateAmericano — keadilan temporal (DEF-1: tak main beruntun)", () => {
  function maxConsecutivePlay(
    rounds: ReturnType<typeof generateAmericano>,
    id: PlayerId
  ): number {
    let max = 0;
    let cur = 0;
    for (const r of rounds) {
      const playing = r.matches.some((m) =>
        [...m.teamA, ...m.teamB].includes(id)
      );
      if (playing) {
        cur += 1;
        max = Math.max(max, cur);
      } else {
        cur = 0;
      }
    }
    return max;
  }

  it("7 pemain / 1 lapangan: tak ada yang main > 3 ronde beruntun (kasus trial)", () => {
    const ps = players(7);
    const rounds = generateAmericano(ps, { courts: 1 });
    for (const id of ps) {
      expect(maxConsecutivePlay(rounds, id)).toBeLessThanOrEqual(3);
    }
  });

  it("penjadwalan recency-aware menyebar main/istirahat (6 & 11 pemain, 1 lapangan)", () => {
    for (const n of [6, 11]) {
      const ps = players(n);
      const rounds = generateAmericano(ps, { courts: 1 });
      for (const id of ps) {
        expect(maxConsecutivePlay(rounds, id)).toBeLessThanOrEqual(3);
      }
    }
  });
});
