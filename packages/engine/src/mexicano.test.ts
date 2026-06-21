import { describe, it, expect } from "vitest";
import { nextMexicanoRound } from "./mexicano.js";
import type { PlayerId } from "./types.js";

const players = (n: number): PlayerId[] =>
  Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("nextMexicanoRound — validitas", () => {
  it("menolak < 4 pemain", () => {
    expect(() => nextMexicanoRound(players(3), 0)).toThrow();
  });

  it("jumlah lapangan benar & tak ada pemain dua kali dalam satu ronde", () => {
    const r = nextMexicanoRound(players(8), 0, { courts: 2 });
    expect(r.matches.length).toBe(2);
    const ids = [
      ...r.resting,
      ...r.matches.flatMap((m) => [...m.teamA, ...m.teamB]),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids).size).toBe(8);
  });

  it("lapangan seimbang: (terbaik + terlemah) vs (dua tengah)", () => {
    const r = nextMexicanoRound(players(4), 0, { courts: 1 });
    expect(r.matches[0]!.teamA).toEqual(["p1", "p4"]);
    expect(r.matches[0]!.teamB).toEqual(["p2", "p3"]);
  });
});

describe("nextMexicanoRound — rotasi bye adil (DEF-3: tak ada bench permanen)", () => {
  it("istirahat terdistribusi merata lintas ronde (selisih ≤ 1)", () => {
    // 7 pemain / 1 lapangan → 3 istirahat tiap ronde. Tanpa rotasi, pemain yang
    // kena bye di awal akan mandek di dasar klasemen & istirahat selamanya.
    const ps = players(7);
    const restCount: Record<string, number> = {};
    for (let i = 0; i < 14; i++) {
      const r = nextMexicanoRound(ps, i, { courts: 1, restCount });
      for (const id of r.resting)
        restCount[id] = (restCount[id] ?? 0) + 1;
    }
    const counts = ps.map((id) => restCount[id] ?? 0);
    expect(Math.min(...counts)).toBeGreaterThan(0); // semua pernah istirahat
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1); // merata
  });

  it("tanpa restCount tetap valid (kompat ronde pertama)", () => {
    const r = nextMexicanoRound(players(6), 0, { courts: 1 });
    expect(r.matches.length).toBe(1);
    expect(r.resting.length).toBe(2);
  });
});
