/**
 * Logika sesi pertandingan (state machine) untuk UI.
 *
 * Mendukung 4 format dengan UX sama (main ronde-per-ronde):
 *  - americano       : individual, jadwal di-precompute.
 *  - mexicano        : individual, ronde dinamis dari klasemen pemain.
 *  - team_americano  : pasangan tetap, jadwal di-precompute (rotasi tim).
 *  - team_mexicano   : pasangan tetap, ronde dinamis dari klasemen tim.
 *
 * Engine (matchmaking + standings) tetap murni; di sini hanya orkestrasi state.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  generateAmericano,
  nextMexicanoRound,
  generateTeamAmericano,
  nextTeamMexicanoRound,
  pairUp,
  rankTeams,
  computeStandings,
  type Pair,
  type PlayerId,
  type Round,
  type MatchResult,
} from "@pedal/engine";

export type Format =
  | "americano"
  | "mexicano"
  | "team_americano"
  | "team_mexicano";

export function isTeamFormat(f: Format): boolean {
  return f === "team_americano" || f === "team_mexicano";
}
/** Jadwal pasti di awal (semua ronde langsung dibuka). Lawannya: dinamis. */
export function isScheduledFormat(f: Format): boolean {
  return f === "americano" || f === "team_americano";
}

/** Konfigurasi sistem skor. */
export type ScoringConfig =
  | { type: "point"; points: number } // points=0 → jumlah bebas (Undefined)
  | { type: "normal"; mode: "first" | "total"; target: number };

/** Spesifikasi turunan untuk UI picker. */
export interface ScoreSpec {
  /** true → lawan otomatis = max − nilai (total tetap). */
  complement: boolean;
  /** Nilai tertinggi yang bisa dipilih. */
  max: number;
  /** Label ringkas untuk meta bar. */
  label: string;
}

export function scoreSpec(c: ScoringConfig): ScoreSpec {
  if (c.type === "point") {
    return c.points > 0
      ? { complement: true, max: c.points, label: `${c.points} poin` }
      : { complement: false, max: 40, label: "poin bebas" };
  }
  return c.mode === "total"
    ? { complement: true, max: c.target, label: `total ${c.target} game` }
    : { complement: false, max: c.target, label: `first to ${c.target}` };
}

export interface SessionConfig {
  name: string;
  format: Format;
  courts: number;
  scoring: ScoringConfig;
  randomizeStart: boolean;
}

type ScoreKey = string; // `${roundIndex}-${court}`
export type Scores = Record<ScoreKey, { a: number; b: number }>;

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Urutkan pemain berdasarkan klasemen; yang belum main ditaruh di akhir. */
export function rankPlayers(
  all: readonly PlayerId[],
  results: readonly MatchResult[]
): PlayerId[] {
  const standings = computeStandings(results);
  const rank = new Map(standings.map((s, i) => [s.playerId, i]));
  return [...all].sort((a, b) => {
    const ra = rank.get(a) ?? Number.POSITIVE_INFINITY;
    const rb = rank.get(b) ?? Number.POSITIVE_INFINITY;
    return ra - rb || a.localeCompare(b);
  });
}

export interface Session {
  config: SessionConfig;
  players: PlayerId[];
  /** Tim tetap (hanya untuk format tim; [] selain itu). */
  teams: Pair[];
  rounds: Round[];
  scores: Scores;
  results: MatchResult[];
  setMatchScore: (roundIndex: number, court: number, a: number, b: number) => void;
  nextRound: () => void;
  /** Masih ada ronde berikutnya secara struktur (Americano: jadwal belum habis). */
  hasMoreRounds: boolean;
  /** Semua match di ronde terakhir sudah terisi skor. */
  lastRoundComplete: boolean;
  /** Boleh buka ronde berikutnya (ada lagi & ronde ini lengkap). */
  canAddRound: boolean;
  reshuffle: () => void;
  reset: () => void;
}

export interface SessionRestore {
  rounds: Round[];
  scores: Scores;
  teams: Pair[];
}

export function useSession(
  initial: {
    config: SessionConfig;
    players: PlayerId[];
    restore?: SessionRestore;
    /** Tim ditentukan manual (format tim). Kosong = auto-pairing. */
    initialTeams?: Pair[];
  },
  onReset: () => void
): Session {
  const { config, players, restore, initialTeams } = initial;
  const courts = config.courts;

  // Inisialisasi sekali dari SATU urutan, agar jadwal & ronde-1 konsisten.
  const initRef = useRef<{
    schedule: Round[] | null;
    teams: Pair[];
    first: Round[];
  } | null>(null);
  if (!initRef.current) {
    if (restore) {
      // Lanjutkan dari state tersimpan (tanpa generate ulang).
      initRef.current = {
        schedule: isScheduledFormat(config.format) ? restore.rounds : null,
        teams: restore.teams,
        first: restore.rounds,
      };
    } else {
    const ordered = config.randomizeStart ? shuffle(players) : [...players];
    if (config.format === "americano") {
      // Jadwal pasti → buka SEMUA ronde sekaligus.
      const sched = generateAmericano(ordered, { courts });
      initRef.current = { schedule: sched, teams: [], first: sched };
    } else if (config.format === "mexicano") {
      initRef.current = {
        schedule: null,
        teams: [],
        first: [nextMexicanoRound(ordered, 0, { courts })],
      };
    } else if (config.format === "team_americano") {
      // Manual jika initialTeams diisi, selain itu auto-pairing.
      const teams =
        initialTeams && initialTeams.length ? initialTeams : pairUp(ordered);
      const sched = generateTeamAmericano(teams, { courts });
      initRef.current = { schedule: sched, teams, first: sched };
    } else {
      const teams =
        initialTeams && initialTeams.length ? initialTeams : pairUp(ordered);
      initRef.current = {
        schedule: null,
        teams,
        first: [nextTeamMexicanoRound(teams, 0, { courts })],
      };
    }
    }
  }

  const [rounds, setRounds] = useState<Round[]>(initRef.current.first);
  const [scores, setScores] = useState<Scores>(restore?.scores ?? {});
  const scheduleRef = useRef<Round[] | null>(initRef.current.schedule);
  const teamsRef = useRef<Pair[]>(initRef.current.teams);

  const setMatchScore = useCallback(
    (roundIndex: number, court: number, a: number, b: number) => {
      setScores((prev) => ({
        ...prev,
        [`${roundIndex}-${court}`]: { a: Math.max(0, a), b: Math.max(0, b) },
      }));
    },
    []
  );

  const results = useMemo<MatchResult[]>(() => {
    const out: MatchResult[] = [];
    for (const r of rounds) {
      for (const m of r.matches) {
        const s = scores[`${r.index}-${m.court}`];
        if (s && s.a + s.b > 0) out.push({ match: m, scoreA: s.a, scoreB: s.b });
      }
    }
    return out;
  }, [rounds, scores]);

  const hasMoreRounds =
    !isScheduledFormat(config.format) ||
    (scheduleRef.current?.length ?? 0) > rounds.length;

  const lastRoundComplete = useMemo(() => {
    const last = rounds[rounds.length - 1];
    if (!last) return false;
    return last.matches.every((m) => {
      const s = scores[`${last.index}-${m.court}`];
      return !!s && s.a + s.b > 0;
    });
  }, [rounds, scores]);

  const canAddRound = hasMoreRounds && lastRoundComplete;

  const nextRound = useCallback(() => {
    setRounds((prev) => {
      const idx = prev.length;
      switch (config.format) {
        case "americano":
        case "team_americano": {
          const sched = scheduleRef.current!;
          return idx < sched.length ? [...prev, sched[idx]!] : prev;
        }
        case "mexicano":
          return [
            ...prev,
            nextMexicanoRound(rankPlayers(players, results), idx, { courts }),
          ];
        case "team_mexicano":
          return [
            ...prev,
            nextTeamMexicanoRound(rankTeams(teamsRef.current, results), idx, {
              courts,
            }),
          ];
      }
    });
  }, [config.format, players, results, courts]);

  const reshuffle = useCallback(() => {
    // Format terjadwal: regen SELURUH jadwal (acak ulang) & hapus semua skor.
    if (config.format === "americano") {
      scheduleRef.current = generateAmericano(shuffle(players), { courts });
      setScores({});
      setRounds(scheduleRef.current);
      return;
    }
    if (config.format === "team_americano") {
      // Acak urutan TIM (pasangan tetap), regen seluruh jadwal.
      scheduleRef.current = generateTeamAmericano(shuffle(teamsRef.current), {
        courts,
      });
      setScores({});
      setRounds(scheduleRef.current);
      return;
    }

    // Format dinamis: acak ulang ronde TERAKHIR saja.
    setRounds((prev) => {
      const idx = prev.length - 1;
      if (idx < 0) return prev;
      const replacement =
        config.format === "mexicano"
          ? nextMexicanoRound(
              idx === 0 ? shuffle(players) : rankPlayers(players, results),
              idx,
              { courts }
            )
          : nextTeamMexicanoRound(
              idx === 0
                ? shuffle(teamsRef.current)
                : rankTeams(teamsRef.current, results),
              idx,
              { courts }
            );
      setScores((s) => {
        const copy = { ...s };
        for (const m of replacement.matches) delete copy[`${idx}-${m.court}`];
        return copy;
      });
      return [...prev.slice(0, idx), replacement];
    });
  }, [config.format, players, results, courts]);

  return {
    config,
    players,
    teams: teamsRef.current,
    rounds,
    scores,
    results,
    setMatchScore,
    nextRound,
    hasMoreRounds,
    lastRoundComplete,
    canAddRound,
    reshuffle,
    reset: onReset,
  };
}
