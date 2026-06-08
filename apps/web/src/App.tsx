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
  discoverLeagues,
  requestJoin,
  joinWithCode,
  inviteUser,
  searchAccounts,
  listLeagueMembers,
  approveMember,
  removeMember,
  leaveLeague,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  leagueStandings,
  globalStats,
  playerHistory,
  type DbEvent,
  type AccountUser,
} from "./db";
import { useAsync } from "./useAsync";

type View =
  | { t: "home" }
  | { t: "leagues" }
  | { t: "league"; id: string }
  | { t: "create"; leagueId: string | null }
  | { t: "session"; id: string }
  | { t: "leaderboard" }
  | { t: "player"; name: string }
  | { t: "discover" }
  | { t: "profile" };

type TabKey = "home" | "leagues" | "main" | "rank" | "profile";

const NAV_TABS: { key: TabKey; label: string; icon: string; view: View }[] = [
  { key: "home", label: "Beranda", icon: "dashboard", view: { t: "home" } },
  { key: "leagues", label: "Liga", icon: "groups", view: { t: "leagues" } },
  { key: "main", label: "Main", icon: "sports_tennis", view: { t: "create", leagueId: null } },
  { key: "rank", label: "Ranking", icon: "leaderboard", view: { t: "leaderboard" } },
  { key: "profile", label: "Profil", icon: "person", view: { t: "profile" } },
];

function activeTab(v: View): TabKey {
  switch (v.t) {
    case "leagues":
    case "league":
    case "discover":
      return "leagues";
    case "create":
    case "session":
      return "main";
    case "leaderboard":
    case "player":
      return "rank";
    case "profile":
      return "profile";
    default:
      return "home";
  }
}

export function App() {
  const [view, setView] = useState<View>({ t: "home" });
  const { user } = useAuth();

  // Saat login: pastikan user punya "self-player" (jadi bisa dicari & di-add).
  useEffect(() => {
    if (user) void ensureSelfPlayer(displayName(user));
  }, [user]);

  return (
    <AppShell view={view} user={user} onNavigate={setView}>
      {view.t === "home" && (
        <DashboardScreen user={user} onNavigate={setView} />
      )}
      {view.t === "leagues" && (
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
              view.leagueId ? { t: "league", id: view.leagueId } : { t: "home" }
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
        <LeaderboardScreen
          user={user}
          onOpenPlayer={(name) => setView({ t: "player", name })}
        />
      )}
      {view.t === "player" && (
        <PlayerProfileScreen
          key={view.name}
          name={view.name}
          onBack={() => setView({ t: "leaderboard" })}
        />
      )}
      {view.t === "discover" && (
        <DiscoverScreen
          onBack={() => setView({ t: "home" })}
          onOpenLeague={(id) => setView({ t: "league", id })}
        />
      )}
      {view.t === "profile" && (
        <ProfileScreen user={user} onBack={() => setView({ t: "home" })} />
      )}
    </AppShell>
  );
}

/* ---------- App shell: header navy (desktop nav) + bottom nav (mobile) ---------- */

function AppShell({
  view,
  user,
  onNavigate,
  children,
}: {
  view: View;
  user: User | null;
  onNavigate: (v: View) => void;
  children: React.ReactNode;
}) {
  const active = activeTab(view);
  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <header className="sticky top-0 z-40 bg-navy text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <button
            onClick={() => onNavigate({ t: "home" })}
            className="flex items-center gap-2"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-fixed">
              <span className="material-symbols-outlined fill text-on-primary-fixed">
                sports_tennis
              </span>
            </span>
            <span className="font-display text-xl font-extrabold tracking-tight text-primary-fixed">
              PedalPadel
            </span>
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => onNavigate(t.view)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  active === t.key
                    ? "text-primary-fixed"
                    : "text-white/55 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <AuthBar user={user} onProfile={() => onNavigate({ t: "profile" })} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-28 md:pb-10">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 z-40 flex w-full items-stretch justify-around border-t border-outline-variant bg-surface-container-lowest pb-safe shadow-lg md:hidden">
        {NAV_TABS.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onNavigate(t.view)}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
            >
              <span
                className={`grid h-8 w-14 place-items-center rounded-full transition ${
                  on ? "bg-primary-container" : ""
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[22px] ${
                    on
                      ? "fill text-on-primary-container"
                      : "text-on-surface-variant"
                  }`}
                >
                  {t.icon}
                </span>
              </span>
              <span
                className={`text-[11px] font-semibold ${
                  on ? "text-on-surface" : "text-on-surface-variant"
                }`}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* ---------- Beranda (dashboard) ---------- */

function DashboardScreen({
  user,
  onNavigate,
}: {
  user: User | null;
  onNavigate: (v: View) => void;
}) {
  const statsQ = useAsync(() => globalStats(), []);
  const leaguesQ = useAsync(() => listLeagues(), []);
  const eventsQ = useAsync(() => listEvents(), []);

  if (!user) {
    return (
      <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-8 text-center shadow-sm">
        <span className="material-symbols-outlined mb-2 text-5xl text-primary-fixed-dim">
          sports_tennis
        </span>
        <h2 className="font-display text-xl font-bold">
          Selamat datang di PedalPadel
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-on-surface-variant">
          Klik <b>Masuk / Daftar</b> di kanan atas untuk membuat liga & turnamen,
          input skor, dan lihat ranking ELO-mu.
        </p>
      </div>
    );
  }

  const myName = displayName(user);
  const ratings = statsQ.data
    ? computeRatings(statsQ.data.names, statsQ.data.results)
    : [];
  const standings = statsQ.data
    ? computeStandings(statsQ.data.results, { compensate: false })
    : [];
  const playedRanked = ratings.filter((r) => r.matchesPlayed > 0);
  const myIdx = playedRanked.findIndex((r) => r.name === myName);
  const myRating = ratings.find((r) => r.name === myName);
  const mySt = standings.find((s) => s.playerId === myName);

  const events = eventsQ.data ?? [];
  const upcoming = events
    .filter((e) => e.startAt && e.startAt > Date.now() && e.status !== "finished")
    .sort((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0));
  const live = events.filter((e) => e.status !== "finished" && !e.startAt);
  const nextMatch = upcoming[0] ?? live[0] ?? null;
  const leagues = leaguesQ.data ?? [];

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl bg-navy p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              Halo, {myName.split(" ")[0]}! 👋
            </h1>
            <p className="mt-1 text-sm text-white/60">
              Siap bertanding hari ini? Cek performamu di bawah.
            </p>
          </div>
          <div className="rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
            <div className="font-label-caps text-label-caps text-primary-fixed">
              {nextMatch ? "MATCH BERIKUTNYA" : "STATISTIK"}
            </div>
            {nextMatch ? (
              <button
                onClick={() => onNavigate({ t: "session", id: nextMatch.id })}
                className="mt-1 block text-left"
              >
                <div className="truncate font-bold">{nextMatch.name}</div>
                <div className="text-xs text-white/60">
                  {nextMatch.startAt
                    ? `🗓 ${fmtDate(nextMatch.startAt)}`
                    : "Sedang berlangsung"}
                </div>
              </button>
            ) : (
              <div className="mt-1 flex items-end gap-3">
                <span className="font-data-mono text-2xl font-bold text-primary-fixed">
                  {myRating?.matchesPlayed ? Math.round(myRating.rating) : 1000}
                </span>
                <span className="pb-1 text-xs text-white/50">
                  ELO{myIdx >= 0 ? ` · #${myIdx + 1}` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Aksi cepat */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          onClick={() => onNavigate({ t: "create", leagueId: null })}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary-fixed px-4 py-3 font-semibold text-on-primary-fixed transition hover:bg-primary-fixed-dim"
        >
          <span className="material-symbols-outlined">add_circle</span>
          Main Sekarang
        </button>
        <button
          onClick={() => onNavigate({ t: "discover" })}
          className="flex items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 font-semibold transition hover:border-primary-fixed-dim"
        >
          <span className="material-symbols-outlined text-on-surface-variant">
            travel_explore
          </span>
          Jelajah Liga
        </button>
        <button
          onClick={() => onNavigate({ t: "leagues" })}
          className="flex items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 font-semibold transition hover:border-primary-fixed-dim"
        >
          <span className="material-symbols-outlined text-on-surface-variant">
            groups
          </span>
          Liga Saya
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Kiri */}
        <div className="space-y-5 lg:col-span-2">
          <DashCard
            title="Turnamen Terbaru"
            action={
              <button
                onClick={() => onNavigate({ t: "leagues" })}
                className="text-xs font-semibold text-primary"
              >
                Lihat semua
              </button>
            }
          >
            {events.length === 0 ? (
              <DashEmpty text="Belum ada turnamen. Klik 'Main Sekarang'." />
            ) : (
              <ul className="space-y-1.5">
                {events.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => onNavigate({ t: "session", id: e.id })}
                      className="flex w-full items-center gap-3 rounded-xl border border-outline-variant/50 px-3 py-2.5 text-left hover:border-primary-fixed-dim"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-container">
                        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                          sports_tennis
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {e.name}
                        </span>
                        <span className="text-xs text-on-surface-variant">
                          {FORMAT_LABEL[e.format]} · {e.players.length} pemain ·{" "}
                          {e.startAt ? `🗓 ${fmtDate(e.startAt)}` : fmtDate(e.createdAt)}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          e.status === "finished"
                            ? "bg-surface-container text-on-surface-variant"
                            : "bg-primary-container text-on-primary-container"
                        }`}
                      >
                        {e.status === "finished" ? "selesai" : "live"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DashCard>

          <DashCard
            title="Liga Saya"
            action={
              <button
                onClick={() => onNavigate({ t: "leagues" })}
                className="text-xs font-semibold text-primary"
              >
                Kelola
              </button>
            }
          >
            {leagues.length === 0 ? (
              <DashEmpty text="Belum ikut liga. Buat atau jelajah liga." />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {leagues.slice(0, 4).map((l) => (
                  <button
                    key={l.id}
                    onClick={() => onNavigate({ t: "league", id: l.id })}
                    className="flex items-center gap-2.5 rounded-xl border border-outline-variant/50 px-3 py-2.5 text-left hover:border-primary-fixed-dim"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-container">
                      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                        {l.visibility === "private" ? "lock" : "public"}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {l.name}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {l.memberIds.length} pemain
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </DashCard>
        </div>

        {/* Kanan */}
        <div className="space-y-5">
          <section className="rounded-2xl bg-navy p-5 text-white shadow-sm">
            <div className="font-label-caps text-label-caps text-primary-fixed">
              STATISTIK SAYA
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                {
                  k: "ELO",
                  v: myRating?.matchesPlayed
                    ? Math.round(myRating.rating)
                    : 1000,
                },
                {
                  k: "Win %",
                  v: mySt ? `${Math.round(mySt.winRate * 100)}%` : "0%",
                },
                { k: "Rank", v: myIdx >= 0 ? `#${myIdx + 1}` : "–" },
              ].map((s) => (
                <div key={s.k} className="rounded-xl bg-white/5 py-3">
                  <div className="font-data-mono text-xl font-bold text-primary-fixed">
                    {s.v}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-white/50">
                    {s.k}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => onNavigate({ t: "profile" })}
              className="mt-3 w-full rounded-lg bg-white/10 py-2 text-sm font-semibold hover:bg-white/15"
            >
              Lihat profil
            </button>
          </section>

          <DashCard
            title="Ranking Global"
            action={
              <button
                onClick={() => onNavigate({ t: "leaderboard" })}
                className="text-xs font-semibold text-primary"
              >
                Lihat semua
              </button>
            }
          >
            {playedRanked.length === 0 ? (
              <DashEmpty text="Belum ada match selesai." />
            ) : (
              <ul className="space-y-1">
                {playedRanked.slice(0, 5).map((r, i) => (
                  <li key={r.id}>
                    <button
                      onClick={() => onNavigate({ t: "player", name: r.name })}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-container-low ${
                        r.name === myName ? "bg-primary-container/30" : ""
                      }`}
                    >
                      <RankBadge rank={i + 1} />
                      <TeamAvatar name={r.name} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {r.name}
                      </span>
                      <span className="font-data-mono text-sm font-bold tabular-nums">
                        {Math.round(r.rating)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DashCard>
        </div>
      </div>
    </div>
  );
}

function DashCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-bold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function DashEmpty({ text }: { text: string }) {
  return (
    <p className="rounded-xl bg-surface-container-low px-3 py-5 text-center text-sm text-on-surface-variant">
      {text}
    </p>
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
  const statsQ = useAsync(() => globalStats(), []);
  const histQ = useAsync(
    () => (user ? playerHistory(displayName(user)) : Promise.resolve([])),
    [user]
  );
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

  // Statistik & riwayat akun (by nama, dari semua sesi).
  const myName = displayName(u);
  const me = (() => {
    if (!statsQ.data) return null;
    const ratings = computeRatings(statsQ.data.names, statsQ.data.results);
    const played = ratings.filter((r) => r.matchesPlayed > 0); // sudah urut by ELO
    const idx = played.findIndex((x) => x.name === myName);
    const r = ratings.find((x) => x.name === myName);
    const s = computeStandings(statsQ.data.results, { compensate: false }).find(
      (x) => x.playerId === myName
    );
    return {
      rating: r?.rating ?? null,
      played: r?.matchesPlayed ?? 0,
      st: s ?? null,
      rank: idx >= 0 ? idx + 1 : null,
      totalRanked: played.length,
    };
  })();
  const history = histQ.data ?? [];
  const rel = me && me.played > 0 ? Math.round(reliability(me.played) * 100) : 0;

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
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl bg-navy p-5 text-white md:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary-fixed/10 blur-3xl" />
        {editing ? (
          <div className="relative space-y-3">
            <label className="block font-label-caps text-label-caps text-white/60">
              Nama lengkap
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-on-surface"
              placeholder="Nama"
            />
            <label className="block font-label-caps text-label-caps text-white/60">
              Username (unik)
            </label>
            <div className="flex items-center rounded-lg bg-white px-3 text-on-surface">
              <span className="text-outline">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full py-2 outline-none"
                placeholder="username"
              />
            </div>
            <label className="block font-label-caps text-label-caps text-white/60">
              URL foto (opsional)
            </label>
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-on-surface"
              placeholder="https://…/foto.jpg"
            />
            {err && <p className="text-sm text-loss-red">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-primary-fixed px-4 py-2 text-sm font-semibold text-on-primary-fixed disabled:opacity-60"
              >
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                Batal
              </button>
            </div>
          </div>
        ) : (
          <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {shownAvatar ? (
                <img
                  src={shownAvatar}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-full border-4 border-on-secondary-fixed-variant object-cover"
                />
              ) : (
                <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 border-on-secondary-fixed-variant bg-primary-fixed font-display text-3xl font-extrabold text-on-primary-fixed">
                  {shownName.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <h1 className="truncate font-display text-2xl font-bold">
                  {shownName}
                </h1>
                <div className="text-sm text-white/60">@{shownUser}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {me?.rank != null && (
                    <span className="rounded border border-white/15 bg-white/5 px-2 py-1 font-label-caps text-label-caps">
                      #{me.rank} GLOBAL
                    </span>
                  )}
                  <span className="rounded border border-white/15 bg-white/5 px-2 py-1 font-label-caps text-label-caps">
                    {me?.played ?? 0} MATCH
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={startEdit}
              className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-5 py-2.5 font-label-caps text-label-caps transition hover:bg-primary-fixed hover:text-on-primary-fixed active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
              Ubah Profil
            </button>
          </div>
        )}
      </section>

      {/* Rating + Statistik */}
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
            <span className="material-symbols-outlined text-[20px] text-primary">
              trending_up
            </span>
            Rating
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <ProfileStat
              label="Peringkat"
              value={me?.rank != null ? `#${me.rank}` : "–"}
              sub={me?.rank != null ? `dari ${me.totalRanked}` : "belum main"}
            />
            <ProfileStat
              label="ELO"
              value={me && me.played > 0 ? Math.round(me.rating!) : "–"}
              sub="rating"
            />
            <ProfileStat
              label="Keandalan"
              value={me && me.played > 0 ? `${rel}%` : "–"}
              sub={me && me.played > 0 ? `${me.played}/20 match` : "—"}
            />
          </div>
          <p className="mt-3 text-xs text-on-surface-variant">
            <b>Keandalan</b> = seberapa stabil rating-mu; 100% (stabil) setelah 20
            match.
          </p>
        </section>

        <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
            <span className="material-symbols-outlined text-[20px] text-primary">
              bar_chart
            </span>
            Statistik
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <ProfileStat label="Main" value={me?.played ?? 0} />
            <ProfileStat label="Menang" value={me?.st?.wins ?? 0} />
            <ProfileStat
              label="Win %"
              value={me?.st ? `${Math.round(me.st.winRate * 100)}%` : "0%"}
            />
          </div>
          {history.length > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <span className="font-label-caps text-label-caps text-on-surface-variant">
                FORM TERAKHIR
              </span>
              <div className="flex gap-1">
                {history.slice(0, 5).map((m, i) => {
                  const c =
                    m.result === "win"
                      ? "bg-primary-container text-on-primary-container"
                      : m.result === "loss"
                        ? "bg-error-container text-error"
                        : "bg-surface-container-high text-on-surface-variant";
                  const l =
                    m.result === "win" ? "M" : m.result === "loss" ? "K" : "S";
                  return (
                    <span
                      key={i}
                      className={`grid h-6 w-6 place-items-center rounded text-[10px] font-bold ${c}`}
                    >
                      {l}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Pertandingan Terakhir */}
      <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
          <span className="material-symbols-outlined text-[20px] text-primary">
            history
          </span>
          Pertandingan Terakhir
        </h3>
        <StateText
          loading={histQ.loading}
          error={histQ.error}
          empty={!histQ.loading && !histQ.error && history.length === 0}
          emptyText="Belum ada pertandingan."
        />
        <ul className="space-y-2">
          {history.slice(0, 10).map((m, i) => {
            const win = m.result === "win";
            const loss = m.result === "loss";
            const badge = win
              ? ["Menang", "bg-primary-container text-on-primary-container"]
              : loss
                ? ["Kalah", "bg-error-container text-error"]
                : ["Seri", "bg-surface-container-high text-on-surface-variant"];
            const box = win
              ? "bg-primary-container/40"
              : loss
                ? "bg-error-container/40"
                : "bg-surface-container-high";
            return (
              <li
                key={i}
                className="flex items-center gap-3 rounded-xl border border-outline-variant/40 p-3"
              >
                <div
                  className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg ${box}`}
                >
                  <span className="font-data-mono text-base font-bold">
                    {m.scoreFor}–{m.scoreAgainst}
                  </span>
                  <span className="font-label-caps text-[8px] uppercase text-outline">
                    {win ? "WIN" : loss ? "LOSS" : "DRAW"}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    vs {m.opponents.join(" & ")}
                  </div>
                  <div className="truncate text-xs text-on-surface-variant">
                    Partner: {m.partner} · {m.eventName} · {fmtDate(m.date)}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 font-label-caps text-label-caps ${badge[1]}`}
                >
                  {badge[0]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <button
        onClick={() => {
          signOut();
          onBack();
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest py-3 font-semibold text-on-surface hover:bg-surface-container-high"
      >
        <span className="material-symbols-outlined text-[20px] text-error">
          logout
        </span>
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
  const me = useAsync(() => globalStats(), []);
  const [newLeague, setNewLeague] = useState("");
  const [newLeagueDesc, setNewLeagueDesc] = useState("");
  const [newVisibility, setNewVisibility] = useState<"private" | "public">(
    "private"
  );
  const [tab, setTab] = useState<"all" | "active" | "past">("all");

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
    const lg = await createLeague(name, newVisibility, newLeagueDesc);
    setNewLeague("");
    setNewLeagueDesc("");
    onNavigate({ t: "league", id: lg.id });
  }

  const lgList = leagues.data ?? [];

  // Rank pemilik akun (self-player) di leaderboard ELO miliknya.
  const myRank = (() => {
    if (!me.data) return null;
    const played = computeRatings(me.data.names, me.data.results).filter(
      (r) => r.matchesPlayed > 0
    );
    const idx = played.findIndex((r) => r.name === displayName(user));
    if (idx < 0) return null;
    return {
      rank: idx + 1,
      total: played.length,
      rating: Math.round(played[idx]!.rating),
    };
  })();

  const allEvents = standalone.data ?? [];
  const events =
    tab === "all"
      ? allEvents
      : allEvents.filter((e) =>
          tab === "active" ? e.status === "live" : e.status === "finished"
        );

  return (
    <div className="space-y-6">
      <button
        onClick={() => onNavigate({ t: "leaderboard" })}
        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-lime-400 hover:bg-lime-50/40"
      >
        <span className="min-w-0">
          <span className="block font-semibold">🏅 Pemain &amp; Ranking</span>
          <span className="block text-sm text-slate-400">
            {myRank
              ? `Rank-mu #${myRank.rank} dari ${myRank.total} · ELO ${myRank.rating}`
              : "Daftar pemain + leaderboard ELO dari semua sesimu"}
          </span>
        </span>
        <span className="shrink-0 text-xl text-slate-300">›</span>
      </button>

      <Card title="🏆 Liga">
        <div className="mb-2 flex gap-2">
          <input
            value={newLeague}
            onChange={(e) => setNewLeague(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLeague()}
            placeholder="Nama liga baru… (mis. Liga Tarkam 2026)"
            className="input flex-1"
          />
          <button
            onClick={addLeague}
            className="rounded-lg bg-primary-fixed px-4 text-sm font-semibold text-on-primary-fixed hover:bg-primary-fixed-dim"
          >
            + Liga
          </button>
        </div>
        <input
          value={newLeagueDesc}
          onChange={(e) => setNewLeagueDesc(e.target.value)}
          placeholder="Deskripsi liga (opsional)…"
          className="input mb-2 w-full"
        />
        <div className="mb-4 flex items-center gap-2">
          <Toggle
            value={newVisibility === "private"}
            onChange={(v) => setNewVisibility(v ? "private" : "public")}
            onLabel="🔒 Private"
            offLabel="🌐 Public"
          />
          <span className="text-xs text-slate-400">
            {newVisibility === "private"
              ? "Gabung lewat kode / undangan."
              : "Bisa ditemukan & di-request gabung (perlu approval)."}
          </span>
        </div>
        <button
          onClick={() => onNavigate({ t: "discover" })}
          className="mb-4 w-full rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:border-lime-400 hover:text-slate-900"
        >
          🔍 Cari &amp; gabung liga lain
        </button>
        <StateText
          loading={leagues.loading}
          error={leagues.error}
          empty={lgList.length === 0}
          emptyText="Belum ikut liga. Buat baru atau cari liga lain."
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
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {l.visibility === "private" ? "🔒" : "🌐"} {l.name}
                  </span>
                  <span className="text-xs text-slate-400">
                    {l.memberIds.length} pemain · {fmtDate(l.createdAt)}
                    {l.myRole && l.myRole !== "owner"
                      ? ` · ${l.myRole === "admin" ? "admin" : "anggota"}`
                      : ""}
                  </span>
                </span>
              </button>
              {l.myRole === "owner" ? (
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
              ) : (
                <button
                  onClick={async () => {
                    if (confirm(`Keluar dari liga "${l.name}"?`)) {
                      await leaveLeague(l.id);
                      leagues.reload();
                    }
                  }}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Keluar liga"
                >
                  Keluar
                </button>
              )}
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
        {allEvents.length > 0 && (
          <div className="mb-3 flex gap-1.5">
            {(
              [
                ["all", "Semua"],
                ["active", "Aktif"],
                ["past", "Selesai"],
              ] as const
            ).map(([key, label]) => (
              <Chip
                key={key}
                active={tab === key}
                onClick={() => setTab(key)}
                label={label}
              />
            ))}
          </div>
        )}
        <StateText
          loading={standalone.loading}
          error={standalone.error}
          empty={events.length === 0}
          emptyText={
            allEvents.length === 0
              ? "Belum ada turnamen."
              : tab === "active"
                ? "Tidak ada turnamen aktif."
                : "Tidak ada turnamen selesai."
          }
        />
        <EventList
          events={events}
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

type RankRow = {
  id: string;
  name: string;
  isGuest: boolean;
  rating: number | null;
  played: number;
  st: Standing | undefined;
};

/**
 * Pemain & Ranking (revamp): header + podium top-3 + tabel + daftar/hapus pemain.
 * Rating dihitung ulang dari hasil match (keyed by nama).
 */
function LeaderboardScreen({
  user,
  onOpenPlayer,
}: {
  user: User | null;
  onOpenPlayer: (name: string) => void;
}) {
  const stats = useAsync(() => globalStats(), []);
  const roster = useAsync(() => listPlayers(), []);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(10);
  const [unrankedLimit, setUnrankedLimit] = useState(4);
  const meName = user ? displayName(user) : "";

  async function remove(id: string, name: string) {
    if (!confirm(`Hapus pemain "${name}" dari daftar?`)) return;
    await deletePlayer(id);
    roster.reload();
  }

  const rows: RankRow[] = (() => {
    const players = roster.data ?? [];
    const data = stats.data;
    const byName = new Map(
      (data ? computeRatings(data.names, data.results) : []).map((r) => [
        r.name,
        r,
      ])
    );
    const st = new Map(
      (data ? computeStandings(data.results, { compensate: false }) : []).map(
        (s) => [s.playerId, s]
      )
    );
    return players
      .map((p) => ({
        id: p.id,
        name: p.name,
        isGuest: p.isGuest,
        rating: byName.get(p.name)?.rating ?? null,
        played: byName.get(p.name)?.matchesPlayed ?? 0,
        st: st.get(p.name),
      }))
      .sort((a, b) =>
        a.played > 0 && b.played > 0
          ? b.rating! - a.rating! || a.name.localeCompare(b.name)
          : (b.played > 0 ? 1 : 0) - (a.played > 0 ? 1 : 0) ||
            a.name.localeCompare(b.name)
      );
  })();

  const played = rows.filter((r) => r.played > 0);
  const unranked = rows.filter((r) => r.played === 0);
  const top3 = played.slice(0, 3);
  const rest = played.slice(3);
  const term = q.trim().toLowerCase();
  const restShown = (
    term ? rest.filter((r) => r.name.toLowerCase().includes(term)) : rest
  ).slice(0, limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined fill text-[18px] text-elo-gold">
              military_tech
            </span>
            <span className="font-label-caps text-label-caps text-on-surface-variant">
              RANKING ELO GLOBAL
            </span>
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold">
            Pemain &amp; Ranking
          </h2>
          <p className="mt-1 max-w-xl text-sm text-on-surface-variant">
            Ranking gabungan dari semua sesimu (rating awal 1000).
            {stats.data ? ` ${stats.data.eventCount} sesi.` : ""}
          </p>
        </div>
        <div className="relative md:w-72">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline">
            search
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama…"
            className="h-12 w-full rounded-xl border border-outline-variant bg-surface-container-lowest pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <StateText
        loading={stats.loading || roster.loading}
        error={stats.error || roster.error}
        empty={!stats.loading && !roster.loading && rows.length === 0}
        emptyText="Belum ada pemain. Daftarkan di atas."
      />

      {/* Podium */}
      {top3.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {top3.map((r, i) => (
            <PodiumCard
              key={r.id}
              r={r}
              rank={i + 1}
              me={r.name === meName}
              onOpen={() => onOpenPlayer(r.name)}
            />
          ))}
        </div>
      )}

      {/* Tabel sisa peringkat */}
      {rest.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-sm">
          <div className="flex items-center gap-3 border-b border-outline-variant/30 bg-surface-container-low px-4 py-2.5 font-label-caps text-label-caps text-on-surface-variant">
            <span className="w-8">RANK</span>
            <span className="flex-1">PEMAIN</span>
            <span>ELO</span>
            <span className="w-6" />
          </div>
          <ul className="divide-y divide-outline-variant/20">
            {restShown.map((r) => {
              const rk = played.indexOf(r) + 1;
              const rel = Math.round(reliability(r.played) * 100);
              const wl = r.st
                ? `${r.st.wins}–${r.st.losses}${r.st.ties ? "–" + r.st.ties : ""}`
                : "0–0";
              const wr = r.st ? Math.round(r.st.winRate * 100) : 0;
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-3 px-4 py-2.5 ${
                    r.name === meName ? "bg-primary-container/25" : ""
                  }`}
                >
                  <span className="w-8 font-data-mono text-sm font-bold text-on-surface-variant">
                    {rk}
                  </span>
                  <button
                    onClick={() => onOpenPlayer(r.name)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <TeamAvatar name={r.name} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">{r.name}</span>
                        {r.isGuest && (
                          <span className="rounded bg-elo-bronze/15 px-1 text-[10px] font-semibold uppercase text-elo-bronze">
                            tamu
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {r.played} match · {wl} · {wr}% menang
                      </span>
                    </span>
                  </button>
                  <div className="text-right">
                    <div className="font-data-mono text-sm font-bold">
                      {Math.round(r.rating ?? 1000)}
                    </div>
                    <div className="text-[10px] text-reliability-dimmed">
                      {rel < 100 ? `andal ${rel}%` : "stabil"}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(r.id, r.name)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-outline hover:bg-error-container hover:text-error"
                    aria-label={`Hapus ${r.name}`}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
          {rest.length > limit && !term && (
            <button
              onClick={() => setLimit((n) => n + 10)}
              className="w-full border-t border-outline-variant/30 py-2.5 text-sm font-semibold text-primary hover:bg-surface-container-low"
            >
              Muat lebih banyak ({rest.length - limit} lagi)
            </button>
          )}
        </section>
      )}

      {/* Belum main / unranked */}
      {unranked.length > 0 && (
        <section>
          <div className="mb-2 font-label-caps text-label-caps text-on-surface-variant">
            BELUM MAIN / UNRANKED ({unranked.length})
          </div>
          <ul className="space-y-2">
            {unranked.slice(0, unrankedLimit).map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-2.5 shadow-sm"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-container text-sm text-on-surface-variant">
                  –
                </span>
                <TeamAvatar name={r.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{r.name}</span>
                    {r.isGuest && (
                      <span className="rounded bg-elo-bronze/15 px-1 text-[10px] font-semibold uppercase text-elo-bronze">
                        tamu
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-on-surface-variant">belum main</div>
                </div>
                <div className="font-data-mono text-sm font-bold text-outline">
                  1000
                </div>
                <button
                  onClick={() => remove(r.id, r.name)}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-outline hover:bg-error-container hover:text-error"
                  aria-label={`Hapus ${r.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {unranked.length > unrankedLimit && (
            <button
              onClick={() => setUnrankedLimit((n) => n + 4)}
              className="mt-2 w-full rounded-xl border border-outline-variant/40 py-2.5 text-sm font-semibold text-primary hover:bg-surface-container-low"
            >
              Muat lebih banyak ({unranked.length - unrankedLimit} lagi)
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/** Kartu podium top-3 (juara emas elevated, perak/perunggu putih). */
function PodiumCard({
  r,
  rank,
  me,
  onOpen,
}: {
  r: RankRow;
  rank: number;
  me: boolean;
  onOpen: () => void;
}) {
  const champ = rank === 1;
  const tierLabel = rank === 1 ? "JUARA" : rank === 2 ? "PERAK" : "PERUNGGU";
  const order =
    rank === 1 ? "order-1 md:order-2" : rank === 2 ? "order-2 md:order-1" : "order-3";
  const rel = Math.round(reliability(r.played) * 100);
  const wl = r.st
    ? `${r.st.wins}–${r.st.losses}${r.st.ties ? "–" + r.st.ties : ""}`
    : "0–0";
  const wr = r.st ? Math.round(r.st.winRate * 100) : 0;

  const accent =
    rank === 1
      ? {
          bar: "bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500",
          glow: "bg-amber-400/25",
          ring: "ring-amber-400",
          medal: "bg-gradient-to-br from-amber-300 to-amber-500 text-navy",
          badge: "bg-amber-400/15 text-amber-600",
          elo: "text-amber-500",
        }
      : rank === 2
        ? {
            bar: "bg-gradient-to-r from-slate-300 to-slate-400",
            glow: "bg-slate-300/25",
            ring: "ring-slate-300",
            medal: "bg-gradient-to-br from-slate-300 to-slate-400 text-white",
            badge: "bg-slate-300/20 text-slate-500",
            elo: "text-on-surface",
          }
        : {
            bar: "bg-gradient-to-r from-orange-300 to-orange-500",
            glow: "bg-orange-400/20",
            ring: "ring-orange-400",
            medal: "bg-gradient-to-br from-orange-300 to-orange-500 text-white",
            badge: "bg-orange-400/15 text-orange-600",
            elo: "text-on-surface",
          };
  const cardCls = champ
    ? "bg-gradient-to-b from-amber-50 to-surface-container-lowest ring-2 ring-amber-300 shadow-lg shadow-amber-500/10 md:-translate-y-4"
    : "border border-outline-variant/40 bg-surface-container-lowest shadow-sm";

  return (
    <div
      className={`relative flex flex-col items-center overflow-hidden rounded-2xl px-5 pb-5 pt-7 text-center text-on-surface ${order} ${cardCls}`}
    >
      <div className={`absolute inset-x-0 top-0 h-1.5 ${accent.bar}`} />
      <div
        className={`pointer-events-none absolute -top-12 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full blur-3xl ${accent.glow}`}
      />
      <span
        className={`absolute right-3 top-4 font-label-caps text-label-caps rounded px-2 py-1 ${accent.badge}`}
      >
        {tierLabel}
      </span>

      {champ && (
        <span className="material-symbols-outlined fill relative mb-1 text-[22px] text-amber-500">
          emoji_events
        </span>
      )}

      <button onClick={onOpen} className="relative flex flex-col items-center">
        <span className="relative">
          <span
            className={`grid h-20 w-20 place-items-center rounded-full text-2xl font-bold ring-4 ${accent.ring} ${avatarColor(
              r.name
            )}`}
          >
            {initialsOf(r.name)}
          </span>
          <span
            className={`absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full font-data-mono text-xs font-extrabold shadow ring-2 ring-surface-container-lowest ${accent.medal}`}
          >
            {rank}
          </span>
        </span>
        <span className="mt-3 block max-w-full truncate font-display text-lg font-bold">
          {r.name}
          {me && <span className="ml-1 text-xs opacity-60">(kamu)</span>}
        </span>
        <span className="text-sm text-on-surface-variant">
          {wl} · {wr}% menang
        </span>
      </button>

      <div className="relative mt-4 flex w-full items-end justify-between border-t border-outline-variant/20 pt-3">
        <div className="text-left">
          <div className="font-label-caps text-label-caps text-reliability-dimmed">
            KEANDALAN
          </div>
          <div className="font-data-mono text-data-mono">{rel}%</div>
        </div>
        <div className="text-right">
          <div className="font-label-caps text-label-caps text-reliability-dimmed">
            ELO
          </div>
          <div
            className={`font-display text-3xl font-extrabold leading-none ${accent.elo}`}
          >
            {Math.round(r.rating ?? 1000)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-surface-container-low px-2 py-3 text-center">
      <span className="font-label-caps text-label-caps text-on-surface-variant">
        {label}
      </span>
      <span className="mt-1 font-display text-xl font-bold tabular-nums">
        {value}
      </span>
      {sub && (
        <span className="mt-0.5 text-[10px] text-outline">{sub}</span>
      )}
    </div>
  );
}

/** Profil pemain (by nama): rating ELO, statistik, dan riwayat pertandingan. */
function PlayerProfileScreen({
  name,
  onBack,
}: {
  name: string;
  onBack: () => void;
}) {
  const stats = useAsync(() => globalStats(), []);
  const hist = useAsync(() => playerHistory(name), [name]);

  const me = (() => {
    if (!stats.data) return null;
    const ratings = computeRatings(stats.data.names, stats.data.results);
    const played = ratings.filter((r) => r.matchesPlayed > 0);
    const idx = played.findIndex((x) => x.name === name);
    const r = ratings.find((x) => x.name === name);
    const s = computeStandings(stats.data.results, { compensate: false }).find(
      (x) => x.playerId === name
    );
    return {
      rating: r?.rating ?? null,
      played: r?.matchesPlayed ?? 0,
      st: s ?? null,
      rank: idx >= 0 ? idx + 1 : null,
      totalRanked: played.length,
    };
  })();
  const history = hist.data ?? [];
  const rel = me && me.played > 0 ? Math.round(reliability(me.played) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm font-medium text-on-surface-variant hover:text-on-surface"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Kembali
      </button>

      <section className="relative overflow-hidden rounded-2xl bg-navy p-5 text-white md:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary-fixed/10 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span
            className={`grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 border-on-secondary-fixed-variant text-3xl font-extrabold ${avatarColor(
              name
            )}`}
          >
            {initialsOf(name)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold">{name}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {me?.rank != null && (
                <span className="rounded border border-white/15 bg-white/5 px-2 py-1 font-label-caps text-label-caps">
                  #{me.rank} GLOBAL
                </span>
              )}
              <span className="rounded border border-white/15 bg-white/5 px-2 py-1 font-label-caps text-label-caps">
                {me?.played ?? 0} MATCH
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
            <span className="material-symbols-outlined text-[20px] text-primary">
              trending_up
            </span>
            Rating
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <ProfileStat
              label="Peringkat"
              value={me?.rank != null ? `#${me.rank}` : "–"}
              sub={me?.rank != null ? `dari ${me.totalRanked}` : "belum main"}
            />
            <ProfileStat
              label="ELO"
              value={me && me.played > 0 ? Math.round(me.rating!) : "–"}
              sub="rating"
            />
            <ProfileStat
              label="Keandalan"
              value={me && me.played > 0 ? `${rel}%` : "–"}
              sub={me && me.played > 0 ? `${me.played}/20 match` : "—"}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
            <span className="material-symbols-outlined text-[20px] text-primary">
              bar_chart
            </span>
            Statistik
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <ProfileStat label="Main" value={me?.played ?? 0} />
            <ProfileStat label="Menang" value={me?.st?.wins ?? 0} />
            <ProfileStat
              label="Win %"
              value={me?.st ? `${Math.round(me.st.winRate * 100)}%` : "0%"}
            />
          </div>
          {history.length > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <span className="font-label-caps text-label-caps text-on-surface-variant">
                FORM TERAKHIR
              </span>
              <div className="flex gap-1">
                {history.slice(0, 5).map((m, i) => {
                  const c =
                    m.result === "win"
                      ? "bg-primary-container text-on-primary-container"
                      : m.result === "loss"
                        ? "bg-error-container text-error"
                        : "bg-surface-container-high text-on-surface-variant";
                  const l =
                    m.result === "win" ? "M" : m.result === "loss" ? "K" : "S";
                  return (
                    <span
                      key={i}
                      className={`grid h-6 w-6 place-items-center rounded text-[10px] font-bold ${c}`}
                    >
                      {l}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
          <span className="material-symbols-outlined text-[20px] text-primary">
            history
          </span>
          Pertandingan Terakhir
        </h3>
        <StateText
          loading={hist.loading}
          error={hist.error}
          empty={!hist.loading && !hist.error && history.length === 0}
          emptyText="Belum ada pertandingan."
        />
        <ul className="space-y-2">
          {history.slice(0, 10).map((m, i) => {
            const win = m.result === "win";
            const loss = m.result === "loss";
            const badge = win
              ? ["Menang", "bg-primary-container text-on-primary-container"]
              : loss
                ? ["Kalah", "bg-error-container text-error"]
                : ["Seri", "bg-surface-container-high text-on-surface-variant"];
            const box = win
              ? "bg-primary-container/40"
              : loss
                ? "bg-error-container/40"
                : "bg-surface-container-high";
            return (
              <li
                key={i}
                className="flex items-center gap-3 rounded-xl border border-outline-variant/40 p-3"
              >
                <div
                  className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg ${box}`}
                >
                  <span className="font-data-mono text-base font-bold">
                    {m.scoreFor}–{m.scoreAgainst}
                  </span>
                  <span className="font-label-caps text-[8px] uppercase text-outline">
                    {win ? "WIN" : loss ? "LOSS" : "DRAW"}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    vs {m.opponents.join(" & ")}
                  </div>
                  <div className="truncate text-xs text-on-surface-variant">
                    Partner: {m.partner} · {m.eventName} · {fmtDate(m.date)}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 font-label-caps text-label-caps ${badge[1]}`}
                >
                  {badge[0]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Discover: gabung via kode (private) atau cari & request liga public. */
function DiscoverScreen({
  onBack,
  onOpenLeague,
}: {
  onBack: () => void;
  onOpenLeague: (id: string) => void;
}) {
  const list = useAsync(() => discoverLeagues(), []);
  const [q, setQ] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const all = list.data ?? [];
  const shown = q.trim()
    ? all.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase()))
    : all;

  async function joinByCode() {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const id = await joinWithCode(code);
      onOpenLeague(id);
    } catch (e) {
      alert("Gagal: " + errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function request(id: string) {
    setBusy(true);
    try {
      await requestJoin(id);
      list.reload();
      alert("Permintaan terkirim. Menunggu persetujuan owner liga.");
    } catch (e) {
      alert("Gagal: " + errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Kembali
      </button>

      <Card title="🔑 Gabung via Kode">
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && joinByCode()}
            placeholder="Kode liga private…"
            className="input flex-1 font-mono tracking-wider"
          />
          <button
            onClick={joinByCode}
            disabled={busy || !code.trim()}
            className="rounded-lg bg-navy px-4 text-sm font-medium text-white hover:opacity-90 disabled:bg-surface-container disabled:text-outline"
          >
            Gabung
          </button>
        </div>
      </Card>

      <Card title="🌐 Liga Publik">
        <div className="relative mb-3">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            🔍
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama liga…"
            className="input w-full pl-9"
          />
        </div>
        <StateText
          loading={list.loading}
          error={list.error}
          empty={!list.loading && shown.length === 0}
          emptyText="Tidak ada liga publik."
        />
        <ul className="space-y-2">
          {shown.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-2 rounded-xl border border-slate-200 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{l.name}</div>
                <div className="text-xs text-slate-400">
                  {l.memberCount} anggota · {fmtDate(l.createdAt)}
                </div>
              </div>
              {l.myStatus === "member" ? (
                <button
                  onClick={() => onOpenLeague(l.id)}
                  className="shrink-0 rounded-lg bg-primary-container px-3 py-1.5 text-sm font-medium text-on-primary-container hover:brightness-95"
                >
                  Buka
                </button>
              ) : l.myStatus === "pending" ? (
                <span className="shrink-0 rounded-lg bg-elo-gold/15 px-3 py-1.5 text-sm font-medium text-elo-bronze">
                  Menunggu
                </span>
              ) : (
                <button
                  onClick={() => request(l.id)}
                  disabled={busy}
                  className="shrink-0 rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:bg-surface-container disabled:text-outline"
                >
                  Join
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
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
    return (
      <p className="text-sm text-on-surface-variant">Belum ada turnamen.</p>
    );
  return (
    <ul className="space-y-2">
      {events.map((e) => {
        const upcoming =
          e.status !== "finished" && !!e.startAt && e.startAt > Date.now();
        return (
          <li
            key={e.id}
            className="group flex items-center gap-2 rounded-xl border border-outline-variant/50 p-2.5 transition hover:border-primary-fixed-dim hover:bg-surface-container-low"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-container">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                {e.visibility === "private" ? "lock" : "sports_tennis"}
              </span>
            </span>
            <button
              onClick={() => onOpen(e.id)}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{e.name}</span>
                {e.description && (
                  <span className="block truncate text-xs text-on-surface-variant">
                    {e.description}
                  </span>
                )}
                <span className="text-xs text-on-surface-variant">
                  {FORMAT_LABEL[e.format]} · {e.players.length} pemain ·{" "}
                  {e.startAt ? `🗓 ${fmtDate(e.startAt)}` : fmtDate(e.createdAt)}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 font-label-caps text-label-caps ${
                  e.status === "finished"
                    ? "bg-surface-container text-on-surface-variant"
                    : upcoming
                      ? "bg-elo-gold/20 text-elo-bronze"
                      : "bg-primary-container text-on-primary-container"
                }`}
              >
                {e.status === "finished"
                  ? "SELESAI"
                  : upcoming
                    ? "MENDATANG"
                    : "LIVE"}
              </span>
            </button>
            <button
              onClick={() => {
                if (confirm(`Hapus turnamen "${e.name}"?`)) onDelete(e.id);
              }}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-outline hover:bg-error-container hover:text-error"
              aria-label="Hapus"
              title="Hapus"
            >
              <span className="material-symbols-outlined text-[18px]">
                delete
              </span>
            </button>
          </li>
        );
      })}
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
      <section className="relative overflow-hidden rounded-2xl bg-navy p-5 text-white md:p-6">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary-fixed/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span className="font-label-caps text-label-caps text-primary-fixed">
              {league.visibility === "private" ? "LIGA PRIVAT" : "LIGA PUBLIK"}
            </span>
            <h2 className="mt-1 truncate font-display text-2xl font-bold">
              {league.name}
            </h2>
            {league.description && (
              <p className="mt-0.5 text-sm text-white/60">
                {league.description}
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-white/10 px-2.5 py-1 font-label-caps text-label-caps">
                {events.length} SESI
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 font-label-caps text-label-caps">
                🗓 {fmtDate(league.createdAt)}
              </span>
              {league.visibility === "private" && league.joinCode && (
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(league.joinCode!);
                    alert(
                      `Kode "${league.joinCode}" disalin. Bagikan untuk mengundang.`
                    );
                  }}
                  className="flex items-center gap-1 rounded-full bg-primary-fixed/15 px-2.5 py-1 font-data-mono text-data-mono font-bold tracking-wider text-primary-fixed hover:bg-primary-fixed/25"
                  title="Salin kode join"
                >
                  {league.joinCode}
                  <span className="material-symbols-outlined text-[14px]">
                    content_copy
                  </span>
                </button>
              )}
            </div>
          </div>
          <button
            onClick={() => onNavigate({ t: "create", leagueId })}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary-fixed px-4 py-2.5 font-semibold text-on-primary-fixed transition hover:bg-primary-fixed-dim active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Tambah Sesi
          </button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card title="📊 Klasemen Liga (akumulasi pemain)">
          {standings.length === 0 ? (
            <p className="rounded-xl bg-surface-container-low px-3 py-6 text-center text-sm text-on-surface-variant">
              Belum ada skor. Tambah sesi & input skor untuk mengisi klasemen.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/30 text-left font-label-caps text-label-caps text-on-surface-variant">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2">PEMAIN</th>
                  <th className="pb-2 text-right">P</th>
                  <th className="pb-2 text-right" title="Menang-Kalah-Seri">
                    W-L-T
                  </th>
                  <th className="pb-2 text-right" title="Jumlah match dimainkan">
                    MAIN
                  </th>
                  <th className="pb-2 text-right" title="Selisih poin">
                    DIFF
                  </th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <tr
                    key={s.playerId}
                    className="border-b border-outline-variant/15 last:border-0"
                  >
                    <td className="py-2 pr-2">
                      <span
                        className={`grid h-6 w-6 place-items-center rounded-full font-data-mono text-xs font-bold ${
                          i === 0
                            ? "bg-elo-gold/20 text-elo-bronze"
                            : i === 1
                              ? "bg-elo-silver/20 text-on-surface-variant"
                              : i === 2
                                ? "bg-elo-bronze/15 text-elo-bronze"
                                : "text-on-surface-variant"
                        }`}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-2 font-semibold">{s.playerId}</td>
                    <td className="py-2 text-right font-data-mono font-bold tabular-nums">
                      {s.points}
                    </td>
                    <td className="py-2 text-right font-data-mono tabular-nums text-on-surface-variant">
                      {s.wins}-{s.losses}-{s.ties}
                    </td>
                    <td className="py-2 text-right font-data-mono tabular-nums text-on-surface-variant">
                      {s.played}
                    </td>
                    <td className="py-2 text-right font-data-mono tabular-nums text-on-surface-variant">
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
          <LeaguePeople
            leagueId={leagueId}
            isAdmin={league.myRole === "owner" || league.myRole === "admin"}
          />
        </div>
      </div>
    </div>
  );
}

/** Anggota liga: permintaan pending (approve/tolak), daftar anggota, invite. */
/**
 * Satu kartu gabungan: anggota akun (owner/admin/member) + pemain roster
 * (termasuk tamu). Akun = akses kelola; pemain/tamu = yang main (auto-terpilih
 * saat tambah sesi). Dua sumber data (league_users + league_members) disatukan
 * di tampilan, dedup berdasarkan nama agar tak dobel.
 */
function LeaguePeople({
  leagueId,
  isAdmin,
}: {
  leagueId: string;
  isAdmin: boolean;
}) {
  const membersQ = useAsync(() => listLeagueMembers(leagueId), [leagueId]);
  const leagueQ = useAsync(() => getLeague(leagueId), [leagueId]);
  const playersQ = useAsync(() => listPlayers(), []);

  const [roster, setRoster] = useState<string[] | null>(null);
  const [inviteQ, setInviteQ] = useState("");
  const [hits, setHits] = useState<AccountUser[]>([]);
  const [addQ, setAddQ] = useState("");

  const accounts = membersQ.data ?? [];
  const pending = accounts.filter((m) => m.status === "pending");
  const activeAccounts = accounts.filter((m) => m.status === "member");
  const accIds = new Set(accounts.map((m) => m.userId));
  const accountNames = new Set(activeAccounts.map((a) => a.name.toLowerCase()));

  const allPlayers = playersQ.data ?? [];
  const rosterIds = roster ?? leagueQ.data?.memberIds ?? [];
  const extraPlayers = allPlayers
    .filter((p) => rosterIds.includes(p.id))
    .filter((p) => !accountNames.has(p.name.toLowerCase())); // hindari dobel

  const roleRank: Record<string, number> = { owner: 0, admin: 1, member: 2 };
  const rows = [
    ...activeAccounts
      .slice()
      .sort(
        (a, b) =>
          (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9) ||
          a.name.localeCompare(b.name)
      )
      .map((a) => ({
        key: "u:" + a.userId,
        name: a.name,
        username: a.username,
        badge: a.role,
        canRemove: isAdmin && a.role !== "owner",
        onRemove: () => removeMember(leagueId, a.userId),
      })),
    ...extraPlayers
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        key: "p:" + p.id,
        name: p.name,
        username: null as string | null,
        badge: p.isGuest ? "tamu" : "akun",
        canRemove: isAdmin,
        onRemove: async () => setR(rosterIds.filter((x) => x !== p.id)),
      })),
  ];

  // Cari akun untuk diundang (≥3 huruf).
  useEffect(() => {
    const t = inviteQ.trim();
    if (!isAdmin || t.length < 3) {
      setHits([]);
      return;
    }
    const tm = setTimeout(async () => {
      try {
        const r = await searchAccounts(t);
        setHits(r.filter((u) => !accIds.has(u.userId)));
      } catch {
        setHits([]);
      }
    }, 300);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteQ, isAdmin, accounts.length]);

  const addTerm = addQ.trim().toLowerCase();
  const addPool = allPlayers.filter(
    (p) =>
      !rosterIds.includes(p.id) &&
      (addTerm ? p.name.toLowerCase().includes(addTerm) : false)
  );

  async function act(fn: () => Promise<void>) {
    try {
      await fn();
      membersQ.reload();
      leagueQ.reload();
    } catch (e) {
      alert("Gagal: " + errMsg(e));
    }
  }
  async function setR(next: string[]) {
    setRoster(next);
    await setLeagueMembers(leagueId, next);
  }

  const badgeCls = (b: string) =>
    b === "owner"
      ? "bg-lime-100 text-lime-700"
      : b === "admin"
        ? "bg-sky-100 text-sky-700"
        : b === "tamu"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-500";

  return (
    <Card title={`🎾 Pemain & Anggota (${rows.length})`}>
      <p className="mb-3 text-xs text-slate-400">
        <b>Akun</b> (owner/admin/member) = akses kelola. <b>Tamu</b> = main saja.
        Pemain di sini otomatis terpilih saat tambah sesi.
      </p>

      {isAdmin && pending.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
            Permintaan gabung ({pending.length})
          </p>
          <ul className="space-y-1.5">
            {pending.map((m) => (
              <li
                key={m.userId}
                className="flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-sm"
              >
                <TeamAvatar name={m.name} />
                <span className="min-w-0 flex-1 truncate">
                  {m.name}
                  {m.username && (
                    <span className="text-slate-400"> @{m.username}</span>
                  )}
                </span>
                <button
                  onClick={() => act(() => approveMember(leagueId, m.userId))}
                  className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  title="Setujui"
                >
                  ✓
                </button>
                <button
                  onClick={() => act(() => removeMember(leagueId, m.userId))}
                  className="grid h-7 w-7 place-items-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                  title="Tolak"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isAdmin && (
        <>
          <div className="relative mb-2">
            <input
              value={inviteQ}
              onChange={(e) => setInviteQ(e.target.value)}
              placeholder="Undang akun via nama / @username…"
              className="input w-full"
            />
            {hits.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {hits.map((u) => (
                  <li key={u.userId}>
                    <button
                      onClick={() =>
                        act(async () => {
                          await inviteUser(leagueId, u.userId);
                          setInviteQ("");
                          setHits([]);
                        })
                      }
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary-container/40"
                    >
                      <TeamAvatar name={u.name} />
                      <span className="min-w-0 flex-1 truncate">
                        {u.name}
                        {u.username && (
                          <span className="text-slate-400"> @{u.username}</span>
                        )}
                      </span>
                      <span className="text-xs font-medium text-primary">
                        Undang
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="relative mb-3">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              🔍
            </span>
            <input
              value={addQ}
              onChange={(e) => setAddQ(e.target.value)}
              placeholder="Tambah pemain/tamu ke roster…"
              className="input w-full pl-9"
            />
            {addTerm && (
              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {addPool.length === 0 ? (
                  <li className="px-2 py-1.5 text-xs text-slate-400">
                    Tak ada pemain cocok.
                  </li>
                ) : (
                  addPool.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => {
                          setR([...rosterIds, p.id]);
                          setAddQ("");
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary-container/40"
                      >
                        <TeamAvatar name={p.name} />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        {p.isGuest && (
                          <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold uppercase text-amber-700">
                            tamu
                          </span>
                        )}
                        <span className="text-xs font-medium text-primary">
                          Tambah
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </>
      )}

      <StateText
        loading={membersQ.loading || playersQ.loading}
        error={membersQ.error || playersQ.error}
        empty={!membersQ.loading && rows.length === 0}
        emptyText="Belum ada pemain/anggota."
      />
      <ul className="space-y-0.5 rounded-xl border border-slate-200 p-1">
        {rows.map((r) => (
          <li
            key={r.key}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm"
          >
            <TeamAvatar name={r.name} />
            <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
              {r.name}
              {r.username && (
                <span className="font-normal text-slate-400"> @{r.username}</span>
              )}
            </span>
            <span
              className={`rounded px-1.5 text-[10px] font-semibold uppercase ${badgeCls(
                r.badge
              )}`}
            >
              {r.badge}
            </span>
            {r.canRemove && (
              <button
                onClick={() => act(r.onRemove)}
                className="text-slate-300 hover:text-red-600"
                title="Keluarkan"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
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
  const [description, setDescription] = useState("");
  const [startMode, setStartMode] = useState<"now" | "schedule">("now");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [format, setFormat] = useState<Format>("americano");
  const [courts, setCourts] = useState(1);
  const [scoringType, setScoringType] = useState<"point" | "normal">("point");
  const [points, setPoints] = useState(24);
  const [normalMode, setNormalMode] = useState<"first" | "total">("first");
  const [normalTarget, setNormalTarget] = useState(5);
  const [randomize, setRandomize] = useState(true);
  const [busy, setBusy] = useState(false);
  const [visibility, setVisibility] = useState<
    "inherit" | "private" | "public"
  >(leagueId ? "inherit" : "public");
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
        visibility,
        description,
        startAt:
          startMode === "schedule" && startDate
            ? new Date(`${startDate}T${startTime || "00:00"}`).getTime()
            : null,
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

        <Field label="Deskripsi (opsional)">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="mis. Arisan padel mingguan…"
            className="input"
          />
        </Field>

        <Field label="Mulai">
          <Toggle
            value={startMode === "now"}
            onChange={(v) => setStartMode(v ? "now" : "schedule")}
            onLabel="Sekarang"
            offLabel="Pilih tanggal"
          />
          {startMode === "schedule" && (
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="flex-1">
                <span className="mb-1 block text-xs text-slate-400">Tanggal</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input w-full"
                />
              </label>
              <label className="flex-1">
                <span className="mb-1 block text-xs text-slate-400">Jam</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="input w-full"
                />
              </label>
            </div>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {startMode === "now"
              ? "Sesi dimulai sekarang."
              : startDate
                ? "Dijadwalkan — tampil sebagai sesi mendatang sampai waktunya."
                : "Pilih tanggal & jam mulai."}
          </p>
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

        <Field label="Visibilitas">
          <div className="flex flex-wrap gap-1.5">
            {(leagueId
              ? ([
                  ["inherit", `Ikut liga (${inLeague?.visibility === "public" ? "public" : "private"})`],
                  ["public", "🌐 Public"],
                  ["private", "🔒 Private"],
                ] as const)
              : ([
                  ["public", "🌐 Public"],
                  ["private", "🔒 Private"],
                ] as const)
            ).map(([key, label]) => (
              <Chip
                key={key}
                active={visibility === key}
                onClick={() => setVisibility(key)}
                label={label}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {visibility === "public"
              ? "Siapa pun bisa melihat turnamen ini."
              : visibility === "private"
                ? "Hanya kamu" +
                  (leagueId ? " & anggota liga" : "") +
                  " yang bisa melihat."
                : `Ikut pengaturan liga (${inLeague?.visibility === "public" ? "publik" : "privat — anggota saja"}).`}
          </p>
        </Field>

        <button
          onClick={start}
          disabled={!canStart}
          className="mt-2 w-full rounded-xl bg-primary-fixed px-4 py-3 font-semibold text-on-primary-fixed transition hover:bg-primary-fixed-dim disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-outline"
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
              className="flex w-full items-center gap-2 border-t border-outline-variant/30 px-3 py-2 text-sm font-medium text-elo-bronze hover:bg-elo-gold/10"
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
    <section className="relative overflow-hidden rounded-2xl bg-navy px-5 py-4 text-white">
      <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary-fixed/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => onExit(event)}
            className="mb-1 flex items-center gap-1 font-label-caps text-label-caps text-white/60 transition hover:text-primary-fixed"
          >
            <span className="material-symbols-outlined text-[16px]">
              arrow_back
            </span>
            KEMBALI
          </button>
          <h2 className="truncate font-display text-xl font-bold">
            {config.name}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-white/60">
            {items.map((it, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-white/25">·</span>}
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
          className="flex items-center gap-1.5 rounded-xl bg-primary-fixed px-4 py-2.5 font-semibold text-on-primary-fixed transition hover:bg-primary-fixed-dim active:scale-95"
        >
          <span className="material-symbols-outlined text-[20px]">
            check_circle
          </span>
          Tandai selesai
        </button>
      </div>
    </section>
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
            className={`h-9 w-9 rounded-lg font-data-mono text-sm font-bold transition ${
              i === active
                ? "bg-primary-fixed text-on-primary-fixed"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {round && (
        <div className="space-y-3">
          {round.resting.length > 0 && (
            <p className="rounded-lg border-l-2 border-primary-fixed-dim bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
              Istirahat: {round.resting.join(", ")}
            </p>
          )}
          {round.matches.map((m) => {
            const s = scores[`${round.index}-${m.court}`];
            const played = !!s && s.a + s.b > 0;
            return (
              <div
                key={m.court}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-3"
              >
                <div className="mb-2 flex items-center justify-between font-label-caps text-label-caps text-on-surface-variant">
                  <span>LAPANGAN {m.court}</span>
                  {played && (
                    <span className="rounded-full bg-primary-container px-2 py-0.5 text-on-primary-container">
                      SELESAI
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Sisi kiri: klik → pilih skor tim A */}
                  <button
                    onClick={() => setPicking({ court: m.court, side: "a" })}
                    className="flex flex-1 items-center justify-between gap-2 rounded-lg p-1 text-left transition hover:bg-surface-container-high"
                  >
                    <span className="text-sm font-semibold">
                      {m.teamA.join(" & ")}
                    </span>
                    <ScoreChip value={s?.a} />
                  </button>
                  <span className="font-display text-outline">:</span>
                  {/* Sisi kanan: klik → pilih skor tim B */}
                  <button
                    onClick={() => setPicking({ court: m.court, side: "b" })}
                    className="flex flex-1 items-center justify-between gap-2 rounded-lg p-1 text-right transition hover:bg-surface-container-high"
                  >
                    <ScoreChip value={s?.b} />
                    <span className="text-sm font-semibold">
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
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-outline-variant px-4 py-2.5 text-sm font-semibold hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[18px]">shuffle</span>
            Acak ulang jadwal
          </button>
        ) : (
          <>
            <button
              onClick={session.nextRound}
              disabled={!session.canAddRound}
              className="flex-1 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-outline"
            >
              {!session.lastRoundComplete
                ? "Lengkapi skor ronde ini dulu"
                : "Ronde berikutnya →"}
            </button>
            {isLast && (
              <button
                onClick={session.reshuffle}
                className="rounded-xl border border-outline-variant px-4 py-2.5 text-sm font-semibold hover:bg-surface-container-low"
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
    <span className="grid h-11 w-12 place-items-center rounded-lg bg-navy font-data-mono text-lg font-bold text-primary-fixed tabular-nums">
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
      className="fixed inset-0 z-50 grid place-items-center bg-navy/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-surface-container-lowest p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 font-label-caps text-label-caps text-on-surface-variant">
          RONDE {roundIndex + 1} · LAPANGAN {match.court}
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

        <div className="mb-2 text-sm font-semibold text-on-surface-variant">
          Pilih skor · {spec.label}
        </div>
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: spec.max + 1 }, (_, n) => (
            <button
              key={n}
              onClick={() => pick(n)}
              className={`rounded-lg py-2.5 font-data-mono text-sm font-bold tabular-nums transition ${
                activeValue === n
                  ? "bg-primary-fixed text-on-primary-fixed"
                  : "bg-surface-container text-on-surface hover:bg-surface-container-high"
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
            className="rounded-lg px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container-low"
          >
            Reset 0:0
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low"
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
          ? "border-primary bg-primary-container/30 ring-1 ring-primary"
          : "border-outline-variant hover:border-outline"
      }`}
    >
      <span className="truncate text-sm font-semibold">{label}</span>
      <span className="ml-2 font-data-mono text-lg font-bold tabular-nums">
        {value ?? "–"}
      </span>
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
              <tr className="border-b border-outline-variant/30 text-left font-label-caps text-label-caps text-on-surface-variant">
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
                <tr key={s.playerId} className="border-b border-outline-variant/15 last:border-0">
                  <td className="py-2 pr-2 text-on-surface-variant">{i + 1}</td>
                  <td className="py-2 font-semibold">{s.playerId}</td>
                  <td className="py-2 text-right font-data-mono font-bold tabular-nums">
                    {s.adjustedPoints}
                  </td>
                  <td className="py-2 text-right text-win-green">
                    {s.compensation > 0 ? `+${s.compensation}` : "–"}
                  </td>
                  <td className="py-2 text-right font-data-mono tabular-nums text-on-surface-variant">
                    {s.wins}-{s.losses}-{s.ties}
                  </td>
                  <td className="py-2 text-right font-data-mono tabular-nums text-on-surface-variant">
                    {s.played}
                  </td>
                  <td className="py-2 text-right font-data-mono tabular-nums text-on-surface-variant">
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
    <dl className="mt-4 space-y-1 border-t border-outline-variant/30 pt-3 text-[11px] text-on-surface-variant">
      {items.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="w-12 shrink-0 font-semibold text-on-surface">{k}</dt>
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
              <tr className="border-b border-outline-variant/30 text-left font-label-caps text-label-caps text-on-surface-variant">
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
                  className="border-b border-outline-variant/15 last:border-0"
                >
                  <td className="py-2 pr-2 text-on-surface-variant">{i + 1}</td>
                  <td className="py-2 font-semibold">{s.team.join(" & ")}</td>
                  <td className="py-2 text-right font-data-mono font-bold tabular-nums">
                    {s.points}
                  </td>
                  <td className="py-2 text-right font-data-mono tabular-nums text-on-surface-variant">
                    {s.wins}-{s.losses}-{s.ties}
                  </td>
                  <td className="py-2 text-right font-data-mono tabular-nums text-on-surface-variant">
                    {s.played}
                  </td>
                  <td className="py-2 text-right font-data-mono tabular-nums text-on-surface-variant">
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
    <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
      <h3 className="mb-4 font-display text-base font-bold">{title}</h3>
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
      <label className="mb-1.5 block font-label-caps text-label-caps text-on-surface-variant">
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
        className="h-9 w-9 rounded-lg bg-surface-container text-lg text-on-surface hover:bg-surface-container-high"
      >
        −
      </button>
      <span className="w-6 text-center font-semibold tabular-nums">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="h-9 w-9 rounded-lg bg-surface-container text-lg text-on-surface hover:bg-surface-container-high"
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
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        active
          ? "bg-navy text-white"
          : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
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
    <div className="inline-flex rounded-lg bg-surface-container p-1 text-sm">
      {[
        { v: true, label: onLabel },
        { v: false, label: offLabel },
      ].map((o) => (
        <button
          key={o.label}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-2 font-semibold transition ${
            value === o.v
              ? "bg-surface-container-lowest text-on-surface shadow-sm"
              : "text-on-surface-variant"
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
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-2.5 shadow-sm">
      <div className="mb-1.5 font-label-caps text-label-caps text-primary">
        Tim {index + 1}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

const TEAM_GRID = "grid grid-cols-1 gap-2 sm:grid-cols-2";
const EMPTY_HINT =
  "rounded-lg bg-surface-container-low px-3 py-4 text-center text-xs text-on-surface-variant";

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
            className="shrink-0 text-xs font-medium text-primary hover:underline"
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
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary-container/40"
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
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Isi otomatis sisanya
          </button>
        )}
      </div>
    </div>
  );
}

