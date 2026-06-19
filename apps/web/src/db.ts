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
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await db().auth.getSession();
  return data.session?.user.id ?? null;
}

/* ---------- Superadmin (moderasi platform) ---------- */

/** Apakah user saat ini superadmin (baca baris sendiri di tabel superadmins). */
export async function amISuperadmin(): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  const { data } = await db()
    .from("superadmins")
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();
  return !!data;
}

/** Jumlah total akun terdaftar (untuk statistik panel admin). */
export async function countProfiles(): Promise<number> {
  const { count } = await db()
    .from("profiles")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

/* ---------- Pemain ---------- */

export type Gender = "male" | "female";

export interface Player {
  id: string;
  name: string;
  isGuest: boolean;
  gender: Gender | null;
}

function mapPlayer(r: {
  id: string;
  display_name: string;
  user_id: string | null;
  gender?: string | null;
}): Player {
  return {
    id: r.id,
    name: r.display_name,
    isGuest: !r.user_id,
    gender: (r.gender as Gender | null) ?? null,
  };
}

const PLAYER_COLS = "id,display_name,user_id,gender";

export async function listPlayers(): Promise<Player[]> {
  const owner = await currentUserId();
  if (!owner) return [];
  const { data, error } = await db()
    .from("players")
    .select(PLAYER_COLS)
    .eq("owner_id", owner)
    .order("display_name");
  if (error) throw error;
  return (data ?? []).map(mapPlayer);
}

/** Semua pemain (untuk panel superadmin). players_read = baca publik. */
export async function adminListPlayers(limit = 1000): Promise<Player[]> {
  const { data, error } = await db()
    .from("players")
    .select(PLAYER_COLS)
    .order("display_name")
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapPlayer);
}

export async function createPlayer(
  name: string,
  opts: { guest?: boolean; gender?: Gender } = {}
): Promise<Player | undefined> {
  const clean = name.trim();
  if (!clean) return undefined;
  const owner = await currentUserId();
  if (!owner) throw new Error("You must be signed in to add a player.");

  // Dedupe by nama (case-insensitive) milik user ini.
  const { data: existing } = await db()
    .from("players")
    .select(PLAYER_COLS)
    .eq("owner_id", owner)
    .ilike("display_name", clean)
    .limit(1);
  if (existing && existing.length) {
    const p = mapPlayer(existing[0]!);
    // Isi gender bila belum ada & disediakan.
    if (opts.gender && !p.gender) {
      await db().from("players").update({ gender: opts.gender }).eq("id", p.id);
      return { ...p, gender: opts.gender };
    }
    return p;
  }

  const { data, error } = await db()
    .from("players")
    .insert({ display_name: clean, owner_id: owner, gender: opts.gender ?? null })
    .select(PLAYER_COLS)
    .single();
  if (error) throw error;
  return mapPlayer(data!);
}

/** Set/ubah gender pemain (untuk format Mix). */
export async function setPlayerGender(
  id: string,
  gender: Gender | null
): Promise<void> {
  const { error } = await db().from("players").update({ gender }).eq("id", id);
  if (error) throw error;
}

/** Gender beberapa pemain by id → { id: gender|null } (untuk format Mix). */
export async function gendersForPlayers(
  ids: string[]
): Promise<Record<string, Gender | null>> {
  if (!ids.length) return {};
  const { data } = await db().from("players").select("id,gender").in("id", ids);
  const out: Record<string, Gender | null> = {};
  for (const r of data ?? []) out[r.id] = (r.gender as Gender | null) ?? null;
  return out;
}

export async function deletePlayer(id: string): Promise<void> {
  const { error } = await db().from("players").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Gabungkan pemain TAMU ke sebuah AKUN: ganti nama tamu → nama akun di semua
 * turnamen (player_names, player_ids, teams, rounds), lalu hapus baris tamu.
 * Identitas ranking = NAMA, jadi setelah ini history tamu jadi milik akun.
 * Superadmin-only (RLS sa_all_events/sa_all_players). Mengembalikan jumlah event.
 */
export async function mergeGuestIntoAccount(
  guestId: string,
  guestName: string,
  accountId: string,
  accountName: string
): Promise<{ events: number }> {
  // Nama sudah sama → history sudah otomatis gabung; cukup hapus baris tamu.
  if (guestName === accountName) {
    await deletePlayer(guestId);
    return { events: 0 };
  }

  const all = await listVisibleEvents();
  const affected = all.filter(
    (e) => e.players.includes(guestName) || e.playerIds.includes(guestId)
  );
  // Cegah konflik: tamu & akun pernah main di turnamen yang sama.
  const clash = affected.find((e) => e.players.includes(accountName));
  if (clash)
    throw new Error(
      `Guest and account are both in tournament "${clash.name}". Merge cancelled to avoid a conflict.`
    );

  const rn = (n: string) => (n === guestName ? accountName : n);
  const ri = (id: string) => (id === guestId ? accountId : id);

  for (const e of affected) {
    const rounds = e.rounds.map((r) => ({
      ...r,
      resting: (r.resting ?? []).map(rn),
      matches: r.matches.map((m) => ({
        ...m,
        teamA: m.teamA.map(rn) as [string, string],
        teamB: m.teamB.map(rn) as [string, string],
      })),
    }));
    const teams = (e.teams ?? []).map(
      (t) => [rn(t[0]), rn(t[1])] as [string, string]
    );
    const { error } = await db()
      .from("events")
      .update({
        player_names: e.players.map(rn),
        player_ids: e.playerIds.map(ri),
        teams,
        rounds,
      })
      .eq("id", e.id);
    if (error) throw error;
  }

  await deletePlayer(guestId);
  return { events: affected.length };
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
    .insert({ display_name: name.trim() || "Player", user_id: uid, owner_id: uid });
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
      name: pr.name ?? pr.username ?? "Player",
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
  if (!uid) throw new Error("You must be signed in.");
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.username !== undefined) row.username = patch.username.trim().toLowerCase();
  if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;

  const { error } = await db().from("profiles").update(row).eq("id", uid);
  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      throw new Error("Username is already taken. Try another.");
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
  description: string | null;
  notes: string | null;
  photoUrl: string | null;
  createdAt: number;
  memberIds: string[];
  visibility: "private" | "public";
  joinCode: string | null;
  /** Peran user saat ini di liga ini (null bila bukan anggota). */
  myRole: "owner" | "admin" | "member" | null;
}

const LEAGUE_COLS =
  "id,name,description,notes,photo_url,created_at,visibility,join_code,league_members(player_id)";

function mapLeague(r: any, myRole: League["myRole"] = null): League {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    notes: r.notes ?? null,
    photoUrl: r.photo_url ?? null,
    createdAt: Date.parse(r.created_at),
    memberIds: (r.league_members ?? []).map((m: any) => m.player_id),
    visibility: r.visibility ?? "private",
    joinCode: r.join_code ?? null,
    myRole,
  };
}

/** Kode join liga private — 6 huruf/angka tanpa karakter ambigu. */
function genJoinCode(): string {
  const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += ABC[Math.floor(Math.random() * ABC.length)];
  return s;
}

/** Liga yang user ikuti (sebagai anggota) — termasuk yang dibuat sendiri. */
export async function listLeagues(): Promise<League[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await db()
    .from("league_users")
    .select(`role, leagues(${LEAGUE_COLS})`)
    .eq("user_id", uid)
    .eq("status", "member");
  if (error) throw error;
  return (data ?? [])
    .filter((r: any) => r.leagues)
    .map((r: any) => mapLeague(r.leagues, r.role))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getLeague(id: string): Promise<League | undefined> {
  const uid = await currentUserId();
  const { data, error } = await db()
    .from("leagues")
    .select(LEAGUE_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  let role: League["myRole"] = null;
  if (uid) {
    const { data: mem } = await db()
      .from("league_users")
      .select("role,status")
      .eq("league_id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (mem?.status === "member") role = mem.role;
  }
  return mapLeague(data, role);
}

export interface NewLeague {
  name: string;
  visibility?: "private" | "public";
  description?: string;
  notes?: string;
  photoUrl?: string | null;
}

export async function createLeague(input: NewLeague): Promise<League> {
  const owner = await currentUserId();
  if (!owner) throw new Error("You must be signed in to create a league.");
  const visibility = input.visibility ?? "private";
  const { data, error } = await db()
    .from("leagues")
    .insert({
      name: input.name.trim() || "Untitled League",
      owner_id: owner,
      description: input.description?.trim() || null,
      notes: input.notes?.trim() || null,
      photo_url: input.photoUrl || null,
      visibility,
      join_code: visibility === "private" ? genJoinCode() : null,
    })
    .select(LEAGUE_COLS)
    .single();
  if (error) throw error;
  return mapLeague(data!);
}

export interface LeaguePatch {
  name?: string;
  description?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
  visibility?: "private" | "public";
}

/** Edit pengaturan liga (admin/owner; ditegakkan RLS leagues_update). */
export async function updateLeague(
  id: string,
  patch: LeaguePatch
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined)
    row.name = patch.name.trim() || "Untitled League";
  if (patch.description !== undefined)
    row.description = patch.description?.trim() || null;
  if (patch.notes !== undefined) row.notes = patch.notes?.trim() || null;
  if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl || null;
  if (patch.visibility !== undefined) {
    row.visibility = patch.visibility;
    if (patch.visibility === "public") {
      row.join_code = null; // publik tak pakai kode
    } else {
      // private: pertahankan kode lama, buat baru bila belum ada.
      const { data } = await db()
        .from("leagues")
        .select("join_code")
        .eq("id", id)
        .maybeSingle();
      if (!data?.join_code) row.join_code = genJoinCode();
    }
  }
  const { error } = await db().from("leagues").update(row).eq("id", id);
  if (error) throw error;
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

/* ---------- Sosial: discover / join / anggota ---------- */

export interface DiscoverLeague {
  id: string;
  name: string;
  createdAt: number;
  memberCount: number;
  myStatus: "member" | "pending" | null;
}

/** Liga PUBLIC yang bisa ditemukan & di-request gabung. */
export async function discoverLeagues(q?: string): Promise<DiscoverLeague[]> {
  const uid = await currentUserId();
  let query = db()
    .from("leagues")
    .select("id,name,created_at,league_users(user_id,status)")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(50);
  if (q && q.trim()) query = query.ilike("name", `%${q.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r: any) => {
    const lu = r.league_users ?? [];
    return {
      id: r.id,
      name: r.name,
      createdAt: Date.parse(r.created_at),
      memberCount: lu.filter((m: any) => m.status === "member").length,
      myStatus: uid
        ? (lu.find((m: any) => m.user_id === uid)?.status ?? null)
        : null,
    };
  });
}

export interface LatestLeague {
  id: string;
  name: string;
  createdAt: number;
  memberCount: number;
  visibility: "private" | "public";
  myStatus: "member" | "pending" | null;
}

/**
 * Liga terbaru GLOBAL (private + public) untuk Beranda. RLS leagues = baca
 * publik; "private" hanya membatasi bergabung, bukan menyembunyikan dari daftar.
 */
export async function latestLeagues(limit = 8): Promise<LatestLeague[]> {
  const uid = await currentUserId();
  const { data, error } = await db()
    .from("leagues")
    .select("id,name,created_at,visibility,league_users(user_id,status)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => {
    const lu = r.league_users ?? [];
    return {
      id: r.id,
      name: r.name,
      createdAt: Date.parse(r.created_at),
      memberCount: lu.filter((m: any) => m.status === "member").length,
      visibility: (r.visibility ?? "private") as "private" | "public",
      myStatus: uid
        ? (lu.find((m: any) => m.user_id === uid)?.status ?? null)
        : null,
    };
  });
}

/** Turnamen publik (untuk halaman Jelajah). */
export async function discoverEvents(q?: string): Promise<DbEvent[]> {
  let query = db()
    .from("events")
    .select(EVENT_COLS)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(50);
  if (q && q.trim()) query = query.ilike("name", `%${q.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}

/** Daftar/cari pemain akun (untuk halaman Jelajah). */
export async function discoverPlayers(q?: string): Promise<AccountUser[]> {
  let query = db()
    .from("profiles")
    .select("id,name,username,avatar_url")
    .order("name")
    .limit(50);
  if (q && q.trim())
    query = query.or(
      `name.ilike.%${q.trim()}%,username.ilike.%${q.trim()}%`
    );
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    userId: p.id,
    name: p.name ?? p.username ?? "Player",
    username: p.username,
    avatarUrl: p.avatar_url,
  }));
}

/** Request gabung liga public → status pending (perlu approval). */
export async function requestJoin(leagueId: string): Promise<void> {
  const { error } = await db().rpc("request_join", { lid: leagueId });
  if (error) throw error;
}

/** Gabung liga private via kode → langsung member. Mengembalikan id liga. */
export async function joinWithCode(code: string): Promise<string> {
  const { data, error } = await db().rpc("join_with_code", {
    code: code.trim().toUpperCase(),
  });
  if (error) throw error;
  return data as string;
}

/** Undang user (oleh admin/owner) → langsung member. */
export async function inviteUser(
  leagueId: string,
  userId: string
): Promise<void> {
  const { error } = await db().rpc("invite_user", {
    lid: leagueId,
    uid: userId,
  });
  if (error) throw error;
}

export interface LeagueMember {
  userId: string;
  status: "pending" | "member";
  role: "owner" | "admin" | "member";
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

/** Daftar anggota + permintaan pending sebuah liga (dengan profil). */
export async function listLeagueMembers(
  leagueId: string
): Promise<LeagueMember[]> {
  const { data: lus, error } = await db()
    .from("league_users")
    .select("user_id,status,role,created_at")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const ids = (lus ?? []).map((m: any) => m.user_id);
  const profs = new Map<string, any>();
  if (ids.length) {
    const { data: ps } = await db()
      .from("profiles")
      .select("id,name,username,avatar_url")
      .in("id", ids);
    for (const p of ps ?? []) profs.set(p.id, p);
  }
  return (lus ?? []).map((m: any) => {
    const p = profs.get(m.user_id);
    return {
      userId: m.user_id,
      status: m.status,
      role: m.role,
      name: p?.name ?? p?.username ?? "Player",
      username: p?.username ?? null,
      avatarUrl: p?.avatar_url ?? null,
    };
  });
}

/** Keluar dari liga (diri sendiri). */
export async function leaveLeague(leagueId: string): Promise<void> {
  const uid = await currentUserId();
  if (uid) await removeMember(leagueId, uid);
}

/** Setujui permintaan gabung (admin/owner). */
export async function approveMember(
  leagueId: string,
  userId: string
): Promise<void> {
  const { error } = await db()
    .from("league_users")
    .update({ status: "member" })
    .eq("league_id", leagueId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Tolak permintaan / keluarkan anggota (admin/owner) atau keluar sendiri. */
export async function removeMember(
  leagueId: string,
  userId: string
): Promise<void> {
  const { error } = await db()
    .from("league_users")
    .delete()
    .eq("league_id", leagueId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Angkat/turunkan role anggota (admin/owner; ditegakkan RLS lu_admin_update). */
export async function setMemberRole(
  leagueId: string,
  userId: string,
  role: "admin" | "member"
): Promise<void> {
  const { error } = await db()
    .from("league_users")
    .update({ role })
    .eq("league_id", leagueId)
    .eq("user_id", userId);
  if (error) throw error;
}

export interface AccountUser {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

/** Cari user akun (untuk invite) — mengembalikan user_id (= auth/profile id). */
export async function searchAccounts(query: string): Promise<AccountUser[]> {
  const q = query.trim().replace(/[%,]/g, "");
  if (!q) return [];
  const { data, error } = await db()
    .from("profiles")
    .select("id,name,username,avatar_url")
    .or(`name.ilike.%${q}%,username.ilike.%${q}%`)
    .limit(15);
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    userId: p.id,
    name: p.name ?? p.username ?? "Player",
    username: p.username,
    avatarUrl: p.avatar_url,
  }));
}

/* ---------- Event ---------- */

export interface DbEvent {
  id: string;
  ownerId: string;
  leagueId: string | null;
  name: string;
  format: Format;
  courts: number;
  scoring: ScoringConfig;
  randomizeStart: boolean;
  status: "live" | "finished";
  visibility: "inherit" | "private" | "public";
  description: string | null;
  /** Catatan (HTML dari editor WYSIWYG). */
  notes: string | null;
  /** Foto turnamen (data URL / link). */
  photoUrl: string | null;
  /** Jadwal mulai (ms). null = mulai sekarang/segera. */
  startAt: number | null;
  /** Pengaturan leaderboard sesi (diatur saat buat sesi). */
  standingsSort: "points" | "wins";
  tiebreak: "unique" | "allow" | "skip";
  playerIds: string[];
  /** Nama peserta (identitas engine). */
  players: string[];
  teams: Pair[];
  rounds: Round[];
  scores: Scores;
  createdAt: number;
}

const EVENT_COLS =
  "id,league_id,owner_id,name,format,courts,scoring,randomize_start,status,visibility,description,notes,photo_url,start_at,standings_sort,tiebreak,player_ids,player_names,teams,rounds,scores,created_at";

function mapEvent(r: any): DbEvent {
  return {
    id: r.id,
    ownerId: r.owner_id,
    leagueId: r.league_id,
    name: r.name,
    format: r.format,
    courts: r.courts,
    scoring: r.scoring,
    randomizeStart: r.randomize_start,
    status: r.status,
    visibility: r.visibility ?? "inherit",
    description: r.description ?? null,
    notes: r.notes ?? null,
    photoUrl: r.photo_url ?? null,
    startAt: r.start_at ? Date.parse(r.start_at) : null,
    standingsSort: r.standings_sort ?? "points",
    tiebreak: r.tiebreak ?? "unique",
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
    .order("created_at", { ascending: false });
  if (leagueId === null) {
    // Turnamen lepas milikku.
    q = q.eq("owner_id", owner).is("league_id", null);
  } else if (typeof leagueId === "string") {
    // Semua sesi liga yang boleh kulihat (RLS yang menyaring).
    q = q.eq("league_id", leagueId);
  } else {
    // Tanpa argumen: semua sesiku (untuk leaderboard/profil).
    q = q.eq("owner_id", owner);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}

/**
 * Semua sesi yang BOLEH dilihat user (RLS yang menyaring): sesi sendiri +
 * turnamen publik + sesi liga yang diikuti. Dipakai leaderboard & riwayat
 * pemain global — beda dari listEvents() tanpa arg yang hanya sesi sendiri.
 */
export async function listVisibleEvents(): Promise<DbEvent[]> {
  const { data, error } = await db()
    .from("events")
    .select(EVENT_COLS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}

/**
 * Turnamen yang KUIKUTI: yang kubuat (owner) ATAU yang menyertakan aku sebagai
 * peserta (self-player-ku ada di player_ids). Untuk halaman "Kelola turnamen".
 * Dua query lalu digabung — overlap array via .or() rawan salah-parse koma.
 */
export async function myInvolvedEvents(): Promise<DbEvent[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data: pl } = await db().from("players").select("id").eq("user_id", uid);
  const myPlayerIds = (pl ?? []).map((p: any) => p.id as string);

  const queries = [db().from("events").select(EVENT_COLS).eq("owner_id", uid)];
  if (myPlayerIds.length)
    queries.push(
      db().from("events").select(EVENT_COLS).overlaps("player_ids", myPlayerIds)
    );

  const byId = new Map<string, DbEvent>();
  for (const { data, error } of await Promise.all(queries)) {
    if (error) throw error;
    for (const row of data ?? []) byId.set(row.id, mapEvent(row));
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
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
  /** Visibilitas: inherit (ikut liga) | private | public. Default inherit. */
  visibility?: "inherit" | "private" | "public";
  description?: string;
  /** Catatan (HTML dari editor WYSIWYG). */
  notes?: string;
  /** Foto turnamen (data URL / link). */
  photoUrl?: string | null;
  /** Jadwal mulai (ms). null/undefined = sekarang. */
  startAt?: number | null;
  /** Pengaturan leaderboard sesi. Default points / unique. */
  standingsSort?: "points" | "wins";
  tiebreak?: "unique" | "allow" | "skip";
}

export async function createEvent(input: NewEvent): Promise<DbEvent> {
  const owner = await currentUserId();
  if (!owner) throw new Error("You must be signed in to create a session.");
  const { data, error } = await db()
    .from("events")
    .insert({
      league_id: input.leagueId,
      owner_id: owner,
      name: input.name.trim() || "Untitled Session",
      format: input.format,
      courts: input.courts,
      scoring: input.scoring,
      randomize_start: input.randomizeStart,
      status: "live",
      visibility: input.visibility ?? "inherit",
      description: input.description?.trim() || null,
      notes: input.notes?.trim() || null,
      photo_url: input.photoUrl || null,
      start_at: input.startAt ? new Date(input.startAt).toISOString() : null,
      standings_sort: input.standingsSort ?? "points",
      tiebreak: input.tiebreak ?? "unique",
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
  patch: {
    rounds?: Round[];
    scores?: Scores;
    teams?: Pair[];
    status?: string;
    startAt?: number | null;
  }
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.rounds !== undefined) row.rounds = patch.rounds;
  if (patch.scores !== undefined) row.scores = patch.scores;
  if (patch.teams !== undefined) row.teams = patch.teams;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.startAt !== undefined)
    row.start_at = patch.startAt ? new Date(patch.startAt).toISOString() : null;
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

// ── Identitas berbasis ID (terjemah saat baca; data tetap simpan nama) ──
// Peta nama→id untuk satu event (player_names[i] ↔ player_ids[i]).
function nameToId(e: DbEvent): Map<string, string> {
  const m = new Map<string, string>();
  e.players.forEach((nm, i) => {
    const id = e.playerIds[i];
    if (id && !m.has(nm)) m.set(nm, id);
  });
  return m;
}

/** Sama seperti eventResults tapi tim memakai ID pemain (fallback: nama). */
export function eventResultsById(event: DbEvent): MatchResult[] {
  const map = nameToId(event);
  const toId = (nm: string) => map.get(nm) ?? nm; // fallback nama (event lama)
  const out: MatchResult[] = [];
  for (const r of event.rounds) {
    for (const m of r.matches) {
      const s = event.scores[`${r.index}-${m.court}`];
      if (s && s.a + s.b > 0)
        out.push({
          match: {
            court: m.court,
            teamA: [toId(m.teamA[0]!), toId(m.teamA[1]!)] as [string, string],
            teamB: [toId(m.teamB[0]!), toId(m.teamB[1]!)] as [string, string],
          },
          scoreA: s.a,
          scoreB: s.b,
        });
    }
  }
  return out;
}

/** Peta id→nama tampilan (nama terbaru menang; events urut terbaru dulu). */
function buildNameById(events: DbEvent[]): Record<string, string> {
  const nameById: Record<string, string> = {};
  for (const e of events)
    e.playerIds.forEach((id, i) => {
      if (id && !(id in nameById)) nameById[id] = e.players[i] ?? id;
    });
  return nameById;
}

/** ID self-player user saat ini (untuk deteksi "saya" di ranking). */
export async function myPlayerId(): Promise<string | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data } = await db()
    .from("players")
    .select("id")
    .eq("user_id", uid)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
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
  results: MatchResult[]; // tim memakai ID pemain
  ids: string[]; // semua id peserta (unik)
  nameById: Record<string, string>; // id → nama tampilan
  eventCount: number;
}> {
  const events = await listVisibleEvents();
  const nameById = buildNameById(events);
  const results = events.flatMap(eventResultsById);
  const idSet = new Set<string>();
  for (const e of events) for (const id of e.playerIds) if (id) idSet.add(id);
  // Sertakan id hasil fallback-nama (event lama tanpa player_ids sinkron).
  for (const r of results)
    for (const t of [r.match.teamA, r.match.teamB])
      for (const x of t) {
        idSet.add(x);
        if (!(x in nameById)) nameById[x] = x;
      }
  return { results, ids: [...idSet], nameById, eventCount: events.length };
}

/** Satu pertandingan dari sudut pandang seorang pemain (untuk riwayat profil). */
export interface PlayerMatch {
  eventId: string;
  eventName: string;
  date: number;
  format: Format;
  partner: string;
  opponents: string[];
  scoreFor: number;
  scoreAgainst: number;
  result: "win" | "loss" | "tie";
}

/** Riwayat match seorang pemain (by ID) lintas semua sesi, terbaru dulu. */
export async function playerHistory(playerId: string): Promise<PlayerMatch[]> {
  const events = await listVisibleEvents();
  const nameById = buildNameById(events);
  const nm = (id: string) => nameById[id] ?? id;
  const out: PlayerMatch[] = [];
  for (const e of events) {
    for (const { match, scoreA, scoreB } of eventResultsById(e)) {
      const onA = match.teamA.includes(playerId);
      const onB = match.teamB.includes(playerId);
      if (!onA && !onB) continue;
      const mine = onA ? match.teamA : match.teamB;
      const opp = onA ? match.teamB : match.teamA;
      const sf = onA ? scoreA : scoreB;
      const sa = onA ? scoreB : scoreA;
      out.push({
        eventId: e.id,
        eventName: e.name,
        date: e.createdAt,
        format: e.format,
        partner: nm(mine.find((x) => x !== playerId) ?? playerId),
        opponents: opp.map(nm),
        scoreFor: sf,
        scoreAgainst: sa,
        result: sf > sa ? "win" : sf < sa ? "loss" : "tie",
      });
    }
  }
  return out.sort((a, b) => b.date - a.date);
}
