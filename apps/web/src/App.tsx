import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  useAuth,
  AuthBar,
  signOut,
  updateName,
  displayName,
  handle,
} from "./auth";
import {
  computeStandings,
  computeTeamStandings,
  teamKey,
  reliability,
  type Standing,
  type TeamStanding,
  type Pair,
} from "@pedal/engine";
import { computeRatings } from "./ratings";
import {
  useSession,
  isTeamFormat,
  isScheduledFormat,
  scoreSpec,
  type Format,
  type ScoringConfig,
  type SessionConfig,
  type Session,
} from "./session";
import {
  listLeagues,
  listEvents,
  listPlayers,
  createPlayer,
  deletePlayer,
  searchUsers,
  ensureSelfPlayer,
  getMyProfile,
  updateProfile,
  getLeague,
  createLeague,
  setLeagueMembers,
  deleteLeague,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  leagueStandings,
  globalStats,
  type DbEvent,
} from "./db";
import { useAsync } from "./useAsync";

type View =
  | { t: "home" }
  | { t: "league"; id: string }
  | { t: "create"; leagueId: string | null }
  | { t: "session"; id: string }
  | { t: "leaderboard" }
  | { t: "profile" };

export function App() {
  const [view, setView] = useState<View>({ t: "home" });
  const { user } = useAuth();

  // Saat login: pastikan user punya "self-player" (jadi bisa dicari & di-add).
  useEffect(() => {
    if (user) void ensureSelfPlayer(displayName(user));
  }, [user]);

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <Brand
        onHome={() => setView({ t: "home" })}
        onProfile={() => setView({ t: "profile" })}
        user={user}
      />
      <main className="mx-auto max-w-5xl px-4 py-6">
        {view.t === "home" && (
          <HomeScreen user={user} onNavigate={setView} />
        )}
        {view.t === "league" && (
          <LeagueScreen leagueId={view.id} onNavigate={setView} />
        )}
        {view.t === "create" && (
          <CreateScreen
            leagueId={view.leagueId}
            onCreated={(id) => setView({ t: "session", id })}
            onCancel={() =>
              setView(
                view.leagueId
                  ? { t: "league", id: view.leagueId }
                  : { t: "home" }
              )
            }
          />
        )}
        {view.t === "session" && (
          <SessionScreen
            key={view.id}
            eventId={view.id}
            onExit={(ev) =>
              setView(
                ev?.leagueId ? { t: "league", id: ev.leagueId } : { t: "home" }
              )
            }
          />
        )}
        {view.t === "leaderboard" && (
          <LeaderboardScreen onBack={() => setView({ t: "home" })} />
        )}
        {view.t === "profile" && (
          <ProfileScreen user={user} onBack={() => setView({ t: "home" })} />
        )}
      </main>
    </div>
  );
}

/* ---------- Identitas merek (gaya sendiri) ---------- */

function Brand({
  onHome,
  onProfile,
  user,
}: {
  onHome: () => void;
  onProfile: () => void;
  user: User | null;
}) {
  return (
    <header className="border-b border-slate-800 bg-slate-900">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <button onClick={onHome} className="flex items-center gap-3 text-left">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-lime-400 text-lg font-black text-slate-900">
            P
          </span>
          <div className="leading-tight">
            <div className="font-bold tracking-tight text-white">
              Pedal<span className="text-lime-400">Padel</span>
            </div>
            <div className="text-[11px] uppercase tracking-widest text-slate-400">
              liga &amp; matchmaking
            </div>
          </div>
        </button>
        <AuthBar user={user} onProfile={onProfile} />
      </div>
    </header>
  );
}

/* ---------- Profil ---------- */

function ProfileScreen({
  user,
  onBack,
}: {
  user: User | null;
  onBack: () => void;
}) {
  const profileQ = useAsync(() => getMyProfile(), []);
  const profile = profileQ.data;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!user) {
    return (
      <Card title="Profil">
        <p className="text-sm text-slate-500">
          Anda belum masuk. Klik <b>Masuk / Daftar</b> di kanan atas.
        </p>
      </Card>
    );
  }

  const u = user; // sudah dipastikan non-null oleh guard di atas
  const shownName = profile?.name || displayName(u);
  const shownUser = profile?.username || handle(u);
  const shownAvatar = profile?.avatarUrl || null;

  function startEdit() {
    setName(profile?.name || displayName(u));
    setUsername(profile?.username || "");
    setAvatarUrl(profile?.avatarUrl || "");
    setErr(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await updateProfile({
        name,
        username: username.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""),
        avatarUrl: avatarUrl.trim() || null,
      });
      await updateName(name); // sinkron ke metadata (header)
      profileQ.reload();
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <button
        onClick={onBack}
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Kembali
      </button>

      {/* Header */}
      <div className="rounded-2xl bg-slate-900 p-5 text-white">
        {editing ? (
          <div className="space-y-3">
            <label className="block text-xs text-slate-400">Nama lengkap</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-slate-900"
              placeholder="Nama"
            />
            <label className="block text-xs text-slate-400">Username (unik)</label>
            <div className="flex items-center rounded-lg bg-white px-3 text-slate-900">
              <span className="text-slate-400">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full py-2 focus:outline-none"
                placeholder="username"
              />
            </div>
            <label className="block text-xs text-slate-400">
              URL foto (opsional)
            </label>
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-slate-900"
              placeholder="https://…/foto.jpg"
            />
            {err && <p className="text-sm text-red-400">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
              >
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Batal
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            {shownAvatar ? (
              <img
                src={shownAvatar}
                alt=""
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-lime-400 text-2xl font-black text-slate-900">
                {shownName.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-bold">{shownName}</div>
              <div className="text-sm text-slate-400">@{shownUser}</div>
            </div>
            <button
              onClick={startEdit}
              className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            >
              ✎ Ubah
            </button>
          </div>
        )}
      </div>

      {/* Rating */}
      <Card title="📈 Rating">
        <div className="grid grid-cols-2 gap-3 text-center">
          {[
            { k: "Solo", v: "–" },
            { k: "Team", v: "–" },
          ].map((r) => (
            <div key={r.k} className="rounded-xl bg-slate-50 py-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                {r.k}
              </div>
              <div className="mt-1 text-2xl font-bold">{r.v}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Statistik */}
      <Card title="📊 Statistik">
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { k: "Main", v: 0 },
            { k: "Menang", v: 0 },
            { k: "Win %", v: "0%" },
          ].map((s) => (
            <div key={s.k} className="rounded-xl bg-slate-50 py-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                {s.k}
              </div>
              <div className="mt-1 text-2xl font-bold">{s.v}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Riwayat */}
      <Card title="🎾 Pertandingan Terakhir">
        <p className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-400">
          Belum ada pertandingan.
          <br />
          <span className="text-xs">
            Riwayat & statistik terisi setelah data pindah ke cloud.
          </span>
        </p>
      </Card>

      <button
        onClick={() => {
          signOut();
          onBack();
        }}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        Logout
      </button>
    </div>
  );
}

/* ---------- Home: daftar liga & turnamen ---------- */

const FORMAT_LABEL: Record<Format, string> = {
  americano: "Americano",
  mexicano: "Mexicano",
  team_americano: "Team Americano",
  team_mexicano: "Team Mexicano",
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StateText({
  loading,
  error,
  empty,
  emptyText,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
}) {
  if (loading) return <p className="text-sm text-slate-400">Memuat…</p>;
  if (error) return <p className="text-sm text-red-600">Gagal: {error}</p>;
  if (empty) return <p className="text-sm text-slate-400">{emptyText}</p>;
  return null;
}

function HomeScreen({
  user,
  onNavigate,
}: {
  user: User | null;
  onNavigate: (v: View) => void;
}) {
  const leagues = useAsync(() => listLeagues(), []);
  const standalone = useAsync(() => listEvents(null), []);
  const [newLeague, setNewLeague] = useState("");

  if (!user) {
    return (
      <Card title="Selamat datang di PedalPadel">
        <p className="text-sm text-slate-500">
          Klik <b>Masuk / Daftar</b> di kanan atas untuk membuat liga &
          turnamen, dan menyimpan datanya di cloud.
        </p>
      </Card>
    );
  }

  async function addLeague() {
    const name = newLeague.trim();
    if (!name) return;
    const lg = await createLeague(name);
    setNewLeague("");
    onNavigate({ t: "league", id: lg.id });
  }

  const lgList = leagues.data ?? [];
  return (
    <div className="space-y-6">
      <button
        onClick={() => onNavigate({ t: "leaderboard" })}
        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-lime-400 hover:bg-lime-50/40"
      >
        <span className="min-w-0">
          <span className="block font-semibold">🏅 Pemain &amp; Ranking</span>
          <span className="block text-sm text-slate-400">
            Daftar pemain + leaderboard ELO dari semua sesimu
          </span>
        </span>
        <span className="shrink-0 text-xl text-slate-300">›</span>
      </button>

      <Card title="🏆 Liga">
        <div className="mb-4 flex gap-2">
          <input
            value={newLeague}
            onChange={(e) => setNewLeague(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLeague()}
            placeholder="Nama liga baru… (mis. Liga Tarkam 2026)"
            className="input flex-1"
          />
          <button
            onClick={addLeague}
            className="rounded-lg bg-lime-400 px-4 text-sm font-semibold text-slate-900 hover:bg-lime-300"
          >
            + Liga
          </button>
        </div>
        <StateText
          loading={leagues.loading}
          error={leagues.error}
          empty={lgList.length === 0}
          emptyText="Belum ada liga."
        />
        <ul className="space-y-2">
          {lgList.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 hover:border-lime-400 hover:bg-lime-50/40"
            >
              <button
                onClick={() => onNavigate({ t: "league", id: l.id })}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
              >
                <span className="truncate font-semibold">{l.name}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {l.memberIds.length} anggota · {fmtDate(l.createdAt)}
                </span>
              </button>
              <button
                onClick={async () => {
                  if (
                    confirm(
                      `Hapus liga "${l.name}"? Sesi di dalamnya jadi turnamen lepas (tidak ikut terhapus).`
                    )
                  ) {
                    await deleteLeague(l.id);
                    leagues.reload();
                    standalone.reload();
                  }
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                aria-label="Hapus liga"
                title="Hapus liga"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="🎾 Turnamen Lepas">
        <button
          onClick={() => onNavigate({ t: "create", leagueId: null })}
          className="mb-4 w-full rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:border-lime-400 hover:text-slate-900"
        >
          + Buat Turnamen Lepas
        </button>
        <StateText
          loading={standalone.loading}
          error={standalone.error}
          empty={(standalone.data ?? []).length === 0}
          emptyText="Belum ada turnamen."
        />
        <EventList
          events={standalone.data ?? []}
          onOpen={(id) => onNavigate({ t: "session", id })}
          onDelete={async (id) => {
            await deleteEvent(id);
            standalone.reload();
          }}
        />
      </Card>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const style =
    rank === 1
      ? "bg-amber-300 text-amber-900"
      : rank === 2
        ? "bg-slate-300 text-slate-700"
        : rank === 3
          ? "bg-orange-300 text-orange-900"
          : "bg-slate-100 text-slate-500";
  return (
    <span
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums ${style}`}
    >
      {rank}
    </span>
  );
}

/**
 * Pemain & Ranking — semua pemain terdaftar dengan rank/rating ELO (dari semua
 * sesi user), plus daftar/hapus pemain. Yang sudah main diperingkat; yang belum
 * tampil di bawah. Rating dihitung ulang dari hasil match (keyed by nama).
 */
function LeaderboardScreen({ onBack }: { onBack: () => void }) {
  const stats = useAsync(() => globalStats(), []);
  const roster = useAsync(() => listPlayers(), []);
  const [newName, setNewName] = useState("");

  async function register() {
    if (await createPlayer(newName)) {
      setNewName("");
      roster.reload();
    }
  }
  async function remove(id: string, name: string) {
    if (!confirm(`Hapus pemain "${name}" dari daftar?`)) return;
    await deletePlayer(id);
    roster.reload();
  }

  const rows = (() => {
    const players = roster.data ?? [];
    const data = stats.data;
    const byName = new Map(
      (data ? computeRatings(data.names, data.results) : []).map((r) => [
        r.name,
        r,
      ])
    );
    const st = new Map(
      (data
        ? computeStandings(data.results, { compensate: false })
        : []
      ).map((s) => [s.playerId, s])
    );
    return players
      .map((p) => {
        const r = byName.get(p.name);
        return {
          id: p.id,
          name: p.name,
          isGuest: p.isGuest,
          rating: r?.rating ?? null,
          played: r?.matchesPlayed ?? 0,
          st: st.get(p.name),
        };
      })
      .sort((a, b) => {
        if ((a.played > 0) !== (b.played > 0)) return a.played > 0 ? -1 : 1;
        if (a.played > 0 && b.played > 0)
          return b.rating! - a.rating! || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
      });
  })();

  const playedCount = rows.filter((r) => r.played > 0).length;
  let rank = 0;

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Kembali
      </button>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold">🏅 Pemain &amp; Ranking</h2>
          {stats.data && (
            <span className="text-xs text-slate-400">
              {stats.data.eventCount} sesi
            </span>
          )}
        </div>
        <p className="mb-3 text-sm text-slate-400">
          Ranking ELO gabungan dari semua sesimu (rating awal 1000). Pemain belum
          main tampil di bawah.
        </p>

        {/* Daftarkan pemain */}
        <div className="mb-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && register()}
            placeholder="Daftarkan pemain baru…"
            className="input flex-1"
          />
          <button
            onClick={register}
            className="rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700"
          >
            Daftar
          </button>
        </div>

        <StateText
          loading={stats.loading || roster.loading}
          error={stats.error || roster.error}
          empty={!stats.loading && !roster.loading && rows.length === 0}
          emptyText="Belum ada pemain. Daftarkan di atas."
        />

        <ol className="space-y-1.5">
          {rows.map((r) => {
            const played = r.played > 0;
            if (played) rank += 1;
            const rel = Math.round(reliability(r.played) * 100);
            const wl = r.st
              ? `${r.st.wins}–${r.st.losses}${r.st.ties ? "–" + r.st.ties : ""}`
              : "0–0";
            const wr = r.st ? Math.round(r.st.winRate * 100) : 0;
            return (
              <li
                key={r.id}
                className={`flex items-center gap-3 rounded-xl border p-2.5 ${
                  played ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50/60"
                }`}
              >
                {played ? (
                  <RankBadge rank={rank} />
                ) : (
                  <span className="grid h-7 w-7 shrink-0 place-items-center text-xs text-slate-300">
                    –
                  </span>
                )}
                <TeamAvatar name={r.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold text-slate-800">
                      {r.name}
                    </span>
                    {r.isGuest && (
                      <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold uppercase text-amber-700">
                        tamu
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {played ? `${r.played} match · ${wl} · ${wr}% menang` : "belum main"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={`font-bold tabular-nums ${
                      played ? "" : "text-slate-300"
                    }`}
                  >
                    {Math.round(r.rating ?? 1000)}
                  </div>
                  {played && (
                    <div className="text-[10px] text-slate-400">
                      {rel < 100 ? `andal ${rel}%` : "stabil"}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => remove(r.id, r.name)}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-300 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Hapus ${r.name}`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ol>

        {playedCount > 0 && (
          <p className="mt-3 text-center text-xs text-slate-400">
            {playedCount} pemain sudah main · {rows.length} terdaftar
          </p>
        )}
      </section>
    </div>
  );
}

function EventList({
  events,
  onOpen,
  onDelete,
}: {
  events: DbEvent[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (events.length === 0)
    return <p className="text-sm text-slate-400">Belum ada turnamen.</p>;
  return (
    <ul className="space-y-2">
      {events.map((e) => (
        <li
          key={e.id}
          className="group flex items-center gap-2 rounded-xl border border-slate-200 p-3 hover:border-lime-400 hover:bg-lime-50/40"
        >
          <button
            onClick={() => onOpen(e.id)}
            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{e.name}</span>
              <span className="text-xs text-slate-400">
                {FORMAT_LABEL[e.format]} · {e.players.length} pemain ·{" "}
                {fmtDate(e.createdAt)}
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                e.status === "finished"
                  ? "bg-slate-100 text-slate-500"
                  : "bg-lime-100 text-lime-700"
              }`}
            >
              {e.status === "finished" ? "selesai" : "berjalan"}
            </span>
          </button>
          <button
            onClick={() => {
              if (confirm(`Hapus turnamen "${e.name}"?`)) onDelete(e.id);
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
            aria-label="Hapus"
            title="Hapus"
          >
            🗑
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Liga: klasemen akumulatif + daftar sesi ---------- */

function LeagueScreen({
  leagueId,
  onNavigate,
}: {
  leagueId: string;
  onNavigate: (v: View) => void;
}) {
  const leagueQ = useAsync(() => getLeague(leagueId), [leagueId]);
  const eventsQ = useAsync(() => listEvents(leagueId), [leagueId]);
  const standingsQ = useAsync(() => leagueStandings(leagueId), [leagueId]);

  const league = leagueQ.data;
  const events = eventsQ.data ?? [];
  const standings = standingsQ.data?.standings ?? [];

  if (leagueQ.loading) return <p className="text-slate-400">Memuat…</p>;
  if (!league) return <p>Liga tidak ditemukan.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-2xl bg-slate-900 px-5 py-4 text-white">
        <div>
          <h2 className="text-lg font-bold">{league.name}</h2>
          <p className="text-xs text-slate-300">
            {events.length} sesi · dibuat {fmtDate(league.createdAt)}
          </p>
        </div>
        <button
          onClick={() => onNavigate({ t: "create", leagueId })}
          className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-lime-300"
        >
          + Tambah Sesi
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card title="📊 Klasemen Liga (akumulasi pemain)">
          {standings.length === 0 ? (
            <p className="text-sm text-slate-400">
              Belum ada skor. Tambah sesi & input skor untuk mengisi klasemen.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2">Pemain</th>
                  <th className="pb-2 text-right">P</th>
                  <th className="pb-2 text-right" title="Menang-Kalah-Seri">
                    W-L-T
                  </th>
                  <th className="pb-2 text-right" title="Jumlah match dimainkan">
                    Main
                  </th>
                  <th className="pb-2 text-right" title="Selisih poin">
                    Diff
                  </th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <tr key={s.playerId} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                    <td className="py-1.5 font-medium">{s.playerId}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">
                      {s.points}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-500">
                      {s.wins}-{s.losses}-{s.ties}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-500">
                      {s.played}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-500">
                      {s.gamesDiff > 0 ? `+${s.gamesDiff}` : s.gamesDiff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Legend
            items={[
              ["P", "Total poin akumulasi semua sesi"],
              ["W-L-T", "Menang - Kalah - Seri"],
              ["Main", "Jumlah match dimainkan"],
              ["Diff", "Selisih poin (dibuat − kebobolan)"],
            ]}
          />
        </Card>

        <div className="space-y-5">
          <Card title="Sesi dalam liga">
            <StateText
              loading={eventsQ.loading}
              error={eventsQ.error}
              empty={events.length === 0}
              emptyText="Belum ada sesi."
            />
            <EventList
              events={events}
              onOpen={(id) => onNavigate({ t: "session", id })}
              onDelete={async (id) => {
                await deleteEvent(id);
                eventsQ.reload();
                standingsQ.reload();
              }}
            />
          </Card>
          <LeagueRoster leagueId={leagueId} />
        </div>
      </div>
    </div>
  );
}

function LeagueRoster({ leagueId }: { leagueId: string }) {
  const registered = useAsync(() => listPlayers(), []);
  const leagueQ = useAsync(() => getLeague(leagueId), [leagueId]);
  const [members, setMembers] = useState<string[] | null>(null);

  // Inisialisasi member (player ids) dari liga sekali termuat.
  const memberIds = members ?? leagueQ.data?.memberIds ?? [];

  async function toggle(id: string) {
    const next = memberIds.includes(id)
      ? memberIds.filter((m) => m !== id)
      : [...memberIds, id];
    setMembers(next);
    await setLeagueMembers(leagueId, next);
  }

  const list = registered.data ?? [];
  return (
    <Card title="🧑‍🤝‍🧑 Anggota Liga">
      <p className="mb-3 text-xs text-slate-400">
        Pilih pemain terdaftar yang ikut liga ini. Saat tambah sesi, anggota
        otomatis terpilih.
      </p>
      <StateText
        loading={registered.loading}
        error={registered.error}
        empty={list.length === 0}
        emptyText="Belum ada pemain terdaftar — daftarkan dulu di halaman utama."
      />
      {list.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {list.map((p) => {
            const on = memberIds.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  onClick={() => toggle(p.id)}
                  className={`rounded-full px-3 py-1 text-sm transition ${
                    on
                      ? "bg-lime-400 font-medium text-slate-900"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {p.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Setup ---------- */

const FORMATS: { id: Format; name: string; desc: string }[] = [
  {
    id: "americano",
    name: "Americano",
    desc: "Individual. Main dengan & melawan semua.",
  },
  {
    id: "mexicano",
    name: "Mexicano",
    desc: "Individual. Matchup seimbang tiap ronde.",
  },
  {
    id: "team_americano",
    name: "Team Americano",
    desc: "Pasangan tetap. Melawan semua tim.",
  },
  {
    id: "team_mexicano",
    name: "Team Mexicano",
    desc: "Pasangan tetap. Matchup seimbang tiap ronde.",
  },
];

const POINT_OPTIONS = [16, 21, 24, 32, 0]; // 0 = Undefined / bebas
const NORMAL_TARGETS = [3, 4, 5, 6, 7];

function CreateScreen({
  leagueId,
  onCreated,
  onCancel,
}: {
  leagueId: string | null;
  onCreated: (eventId: string) => void;
  onCancel: () => void;
}) {
  const leagueQ = useAsync(
    () => (leagueId ? getLeague(leagueId) : Promise.resolve(undefined)),
    [leagueId]
  );
  const inLeague = leagueQ.data;
  const registered = useAsync(() => listPlayers(), []);
  const registeredList = registered.data ?? [];

  const [name, setName] = useState("");
  const [format, setFormat] = useState<Format>("americano");
  const [courts, setCourts] = useState(1);
  const [scoringType, setScoringType] = useState<"point" | "normal">("point");
  const [points, setPoints] = useState(24);
  const [normalMode, setNormalMode] = useState<"first" | "total">("first");
  const [normalTarget, setNormalTarget] = useState(5);
  const [randomize, setRandomize] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState<"auto" | "manual">("auto");
  const [manualTeams, setManualTeams] = useState<
    { id: string; name: string }[][]
  >([]);
  // Pasangan otomatis (preview sebelum mulai). Disusun ulang tiap pemain/acak
  // berubah; tombol "Acak ulang" me-roll ulang.
  const [autoTeams, setAutoTeams] = useState<{ id: string; name: string }[][]>(
    []
  );

  // Peserta sesi = {id, name, isGuest}. Default: anggota liga (dari registry).
  const [picked, setPicked] = useState<
    { id: string; name: string; isGuest: boolean }[] | null
  >(null);
  const defaultSelected = (inLeague?.memberIds ?? [])
    .map((id) => registeredList.find((p) => p.id === id))
    .filter((p): p is (typeof registeredList)[number] => Boolean(p))
    .map((p) => ({ id: p.id, name: p.name, isGuest: p.isGuest }));
  const selected = picked ?? defaultSelected;
  const names = selected.map((s) => s.name);

  const scoring: ScoringConfig =
    scoringType === "point"
      ? { type: "point", points }
      : { type: "normal", mode: normalMode, target: normalTarget };

  const maxCourts = Math.max(1, Math.floor(names.length / 4));
  const courtsClamped = Math.min(courts, maxCourts);

  const needsEven = isTeamFormat(format);
  const evenOk = !needsEven || names.length % 2 === 0;

  // Pasangan manual (format tim): bersihkan tim yang anggotanya tak lagi dipilih.
  const isManual = isTeamFormat(format) && pairing === "manual";
  const validManualTeams = manualTeams.filter(
    (t) => t.length === 2 && t.every((p) => selected.some((s) => s.id === p.id))
  );
  const manualComplete =
    !isManual ||
    (validManualTeams.length * 2 === selected.length && selected.length >= 4);

  // ── Pasangan otomatis (preview) ──────────────────────────────────────
  const isAuto = isTeamFormat(format) && pairing === "auto";
  const selectedKey = selected.map((s) => s.id).join(",");

  // Susun ulang preview auto saat peserta/urutan/acak berubah.
  useEffect(() => {
    if (!isAuto) return;
    const list = randomize ? shuffle(selected) : selected;
    setAutoTeams(chunkPairs(list));
    // selectedKey & randomize jadi pemicu; selected stabil di dalam render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuto, selectedKey, randomize]);

  const reshuffleAuto = () => setAutoTeams(chunkPairs(shuffle(selected)));
  // Pemain yang belum kebagian tim (jumlah ganjil) — tetap ditampilkan.
  const autoLeftover = selected.filter(
    (s) => !autoTeams.some((t) => t.some((p) => p.id === s.id))
  );

  // Tim final yang dipakai saat mulai: manual atau auto (keduanya di-preview).
  const finalTeams = isManual
    ? validManualTeams
    : isAuto
      ? autoTeams.filter((t) => t.length === 2)
      : null;

  const canStart =
    names.length >= 4 && evenOk && manualComplete && !busy;
  const startLabel = busy
    ? "Membuat…"
    : !evenOk
      ? "Format tim butuh jumlah pemain genap"
      : names.length < 4
        ? "Butuh minimal 4 pemain"
        : !manualComplete
          ? "Pasangkan semua pemain jadi tim dulu"
          : "Mulai Sesi";

  async function addGuest(rawName: string) {
    const n = rawName.trim();
    if (!n || names.includes(n)) return;
    const p = await createPlayer(n, { guest: true }); // jadi record (untuk history)
    if (p) setPicked([...selected, { id: p.id, name: p.name, isGuest: true }]);
  }
  function togglePlayer(p: { id: string; name: string; isGuest: boolean }) {
    setPicked(
      selected.some((s) => s.id === p.id)
        ? selected.filter((s) => s.id !== p.id)
        : [...selected, p]
    );
  }

  async function start() {
    if (!canStart) return;
    setBusy(true);
    try {
      const event = await createEvent({
        leagueId,
        name: name.trim() || "Sesi Tanpa Nama",
        format,
        courts: courtsClamped,
        scoring,
        randomizeStart: randomize,
        participants: selected,
        teams: finalTeams
          ? finalTeams.map(
              (t) => [t[0]!.name, t[1]!.name] as [string, string]
            )
          : undefined,
      });
      onCreated(event.id);
    } catch (e) {
      alert("Gagal membuat sesi: " + (e instanceof Error ? e.message : e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onCancel}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Kembali
        </button>
        <span className="text-xs text-slate-400">
          {inLeague ? `Sesi dalam liga: ${inLeague.name}` : "Turnamen lepas"}
        </span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card title={inLeague ? "Tambah Sesi" : "Buat Turnamen"}>
        <Field label="Nama sesi">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="mis. Tarkam Jumat Malam"
            className="input"
          />
        </Field>

        <Field label="Format">
          <div className="grid gap-2 sm:grid-cols-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`rounded-xl border p-3 text-left transition ${
                  format === f.id
                    ? "border-lime-500 bg-lime-50 ring-1 ring-lime-500"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="font-semibold">{f.name}</div>
                <div className="text-xs text-slate-500">{f.desc}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Jumlah lapangan">
          <Stepper
            value={courtsClamped}
            min={1}
            max={maxCourts}
            onChange={setCourts}
          />
          <span className="ml-2 text-xs text-slate-400">maks {maxCourts}</span>
        </Field>

        <Field label="Sistem skor">
          <Toggle
            value={scoringType === "point"}
            onChange={(v) => setScoringType(v ? "point" : "normal")}
            onLabel="Poin"
            offLabel="Game (normal)"
          />
        </Field>

        {scoringType === "point" ? (
          <Field label="Poin per match">
            <div className="flex flex-wrap gap-1.5">
              {POINT_OPTIONS.map((p) => (
                <Chip
                  key={p}
                  active={points === p}
                  onClick={() => setPoints(p)}
                  label={p === 0 ? "Bebas" : String(p)}
                />
              ))}
            </div>
          </Field>
        ) : (
          <Field label="Tipe game">
            <div className="mb-2">
              <Toggle
                value={normalMode === "first"}
                onChange={(v) => setNormalMode(v ? "first" : "total")}
                onLabel="First to"
                offLabel="Total of"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {NORMAL_TARGETS.map((t) => (
                <Chip
                  key={t}
                  active={normalTarget === t}
                  onClick={() => setNormalTarget(t)}
                  label={String(t)}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {normalMode === "first"
                ? `Tim pertama mencapai ${normalTarget} game menang.`
                : `Main ${normalTarget} game, skor = game yang dimenangkan.`}
            </p>
          </Field>
        )}

        {isTeamFormat(format) && (
          <Field label="Pasangan tim">
            <Toggle
              value={pairing === "auto"}
              onChange={(v) => setPairing(v ? "auto" : "manual")}
              onLabel="Auto"
              offLabel="Manual"
            />
            <p className="mt-1 text-xs text-slate-400">
              {pairing === "auto"
                ? "Pasangan dibentuk otomatis."
                : "Tentukan sendiri tiap tim di bawah."}
            </p>
          </Field>
        )}

        {isTeamFormat(format) && (
          <Field label={isAuto ? "Pratinjau tim" : "Susun tim"}>
            {isManual ? (
              <ManualTeamEditor
                players={selected}
                teams={manualTeams}
                onChange={setManualTeams}
              />
            ) : (
              <AutoTeamPreview
                teams={autoTeams}
                leftover={autoLeftover}
                onReshuffle={reshuffleAuto}
              />
            )}
          </Field>
        )}

        <Field label="Urutan awal pemain">
          <Toggle
            value={randomize}
            onChange={setRandomize}
            onLabel="Acak"
            offLabel="Sesuai input"
          />
        </Field>

        <button
          onClick={start}
          disabled={!canStart}
          className="mt-2 w-full rounded-xl bg-lime-400 px-4 py-3 font-semibold text-slate-900 transition hover:bg-lime-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {startLabel}
        </button>
      </Card>

      {/* Mobile: pilih pemain dulu (di atas), baru pengaturan + susun tim.
          Desktop: tetap di kolom kanan. */}
      <div className="order-first lg:order-none">
      <Card title={`Pemain (${names.length})`}>
        {/* Cari & tambah dulu, daftar pemain terpilih di bawahnya. */}
        <PlayerPicker
          registered={registeredList}
          selectedIds={selected.map((s) => s.id)}
          onToggle={togglePlayer}
          onAddGuest={addGuest}
        />

        {names.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            Belum ada pemain. Cari nama lalu tambahkan, atau buat tamu.
          </p>
        ) : (
          <ul className="mt-4 space-y-0.5 rounded-xl border border-slate-200 p-1">
            {selected.map((sel) => {
              const guest = sel.isGuest;
              return (
                <li
                  key={sel.id}
                  className="flex items-center gap-2.5 rounded-lg bg-lime-50 px-2 py-1.5 text-sm"
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      guest
                        ? "bg-slate-200 text-slate-600"
                        : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    {sel.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate font-medium text-slate-800">
                      {sel.name}
                    </span>
                    <span
                      className={`rounded px-1 text-[10px] font-semibold uppercase ${
                        guest
                          ? "bg-amber-100 text-amber-700"
                          : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {guest ? "tamu" : "akun"}
                    </span>
                  </span>
                  <button
                    onClick={() => togglePlayer(sel)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-lg text-slate-400 hover:bg-black/10 hover:text-slate-700"
                    aria-label={`Hapus ${sel.name}`}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      </div>
      </div>
    </div>
  );
}

interface PickResult {
  id: string;
  name: string;
  isGuest: boolean;
  isAccount: boolean;
  username?: string | null;
  avatarUrl?: string | null;
}

/**
 * Satu kotak search untuk menambah pemain:
 *  - query kosong → tampilkan pemain terdaftar (quick pick)
 *  - ≥ 3 huruf → gabungkan pemain terdaftar + USER akun yang cocok
 *  - bila tak ada yang sama persis → tombol "tambah sebagai tamu"
 */
function PlayerPicker({
  registered,
  selectedIds,
  onToggle,
  onAddGuest,
}: {
  registered: { id: string; name: string; isGuest: boolean }[];
  selectedIds: string[];
  onToggle: (p: { id: string; name: string; isGuest: boolean }) => void;
  onAddGuest: (name: string) => void | Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [accounts, setAccounts] = useState<PickResult[]>([]);
  const [loading, setLoading] = useState(false);

  const term = q.trim();
  const enoughChars = term.length >= 3;

  // Cari user akun saat ≥3 huruf (debounce).
  useEffect(() => {
    if (!enoughChars) {
      setAccounts([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const found = await searchUsers(term);
        setAccounts(
          found.map((p) => ({
            id: p.id,
            name: p.name,
            isGuest: false,
            isAccount: true,
            username: p.username,
            avatarUrl: p.avatarUrl,
          }))
        );
      } catch {
        setAccounts([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [term, enoughChars]);

  // Hanya tampil saat mengetik: cocokkan nama terdaftar (+ hasil akun),
  // lalu buang yang sudah ditambahkan ("sisanya" yang bisa di-add).
  const lower = term.toLowerCase();
  const open = term.length >= 3;
  const localMatches: PickResult[] = open
    ? registered
        .filter((p) => p.name.toLowerCase().includes(lower))
        .map((p) => ({
          id: p.id,
          name: p.name,
          isGuest: p.isGuest,
          isAccount: !p.isGuest,
        }))
    : [];
  const merged: PickResult[] = [];
  const seen = new Set<string>();
  for (const p of [...localMatches, ...accounts]) {
    if (!seen.has(p.id) && !selectedIds.includes(p.id)) {
      seen.add(p.id);
      merged.push(p);
    }
  }
  const exactExists = registered.some((p) => p.name.toLowerCase() === lower);

  return (
    <div className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          🔍
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama / @username, atau tambah…"
          className="input w-full pl-9 pr-9"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            aria-label="Bersihkan pencarian"
            className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        )}
      </div>

      {/* Hint sebelum cukup huruf. */}
      {term.length > 0 && term.length < 3 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400 shadow-lg">
          Ketik minimal 3 huruf…
        </div>
      )}

      {/* Dropdown hasil — mulai 3 huruf. */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between px-3 pt-2 text-[11px] text-slate-400">
            <span>Hasil pencarian</span>
            {loading ? <span>mencari…</span> : <span>{merged.length}</span>}
          </div>

          {merged.length > 0 && (
            <ul className="max-h-64 space-y-0.5 overflow-y-auto p-1">
              {merged.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => {
                      onToggle({ id: p.id, name: p.name, isGuest: p.isGuest });
                      setQ("");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-lime-50"
                  >
                    {p.avatarUrl ? (
                      <img
                        src={p.avatarUrl}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                          p.isAccount
                            ? "bg-sky-100 text-sky-700"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-slate-800">
                          {p.name}
                        </span>
                        <span
                          className={`rounded px-1 text-[10px] font-semibold uppercase ${
                            p.isAccount
                              ? "bg-sky-100 text-sky-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {p.isAccount ? "akun" : "tamu"}
                        </span>
                      </span>
                      {p.isAccount && p.username && (
                        <span className="block truncate text-xs text-slate-400">
                          @{p.username}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-lg text-slate-300">+</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Tambah tamu bila nama belum terdaftar persis. */}
          {!exactExists && (
            <button
              onClick={async () => {
                await onAddGuest(term);
                setQ("");
              }}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-200 text-amber-800">
                +
              </span>
              Tambah “{term}” sebagai tamu
            </button>
          )}

          {merged.length === 0 && exactExists && (
            <p className="px-3 py-3 text-center text-xs text-slate-400">
              Sudah ditambahkan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Layar sesi (live) ---------- */

function SessionScreen({
  eventId,
  onExit,
}: {
  eventId: string;
  onExit: (ev: DbEvent | undefined) => void;
}) {
  const eventQ = useAsync(() => getEvent(eventId), [eventId]);
  if (eventQ.loading) return <p className="text-slate-400">Memuat sesi…</p>;
  if (!eventQ.data) return <p>Sesi tidak ditemukan.</p>;
  return <SessionInner event={eventQ.data} onExit={onExit} />;
}

function SessionInner({
  event,
  onExit,
}: {
  event: DbEvent;
  onExit: (ev: DbEvent | undefined) => void;
}) {
  const config: SessionConfig = {
    name: event.name,
    format: event.format,
    courts: event.courts,
    scoring: event.scoring,
    randomizeStart: event.randomizeStart,
  };
  const restore =
    event.rounds.length > 0
      ? { rounds: event.rounds, scores: event.scores, teams: event.teams }
      : undefined;

  const session = useSession(
    { config, players: event.players, restore, initialTeams: event.teams },
    () => onExit(event)
  );

  // Persist perubahan ronde/skor/tim ke Supabase (debounce 600ms).
  useEffect(() => {
    const t = setTimeout(() => {
      void updateEvent(event.id, {
        rounds: session.rounds,
        scores: session.scores,
        teams: session.teams,
      });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, session.rounds, session.scores, session.teams]);

  return (
    <div className="space-y-5">
      <MetaBar session={session} event={event} onExit={onExit} />
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <RoundsPanel session={session} />
        <div className="space-y-5">
          <Leaderboard session={session} />
          {/* Rating ELO disembunyikan sementara. */}
        </div>
      </div>
    </div>
  );
}

function MetaBar({
  session,
  event,
  onExit,
}: {
  session: Session;
  event: DbEvent;
  onExit: (ev: DbEvent | undefined) => void;
}) {
  const { config, rounds } = session;
  const items = [
    FORMAT_LABEL[config.format],
    scoreSpec(config.scoring).label,
    `${session.players.length} pemain`,
    `${rounds.length} ronde`,
    `${config.courts} lapangan`,
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-4 text-white">
      <div>
        <button
          onClick={() => onExit(event)}
          className="mb-1 text-xs text-slate-400 hover:text-lime-400"
        >
          ← Kembali
        </button>
        <h2 className="text-lg font-bold">{config.name}</h2>
        <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-300">
          {items.map((it, i) => (
            <span key={i}>
              {i > 0 && <span className="mr-2 text-slate-600">·</span>}
              {it}
            </span>
          ))}
        </p>
      </div>
      <button
        onClick={async () => {
          await updateEvent(event.id, { status: "finished" });
          onExit(event);
        }}
        className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
      >
        Tandai selesai
      </button>
    </div>
  );
}

function RoundsPanel({ session }: { session: Session }) {
  const { rounds, scores, config } = session;
  const [active, setActive] = useState(rounds.length - 1);
  const [picking, setPicking] = useState<{
    court: number;
    side: "a" | "b";
  } | null>(null);

  // Lompat ke ronde terbaru saat ronde ditambah.
  useEffect(() => setActive(rounds.length - 1), [rounds.length]);

  const round = rounds[active];
  const isLast = active === rounds.length - 1;
  const pickMatch = picking
    ? round?.matches.find((m) => m.court === picking.court)
    : undefined;

  return (
    <Card title="Ronde Pertandingan">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {rounds.map((r, i) => (
          <button
            key={r.index}
            onClick={() => setActive(i)}
            className={`h-8 w-8 rounded-lg text-sm font-semibold ${
              i === active
                ? "bg-lime-400 text-slate-900"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {round && (
        <div className="space-y-3">
          {round.resting.length > 0 && (
            <p className="text-xs text-slate-400">
              Istirahat: {round.resting.join(", ")}
            </p>
          )}
          {round.matches.map((m) => {
            const s = scores[`${round.index}-${m.court}`];
            const played = !!s && s.a + s.b > 0;
            return (
              <div
                key={m.court}
                className="rounded-xl border border-slate-200 p-3"
              >
                <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
                  <span>Lapangan {m.court}</span>
                  {played && (
                    <span className="rounded-full bg-lime-100 px-2 py-0.5 font-semibold text-lime-700">
                      selesai
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Sisi kiri: klik → pilih skor tim A */}
                  <button
                    onClick={() => setPicking({ court: m.court, side: "a" })}
                    className="flex flex-1 items-center justify-between gap-2 rounded-lg p-1 text-left transition hover:bg-lime-50"
                  >
                    <span className="text-sm font-medium">
                      {m.teamA.join(" & ")}
                    </span>
                    <ScoreChip value={s?.a} />
                  </button>
                  <span className="text-slate-300">:</span>
                  {/* Sisi kanan: klik → pilih skor tim B */}
                  <button
                    onClick={() => setPicking({ court: m.court, side: "b" })}
                    className="flex flex-1 items-center justify-between gap-2 rounded-lg p-1 text-right transition hover:bg-lime-50"
                  >
                    <ScoreChip value={s?.b} />
                    <span className="text-sm font-medium">
                      {m.teamB.join(" & ")}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {isScheduledFormat(config.format) ? (
          // Americano: semua ronde sudah tampil; cuma opsi acak ulang jadwal.
          <button
            onClick={session.reshuffle}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-100"
          >
            Acak ulang jadwal
          </button>
        ) : (
          <>
            <button
              onClick={session.nextRound}
              disabled={!session.canAddRound}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {!session.lastRoundComplete
                ? "Lengkapi skor ronde ini dulu"
                : "Ronde berikutnya →"}
            </button>
            {isLast && (
              <button
                onClick={session.reshuffle}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-100"
              >
                Acak ulang
              </button>
            )}
          </>
        )}
      </div>

      {round && pickMatch && picking && (
        <ScorePicker
          roundIndex={round.index}
          match={pickMatch}
          initialSide={picking.side}
          spec={scoreSpec(config.scoring)}
          current={scores[`${round.index}-${pickMatch.court}`]}
          onPick={(a, b) =>
            session.setMatchScore(round.index, pickMatch.court, a, b)
          }
          onClose={() => setPicking(null)}
        />
      )}
    </Card>
  );
}

function ScoreChip({ value }: { value?: number }) {
  return (
    <span className="grid h-11 w-12 place-items-center rounded-lg bg-slate-900 text-lg font-bold text-white tabular-nums">
      {value ?? "–"}
    </span>
  );
}

function ScorePicker({
  roundIndex,
  match,
  initialSide,
  spec,
  current,
  onPick,
  onClose,
}: {
  roundIndex: number;
  match: import("@pedal/engine").Match;
  initialSide: "a" | "b";
  spec: import("./session").ScoreSpec;
  current?: { a: number; b: number };
  onPick: (a: number, b: number) => void;
  onClose: () => void;
}) {
  // Sisi yang sedang dipilih (default = sisi yang diklik). Bisa diganti via tab.
  const [side, setSide] = useState<"a" | "b">(initialSide);
  const a = current?.a;
  const b = current?.b;

  function pick(n: number) {
    if (spec.complement) {
      // Total tetap: lawan otomatis = max − nilai.
      if (side === "a") onPick(n, spec.max - n);
      else onPick(spec.max - n, n);
    } else {
      // Skor bebas: hanya ubah sisi aktif.
      if (side === "a") onPick(n, b ?? 0);
      else onPick(a ?? 0, n);
    }
    onClose(); // langsung terpilih & tutup, tanpa klik "Selesai"
  }

  const activeValue = side === "a" ? a : b;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">
          Ronde {roundIndex + 1} · Lapangan {match.court}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <TeamScoreTab
            active={side === "a"}
            label={match.teamA.join(" & ")}
            value={a}
            onClick={() => setSide("a")}
          />
          <TeamScoreTab
            active={side === "b"}
            label={match.teamB.join(" & ")}
            value={b}
            onClick={() => setSide("b")}
          />
        </div>

        <div className="mb-1 text-sm font-medium text-slate-600">
          Pilih skor · {spec.label}
        </div>
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: spec.max + 1 }, (_, n) => (
            <button
              key={n}
              onClick={() => pick(n)}
              className={`rounded-lg py-2.5 text-sm font-semibold tabular-nums transition ${
                activeValue === n
                  ? "bg-lime-400 text-slate-900"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-between">
          <button
            onClick={() => {
              onPick(0, 0);
              onClose();
            }}
            className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-100"
          >
            Reset 0:0
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamScoreTab({
  active,
  label,
  value,
  onClick,
}: {
  active: boolean;
  label: string;
  value?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
        active
          ? "border-lime-500 bg-lime-50 ring-1 ring-lime-500"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <span className="truncate text-sm font-medium">{label}</span>
      <span className="ml-2 text-lg font-bold tabular-nums">{value ?? "–"}</span>
    </button>
  );
}

function zeroStanding(playerId: string): Standing {
  return {
    playerId,
    points: 0,
    compensation: 0,
    adjustedPoints: 0,
    gamesDiff: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    played: 0,
    winRate: 0,
  };
}

function Leaderboard({ session }: { session: Session }) {
  if (isTeamFormat(session.config.format)) {
    return <TeamLeaderboard session={session} />;
  }
  // Seed dengan SEMUA pemain (skor 0) supaya tabel tampil sejak awal.
  const byId = new Map(
    computeStandings(session.results).map((s) => [s.playerId, s])
  );
  const standings = session.players
    .map((p) => byId.get(p) ?? zeroStanding(p))
    .sort(
      (a, b) =>
        b.adjustedPoints - a.adjustedPoints ||
        b.gamesDiff - a.gamesDiff ||
        b.wins - a.wins ||
        a.playerId.localeCompare(b.playerId)
    );
  return (
    <Card title="🏆 Klasemen">
      {(
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-2">#</th>
                <th className="pb-2">Pemain</th>
                <th className="pb-2 text-right">P</th>
                <th className="pb-2 text-right" title="Compensation (+M)">
                  +M
                </th>
                <th className="pb-2 text-right" title="Menang-Kalah-Seri">
                  W-L-T
                </th>
                <th className="pb-2 text-right" title="Jumlah match dimainkan">
                  Main
                </th>
                <th className="pb-2 text-right" title="Selisih poin">
                  Diff
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.playerId} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                  <td className="py-1.5 font-medium">{s.playerId}</td>
                  <td className="py-1.5 text-right font-bold tabular-nums">
                    {s.adjustedPoints}
                  </td>
                  <td className="py-1.5 text-right text-emerald-600">
                    {s.compensation > 0 ? `+${s.compensation}` : "–"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">
                    {s.wins}-{s.losses}-{s.ties}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">
                    {s.played}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">
                    {s.gamesDiff > 0 ? `+${s.gamesDiff}` : s.gamesDiff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Legend
        items={[
          ["P", "Poin (sudah termasuk +M)"],
          ["+M", "Poin kompensasi karena main lebih sedikit (bye)"],
          ["W-L-T", "Menang - Kalah - Seri"],
          ["Main", "Jumlah match dimainkan"],
          ["Diff", "Selisih poin (dibuat − kebobolan)"],
        ]}
      />
    </Card>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <dl className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
      {items.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="w-12 shrink-0 font-semibold text-slate-500">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function zeroTeamStanding(team: Pair): TeamStanding {
  return {
    team,
    points: 0,
    gamesDiff: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    played: 0,
    winRate: 0,
  };
}

function TeamLeaderboard({ session }: { session: Session }) {
  // Seed dengan SEMUA tim (skor 0) supaya tabel tampil sejak awal.
  const byKey = new Map(
    computeTeamStandings(session.results).map((s) => [teamKey(s.team), s])
  );
  const standings = session.teams
    .map((t) => byKey.get(teamKey(t)) ?? zeroTeamStanding(t))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.gamesDiff - a.gamesDiff ||
        b.wins - a.wins ||
        teamKey(a.team).localeCompare(teamKey(b.team))
    );
  return (
    <Card title="🏆 Klasemen Tim">
      {(
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-2">#</th>
                <th className="pb-2">Tim</th>
                <th className="pb-2 text-right">P</th>
                <th className="pb-2 text-right" title="Menang-Kalah-Seri">
                  W-L-T
                </th>
                <th className="pb-2 text-right" title="Jumlah match dimainkan">
                  Main
                </th>
                <th className="pb-2 text-right" title="Selisih poin">
                  Diff
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr
                  key={s.team.join("|")}
                  className="border-t border-slate-100"
                >
                  <td className="py-1.5 pr-2 text-slate-400">{i + 1}</td>
                  <td className="py-1.5 font-medium">{s.team.join(" & ")}</td>
                  <td className="py-1.5 text-right font-bold tabular-nums">
                    {s.points}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">
                    {s.wins}-{s.losses}-{s.ties}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">
                    {s.played}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">
                    {s.gamesDiff > 0 ? `+${s.gamesDiff}` : s.gamesDiff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Legend
        items={[
          ["P", "Poin total"],
          ["W-L-T", "Menang - Kalah - Seri"],
          ["Main", "Jumlah match dimainkan"],
          ["Diff", "Selisih poin (dibuat − kebobolan)"],
        ]}
      />
    </Card>
  );
}

// Rating ELO disembunyikan sementara — fungsi & data tetap ada di engine,
// tinggal panggil <RatingsPanel /> lagi untuk memunculkannya.
// function RatingsPanel({ session }: { session: Session }) {
//   const ratings = computeRatings(session.players, session.results);
//   return (
//     <Card title="📈 Rating ELO">
//       ...
//     </Card>
//   );
// }

/* ---------- Primitif UI ---------- */

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-sm font-medium text-slate-600">
        {label}
      </label>
      {children}
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="h-9 w-9 rounded-lg bg-slate-100 text-lg hover:bg-slate-200"
      >
        −
      </button>
      <span className="w-6 text-center font-semibold tabular-nums">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="h-9 w-9 rounded-lg bg-slate-100 text-lg hover:bg-slate-200"
      >
        +
      </button>
    </span>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        active
          ? "bg-slate-900 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

function Toggle({
  value,
  onChange,
  onLabel,
  offLabel,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
      {[
        { v: true, label: onLabel },
        { v: false, label: offLabel },
      ].map((o) => (
        <button
          key={o.label}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-1.5 font-medium ${
            value === o.v
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type ManualPlayer = { id: string; name: string };

// ── Util pasangan tim ──────────────────────────────────────────────────
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Pasangkan berurutan jadi tim berisi 2 (sisa ganjil diabaikan). */
function chunkPairs<T>(arr: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i + 1 < arr.length; i += 2) out.push([arr[i]!, arr[i + 1]!]);
  return out;
}

const AVATAR_COLORS = [
  "bg-rose-200 text-rose-700",
  "bg-amber-200 text-amber-700",
  "bg-lime-200 text-lime-700",
  "bg-emerald-200 text-emerald-700",
  "bg-sky-200 text-sky-700",
  "bg-violet-200 text-violet-700",
  "bg-fuchsia-200 text-fuchsia-700",
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const s =
    parts.length > 1 ? (parts[0]![0] ?? "") + (parts[1]![0] ?? "") : name.slice(0, 2);
  return s.toUpperCase();
}

/** Avatar inisial berwarna (konsisten per nama). */
function TeamAvatar({ name }: { name: string }) {
  return (
    <span
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${avatarColor(
        name
      )}`}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Kerangka kartu tim — header "Tim N" + isi (2 baris kursi). */
function TeamCard({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="mb-1.5 text-xs font-semibold text-lime-600">
        Tim {index + 1}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

const TEAM_GRID = "grid grid-cols-1 gap-2 sm:grid-cols-2";
const EMPTY_HINT =
  "rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400";

/**
 * Pratinjau pasangan otomatis (read-only) — kartu tim grid + tombol acak ulang.
 * Tim yang tampil di sini persis yang dipakai saat sesi dibuat.
 */
function AutoTeamPreview({
  teams,
  leftover,
  onReshuffle,
}: {
  teams: ManualPlayer[][];
  leftover: ManualPlayer[];
  onReshuffle: () => void;
}) {
  const hasLeftover = leftover.length > 0;
  return (
    <div className="space-y-2">
      {teams.length === 0 && !hasLeftover ? (
        <p className={EMPTY_HINT}>Pilih minimal 4 pemain untuk membentuk tim.</p>
      ) : (
        <div className={TEAM_GRID}>
          {teams.map((t, i) => (
            <TeamCard key={i} index={i}>
              {t.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-sm"
                >
                  <TeamAvatar name={p.name} />
                  <span className="truncate">{p.name}</span>
                </div>
              ))}
            </TeamCard>
          ))}

          {/* Kartu untuk pemain sisa (jumlah ganjil) — kursi kedua menunggu. */}
          {hasLeftover && (
            <TeamCard index={teams.length}>
              {leftover.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-sm"
                >
                  <TeamAvatar name={p.name} />
                  <span className="truncate">{p.name}</span>
                </div>
              ))}
              <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2 py-1.5 text-center text-xs text-amber-600">
                menunggu pasangan
              </div>
            </TeamCard>
          )}
        </div>
      )}
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-slate-400">
          {hasLeftover
            ? `${leftover.length} pemain belum kebagian tim (butuh jumlah genap).`
            : "Pasangan dibentuk otomatis."}
        </p>
        {(teams.length > 0 || hasLeftover) && (
          <button
            onClick={onReshuffle}
            className="shrink-0 text-xs font-medium text-lime-700 hover:underline"
          >
            ↻ Acak ulang
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Susun tim manual (format tim): kartu Tim grid dengan 2 kursi. Ketuk kursi
 * untuk membuka daftar pemain (dropdown di tempat) lalu pilih — bisa isi kursi
 * mana saja, urutan bebas. Ketuk × untuk mengosongkan.
 * Controlled — sumber kebenaran ada di `teams` (mentah, boleh separuh terisi).
 */
function ManualTeamEditor({
  players,
  teams,
  onChange,
}: {
  players: ManualPlayer[];
  teams: ManualPlayer[][];
  onChange: (teams: ManualPlayer[][]) => void;
}) {
  const [open, setOpen] = useState<{ team: number; seat: number } | null>(null);

  const inSel = (p: ManualPlayer) => players.some((s) => s.id === p.id);
  const teamCount = Math.floor(players.length / 2);

  // Normalisasi tanpa mengubah urutan: buang pemain yang tak lagi dipilih,
  // cap 2/tim, ambil sebanyak teamCount, lalu pad dengan kursi kosong.
  const slots: ManualPlayer[][] = teams
    .slice(0, teamCount)
    .map((t) => t.filter(inSel).slice(0, 2));
  while (slots.length < teamCount) slots.push([]);

  const assigned = new Set(slots.flatMap((t) => t.map((p) => p.id)));
  const pool = players.filter((p) => !assigned.has(p.id));
  const allPaired = pool.length === 0;

  // Isi/ganti/kosongkan satu kursi (compact agar tak ada celah di tengah).
  function setSeat(teamIdx: number, seatIdx: number, p: ManualPlayer | null) {
    const next = slots.map((t) => [...t]);
    if (p === null) next[teamIdx]!.splice(seatIdx, 1);
    else next[teamIdx]![seatIdx] = p;
    next[teamIdx] = next[teamIdx]!.filter(Boolean);
    onChange(next);
  }

  function autoFill() {
    const next = slots.map((t) => [...t]);
    const rest = [...pool];
    for (const t of next) while (t.length < 2 && rest.length) t.push(rest.shift()!);
    setOpen(null);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {teamCount === 0 ? (
        <p className={EMPTY_HINT}>Pilih minimal 4 pemain untuk membentuk tim.</p>
      ) : (
        <div className={TEAM_GRID}>
          {slots.map((team, i) => (
            <TeamCard key={i} index={i}>
              {[0, 1].map((seat) => {
                const p = team[seat];
                const isOpen = open?.team === i && open?.seat === seat;
                return (
                  <div key={seat} className="relative">
                    {p ? (
                      <div
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                          isOpen ? "bg-lime-100 ring-1 ring-lime-300" : "bg-lime-50"
                        }`}
                      >
                        <TeamAvatar name={p.name} />
                        <button
                          onClick={() =>
                            setOpen(isOpen ? null : { team: i, seat })
                          }
                          className="flex-1 truncate text-left"
                        >
                          {p.name}
                        </button>
                        <button
                          onClick={() => setSeat(i, seat, null)}
                          className="text-slate-400 hover:text-slate-700"
                          aria-label="Kosongkan kursi"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setOpen(isOpen ? null : { team: i, seat })}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-dashed px-2 py-1.5 text-sm ${
                          isOpen
                            ? "border-lime-400 bg-lime-50 text-lime-600"
                            : "border-slate-300 text-slate-400 hover:border-slate-400"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-dashed border-current text-current">
                            +
                          </span>
                          Pilih pemain
                        </span>
                        <span aria-hidden>▾</span>
                      </button>
                    )}

                    {isOpen && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                        {pool.length === 0 ? (
                          <p className="px-2 py-1.5 text-xs text-slate-400">
                            Tak ada pemain tersisa.
                          </p>
                        ) : (
                          pool.map((op) => (
                            <button
                              key={op.id}
                              onClick={() => {
                                setSeat(i, seat, op);
                                setOpen(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-lime-100"
                            >
                              <TeamAvatar name={op.name} />
                              <span className="truncate">{op.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </TeamCard>
          ))}
        </div>
      )}

      {/* Backdrop transparan: ketuk di luar untuk menutup dropdown. */}
      {open && (
        <button
          aria-hidden
          tabIndex={-1}
          onClick={() => setOpen(null)}
          className="fixed inset-0 z-10 cursor-default"
        />
      )}

      <div className="flex items-center justify-between pt-1">
        <p
          className={`text-xs ${
            allPaired ? "text-emerald-600" : "text-slate-400"
          }`}
        >
          {allPaired
            ? "Semua pemain sudah masuk tim."
            : `${pool.length} pemain belum masuk tim.`}
        </p>
        {pool.length >= 1 && (
          <button
            onClick={autoFill}
            className="shrink-0 text-xs font-medium text-lime-700 hover:underline"
          >
            Isi otomatis sisanya
          </button>
        )}
      </div>
    </div>
  );
}

