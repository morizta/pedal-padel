/**
 * Data layer Supabase (async). Menggantikan store.ts (localStorage).
 *
 * Model: pemain & event punya ID (uuid). Identitas yang dipakai ENGINE tetap
 * NAMA pemain (disnapshot di event.player_names) supaya logika/standings tak
 * berubah; player_ids disimpan untuk relasi & history.
 */
import {
  computeStandings,
  type MatchResult,
  type Pair,
  type Round,
  type Standing,
} from "@pedal/engine";
import type { Format, ScoringConfig, Scores } from "./session";
import { supabase } from "./supabase";

function db() {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
  return supabase;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await db().auth.getSession();
  return data.session?.user.id ?? null;
}

/* ---------- Pemain ---------- */

export interface Player {
  id: string;
  name: string;
  isGuest: boolean;
}

function mapPlayer(r: {
  id: string;
  display_name: string;
  user_id: string | null;
}): Player {
  return { id: r.id, name: r.display_name, isGuest: !r.user_id };
}

export async function listPlayers(): Promise<Player[]> {
  const owner = await currentUserId();
  if (!owner) return [];
  const { data, error } = await db()
    .from("players")
    .select("id,display_name,user_id")
    .eq("owner_id", owner)
    .order("display_name");
  if (error) throw error;
  return (data ?? []).map(mapPlayer);
}

export async function createPlayer(
  name: string,
  opts: { guest?: boolean } = {}
): Promise<Player | undefined> {
  const clean = name.trim();
  if (!clean) return undefined;
  const owner = await currentUserId();
  if (!owner) throw new Error("Harus login untuk menambah pemain.");

  // Dedupe by nama (case-insensitive) milik user ini.
  const { data: existing } = await db()
    .from("players")
    .select("id,display_name,user_id")
    .eq("owner_id", owner)
    .ilike("display_name", clean)
    .limit(1);
  if (existing && existing.length) return mapPlayer(existing[0]!);

  const { data, error } = await db()
    .from("players")
    .insert({ display_name: clean, owner_id: owner })
    .select("id,display_name,user_id")
    .single();
  if (error) throw error;
  void opts;
  return mapPlayer(data!);
}

export async function deletePlayer(id: string): Promise<void> {
  const { error } = await db().from("players").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Pastikan user yang login punya "self-player" (player tertaut akunnya).
 * Dipanggil saat login → user otomatis bisa dicari & ditambahkan sbg pemain.
 */
export async function ensureSelfPlayer(name: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const { data, error } = await db()
    .from("players")
    .select("id")
    .eq("user_id", uid)
    .limit(1);
  if (error) throw error;
  if (data && data.length > 0) return; // sudah ada
  await db()
    .from("players")
    .insert({ display_name: name.trim() || "Pemain", user_id: uid, owner_id: uid });
}

export interface AccountHit {
  /** id PLAYER (self-player) untuk ditambahkan sbg peserta. */
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

/** Cari USER akun by nama ATAU username. Hasil membawa username + avatar. */
export async function searchUsers(query: string): Promise<AccountHit[]> {
  const q = query.trim().replace(/[%,]/g, "");
  if (!q) return [];
  const { data: profs, error } = await db()
    .from("profiles")
    .select("id,name,username,avatar_url")
    .or(`name.ilike.%${q}%,username.ilike.%${q}%`)
    .limit(15);
  if (error) throw error;
  if (!profs || profs.length === 0) return [];

  const ids = profs.map((p) => p.id);
  const { data: pls } = await db()
    .from("players")
    .select("id,user_id")
    .in("user_id", ids);
  const byUser = new Map((pls ?? []).map((p) => [p.user_id, p.id]));

  return profs
    .map((pr) => ({
      id: byUser.get(pr.id) ?? "",
      name: pr.name ?? pr.username ?? "Pemain",
      username: pr.username,
      avatarUrl: pr.avatar_url,
    }))
    .filter((r) => r.id);
}

/** Cek apakah username sudah dipakai (case-insensitive). */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  const { data } = await db()
    .from("profiles")
    .select("id")
    .ilike("username", u)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/* ---------- Profil ---------- */

export interface MyProfile {
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

export async function getMyProfile(): Promise<MyProfile | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data } = await db()
    .from("profiles")
    .select("name,username,avatar_url")
    .eq("id", uid)
    .maybeSingle();
  if (!data) return null;
  return {
    name: data.name ?? "",
    username: data.username,
    avatarUrl: data.avatar_url,
  };
}

export async function updateProfile(patch: {
  name?: string;
  username?: string;
  avatarUrl?: string | null;
}): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Harus login.");
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.username !== undefined) row.username = patch.username.trim().toLowerCase();
  if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;

  const { error } = await db().from("profiles").update(row).eq("id", uid);
  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      throw new Error("Username sudah dipakai. Coba yang lain.");
    }
    throw error;
  }
  // Sinkronkan nama self-player agar konsisten.
  if (patch.name !== undefined) {
    await db().from("players").update({ display_name: row.name }).eq("user_id", uid);
  }
}

/* ---------- Liga ---------- */

export interface League {
  id: string;
  name: string;
  createdAt: number;
  memberIds: string[];
}

function mapLeague(r: any): League {
  return {
    id: r.id,
    name: r.name,
    createdAt: Date.parse(r.created_at),
    memberIds: (r.league_members ?? []).map((m: any) => m.player_id),
  };
}

export async function listLeagues(): Promise<League[]> {
  const owner = await currentUserId();
  if (!owner) return [];
  const { data, error } = await db()
    .from("leagues")
    .select("id,name,created_at,league_members(player_id)")
    .eq("owner_id", owner)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapLeague);
}

export async function getLeague(id: string): Promise<League | undefined> {
  const { data, error } = await db()
    .from("leagues")
    .select("id,name,created_at,league_members(player_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapLeague(data) : undefined;
}

export async function createLeague(name: string): Promise<League> {
  const owner = await currentUserId();
  if (!owner) throw new Error("Harus login untuk membuat liga.");
  const { data, error } = await db()
    .from("leagues")
    .insert({ name: name.trim() || "Liga Tanpa Nama", owner_id: owner })
    .select("id,name,created_at")
    .single();
  if (error) throw error;
  return mapLeague(data!);
}

export async function deleteLeague(id: string): Promise<void> {
  const { error } = await db().from("leagues").delete().eq("id", id);
  if (error) throw error;
}

export async function setLeagueMembers(
  leagueId: string,
  playerIds: string[]
): Promise<void> {
  const client = db();
  await client.from("league_members").delete().eq("league_id", leagueId);
  if (playerIds.length) {
    const rows = playerIds.map((player_id) => ({
      league_id: leagueId,
      player_id,
    }));
    const { error } = await client.from("league_members").insert(rows);
    if (error) throw error;
  }
}

/* ---------- Event ---------- */

export interface DbEvent {
  id: string;
  leagueId: string | null;
  name: string;
  format: Format;
  courts: number;
  scoring: ScoringConfig;
  randomizeStart: boolean;
  status: "live" | "finished";
  playerIds: string[];
  /** Nama peserta (identitas engine). */
  players: string[];
  teams: Pair[];
  rounds: Round[];
  scores: Scores;
  createdAt: number;
}

const EVENT_COLS =
  "id,league_id,owner_id,name,format,courts,scoring,randomize_start,status,player_ids,player_names,teams,rounds,scores,created_at";

function mapEvent(r: any): DbEvent {
  return {
    id: r.id,
    leagueId: r.league_id,
    name: r.name,
    format: r.format,
    courts: r.courts,
    scoring: r.scoring,
    randomizeStart: r.randomize_start,
    status: r.status,
    playerIds: r.player_ids ?? [],
    players: r.player_names ?? [],
    teams: r.teams ?? [],
    rounds: r.rounds ?? [],
    scores: r.scores ?? {},
    createdAt: Date.parse(r.created_at),
  };
}

export async function listEvents(
  leagueId?: string | null
): Promise<DbEvent[]> {
  const owner = await currentUserId();
  if (!owner) return [];
  let q = db()
    .from("events")
    .select(EVENT_COLS)
    .eq("owner_id", owner)
    .order("created_at", { ascending: false });
  if (leagueId === null) q = q.is("league_id", null);
  else if (typeof leagueId === "string") q = q.eq("league_id", leagueId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}

export async function getEvent(id: string): Promise<DbEvent | undefined> {
  const { data, error } = await db()
    .from("events")
    .select(EVENT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapEvent(data) : undefined;
}

export interface NewEvent {
  leagueId: string | null;
  name: string;
  format: Format;
  courts: number;
  scoring: ScoringConfig;
  randomizeStart: boolean;
  /** Peserta {id, name}. */
  participants: { id: string; name: string }[];
  /** Tim manual (format tim). Kosong/undefined = auto-pairing. */
  teams?: Pair[];
}

export async function createEvent(input: NewEvent): Promise<DbEvent> {
  const owner = await currentUserId();
  if (!owner) throw new Error("Harus login untuk membuat sesi.");
  const { data, error } = await db()
    .from("events")
    .insert({
      league_id: input.leagueId,
      owner_id: owner,
      name: input.name.trim() || "Sesi Tanpa Nama",
      format: input.format,
      courts: input.courts,
      scoring: input.scoring,
      randomize_start: input.randomizeStart,
      status: "live",
      player_ids: input.participants.map((p) => p.id),
      player_names: input.participants.map((p) => p.name),
      teams: input.teams ?? [],
      rounds: [],
      scores: {},
    })
    .select(EVENT_COLS)
    .single();
  if (error) throw error;
  return mapEvent(data!);
}

export async function updateEvent(
  id: string,
  patch: { rounds?: Round[]; scores?: Scores; teams?: Pair[]; status?: string }
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.rounds !== undefined) row.rounds = patch.rounds;
  if (patch.scores !== undefined) row.scores = patch.scores;
  if (patch.teams !== undefined) row.teams = patch.teams;
  if (patch.status !== undefined) row.status = patch.status;
  const { error } = await db().from("events").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await db().from("events").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- Agregasi ---------- */

export function eventResults(event: DbEvent): MatchResult[] {
  const out: MatchResult[] = [];
  for (const r of event.rounds) {
    for (const m of r.matches) {
      const s = event.scores[`${r.index}-${m.court}`];
      if (s && s.a + s.b > 0) out.push({ match: m, scoreA: s.a, scoreB: s.b });
    }
  }
  return out;
}

export async function leagueStandings(
  leagueId: string
): Promise<{ standings: Standing[]; eventCount: number }> {
  const events = await listEvents(leagueId);
  const results = events.flatMap(eventResults);
  return { standings: computeStandings(results), eventCount: events.length };
}

/**
 * Agregat semua sesi user (lintas liga + lepas) untuk leaderboard ELO global.
 * Mengembalikan hasil match mentah + daftar nama unik; rating dihitung di UI.
 */
export async function globalStats(): Promise<{
  results: MatchResult[];
  names: string[];
  eventCount: number;
}> {
  const events = await listEvents();
  const results = events.flatMap(eventResults);
  const names = Array.from(new Set(events.flatMap((e) => e.players)));
  return { results, names, eventCount: events.length };
}
