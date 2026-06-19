import { useCallback, useEffect, useRef, useState } from "react";
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
  adminListPlayers,
  mergeGuestIntoAccount,
  createPlayer,
  deletePlayer,
  searchUsers,
  ensureSelfPlayer,
  getMyProfile,
  updateProfile,
  getLeague,
  createLeague,
  setLeagueMembers,
  updateLeague,
  deleteLeague,
  discoverLeagues,
  latestLeagues,
  listVisibleEvents,
  myInvolvedEvents,
  amISuperadmin,
  countProfiles,
  myPlayerId,
  discoverEvents,
  requestJoin,
  joinWithCode,
  inviteUser,
  searchAccounts,
  listLeagueMembers,
  approveMember,
  removeMember,
  setMemberRole,
  leaveLeague,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  leagueStandings,
  globalStats,
  playerHistory,
  eventResultsById,
  type DbEvent,
  type AccountUser,
  type PlayerMatch,
  type League,
} from "./db";
import { useAsync } from "./useAsync";
import { confirmDialog, alertDialog, DialogHost } from "./dialog";
import { ShareButton, buildShareRows } from "./share";

type View =
  | { t: "home" }
  | { t: "leagues" }
  | { t: "league"; id: string }
  | { t: "createLeague" }
  | { t: "create"; leagueId: string | null }
  | { t: "myEvents" }
  | { t: "myLeagues" }
  | { t: "myMatches" }
  | { t: "admin" }
  | { t: "session"; id: string }
  | { t: "leaderboard" }
  | { t: "player"; id: string }
  | { t: "discover" }
  | { t: "profile" };

/* ---------- Routing: petakan View ↔ URL path (back/forward + link share) ---------- */

function viewToPath(v: View): string {
  switch (v.t) {
    case "home":
      return "/";
    case "leagues":
      return "/jelajah";
    case "league":
      return `/liga/${v.id}`;
    case "createLeague":
      return "/liga/baru";
    case "create":
      return v.leagueId ? `/main/baru?liga=${v.leagueId}` : "/main/baru";
    case "myEvents":
      return "/turnamen-saya";
    case "myLeagues":
      return "/liga-saya";
    case "myMatches":
      return "/pertandingan-saya";
    case "admin":
      return "/admin";
    case "session":
      return `/main/${v.id}`;
    case "leaderboard":
      return "/ranking";
    case "player":
      return `/pemain/${encodeURIComponent(v.id)}`;
    case "discover":
      return "/temukan";
    case "profile":
      return "/profil";
  }
}

function pathToView(pathname: string, search: string): View {
  const [a, b] = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  switch (a) {
    case undefined:
      return { t: "home" };
    case "jelajah":
      return { t: "leagues" };
    case "liga":
      if (!b) return { t: "leagues" };
      if (b === "baru") return { t: "createLeague" };
      return { t: "league", id: b };
    case "main":
      if (!b || b === "baru")
        return { t: "create", leagueId: new URLSearchParams(search).get("liga") };
      return { t: "session", id: b };
    case "turnamen-saya":
      return { t: "myEvents" };
    case "liga-saya":
      return { t: "myLeagues" };
    case "pertandingan-saya":
      return { t: "myMatches" };
    case "admin":
      return { t: "admin" };
    case "ranking":
      return { t: "leaderboard" };
    case "pemain":
      return b ? { t: "player", id: decodeURIComponent(b) } : { t: "leaderboard" };
    case "temukan":
      return { t: "discover" };
    case "profil":
      return { t: "profile" };
    default:
      return { t: "home" };
  }
}

// Navigasi berbasis state, tapi tersinkron ke URL: setView push history baru,
// tombol back/forward browser update view, dan URL bisa di-share / di-refresh.
function useRoutedView(): [View, (v: View) => void] {
  const [view, setViewState] = useState<View>(() =>
    pathToView(window.location.pathname, window.location.search)
  );

  const setView = useCallback((v: View) => {
    setViewState(v);
    const path = viewToPath(v);
    if (path !== window.location.pathname + window.location.search)
      window.history.pushState(null, "", path);
  }, []);

  useEffect(() => {
    const onPop = () =>
      setViewState(pathToView(window.location.pathname, window.location.search));
    window.addEventListener("popstate", onPop);
    // Normalkan URL awal agar cocok dengan view awal (mis. path tak dikenal → "/").
    const path = viewToPath(view);
    if (path !== window.location.pathname + window.location.search)
      window.history.replaceState(null, "", path);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [view, setView];
}

type TabKey = "home" | "leagues" | "main" | "rank" | "profile";

const NAV_TABS: { key: TabKey; label: string; icon: string; view: View }[] = [
  { key: "home", label: "Home", icon: "dashboard", view: { t: "home" } },
  { key: "leagues", label: "Explore", icon: "explore", view: { t: "leagues" } },
  { key: "main", label: "Play", icon: "sports_tennis", view: { t: "create", leagueId: null } },
  { key: "rank", label: "Rankings", icon: "leaderboard", view: { t: "leaderboard" } },
  { key: "profile", label: "Profile", icon: "person", view: { t: "profile" } },
];

function activeTab(v: View): TabKey {
  switch (v.t) {
    case "leagues":
    case "league":
    case "createLeague":
    case "myLeagues":
    case "discover":
      return "leagues";
    case "create":
    case "myEvents":
    case "session":
      return "main";
    case "leaderboard":
    case "player":
      return "rank";
    case "profile":
    case "myMatches":
    case "admin":
      return "profile";
    default:
      return "home";
  }
}

export function App() {
  const [view, setView] = useRoutedView();
  const { user } = useAuth();

  // Saat login: pastikan user punya "self-player" (jadi bisa dicari & di-add).
  useEffect(() => {
    if (user) void ensureSelfPlayer(displayName(user));
  }, [user]);

  return (
    <>
      <AppShell view={view} user={user} onNavigate={setView}>
      {view.t === "home" && (
        <DashboardScreen user={user} onNavigate={setView} />
      )}
      {view.t === "leagues" && (
        <ExploreScreen user={user} onNavigate={setView} />
      )}
      {view.t === "createLeague" && (
        <CreateLeagueScreen
          onCreated={(id) => setView({ t: "league", id })}
          onCancel={() => setView({ t: "leagues" })}
        />
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
      {view.t === "myEvents" && (
        <MyEventsScreen
          user={user}
          onNavigate={setView}
          onBack={() => setView({ t: "home" })}
        />
      )}
      {view.t === "myMatches" && (
        <MyMatchesScreen
          user={user}
          onBack={() => setView({ t: "profile" })}
        />
      )}
      {view.t === "myLeagues" && (
        <MyLeaguesScreen
          onNavigate={setView}
          onBack={() => setView({ t: "home" })}
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
          onOpenPlayer={(id) => setView({ t: "player", id })}
        />
      )}
      {view.t === "player" && (
        <PlayerProfileScreen
          key={view.id}
          id={view.id}
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
        <ProfileScreen
          user={user}
          onNavigate={setView}
          onBack={() => setView({ t: "home" })}
        />
      )}
      {view.t === "admin" && (
        <AdminPanel onNavigate={setView} onBack={() => setView({ t: "home" })} />
      )}
      </AppShell>
      <DialogHost />
    </>
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
              SICOPA
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

          // Tab "Main" = aksi utama → tombol bulat menonjol (FAB) di tengah.
          if (t.key === "main") {
            return (
              <button
                key={t.key}
                onClick={() => onNavigate(t.view)}
                className="flex flex-1 flex-col items-center justify-end gap-0.5 py-1.5"
                aria-label={t.label}
              >
                <span
                  className={`-mt-9 grid h-16 w-16 place-items-center rounded-full border-4 border-surface-container-lowest shadow-lg transition active:scale-95 ${
                    on ? "bg-primary-fixed-dim" : "bg-primary-fixed"
                  } text-on-primary-fixed`}
                >
                  <span className="material-symbols-outlined fill text-[30px]">
                    {t.icon}
                  </span>
                </span>
                <span
                  className={`text-[11px] font-bold ${
                    on ? "text-on-surface" : "text-on-surface-variant"
                  }`}
                >
                  {t.label}
                </span>
              </button>
            );
          }

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
  const myLeaguesQ = useAsync(() => listLeagues(), []);
  const myEventsQ = useAsync(() => listEvents(), []);
  const latestLeaguesQ = useAsync(() => latestLeagues(), []);
  const latestEventsQ = useAsync(() => listVisibleEvents(), []);
  const myIdQ = useAsync(() => myPlayerId(), []);

  const myName = user ? displayName(user) : "";
  const myId = myIdQ.data ?? null;
  const nameById = statsQ.data?.nameById ?? {};
  const ratings = statsQ.data
    ? computeRatings(statsQ.data.ids, statsQ.data.results)
    : [];
  const standings = statsQ.data
    ? computeStandings(statsQ.data.results, { compensate: false })
    : [];
  const playedRanked = ratings.filter((r) => r.matchesPlayed > 0);
  const myIdx = myId ? playedRanked.findIndex((r) => r.id === myId) : -1;
  const myRating = myId ? ratings.find((r) => r.id === myId) : undefined;
  const mySt = myId ? standings.find((s) => s.playerId === myId) : undefined;

  const myEvents = myEventsQ.data ?? [];
  const upcoming = myEvents
    .filter((e) => e.startAt && e.startAt > Date.now() && e.status !== "finished")
    .sort((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0));
  const live = myEvents.filter((e) => e.status !== "finished" && !e.startAt);
  const nextMatch = upcoming[0] ?? live[0] ?? null;
  const myLeagues = myLeaguesQ.data ?? [];
  const latestLeaguesD = latestLeaguesQ.data ?? [];
  const latestEventsD = latestEventsQ.data ?? [];

  const needLogin = () =>
    void alertDialog(
      "Sign in / Sign up first (button at the top right) to use this feature.",
      { title: "Login required" }
    );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl bg-navy p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              {user
                ? `Hi, ${myName.split(" ")[0]}! 👋`
                : "Welcome to SICOPA 🎾"}
            </h1>
            <p className="mt-1 text-sm text-white/60">
              {user
                ? "Ready to play today? Check your stats below."
                : "Browse rankings, leagues & tournaments. Sign in / Sign up (top right) to start playing."}
            </p>
          </div>
          {user && (
            <div className="rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
              <div className="font-label-caps text-label-caps text-primary-fixed">
                {nextMatch ? "NEXT MATCH" : "STATS"}
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
                      : "Ongoing"}
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
          )}
        </div>
      </section>

      {/* Aksi cepat */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          onClick={() =>
            user ? onNavigate({ t: "create", leagueId: null }) : needLogin()
          }
          className="flex items-center justify-center gap-2 rounded-xl bg-primary-fixed px-4 py-3 font-semibold text-on-primary-fixed transition hover:bg-primary-fixed-dim"
        >
          <span className="material-symbols-outlined">add_circle</span>
          Play Now
        </button>
        <button
          onClick={() => onNavigate({ t: "leagues" })}
          className="flex items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 font-semibold transition hover:border-primary-fixed-dim"
        >
          <span className="material-symbols-outlined text-on-surface-variant">
            explore
          </span>
          Explore
        </button>
        <button
          onClick={() => onNavigate({ t: "leagues" })}
          className="flex items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 font-semibold transition hover:border-primary-fixed-dim"
        >
          <span className="material-symbols-outlined text-on-surface-variant">
            groups
          </span>
          My Leagues
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Kiri */}
        <div className="space-y-5 lg:col-span-2">
          {/* Terbaru (global, private + public) — Liga / Turnamen */}
          <DashTabCard
            title="Recent"
            action={
              <button
                onClick={() => onNavigate({ t: "leagues" })}
                className="text-xs font-semibold text-primary"
              >
                Explore
              </button>
            }
            tabs={[
              {
                key: "liga",
                label: "League",
                icon: "emoji_events",
                node: (
                  <DashLeagueList
                    onNavigate={onNavigate}
                    emptyText="No leagues yet."
                    items={latestLeaguesD.map((l) => ({
                      id: l.id,
                      name: l.name,
                      visibility: l.visibility,
                      count: `${l.memberCount} members`,
                      date: l.createdAt,
                      badge:
                        l.myStatus === "member"
                          ? "Member"
                          : l.myStatus === "pending"
                            ? "Pending"
                            : undefined,
                    }))}
                  />
                ),
              },
              {
                key: "turnamen",
                label: "Tournament",
                icon: "sports_tennis",
                node: (
                  <DashEventList
                    events={latestEventsD}
                    onNavigate={onNavigate}
                    emptyText="No tournaments yet."
                  />
                ),
              },
            ]}
          />

          {/* Punyaku — Liga / Turnamen milikku (hanya saat login) */}
          {user && (
          <DashTabCard
            title="Mine"
            tabs={[
              {
                key: "liga",
                label: "League",
                icon: "emoji_events",
                action: (
                  <button
                    onClick={() => onNavigate({ t: "myLeagues" })}
                    className="text-xs font-semibold text-primary"
                  >
                    Manage
                  </button>
                ),
                node: (
                  <DashLeagueList
                    onNavigate={onNavigate}
                    emptyText="No leagues joined yet. Create or explore leagues."
                    items={myLeagues.map((l) => ({
                      id: l.id,
                      name: l.name,
                      visibility: l.visibility,
                      count: `${l.memberIds.length} players`,
                      date: l.createdAt,
                      badge:
                        l.myRole === "owner"
                          ? "Owner"
                          : l.myRole === "admin"
                            ? "Admin"
                            : l.myRole === "member"
                              ? "Member"
                              : undefined,
                    }))}
                  />
                ),
              },
              {
                key: "turnamen",
                label: "Tournament",
                icon: "sports_tennis",
                action: (
                  <button
                    onClick={() => onNavigate({ t: "myEvents" })}
                    className="text-xs font-semibold text-primary"
                  >
                    Manage
                  </button>
                ),
                node: (
                  <DashEventList
                    events={myEvents}
                    onNavigate={onNavigate}
                    emptyText="No tournaments yet. Click 'Play Now'."
                  />
                ),
              },
            ]}
          />
          )}
        </div>

        {/* Kanan */}
        <div className="space-y-5">
          {user && (
          <section className="rounded-2xl bg-navy p-5 text-white shadow-sm">
            <div className="font-label-caps text-label-caps text-primary-fixed">
              MY STATS
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
              View profile
            </button>
          </section>
          )}

          <DashCard
            title="Global Rankings"
            action={
              <button
                onClick={() => onNavigate({ t: "leaderboard" })}
                className="text-xs font-semibold text-primary"
              >
                See all
              </button>
            }
          >
            {playedRanked.length === 0 ? (
              <DashEmpty text="No finished matches yet." />
            ) : (
              <ul className="space-y-1">
                {playedRanked.slice(0, 5).map((r, i) => (
                  <li key={r.id}>
                    <button
                      onClick={() => onNavigate({ t: "player", id: r.id })}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-container-low ${
                        r.id === myId ? "bg-primary-container/30" : ""
                      }`}
                    >
                      <RankBadge rank={i + 1} />
                      <TeamAvatar name={nameById[r.id] ?? r.name} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {nameById[r.id] ?? r.name}
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

/** Card Beranda dengan tab internal (mis. Liga | Turnamen). */
function DashTabCard({
  title,
  action,
  tabs,
}: {
  title: string;
  action?: React.ReactNode;
  tabs: {
    key: string;
    label: string;
    icon: string;
    node: React.ReactNode;
    action?: React.ReactNode;
  }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold">{title}</h3>
        {current?.action ?? action}
      </div>
      <div className="mb-3 flex w-fit rounded-xl border border-outline-variant/40 bg-surface-container p-0.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              active === t.key
                ? "bg-surface-container-lowest text-on-surface shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span
              className={`material-symbols-outlined text-[18px] ${
                active === t.key ? "fill text-primary" : ""
              }`}
            >
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </div>
      {current?.node}
    </section>
  );
}

/** Daftar turnamen ringkas (Beranda) — dipakai global & "milikku". */
function DashEventList({
  events,
  onNavigate,
  emptyText,
}: {
  events: DbEvent[];
  onNavigate: (v: View) => void;
  emptyText: string;
}) {
  if (events.length === 0) return <DashEmpty text={emptyText} />;
  return (
    <ul className="space-y-1.5">
      {events.slice(0, 5).map((e) => (
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
              <span className="block truncate font-semibold">{e.name}</span>
              <span className="text-xs text-on-surface-variant">
                {FORMAT_LABEL[e.format]} · {e.players.length} players ·{" "}
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
              {e.status === "finished" ? "finished" : "live"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Daftar liga ringkas (Beranda) — satu baris penuh + detail. */
function DashLeagueList({
  items,
  onNavigate,
  emptyText,
}: {
  items: {
    id: string;
    name: string;
    visibility: "private" | "public";
    count: string;
    date?: number;
    badge?: string;
  }[];
  onNavigate: (v: View) => void;
  emptyText: string;
}) {
  if (items.length === 0) return <DashEmpty text={emptyText} />;
  return (
    <ul className="space-y-2">
      {items.slice(0, 5).map((l) => (
        <li key={l.id}>
          <button
            onClick={() => onNavigate({ t: "league", id: l.id })}
            className="flex w-full items-center gap-3 rounded-xl border border-outline-variant/50 px-3 py-2.5 text-left hover:border-primary-fixed-dim"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-container">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                {l.visibility === "private" ? "lock" : "public"}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{l.name}</span>
              <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-on-surface-variant">
                <span>{l.visibility === "private" ? "Private" : "Public"}</span>
                <span>·</span>
                <span>{l.count}</span>
                {l.date != null && (
                  <>
                    <span>·</span>
                    <span>{fmtDate(l.date)}</span>
                  </>
                )}
              </span>
            </span>
            {l.badge && (
              <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-semibold uppercase text-on-surface-variant">
                {l.badge}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Turnamen Saya (kelola: buat / ikuti, berlangsung + selesai) ---------- */

function MyEventsScreen({
  user,
  onNavigate,
  onBack,
}: {
  user: User | null;
  onNavigate: (v: View) => void;
  onBack: () => void;
}) {
  const q = useAsync(() => myInvolvedEvents(), []);
  const all = q.data ?? [];
  const myIdQ = useAsync(() => (user ? myPlayerId() : Promise.resolve(null)), [user]);
  const myId = myIdQ.data ?? null;
  const ongoing = all.filter((e) => e.status !== "finished");
  const finished = all.filter((e) => e.status === "finished");

  const row = (e: DbEvent) => {
    const r = myRankInEvent(e, myId);
    // Hanya pembuat turnamen yang boleh menghapus (RLS juga menegakkan).
    const canDelete = !!user && e.ownerId === user.id;
    return (
    <li key={e.id} className="flex items-stretch gap-2">
      <button
        onClick={() => onNavigate({ t: "session", id: e.id })}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-3 text-left shadow-sm transition hover:border-primary-fixed-dim"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-container">
          <span className="material-symbols-outlined text-on-surface-variant">
            sports_tennis
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{e.name}</span>
          <span className="text-xs text-on-surface-variant">
            {FORMAT_LABEL[e.format]} · {e.players.length} players ·{" "}
            {r ? `Rank #${r.rank}/${r.total}` : "No results yet"}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-label-caps text-label-caps ${
            e.status === "finished"
              ? "bg-surface-container text-on-surface-variant"
              : "bg-primary-container text-on-primary-container"
          }`}
        >
          {e.status === "finished" ? "FINISHED" : "LIVE"}
        </span>
      </button>
      {canDelete && (
        <button
          onClick={async () => {
            if (
              await confirmDialog(
                `Delete tournament "${e.name}"? This action is permanent.`,
                { title: "Delete tournament", confirmText: "Delete", tone: "danger" }
              )
            ) {
              await deleteEvent(e.id);
              q.reload();
            }
          }}
          className="grid w-11 shrink-0 place-items-center rounded-2xl border border-outline-variant/40 text-outline transition hover:border-error hover:bg-error-container hover:text-error"
          aria-label="Delete tournament"
          title="Delete tournament"
        >
          <span className="material-symbols-outlined text-[20px]">delete</span>
        </button>
      )}
    </li>
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm font-medium text-on-surface-variant hover:text-on-surface"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Back
      </button>

      <div>
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined fill text-[18px] text-primary">
            sports_tennis
          </span>
          <span className="font-label-caps text-label-caps text-on-surface-variant">
            MY TOURNAMENTS
          </span>
        </div>
        <h2 className="mt-1 font-display text-2xl font-bold">Manage Tournaments</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Tournaments you created or joined — ongoing & finished.
        </p>
      </div>

      <StateText
        loading={q.loading}
        error={q.error}
        empty={!q.loading && all.length === 0}
        emptyText="No tournaments yet. Click 'Play Now' on the home screen."
      />

      {ongoing.length > 0 && (
        <section className="space-y-2">
          <div className="font-label-caps text-label-caps text-on-surface-variant">
            ONGOING ({ongoing.length})
          </div>
          <ul className="space-y-2">{ongoing.map(row)}</ul>
        </section>
      )}

      {finished.length > 0 && (
        <section className="space-y-2">
          <div className="font-label-caps text-label-caps text-on-surface-variant">
            FINISHED ({finished.length})
          </div>
          <ul className="space-y-2">{finished.map(row)}</ul>
        </section>
      )}
    </div>
  );
}

/* ---------- Liga Saya (kelola: dikelola owner/admin + diikuti) ---------- */

function MyLeaguesScreen({
  onNavigate,
  onBack,
}: {
  onNavigate: (v: View) => void;
  onBack: () => void;
}) {
  const q = useAsync(() => listLeagues(), []);
  const all = q.data ?? [];
  const managed = all.filter(
    (l) => l.myRole === "owner" || l.myRole === "admin"
  );
  const joined = all.filter((l) => l.myRole === "member");

  const row = (l: (typeof all)[number]) => (
    <li key={l.id}>
      <button
        onClick={() => onNavigate({ t: "league", id: l.id })}
        className="flex w-full items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-3 text-left shadow-sm transition hover:border-primary-fixed-dim"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-container">
          <span className="material-symbols-outlined text-on-surface-variant">
            {l.visibility === "private" ? "lock" : "public"}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{l.name}</span>
          <span className="text-xs text-on-surface-variant">
            {l.visibility === "private" ? "Private" : "Public"} ·{" "}
            {l.memberIds.length} players · {fmtDate(l.createdAt)}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-semibold uppercase text-on-surface-variant">
          {l.myRole === "owner"
            ? "Owner"
            : l.myRole === "admin"
              ? "Admin"
              : "Member"}
        </span>
      </button>
    </li>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm font-medium text-on-surface-variant hover:text-on-surface"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Back
      </button>

      <div>
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined fill text-[18px] text-primary">
            emoji_events
          </span>
          <span className="font-label-caps text-label-caps text-on-surface-variant">
            MY LEAGUES
          </span>
        </div>
        <h2 className="mt-1 font-display text-2xl font-bold">Manage Leagues</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Leagues you manage or have joined.
        </p>
      </div>

      <StateText
        loading={q.loading}
        error={q.error}
        empty={!q.loading && all.length === 0}
        emptyText="No leagues joined yet. Create or explore a league first."
      />

      {managed.length > 0 && (
        <section className="space-y-2">
          <div className="font-label-caps text-label-caps text-on-surface-variant">
            MANAGED ({managed.length})
          </div>
          <ul className="space-y-2">{managed.map(row)}</ul>
        </section>
      )}

      {joined.length > 0 && (
        <section className="space-y-2">
          <div className="font-label-caps text-label-caps text-on-surface-variant">
            JOINED ({joined.length})
          </div>
          <ul className="space-y-2">{joined.map(row)}</ul>
        </section>
      )}
    </div>
  );
}

/* ---------- Semua Pertandingan Saya ---------- */

function MyMatchesScreen({
  user,
  onBack,
}: {
  user: User | null;
  onBack: () => void;
}) {
  const myIdQ = useAsync(() => (user ? myPlayerId() : Promise.resolve(null)), [user]);
  const myId = myIdQ.data ?? null;
  const q = useAsync(
    () => (myId ? playerHistory(myId) : Promise.resolve([])),
    [myId]
  );
  const history = q.data ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm font-medium text-on-surface-variant hover:text-on-surface"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Back
      </button>

      <div>
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined fill text-[18px] text-primary">
            history
          </span>
          <span className="font-label-caps text-label-caps text-on-surface-variant">
            MY MATCHES
          </span>
        </div>
        <h2 className="mt-1 font-display text-2xl font-bold">
          All Matches
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {history.length} matches, most recent first.
        </p>
      </div>

      <StateText
        loading={q.loading}
        error={q.error}
        empty={!q.loading && history.length === 0}
        emptyText="No matches yet."
      />
      <ul className="space-y-2">
        {history.map((m, i) => (
          <MatchRow key={i} m={m} />
        ))}
      </ul>
    </div>
  );
}

/* ---------- Panel Admin (superadmin: moderasi terpusat) ---------- */

function AdminPanel({
  onNavigate,
  onBack,
}: {
  onNavigate: (v: View) => void;
  onBack: () => void;
}) {
  const saQ = useAsync(() => amISuperadmin(), []);
  const leaguesQ = useAsync(() => latestLeagues(500), []);
  const eventsQ = useAsync(() => listVisibleEvents(), []);
  const playersQ = useAsync(() => adminListPlayers(), []);
  const userCountQ = useAsync(() => countProfiles(), []);
  const [tab, setTab] = useState<"liga" | "turnamen" | "pemain">("liga");
  const [mergeGuest, setMergeGuest] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const back = (
    <button
      onClick={onBack}
      className="flex items-center gap-1 text-sm font-medium text-on-surface-variant hover:text-on-surface"
    >
      <span className="material-symbols-outlined text-[18px]">arrow_back</span>
      Back
    </button>
  );

  if (saQ.loading)
    return <p className="text-sm text-on-surface-variant">Loading…</p>;
  if (!saQ.data)
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {back}
        <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-8 text-center shadow-sm">
          <span className="material-symbols-outlined mb-2 text-5xl text-error">
            lock
          </span>
          <h2 className="font-display text-xl font-bold">Access denied</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            This page is for superadmins only.
          </p>
        </div>
      </div>
    );

  const leagues = leaguesQ.data ?? [];
  const events = eventsQ.data ?? [];
  const players = playersQ.data ?? [];

  async function delPlayer(id: string, name: string) {
    if (
      !(await confirmDialog(
        `Delete player "${name}"? Match history (name snapshot) is kept.`,
        { title: "Delete player", confirmText: "Delete", tone: "danger" }
      ))
    )
      return;
    try {
      await deletePlayer(id);
      playersQ.reload();
    } catch (e) {
      void alertDialog("Failed: " + errMsg(e), { title: "Failed", tone: "danger" });
    }
  }

  async function delLeague(id: string, name: string) {
    if (
      !(await confirmDialog(`Delete league "${name}"? Permanent.`, {
        title: "Delete league",
        confirmText: "Delete",
        tone: "danger",
      }))
    )
      return;
    try {
      await deleteLeague(id);
      leaguesQ.reload();
    } catch (e) {
      void alertDialog("Failed: " + errMsg(e), { title: "Failed", tone: "danger" });
    }
  }
  async function delEvent(id: string, name: string) {
    if (
      !(await confirmDialog(`Delete tournament "${name}"? Permanent.`, {
        title: "Delete tournament",
        confirmText: "Delete",
        tone: "danger",
      }))
    )
      return;
    try {
      await deleteEvent(id);
      eventsQ.reload();
    } catch (e) {
      void alertDialog("Failed: " + errMsg(e), { title: "Failed", tone: "danger" });
    }
  }

  const stats = [
    { k: "Leagues", v: leagues.length },
    { k: "Tournaments", v: events.length },
    { k: "Accounts", v: userCountQ.data ?? "—" },
    { k: "Players", v: players.length },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {back}
      <div>
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined fill text-[18px] text-primary">
            shield_person
          </span>
          <span className="font-label-caps text-label-caps text-on-surface-variant">
            SUPERADMIN
          </span>
        </div>
        <h2 className="mt-1 font-display text-2xl font-bold">Admin Panel</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Centralized moderation — all leagues & tournaments on the platform.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.k}
            className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-3 text-center shadow-sm"
          >
            <div className="font-data-mono text-2xl font-bold">{s.v}</div>
            <div className="font-label-caps text-label-caps text-on-surface-variant">
              {s.k}
            </div>
          </div>
        ))}
      </div>

      <div className="flex w-fit rounded-xl border border-outline-variant/40 bg-surface-container p-1 text-sm">
        {(
          [
            ["liga", "League", "emoji_events"],
            ["turnamen", "Tournament", "sports_tennis"],
            ["pemain", "Player", "group"],
          ] as const
        ).map(([k, l, icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition ${
              tab === k
                ? "bg-surface-container-lowest text-on-surface shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{icon}</span>
            {l}
          </button>
        ))}
      </div>

      {tab === "liga" && (
        <ul className="space-y-2">
          {leagues.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-3 shadow-sm"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-container">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                  {l.visibility === "private" ? "lock" : "public"}
                </span>
              </span>
              <button
                onClick={() => onNavigate({ t: "league", id: l.id })}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate font-semibold">{l.name}</span>
                <span className="text-xs text-on-surface-variant">
                  {l.visibility === "private" ? "Private" : "Public"} ·{" "}
                  {l.memberCount} members · {fmtDate(l.createdAt)}
                </span>
              </button>
              <button
                onClick={() => delLeague(l.id, l.name)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-outline hover:bg-error-container hover:text-error"
                title="Delete league"
              >
                <span className="material-symbols-outlined text-[18px]">
                  delete
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {tab === "turnamen" && (
        <ul className="space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-3 shadow-sm"
            >
              {e.photoUrl ? (
                <img
                  src={e.photoUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-container">
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                    sports_tennis
                  </span>
                </span>
              )}
              <button
                onClick={() => onNavigate({ t: "session", id: e.id })}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate font-semibold">{e.name}</span>
                <span className="text-xs text-on-surface-variant">
                  {FORMAT_LABEL[e.format]} · {e.players.length} players ·{" "}
                  {e.status === "finished" ? "finished" : "live"}
                </span>
              </button>
              <button
                onClick={() => delEvent(e.id, e.name)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-outline hover:bg-error-container hover:text-error"
                title="Delete tournament"
              >
                <span className="material-symbols-outlined text-[18px]">
                  delete
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {tab === "pemain" && (
        <ul className="space-y-2">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-3 shadow-sm"
            >
              <TeamAvatar name={p.name} />
              <button
                onClick={() => onNavigate({ t: "player", id: p.id })}
                className="min-w-0 flex-1 text-left"
              >
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-semibold">{p.name}</span>
                  {p.isGuest && (
                    <span className="rounded bg-elo-bronze/15 px-1 text-[10px] font-semibold uppercase text-elo-bronze">
                      guest
                    </span>
                  )}
                </span>
              </button>
              {p.isGuest && (
                <button
                  onClick={() => setMergeGuest({ id: p.id, name: p.name })}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-outline hover:bg-primary-container hover:text-on-primary-container"
                  title="Merge into account"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    call_merge
                  </span>
                </button>
              )}
              <button
                onClick={() => delPlayer(p.id, p.name)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-outline hover:bg-error-container hover:text-error"
                title="Delete player"
              >
                <span className="material-symbols-outlined text-[18px]">
                  delete
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {mergeGuest && (
        <MergePlayerModal
          guest={mergeGuest}
          onClose={() => setMergeGuest(null)}
          onDone={() => {
            setMergeGuest(null);
            playersQ.reload();
            eventsQ.reload();
          }}
        />
      )}
    </div>
  );
}

/** Modal gabungkan tamu → akun (superadmin): pilih akun → preview → konfirmasi. */
function MergePlayerModal({
  guest,
  onClose,
  onDone,
}: {
  guest: { id: string; name: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const playersQ = useAsync(() => adminListPlayers(), []);
  const eventsQ = useAsync(() => listVisibleEvents(), []);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<{ id: string; name: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  const accounts = (playersQ.data ?? []).filter(
    (p) => !p.isGuest && p.id !== guest.id
  );
  const term = q.trim().toLowerCase();
  const accShown = (
    term ? accounts.filter((a) => a.name.toLowerCase().includes(term)) : accounts
  ).slice(0, 8);

  const events = eventsQ.data ?? [];
  const affected = events
    .filter(
      (e) => e.players.includes(guest.name) || e.playerIds.includes(guest.id)
    )
    .map((e) => {
      let matches = 0;
      for (const r of e.rounds)
        for (const m of r.matches)
          if (m.teamA.includes(guest.name) || m.teamB.includes(guest.name))
            matches++;
      return {
        id: e.id,
        name: e.name,
        date: e.startAt ?? e.createdAt,
        matches,
      };
    });
  const totalMatches = affected.reduce((s, a) => s + a.matches, 0);
  const conflicts = target
    ? events.filter(
        (e) => e.players.includes(guest.name) && e.players.includes(target.name)
      )
    : [];

  async function submit() {
    if (!target || conflicts.length) return;
    const ok = await confirmDialog(
      `Merge guest "${guest.name}" → account "${target.name}"?\n\n${affected.length} tournaments · ${totalMatches} matches will be reassigned to the account, then the guest row is deleted. This action CANNOT be undone.`,
      { title: "Merge player", confirmText: "Merge", tone: "danger" }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await mergeGuestIntoAccount(
        guest.id,
        guest.name,
        target.id,
        target.name
      );
      await alertDialog(`Done — ${res.events} tournaments updated.`, {
        title: "Merged",
      });
      onDone();
    } catch (e) {
      void alertDialog("Failed: " + errMsg(e), { title: "Failed", tone: "danger" });
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-surface-container-lowest text-on-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-navy px-6 pb-4 pt-5 text-white">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-white/55 hover:bg-white/10 hover:text-white"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
          <h3 className="font-display text-lg font-bold">Merge into Account</h3>
          <p className="text-xs text-white/55">
            Guest <b>{guest.name}</b> → choose a target account.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {/* Pilih akun tujuan */}
          <div>
            <div className="mb-1.5 font-label-caps text-label-caps text-on-surface-variant">
              Target account
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search accounts…"
              className="input w-full"
            />
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {accShown.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => setTarget({ id: a.id, name: a.name })}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition ${
                      target?.id === a.id
                        ? "border-primary bg-primary-container/30"
                        : "border-outline-variant/50 hover:bg-surface-container-low"
                    }`}
                  >
                    <TeamAvatar name={a.name} />
                    <span className="flex-1 truncate font-medium">{a.name}</span>
                    {target?.id === a.id && (
                      <span className="material-symbols-outlined fill text-[18px] text-primary">
                        check_circle
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {accShown.length === 0 && (
                <li className="px-1 text-xs text-on-surface-variant">
                  No matching accounts.
                </li>
              )}
            </ul>
          </div>

          {/* Preview */}
          <div>
            <div className="mb-1.5 font-label-caps text-label-caps text-on-surface-variant">
              Preview — what will be moved ({affected.length} tournaments ·{" "}
              {totalMatches} matches)
            </div>
            {affected.length === 0 ? (
              <p className="rounded-lg bg-surface-container-low px-3 py-3 text-sm text-on-surface-variant">
                This guest has no tournament history yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {affected.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant/40 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{a.name}</span>
                    <span className="shrink-0 text-xs text-on-surface-variant">
                      {a.matches} matches · {fmtDate(a.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {conflicts.length > 0 && (
              <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-error-container/50 px-3 py-2 text-xs text-error">
                <span className="material-symbols-outlined text-[16px]">
                  warning
                </span>
                This guest & account both played in {conflicts.length} tournaments —
                merge is blocked to avoid clashes.
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t border-outline-variant/40 p-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-outline-variant px-4 py-2.5 text-sm font-semibold hover:bg-surface-container-low"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !target || conflicts.length > 0}
            className="flex-1 rounded-xl bg-primary-fixed px-4 py-2.5 text-sm font-semibold text-on-primary-fixed hover:bg-primary-fixed-dim disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-outline"
          >
            {busy ? "Merging…" : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Profil ---------- */

function ProfileScreen({
  user,
  onNavigate,
  onBack,
}: {
  user: User | null;
  onNavigate: (v: View) => void;
  onBack: () => void;
}) {
  const profileQ = useAsync(() => getMyProfile(), []);
  const profile = profileQ.data;
  const statsQ = useAsync(() => globalStats(), []);
  const myIdQ = useAsync(() => (user ? myPlayerId() : Promise.resolve(null)), [user]);
  const myId = myIdQ.data ?? null;
  const histQ = useAsync(
    () => (myId ? playerHistory(myId) : Promise.resolve([])),
    [myId]
  );
  const eventsQ = useAsync(
    () => (user ? myInvolvedEvents() : Promise.resolve([])),
    [user]
  );
  const isSA = useAsync(
    () => (user ? amISuperadmin() : Promise.resolve(false)),
    [user]
  );
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  if (!user) {
    return (
      <Card title="Profile">
        <p className="text-sm text-slate-500">
          You are not signed in. Click <b>Sign in / Sign up</b> at the top right.
        </p>
      </Card>
    );
  }

  const u = user; // sudah dipastikan non-null oleh guard di atas
  const shownName = profile?.name || displayName(u);
  const shownUser = profile?.username || handle(u);
  const shownAvatar = profile?.avatarUrl || null;

  // Statistik & riwayat akun (by ID pemain, dari semua sesi).
  const me = (() => {
    if (!statsQ.data || !myId) return null;
    const ratings = computeRatings(statsQ.data.ids, statsQ.data.results);
    const played = ratings.filter((r) => r.matchesPlayed > 0); // sudah urut by ELO
    const idx = played.findIndex((x) => x.id === myId);
    const r = ratings.find((x) => x.id === myId);
    const s = computeStandings(statsQ.data.results, { compensate: false }).find(
      (x) => x.playerId === myId
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
  // Turnamen yang kuikuti — ongoing dulu, lalu terbaru.
  const myTournaments = [...(eventsQ.data ?? [])].sort((a, b) => {
    const ao = a.status !== "finished" ? 0 : 1;
    const bo = b.status !== "finished" ? 0 : 1;
    return ao - bo || (b.startAt ?? b.createdAt) - (a.startAt ?? a.createdAt);
  });
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
      setErr(e instanceof Error ? e.message : "Failed to save.");
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
              Full name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-on-surface"
              placeholder="Name"
            />
            <label className="block font-label-caps text-label-caps text-white/60">
              Username (unique)
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
              Profile photo (optional)
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => avatarFileRef.current?.click()}
                className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-dashed border-white/30 bg-white/5 hover:border-primary-fixed"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="material-symbols-outlined text-white/60">
                    add_a_photo
                  </span>
                )}
              </button>
              <div className="text-sm">
                <button
                  type="button"
                  onClick={() => avatarFileRef.current?.click()}
                  className="font-semibold text-primary-fixed hover:underline"
                >
                  {avatarUrl ? "Change photo" : "Upload photo"}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl("")}
                    className="ml-3 text-white/50 hover:text-loss-red"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            <input
              ref={avatarFileRef}
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  setAvatarUrl(await readImageDataUrl(f));
                } catch {
                  void alertDialog("Failed to read image.", {
                    title: "Failed",
                    tone: "danger",
                  });
                }
              }}
              className="hidden"
            />
            {err && <p className="text-sm text-loss-red">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-primary-fixed px-4 py-2 text-sm font-semibold text-on-primary-fixed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                Cancel
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
              Edit Profile
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
              label="Rank"
              value={me?.rank != null ? `#${me.rank}` : "–"}
              sub={me?.rank != null ? `of ${me.totalRanked}` : "not played"}
            />
            <ProfileStat
              label="ELO"
              value={me && me.played > 0 ? Math.round(me.rating!) : "–"}
              sub="rating"
            />
            <ProfileStat
              label="Reliability"
              value={me && me.played > 0 ? `${rel}%` : "–"}
              sub={me && me.played > 0 ? `${me.played}/20 matches` : "—"}
            />
          </div>
          <p className="mt-3 text-xs text-on-surface-variant">
            <b>Reliability</b> = how stable your rating is; 100% (stable) after 20
            matches.
          </p>
        </section>

        <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
            <span className="material-symbols-outlined text-[20px] text-primary">
              bar_chart
            </span>
            Stats
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <ProfileStat label="Played" value={me?.played ?? 0} />
            <ProfileStat label="Wins" value={me?.st?.wins ?? 0} />
            <ProfileStat
              label="Win %"
              value={me?.st ? `${Math.round(me.st.winRate * 100)}%` : "0%"}
            />
          </div>
          {history.length > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <span className="font-label-caps text-label-caps text-on-surface-variant">
                RECENT FORM
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

      {/* Turnamen Terakhir */}
      <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display text-base font-bold">
            <span className="material-symbols-outlined text-[20px] text-primary">
              sports_tennis
            </span>
            Recent Tournaments
          </h3>
          {myTournaments.length > 0 && (
            <button
              onClick={() => onNavigate({ t: "myEvents" })}
              className="text-xs font-semibold text-primary"
            >
              See all
            </button>
          )}
        </div>
        <StateText
          loading={eventsQ.loading}
          error={eventsQ.error}
          empty={!eventsQ.loading && !eventsQ.error && myTournaments.length === 0}
          emptyText="No tournaments joined yet."
        />
        <ul className="space-y-2">
          {myTournaments.slice(0, 5).map((e) => {
            const r = myRankInEvent(e, myId);
            const ongoing = e.status !== "finished";
            return (
              <li key={e.id}>
                <button
                  onClick={() => onNavigate({ t: "session", id: e.id })}
                  className="flex w-full items-center gap-3 rounded-xl border border-outline-variant/40 p-3 text-left hover:border-primary-fixed-dim"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-surface-container">
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                      sports_tennis
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {e.name}
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      {FORMAT_LABEL[e.format]} · {e.players.length} players ·{" "}
                      {r ? `Rank #${r.rank}/${r.total}` : "No results yet"}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-label-caps text-label-caps ${
                      ongoing
                        ? "bg-primary-container text-on-primary-container"
                        : "bg-surface-container text-on-surface-variant"
                    }`}
                  >
                    {ongoing ? "LIVE" : "FINISHED"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Pertandingan Terakhir */}
      <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display text-base font-bold">
            <span className="material-symbols-outlined text-[20px] text-primary">
              history
            </span>
            Recent Matches
          </h3>
          {history.length > 0 && (
            <button
              onClick={() => onNavigate({ t: "myMatches" })}
              className="text-xs font-semibold text-primary"
            >
              See all
            </button>
          )}
        </div>
        <StateText
          loading={histQ.loading}
          error={histQ.error}
          empty={!histQ.loading && !histQ.error && history.length === 0}
          emptyText="No matches yet."
        />
        <ul className="space-y-2">
          {history.slice(0, 5).map((m, i) => (
            <MatchRow key={i} m={m} />
          ))}
        </ul>
      </section>

      {isSA.data && (
        <button
          onClick={() => onNavigate({ t: "admin" })}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy py-3 font-semibold text-white hover:opacity-90"
        >
          <span className="material-symbols-outlined text-[20px] text-primary-fixed">
            shield_person
          </span>
          Admin Panel
        </button>
      )}

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

/** Peringkat seorang pemain (by ID) di dalam SATU turnamen. null = belum ada hasil. */
function myRankInEvent(
  e: DbEvent,
  playerId: string | null
): { rank: number; total: number } | null {
  if (!playerId) return null;
  const results = eventResultsById(e);
  if (results.length === 0) return null;
  const st = computeStandings(results, { compensate: false });
  const idx = st.findIndex((s) => s.playerId === playerId);
  if (idx < 0) return null;
  return { rank: idx + 1, total: st.length };
}

/** Satu baris pertandingan (dipakai di profil sendiri & profil pemain). */
function MatchRow({ m }: { m: PlayerMatch }) {
  const win = m.result === "win";
  const loss = m.result === "loss";
  const badge = win
    ? ["Win", "bg-primary-container text-on-primary-container"]
    : loss
      ? ["Loss", "bg-error-container text-error"]
      : ["Tie", "bg-surface-container-high text-on-surface-variant"];
  const box = win
    ? "bg-primary-container/40"
    : loss
      ? "bg-error-container/40"
      : "bg-surface-container-high";
  return (
    <li className="flex items-center gap-3 rounded-xl border border-outline-variant/40 p-3">
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
  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">Failed: {error}</p>;
  if (empty) return <p className="text-sm text-slate-400">{emptyText}</p>;
  return null;
}

function ExploreScreen({
  user,
  onNavigate,
}: {
  user: User | null;
  onNavigate: (v: View) => void;
}) {
  const [tab, setTab] = useState<"liga" | "turnamen" | "pemain">("liga");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const leaguesQ = useAsync(() => discoverLeagues(), []);
  const eventsQ = useAsync(() => discoverEvents(), []);
  const rosterQ = useAsync(() => listPlayers(), []);
  const statsQ = useAsync(() => globalStats(), []);

  const [code, setCode] = useState("");

  const term = q.trim().toLowerCase();
  const ligaShown = (leaguesQ.data ?? []).filter(
    (l) => !term || l.name.toLowerCase().includes(term)
  );
  const turnamenShown = (eventsQ.data ?? []).filter(
    (e) => !term || e.name.toLowerCase().includes(term)
  );

  // Pemain GLOBAL: semua ID pemain yang muncul di event (identitas per ID).
  // Roster-ku dipakai untuk flag "tamu" + pemainku yang belum main.
  const rankedPlayers = (() => {
    const players = rosterQ.data ?? [];
    const data = statsQ.data;
    const ratings = data ? computeRatings(data.ids, data.results) : [];
    const nameById = data?.nameById ?? {};
    const mine = new Map(players.map((p) => [p.id, p]));
    const nameOf = (id: string) => nameById[id] ?? mine.get(id)?.name ?? id;
    const out: {
      id: string;
      name: string;
      isGuest: boolean;
      rating: number | null;
      played: number;
    }[] = [];
    const seen = new Set<string>();
    for (const r of ratings) {
      if (r.matchesPlayed === 0) continue;
      const p = mine.get(r.id);
      seen.add(r.id);
      out.push({
        id: r.id,
        name: nameOf(r.id),
        isGuest: p?.isGuest ?? false,
        rating: r.rating,
        played: r.matchesPlayed,
      });
    }
    for (const p of players) {
      if (seen.has(p.id)) continue;
      out.push({
        id: p.id,
        name: p.name,
        isGuest: p.isGuest,
        rating: null,
        played: 0,
      });
    }
    return out.sort((a, b) =>
      a.played > 0 && b.played > 0
        ? b.rating! - a.rating! || a.name.localeCompare(b.name)
        : (b.played > 0 ? 1 : 0) - (a.played > 0 ? 1 : 0) ||
          a.name.localeCompare(b.name)
    );
  })();
  const pemainShown = term
    ? rankedPlayers.filter((p) => p.name.toLowerCase().includes(term))
    : rankedPlayers;

  const needLogin = () =>
    void alertDialog(
      "Sign in / Sign up first (button at the top right) to use this feature.",
      { title: "Login required" }
    );

  async function joinByCode() {
    if (!code.trim()) return;
    if (!user) return needLogin();
    setBusy(true);
    try {
      const id = await joinWithCode(code);
      onNavigate({ t: "league", id });
    } catch (e) {
      void alertDialog("Failed: " + errMsg(e), { title: "Failed", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }
  async function requestJoinLiga(id: string) {
    if (!user) return needLogin();
    setBusy(true);
    try {
      await requestJoin(id);
      leaguesQ.reload();
      void alertDialog("Request sent. Waiting for owner approval.", {
        title: "Sent",
      });
    } catch (e) {
      void alertDialog("Failed: " + errMsg(e), { title: "Failed", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold">
          <span className="material-symbols-outlined text-primary">explore</span>
          Explore
        </h2>
        <p className="text-sm text-on-surface-variant">
          Discover leagues, tournaments, and players.
        </p>
      </div>

      {/* Tab full-width (segmented) */}
      <div className="flex rounded-2xl border border-outline-variant/40 bg-surface-container p-1 shadow-sm">
        {(
          [
            ["liga", "League", "emoji_events"],
            ["turnamen", "Tournament", "sports_tennis"],
            ["pemain", "Player", "group"],
          ] as const
        ).map(([k, l, icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition ${
              tab === k
                ? "bg-surface-container-lowest text-on-surface shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span
              className={`material-symbols-outlined text-[18px] ${
                tab === k ? "fill text-primary" : ""
              }`}
            >
              {icon}
            </span>
            {l}
          </button>
        ))}
      </div>

      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline">
          search
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            tab === "pemain"
              ? "Search players / @username…"
              : tab === "turnamen"
                ? "Search tournaments…"
                : "Search leagues…"
          }
          className="h-12 w-full rounded-xl border border-outline-variant bg-surface-container-lowest pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {tab === "liga" && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              user ? onNavigate({ t: "createLeague" }) : needLogin()
            }
            className="flex items-center gap-1.5 rounded-xl bg-primary-fixed px-4 py-2.5 font-semibold text-on-primary-fixed transition hover:bg-primary-fixed-dim"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Create League
          </button>
        </div>
      )}
      {tab === "turnamen" && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              user ? onNavigate({ t: "create", leagueId: null }) : needLogin()
            }
            className="flex items-center gap-1.5 rounded-xl bg-primary-fixed px-4 py-2.5 font-semibold text-on-primary-fixed transition hover:bg-primary-fixed-dim"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Create Tournament
          </button>
        </div>
      )}

      {tab === "liga" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Have a league code? Enter it…"
              className="input flex-1 font-data-mono tracking-wider"
            />
            <button
              onClick={joinByCode}
              disabled={busy || !code.trim()}
              className="rounded-lg bg-navy px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Join
            </button>
          </div>
          <StateText
            loading={leaguesQ.loading}
            error={leaguesQ.error}
            empty={!leaguesQ.loading && ligaShown.length === 0}
            emptyText="No public leagues."
          />
          <ul className="space-y-2">
            {ligaShown.map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-3 shadow-sm"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-container">
                  <span className="material-symbols-outlined text-on-surface-variant">
                    emoji_events
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{l.name}</div>
                  <div className="text-xs text-on-surface-variant">
                    {l.memberCount} members · {fmtDate(l.createdAt)}
                  </div>
                </div>
                {l.myStatus === "member" ? (
                  <button
                    onClick={() => onNavigate({ t: "league", id: l.id })}
                    className="shrink-0 rounded-lg bg-primary-container px-3 py-1.5 text-sm font-semibold text-on-primary-container hover:brightness-95"
                  >
                    Open
                  </button>
                ) : l.myStatus === "pending" ? (
                  <span className="shrink-0 rounded-lg bg-elo-gold/15 px-3 py-1.5 text-sm font-semibold text-elo-bronze">
                    Pending
                  </span>
                ) : (
                  <button
                    onClick={() => requestJoinLiga(l.id)}
                    disabled={busy}
                    className="shrink-0 rounded-lg bg-navy px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Join
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "turnamen" && (
        <div>
          <StateText
            loading={eventsQ.loading}
            error={eventsQ.error}
            empty={!eventsQ.loading && turnamenShown.length === 0}
            emptyText="No public tournaments."
          />
          <ul className="space-y-2">
            {turnamenShown.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => onNavigate({ t: "session", id: e.id })}
                  className="flex w-full items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-3 text-left shadow-sm transition hover:border-primary-fixed-dim"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-container">
                    <span className="material-symbols-outlined text-on-surface-variant">
                      sports_tennis
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {e.name}
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      {FORMAT_LABEL[e.format]} · {e.players.length} players ·{" "}
                      {fmtDate(e.startAt ?? e.createdAt)}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-label-caps text-label-caps ${
                      e.status === "finished"
                        ? "bg-surface-container text-on-surface-variant"
                        : "bg-primary-container text-on-primary-container"
                    }`}
                  >
                    {e.status === "finished" ? "FINISHED" : "LIVE"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "pemain" && (
        <div>
          <StateText
            loading={rosterQ.loading || statsQ.loading}
            error={rosterQ.error || statsQ.error}
            empty={
              !rosterQ.loading && !statsQ.loading && pemainShown.length === 0
            }
            emptyText="No players yet."
          />
          <ul className="space-y-2">
            {pemainShown.map((p, i) => {
              const played = p.played > 0;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => onNavigate({ t: "player", id: p.id })}
                    className="flex w-full items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-3 text-left shadow-sm transition hover:border-primary-fixed-dim"
                  >
                    {played ? (
                      <RankBadge rank={i + 1} />
                    ) : (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-container text-sm text-on-surface-variant">
                        –
                      </span>
                    )}
                    <TeamAvatar name={p.name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">{p.name}</span>
                        {p.isGuest && (
                          <span className="rounded bg-elo-bronze/15 px-1 text-[10px] font-semibold uppercase text-elo-bronze">
                            guest
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {played ? `${p.played} matches` : "not played"}
                      </span>
                    </span>
                    <span className="font-data-mono text-sm font-bold text-on-surface-variant">
                      {Math.round(p.rating ?? 1000)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
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
  pid: string; // ID pemain (identitas global → navigasi & deteksi "saya")
  id: string | null; // null = pemain global (bukan roster-ku) → tak bisa dihapus
  name: string; // nama tampilan
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
  onOpenPlayer: (id: string) => void;
}) {
  const stats = useAsync(() => globalStats(), []);
  const roster = useAsync(() => listPlayers(), []);
  const meIdQ = useAsync(() => (user ? myPlayerId() : Promise.resolve(null)), [user]);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(10);
  const [unrankedLimit, setUnrankedLimit] = useState(4);
  const meId = meIdQ.data ?? null;

  const rows: RankRow[] = (() => {
    const players = roster.data ?? [];
    const data = stats.data;
    const ratings = data ? computeRatings(data.ids, data.results) : [];
    const nameById = data?.nameById ?? {};
    const st = new Map(
      (data ? computeStandings(data.results, { compensate: false }) : []).map(
        (s) => [s.playerId, s]
      )
    );
    // Roster milikku → untuk id (tombol hapus) + flag tamu, dicocokkan per ID.
    const mine = new Map(players.map((p) => [p.id, p]));
    const nameOf = (id: string) => nameById[id] ?? mine.get(id)?.name ?? id;
    const out: RankRow[] = [];
    const seen = new Set<string>();
    // Peringkat: SEMUA pemain yang pernah main (global, identitas per ID).
    for (const r of ratings) {
      if (r.matchesPlayed === 0) continue;
      const p = mine.get(r.id);
      seen.add(r.id);
      out.push({
        pid: r.id,
        id: p?.id ?? null,
        name: nameOf(r.id),
        isGuest: p?.isGuest ?? false,
        rating: r.rating,
        played: r.matchesPlayed,
        st: st.get(r.id),
      });
    }
    // Unranked: pemain di roster-ku yang belum pernah main.
    for (const p of players) {
      if (seen.has(p.id)) continue;
      out.push({
        pid: p.id,
        id: p.id,
        name: p.name,
        isGuest: p.isGuest,
        rating: null,
        played: 0,
        st: st.get(p.id),
      });
    }
    return out.sort((a, b) =>
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
              GLOBAL ELO RANKINGS
            </span>
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold">
            Players &amp; Rankings
          </h2>
          <p className="mt-1 max-w-xl text-sm text-on-surface-variant">
            Combined rankings across all sessions (starting rating 1000).
            {stats.data ? ` ${stats.data.eventCount} sessions.` : ""}
          </p>
        </div>
        <div className="relative md:w-72">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline">
            search
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search names…"
            className="h-12 w-full rounded-xl border border-outline-variant bg-surface-container-lowest pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <StateText
        loading={stats.loading || roster.loading}
        error={stats.error || roster.error}
        empty={!stats.loading && !roster.loading && rows.length === 0}
        emptyText="No players yet. Register above."
      />

      {/* Podium — 3 kolom (juara di tengah & lebih tinggi), ringkas di mobile */}
      {top3.length > 0 && (
        <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
          {top3.map((r, i) => (
            <PodiumCard
              key={r.pid}
              r={r}
              rank={i + 1}
              me={r.pid === meId}
              onOpen={() => onOpenPlayer(r.pid)}
            />
          ))}
        </div>
      )}

      {/* Tabel sisa peringkat */}
      {rest.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-sm">
          <div className="flex items-center gap-3 border-b border-outline-variant/30 bg-surface-container-low px-4 py-2.5 font-label-caps text-label-caps text-on-surface-variant">
            <span className="w-8">RANK</span>
            <span className="flex-1">PLAYER</span>
            <span>ELO</span>
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
                  key={r.pid}
                  className={`flex items-center gap-3 px-4 py-2.5 ${
                    r.pid === meId ? "bg-primary-container/25" : ""
                  }`}
                >
                  <span className="w-8 font-data-mono text-sm font-bold text-on-surface-variant">
                    {rk}
                  </span>
                  <button
                    onClick={() => onOpenPlayer(r.pid)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <TeamAvatar name={r.name} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">{r.name}</span>
                        {r.isGuest && (
                          <span className="rounded bg-elo-bronze/15 px-1 text-[10px] font-semibold uppercase text-elo-bronze">
                            guest
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {r.played} matches · {wl} · {wr}% wins
                      </span>
                    </span>
                  </button>
                  <div className="text-right">
                    <div className="font-data-mono text-sm font-bold">
                      {Math.round(r.rating ?? 1000)}
                    </div>
                    <div className="text-[10px] text-reliability-dimmed">
                      {rel < 100 ? `reliable ${rel}%` : "stable"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {rest.length > limit && !term && (
            <button
              onClick={() => setLimit((n) => n + 10)}
              className="w-full border-t border-outline-variant/30 py-2.5 text-sm font-semibold text-primary hover:bg-surface-container-low"
            >
              Load more ({rest.length - limit} more)
            </button>
          )}
        </section>
      )}

      {/* Belum main / unranked */}
      {unranked.length > 0 && (
        <section>
          <div className="mb-2 font-label-caps text-label-caps text-on-surface-variant">
            NOT PLAYED / UNRANKED ({unranked.length})
          </div>
          <ul className="space-y-2">
            {unranked.slice(0, unrankedLimit).map((r) => (
              <li
                key={r.pid}
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
                        guest
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-on-surface-variant">not played</div>
                </div>
                <div className="font-data-mono text-sm font-bold text-outline">
                  1000
                </div>
              </li>
            ))}
          </ul>
          {unranked.length > unrankedLimit && (
            <button
              onClick={() => setUnrankedLimit((n) => n + 4)}
              className="mt-2 w-full rounded-xl border border-outline-variant/40 py-2.5 text-sm font-semibold text-primary hover:bg-surface-container-low"
            >
              Load more ({unranked.length - unrankedLimit} more)
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
  const tierLabel = rank === 1 ? "CHAMPION" : rank === 2 ? "SILVER" : "BRONZE";
  // Susunan podium: perak (kiri) · juara (tengah) · perunggu (kanan).
  const order =
    rank === 1 ? "order-2" : rank === 2 ? "order-1" : "order-3";
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
    ? "bg-gradient-to-b from-amber-50 to-surface-container-lowest ring-2 ring-amber-300 shadow-lg shadow-amber-500/10 pt-5 sm:pt-6"
    : "border border-outline-variant/40 bg-surface-container-lowest shadow-sm pt-4";

  return (
    <button
      onClick={onOpen}
      className={`relative flex flex-col items-center overflow-hidden rounded-2xl px-2 pb-3 text-center text-on-surface sm:px-3 ${order} ${cardCls} ${
        champ ? "-translate-y-1 sm:-translate-y-3" : ""
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1.5 ${accent.bar}`} />
      <div
        className={`pointer-events-none absolute -top-12 left-1/2 h-28 w-28 -translate-x-1/2 rounded-full blur-3xl ${accent.glow}`}
      />
      <span
        className={`mb-1.5 rounded-full px-2 py-0.5 font-label-caps text-label-caps ${accent.badge}`}
      >
        {tierLabel}
      </span>

      <span className="relative">
        <span
          className={`grid place-items-center rounded-full font-bold ring-4 ${accent.ring} ${avatarColor(
            r.name
          )} ${champ ? "h-16 w-16 text-xl sm:h-20 sm:w-20 sm:text-2xl" : "h-14 w-14 text-lg sm:h-16 sm:w-16 sm:text-xl"}`}
        >
          {initialsOf(r.name)}
        </span>
        <span
          className={`absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full font-data-mono text-[11px] font-extrabold shadow ring-2 ring-surface-container-lowest ${accent.medal}`}
        >
          {rank}
        </span>
      </span>

      <span className="mt-2 block w-full truncate font-display text-sm font-bold leading-tight sm:text-base">
        {r.name}
      </span>
      {me && <span className="text-[10px] text-on-surface-variant">(you)</span>}

      <span
        className={`mt-1 font-display text-2xl font-extrabold leading-none sm:text-3xl ${accent.elo}`}
      >
        {Math.round(r.rating ?? 1000)}
      </span>
      <span className="font-label-caps text-label-caps text-reliability-dimmed">
        ELO
      </span>
      <span className="mt-1 text-[11px] text-on-surface-variant">
        {wr}% wins
      </span>
    </button>
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

/** Profil pemain (by ID): rating ELO, statistik, dan riwayat pertandingan. */
function PlayerProfileScreen({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const stats = useAsync(() => globalStats(), []);
  const hist = useAsync(() => playerHistory(id), [id]);
  const name = stats.data?.nameById[id] ?? id;

  const me = (() => {
    if (!stats.data) return null;
    const ratings = computeRatings(stats.data.ids, stats.data.results);
    const played = ratings.filter((r) => r.matchesPlayed > 0);
    const idx = played.findIndex((x) => x.id === id);
    const r = ratings.find((x) => x.id === id);
    const s = computeStandings(stats.data.results, { compensate: false }).find(
      (x) => x.playerId === id
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
        Back
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
              label="Rank"
              value={me?.rank != null ? `#${me.rank}` : "–"}
              sub={me?.rank != null ? `of ${me.totalRanked}` : "not played"}
            />
            <ProfileStat
              label="ELO"
              value={me && me.played > 0 ? Math.round(me.rating!) : "–"}
              sub="rating"
            />
            <ProfileStat
              label="Reliability"
              value={me && me.played > 0 ? `${rel}%` : "–"}
              sub={me && me.played > 0 ? `${me.played}/20 matches` : "—"}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
            <span className="material-symbols-outlined text-[20px] text-primary">
              bar_chart
            </span>
            Stats
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <ProfileStat label="Played" value={me?.played ?? 0} />
            <ProfileStat label="Wins" value={me?.st?.wins ?? 0} />
            <ProfileStat
              label="Win %"
              value={me?.st ? `${Math.round(me.st.winRate * 100)}%` : "0%"}
            />
          </div>
          {history.length > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <span className="font-label-caps text-label-caps text-on-surface-variant">
                RECENT FORM
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
          emptyText="No matches yet."
        />
        <ul className="space-y-2">
          {history.slice(0, 10).map((m, i) => (
            <MatchRow key={i} m={m} />
          ))}
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
      void alertDialog("Failed: " + errMsg(e), { title: "Failed", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }
  async function request(id: string) {
    setBusy(true);
    try {
      await requestJoin(id);
      list.reload();
      void alertDialog("Request sent. Waiting for league owner approval.", {
        title: "Sent",
      });
    } catch (e) {
      void alertDialog("Failed: " + errMsg(e), { title: "Failed", tone: "danger" });
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
        ← Back
      </button>

      <Card title="🔑 Join via Code">
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && joinByCode()}
            placeholder="Private league code…"
            className="input flex-1 font-mono tracking-wider"
          />
          <button
            onClick={joinByCode}
            disabled={busy || !code.trim()}
            className="rounded-lg bg-navy px-4 text-sm font-medium text-white hover:opacity-90 disabled:bg-surface-container disabled:text-outline"
          >
            Join
          </button>
        </div>
      </Card>

      <Card title="🌐 Public Leagues">
        <div className="relative mb-3">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            🔍
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search league names…"
            className="input w-full pl-9"
          />
        </div>
        <StateText
          loading={list.loading}
          error={list.error}
          empty={!list.loading && shown.length === 0}
          emptyText="No public leagues."
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
                  {l.memberCount} members · {fmtDate(l.createdAt)}
                </div>
              </div>
              {l.myStatus === "member" ? (
                <button
                  onClick={() => onOpenLeague(l.id)}
                  className="shrink-0 rounded-lg bg-primary-container px-3 py-1.5 text-sm font-medium text-on-primary-container hover:brightness-95"
                >
                  Open
                </button>
              ) : l.myStatus === "pending" ? (
                <span className="shrink-0 rounded-lg bg-elo-gold/15 px-3 py-1.5 text-sm font-medium text-elo-bronze">
                  Pending
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
  meId,
  canManage = false,
}: {
  events: DbEvent[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  /** id user saat ini — tombol hapus untuk pemilik turnamen. */
  meId?: string | null;
  /** admin/owner liga — boleh hapus semua turnamen di liga ini. */
  canManage?: boolean;
}) {
  if (events.length === 0)
    return (
      <p className="text-sm text-on-surface-variant">No tournaments yet.</p>
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
            {e.photoUrl ? (
              <img
                src={e.photoUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-container">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                  {e.visibility === "private" ? "lock" : "sports_tennis"}
                </span>
              </span>
            )}
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
                  {FORMAT_LABEL[e.format]} · {e.players.length} players ·{" "}
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
                  ? "FINISHED"
                  : upcoming
                    ? "UPCOMING"
                    : "LIVE"}
              </span>
            </button>
            {(canManage || (meId && e.ownerId === meId)) && (
              <button
                onClick={async () => {
                  if (
                    await confirmDialog(`Delete tournament "${e.name}"?`, {
                      title: "Delete tournament",
                      confirmText: "Delete",
                      tone: "danger",
                    })
                  )
                    onDelete(e.id);
                }}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-outline hover:bg-error-container hover:text-error"
                aria-label="Delete"
                title="Delete"
              >
                <span className="material-symbols-outlined text-[18px]">
                  delete
                </span>
              </button>
            )}
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
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const leagueQ = useAsync(() => getLeague(leagueId), [leagueId]);
  const eventsQ = useAsync(() => listEvents(leagueId), [leagueId]);
  const standingsQ = useAsync(() => leagueStandings(leagueId), [leagueId]);

  const league = leagueQ.data;
  const events = eventsQ.data ?? [];
  const standings = standingsQ.data?.standings ?? [];

  if (leagueQ.loading) return <p className="text-slate-400">Loading…</p>;
  if (!league) return <p>League not found.</p>;

  // Admin/owner liga: boleh kelola semua sesi, roster, & buat sesi di liga.
  const isAdmin =
    league.myRole === "owner" || league.myRole === "admin";

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl bg-navy p-5 text-white md:p-6">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary-fixed/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span className="font-label-caps text-label-caps text-primary-fixed">
              {league.visibility === "private" ? "PRIVATE LEAGUE" : "PUBLIC LEAGUE"}
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
                {events.length} SESSIONS
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 font-label-caps text-label-caps">
                🗓 {fmtDate(league.createdAt)}
              </span>
              {league.visibility === "private" && league.joinCode && (
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(league.joinCode!);
                    void alertDialog(
                      `Code "${league.joinCode}" copied. Share it to invite people.`,
                      { title: "Code copied" }
                    );
                  }}
                  className="flex items-center gap-1 rounded-full bg-primary-fixed/15 px-2.5 py-1 font-data-mono text-data-mono font-bold tracking-wider text-primary-fixed hover:bg-primary-fixed/25"
                  title="Copy join code"
                >
                  {league.joinCode}
                  <span className="material-symbols-outlined text-[14px]">
                    content_copy
                  </span>
                </button>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {isAdmin && (
              <button
                onClick={() => onNavigate({ t: "create", leagueId })}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-primary-fixed px-4 py-2.5 font-semibold text-on-primary-fixed transition hover:bg-primary-fixed-dim active:scale-95"
              >
                <span className="material-symbols-outlined text-[20px]">add</span>
                Add Session
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 font-label-caps text-label-caps text-white/50 transition hover:text-primary-fixed"
              >
                <span className="material-symbols-outlined text-[14px]">
                  edit
                </span>
                Edit league
              </button>
            )}
            {league.myRole === "owner" ? (
              <button
                onClick={async () => {
                  if (
                    await confirmDialog(
                      `Delete league "${league.name}"? Its sessions become standalone tournaments.`,
                      { title: "Delete league", confirmText: "Delete", tone: "danger" }
                    )
                  ) {
                    await deleteLeague(league.id);
                    onNavigate({ t: "leagues" });
                  }
                }}
                className="font-label-caps text-label-caps text-white/50 transition hover:text-loss-red"
              >
                Delete league
              </button>
            ) : league.myRole ? (
              <button
                onClick={async () => {
                  if (
                    await confirmDialog(`Leave league "${league.name}"?`, {
                      title: "Leave league",
                      confirmText: "Leave",
                      tone: "danger",
                    })
                  ) {
                    await leaveLeague(league.id);
                    onNavigate({ t: "leagues" });
                  }
                }}
                className="font-label-caps text-label-caps text-white/50 transition hover:text-loss-red"
              >
                Leave league
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {league.notes && (
        <Card title="📝 League notes">
          <NotesHtml html={league.notes} />
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card
          title="📊 League Standings (player totals)"
          action={
            standings.length > 0 ? (
              <ShareButton
                title={league.name}
                rows={buildShareRows(standings)}
                label="Share"
              />
            ) : undefined
          }
        >
          {standings.length === 0 ? (
            <p className="rounded-xl bg-surface-container-low px-3 py-6 text-center text-sm text-on-surface-variant">
              No scores yet. Add a session & enter scores to fill the standings.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/30 text-left font-label-caps text-label-caps text-on-surface-variant">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2">PLAYER</th>
                  <th className="pb-2 text-right">P</th>
                  <th className="pb-2 text-right" title="Wins-Losses-Ties">
                    W-L-T
                  </th>
                  <th className="pb-2 text-right" title="Matches played">
                    PLAYED
                  </th>
                  <th className="pb-2 text-right" title="Point difference">
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
              ["P", "Total points across all sessions"],
              ["W-L-T", "Wins - Losses - Ties"],
              ["Played", "Matches played"],
              ["Diff", "Point difference (scored − conceded)"],
            ]}
          />
        </Card>

        <div className="space-y-5">
          <Card title="Sessions in league">
            <StateText
              loading={eventsQ.loading}
              error={eventsQ.error}
              empty={events.length === 0}
              emptyText="No sessions yet."
            />
            <EventList
              events={events}
              meId={user?.id ?? null}
              canManage={isAdmin}
              onOpen={(id) => onNavigate({ t: "session", id })}
              onDelete={async (id) => {
                await deleteEvent(id);
                eventsQ.reload();
                standingsQ.reload();
              }}
            />
          </Card>
          <LeaguePeople leagueId={leagueId} isAdmin={isAdmin} />
        </div>
      </div>
      {editing && (
        <EditLeagueModal
          league={league}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            leagueQ.reload();
          }}
        />
      )}
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
/** Modal edit pengaturan liga (admin/owner). */
function EditLeagueModal({
  league,
  onClose,
  onSaved,
}: {
  league: League;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(league.name);
  const [description, setDescription] = useState(league.description ?? "");
  const [notes, setNotes] = useState(league.notes ?? "");
  const [photo, setPhoto] = useState<string | null>(league.photoUrl);
  const [visibility, setVisibility] = useState<"private" | "public">(
    league.visibility
  );
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      try {
        setPhoto(await readImageDataUrl(f));
      } catch {
        void alertDialog("Failed to read image.", { title: "Failed", tone: "danger" });
      }
    }
  }

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await updateLeague(league.id, {
        name,
        description,
        notes,
        photoUrl: photo,
        visibility,
      });
      onSaved();
    } catch (e) {
      void alertDialog("Failed to save: " + errMsg(e), {
        title: "Failed",
        tone: "danger",
      });
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl bg-surface-container-lowest text-on-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-navy px-6 pb-4 pt-5 text-white">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
          <h3 className="font-display text-lg font-bold">Edit League</h3>
          <p className="text-xs text-white/55">Change league settings.</p>
        </div>

        <div className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-outline-variant bg-surface-container-low hover:border-primary-fixed-dim"
            >
              {photo ? (
                <img src={photo} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-on-surface-variant">
                  add_a_photo
                </span>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="League name"
                className="input w-full"
              />
              {photo && (
                <button
                  onClick={() => setPhoto(null)}
                  className="mt-1 text-xs font-medium text-loss-red hover:underline"
                >
                  Delete photo
                </button>
              )}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={pickPhoto}
            className="hidden"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
            rows={2}
            className="input w-full resize-none"
          />

          <div>
            <div className="mb-1 text-xs font-medium text-on-surface-variant">
              Notes (optional)
            </div>
            <RichText
              value={notes}
              onChange={setNotes}
              placeholder="Rules, schedule, extra info…"
            />
          </div>

          <div className="flex rounded-xl border border-outline-variant/40 bg-surface-container p-1 text-sm">
            {(
              [
                ["private", "Private", "lock"],
                ["public", "Public", "public"],
              ] as const
            ).map(([v, l, icon]) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 font-semibold transition ${
                  visibility === v
                    ? "bg-surface-container-lowest text-on-surface shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {icon}
                </span>
                {l}
              </button>
            ))}
          </div>
          <p className="text-xs text-on-surface-variant">
            {visibility === "private"
              ? "Private — can only be joined via code/invitation."
              : "Public — discoverable & requestable to join (approval needed)."}
          </p>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-outline-variant px-4 py-2.5 text-sm font-semibold hover:bg-surface-container-low"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy || !name.trim()}
              className="flex-1 rounded-xl bg-primary-fixed px-4 py-2.5 text-sm font-semibold text-on-primary-fixed hover:bg-primary-fixed-dim disabled:bg-surface-container disabled:text-outline"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
        isAdminRole: a.role === "admin",
        canSetRole: isAdmin && a.role !== "owner",
        onToggleRole: async () => {
          const toAdmin = a.role !== "admin";
          const ok = await confirmDialog(
            toAdmin
              ? `Make ${a.name} a league admin? Admins can manage members, tournaments & roster.`
              : `Demote ${a.name} to a regular member?`,
            {
              title: toAdmin ? "Make admin" : "Demote role",
              confirmText: toAdmin ? "Make admin" : "Demote",
            }
          );
          if (!ok) return;
          await setMemberRole(leagueId, a.userId, toAdmin ? "admin" : "member");
        },
      })),
    ...extraPlayers
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        key: "p:" + p.id,
        name: p.name,
        username: null as string | null,
        badge: p.isGuest ? "guest" : "account",
        canRemove: isAdmin,
        onRemove: async () => setR(rosterIds.filter((x) => x !== p.id)),
        isAdminRole: false,
        canSetRole: false,
        onToggleRole: undefined as (() => Promise<void>) | undefined,
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
      void alertDialog("Failed: " + errMsg(e), { title: "Failed", tone: "danger" });
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
        : b === "guest"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-500";

  return (
    <Card title={`🎾 Players & Members (${rows.length})`}>
      <p className="mb-3 text-xs text-slate-400">
        <b>Accounts</b> (owner/admin/member) = management access. <b>Guests</b> = play only.
        Players here are auto-selected when adding a session.
      </p>

      {isAdmin && pending.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
            Join requests ({pending.length})
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
                  title="Approve"
                >
                  ✓
                </button>
                <button
                  onClick={() => act(() => removeMember(leagueId, m.userId))}
                  className="grid h-7 w-7 place-items-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                  title="Decline"
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
              placeholder="Invite an account by name / @username…"
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
                        Invite
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
              placeholder="Add a player/guest to the roster…"
              className="input w-full pl-9"
            />
            {addTerm && (
              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {addPool.length === 0 ? (
                  <li className="px-2 py-1.5 text-xs text-slate-400">
                    No matching players.
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
                            guest
                          </span>
                        )}
                        <span className="text-xs font-medium text-primary">
                          Add
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
        emptyText="No players/members yet."
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
            {r.canSetRole && r.onToggleRole && (
              <button
                onClick={() => act(r.onToggleRole!)}
                className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-primary"
                title={r.isAdminRole ? "Demote to member" : "Make admin"}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {r.isAdminRole ? "remove_moderator" : "add_moderator"}
                </span>
              </button>
            )}
            {r.canRemove && (
              <button
                onClick={() => act(r.onRemove)}
                className="text-slate-300 hover:text-red-600"
                title="Remove"
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
    desc: "Individual. Play with & against everyone.",
  },
  {
    id: "mexicano",
    name: "Mexicano",
    desc: "Individual. Balanced matchups each round.",
  },
  {
    id: "team_americano",
    name: "Team Americano",
    desc: "Fixed pairs. Play against all teams.",
  },
  {
    id: "team_mexicano",
    name: "Team Mexicano",
    desc: "Fixed pairs. Balanced matchups each round.",
  },
];

const POINT_OPTIONS = [16, 21, 24, 32, 0]; // 0 = Undefined / bebas
const NORMAL_TARGETS = [3, 4, 5, 6, 7];

/** Editor WYSIWYG ringan (contentEditable + execCommand) — ramah mobile. */
function RichText({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value)
      ref.current.innerHTML = value;
    // sekali saat mount saja
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cmd = (c: string) => {
    document.execCommand(c, false);
    ref.current?.focus();
    onChange(ref.current?.innerHTML ?? "");
  };
  const Btn = ({ c, icon }: { c: string; icon: string }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => cmd(c)}
      className="grid h-8 w-8 place-items-center rounded text-on-surface-variant hover:bg-surface-container-high"
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </button>
  );
  return (
    <div className="overflow-hidden rounded-lg border border-outline-variant">
      <div className="flex gap-0.5 border-b border-outline-variant/50 bg-surface-container-low p-1">
        <Btn c="bold" icon="format_bold" />
        <Btn c="italic" icon="format_italic" />
        <Btn c="insertUnorderedList" icon="format_list_bulleted" />
        <Btn c="insertOrderedList" icon="format_list_numbered" />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        data-placeholder={placeholder}
        className="min-h-24 px-3 py-2 text-sm outline-none [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  );
}

/** Render catatan HTML (read-only) dengan sanitasi ringan: hanya tag format,
 * semua atribut dibuang (cegah XSS dari event-handler / javascript: / style). */
function NotesHtml({ html }: { html: string }) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ok = new Set([
    "B", "I", "EM", "STRONG", "U", "UL", "OL", "LI", "P", "BR", "DIV", "SPAN",
  ]);
  doc.body.querySelectorAll("*").forEach((el) => {
    if (!ok.has(el.tagName)) {
      el.replaceWith(...Array.from(el.childNodes)); // unwrap tag tak diizinkan
      return;
    }
    Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name));
  });
  return (
    <div
      className="text-sm text-on-surface-variant [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: doc.body.innerHTML }}
    />
  );
}

/** Baca file gambar → data URL terkompres (maks sisi terpanjang `max` px). */
function readImageDataUrl(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Halaman buat liga (proper): foto, nama, deskripsi, notes (WYSIWYG),
 *  visibilitas, dan tambah anggota (undang akun / tamu). */
function CreateLeagueScreen({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const fileRef = useRef<HTMLInputElement>(null);

  // anggota
  const [invited, setInvited] = useState<AccountUser[]>([]);
  const [guests, setGuests] = useState<string[]>([]);
  const [accQ, setAccQ] = useState("");
  const [accHits, setAccHits] = useState<AccountUser[]>([]);
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = accQ.trim();
    if (t.length < 3) {
      setAccHits([]);
      return;
    }
    const tm = setTimeout(async () => {
      try {
        const r = await searchAccounts(t);
        const have = new Set(invited.map((u) => u.userId));
        setAccHits(r.filter((u) => !have.has(u.userId)));
      } catch {
        setAccHits([]);
      }
    }, 300);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accQ, invited.length]);

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      try {
        setPhoto(await readImageDataUrl(f));
      } catch {
        void alertDialog("Failed to read image.", { title: "Failed", tone: "danger" });
      }
    }
  }

  function addGuest() {
    const n = guestName.trim();
    if (n && !guests.includes(n)) setGuests([...guests, n]);
    setGuestName("");
  }

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const lg = await createLeague({
        name,
        visibility,
        description,
        notes,
        photoUrl: photo,
      });
      // Undang akun
      for (const u of invited) {
        try {
          await inviteUser(lg.id, u.userId);
        } catch {
          /* lanjut */
        }
      }
      // Tambah tamu ke roster
      if (guests.length) {
        const ids: string[] = [];
        for (const g of guests) {
          const p = await createPlayer(g, { guest: true });
          if (p) ids.push(p.id);
        }
        if (ids.length) await setLeagueMembers(lg.id, ids);
      }
      onCreated(lg.id);
    } catch (e) {
      void alertDialog("Failed to create league: " + errMsg(e), {
        title: "Failed",
        tone: "danger",
      });
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button
        onClick={onCancel}
        className="flex items-center gap-1 text-sm font-medium text-on-surface-variant hover:text-on-surface"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Back
      </button>

      <h2 className="font-display text-2xl font-bold">Create League</h2>

      <Card title="🏆 League Info">
        {/* Foto */}
        <div className="mb-4 flex items-center gap-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-outline-variant bg-surface-container-low hover:border-primary-fixed-dim"
          >
            {photo ? (
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-on-surface-variant">
                add_a_photo
              </span>
            )}
          </button>
          <div className="text-sm">
            <div className="font-semibold">League photo (optional)</div>
            <div className="text-on-surface-variant">
              Tap to choose an image.
            </div>
            {photo && (
              <button
                onClick={() => setPhoto(null)}
                className="mt-1 text-xs font-medium text-loss-red hover:underline"
              >
                Delete photo
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={pickPhoto}
            className="hidden"
          />
        </div>

        <Field label="League name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Local League 2026"
            className="input w-full"
          />
        </Field>

        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short league description…"
            rows={2}
            className="input w-full resize-y"
          />
        </Field>

        <Field label="Notes (optional)">
          <RichText
            value={notes}
            onChange={setNotes}
            placeholder="Rules, schedule, other info… (bold/italic/lists supported)"
          />
        </Field>

        <Field label="Visibility">
          <Toggle
            value={visibility === "private"}
            onChange={(v) => setVisibility(v ? "private" : "public")}
            onLabel="🔒 Private"
            offLabel="🌐 Public"
          />
          <p className="mt-1 text-xs text-on-surface-variant">
            {visibility === "private"
              ? "Join via code / invitation."
              : "Shows up in Explore; people can request to join (approval needed)."}
          </p>
        </Field>
      </Card>

      <Card title="👥 Initial Members (optional)">
        {/* Undang akun */}
        <Field label="Invite an account (@username)">
          <div className="relative">
            <input
              value={accQ}
              onChange={(e) => setAccQ(e.target.value)}
              placeholder="Search name / @username…"
              className="input w-full"
            />
            {accHits.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                {accHits.map((u) => (
                  <li key={u.userId}>
                    <button
                      onClick={() => {
                        setInvited([...invited, u]);
                        setAccQ("");
                        setAccHits([]);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary-container/40"
                    >
                      <TeamAvatar name={u.name} />
                      <span className="min-w-0 flex-1 truncate">
                        {u.name}
                        {u.username && (
                          <span className="text-on-surface-variant">
                            {" "}
                            @{u.username}
                          </span>
                        )}
                      </span>
                      <span className="text-xs font-medium text-primary">
                        Invite
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>

        {/* Tambah tamu */}
        <Field label="Add a guest (no account)">
          <div className="flex gap-2">
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGuest()}
              placeholder="Guest name…"
              className="input flex-1"
            />
            <button
              onClick={addGuest}
              className="rounded-lg bg-navy px-4 text-sm font-semibold text-white"
            >
              Add
            </button>
          </div>
        </Field>

        {(invited.length > 0 || guests.length > 0) && (
          <ul className="flex flex-wrap gap-2">
            {invited.map((u) => (
              <li
                key={"u" + u.userId}
                className="flex items-center gap-1.5 rounded-full bg-sky-100 py-1 pl-2 pr-1 text-sm text-sky-800"
              >
                <TeamAvatar name={u.name} />
                {u.name}
                <button
                  onClick={() =>
                    setInvited(invited.filter((x) => x.userId !== u.userId))
                  }
                  className="grid h-5 w-5 place-items-center rounded-full hover:bg-black/10"
                >
                  ×
                </button>
              </li>
            ))}
            {guests.map((g) => (
              <li
                key={"g" + g}
                className="flex items-center gap-1.5 rounded-full bg-amber-100 py-1 pl-2 pr-1 text-sm text-amber-800"
              >
                <TeamAvatar name={g} />
                {g}
                <span className="text-[10px] uppercase">guest</span>
                <button
                  onClick={() => setGuests(guests.filter((x) => x !== g))}
                  className="grid h-5 w-5 place-items-center rounded-full hover:bg-black/10"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <button
        onClick={submit}
        disabled={busy || !name.trim()}
        className="w-full rounded-xl bg-primary-fixed px-4 py-3 font-semibold text-on-primary-fixed transition hover:bg-primary-fixed-dim disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-outline"
      >
        {busy ? "Creating…" : "Create League"}
      </button>
    </div>
  );
}

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
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
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
    ? "Creating…"
    : !evenOk
      ? "Team formats need an even number of players"
      : names.length < 4
        ? "Need at least 4 players"
        : !manualComplete
          ? "Pair all players into teams first"
          : "Start Session";

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
        name: name.trim() || "Untitled Session",
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
        notes,
        photoUrl: photo,
        startAt:
          startMode === "schedule" && startDate
            ? new Date(`${startDate}T${startTime || "00:00"}`).getTime()
            : null,
      });
      onCreated(event.id);
    } catch (e) {
      void alertDialog(
        "Failed to create session: " + (e instanceof Error ? e.message : e),
        { title: "Failed", tone: "danger" }
      );
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onCancel}
          className="flex items-center gap-1 text-sm font-medium text-on-surface-variant hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back
        </button>
        <span className="rounded-full bg-surface-container px-2.5 py-1 font-label-caps text-label-caps text-on-surface-variant">
          {inLeague ? `League: ${inLeague.name}` : "Standalone tournament"}
        </span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card title={inLeague ? "Add Session" : "Create Tournament"}>
        <Field label="Tournament photo (optional)">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-outline-variant bg-surface-container-low hover:border-primary-fixed-dim"
            >
              {photo ? (
                <img src={photo} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-on-surface-variant">
                  add_a_photo
                </span>
              )}
            </button>
            <div className="text-sm">
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                className="font-semibold text-primary hover:underline"
              >
                {photo ? "Change photo" : "Upload photo"}
              </button>
              {photo && (
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="ml-3 text-on-surface-variant hover:text-loss-red"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setPhoto(await readImageDataUrl(f));
              } catch {
                void alertDialog("Failed to read image.", {
                  title: "Failed",
                  tone: "danger",
                });
              }
            }}
            className="hidden"
          />
        </Field>

        <Field label="Session name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Friday Night Games"
            className="input"
          />
        </Field>

        <Field label="Description (optional)">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Weekly padel meetup…"
            className="input"
          />
        </Field>

        <Field label="Notes (optional)">
          <RichText
            value={notes}
            onChange={setNotes}
            placeholder="Rules, schedule, extra info…"
          />
        </Field>

        <Field label="Start">
          <Toggle
            value={startMode === "now"}
            onChange={(v) => setStartMode(v ? "now" : "schedule")}
            onLabel="Now"
            offLabel="Pick date"
          />
          {startMode === "schedule" && (
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="flex-1">
                <span className="mb-1 block text-xs text-on-surface-variant">
                  Date
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input w-full"
                />
              </label>
              <label className="flex-1">
                <span className="mb-1 block text-xs text-on-surface-variant">
                  Time
                </span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="input w-full"
                />
              </label>
            </div>
          )}
          <p className="mt-1 text-xs text-on-surface-variant">
            {startMode === "now"
              ? "Session starts now."
              : startDate
                ? "Scheduled — shows as an upcoming session until its time."
                : "Pick a start date & time."}
          </p>
        </Field>

        <Field label="Format">
          <div className="grid gap-2 sm:grid-cols-2">
            {FORMATS.map((f) => {
              const on = format === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className={`flex items-start gap-2 rounded-xl border p-3 text-left transition ${
                    on
                      ? "border-primary bg-primary-container/30 ring-1 ring-primary"
                      : "border-outline-variant hover:border-primary-fixed-dim hover:bg-surface-container-low"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined mt-0.5 text-[18px] ${
                      on ? "fill text-primary" : "text-on-surface-variant"
                    }`}
                  >
                    {on ? "check_circle" : "radio_button_unchecked"}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{f.name}</span>
                    <span className="block text-xs text-on-surface-variant">
                      {f.desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Number of courts">
          <Stepper
            value={courtsClamped}
            min={1}
            max={maxCourts}
            onChange={setCourts}
          />
          <span className="ml-2 text-xs text-on-surface-variant">
            max {maxCourts}
          </span>
        </Field>

        <Field label="Scoring system">
          <Toggle
            value={scoringType === "point"}
            onChange={(v) => setScoringType(v ? "point" : "normal")}
            onLabel="Points"
            offLabel="Games (normal)"
          />
        </Field>

        {scoringType === "point" ? (
          <Field label="Points per match">
            <div className="flex flex-wrap gap-1.5">
              {POINT_OPTIONS.map((p) => (
                <Chip
                  key={p}
                  active={points === p}
                  onClick={() => setPoints(p)}
                  label={p === 0 ? "Free" : String(p)}
                />
              ))}
            </div>
          </Field>
        ) : (
          <Field label="Game type">
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
            <p className="mt-2 text-xs text-on-surface-variant">
              {normalMode === "first"
                ? `First team to ${normalTarget} games wins.`
                : `Play ${normalTarget} games, score = games won.`}
            </p>
          </Field>
        )}

        {isTeamFormat(format) && (
          <Field label="Team pairing">
            <Toggle
              value={pairing === "auto"}
              onChange={(v) => setPairing(v ? "auto" : "manual")}
              onLabel="Auto"
              offLabel="Manual"
            />
            <p className="mt-1 text-xs text-on-surface-variant">
              {pairing === "auto"
                ? "Pairs are formed automatically."
                : "Set up each team yourself below."}
            </p>
          </Field>
        )}

        {isTeamFormat(format) && (
          <Field label={isAuto ? "Team preview" : "Set up teams"}>
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

        <Field label="Initial player order">
          <Toggle
            value={randomize}
            onChange={setRandomize}
            onLabel="Shuffle"
            offLabel="As entered"
          />
        </Field>

        <Field label="Visibility">
          <div className="flex flex-wrap gap-1.5">
            {(leagueId
              ? ([
                  ["inherit", `Follow league (${inLeague?.visibility === "public" ? "public" : "private"})`],
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
          <p className="mt-1.5 text-xs text-on-surface-variant">
            {visibility === "public"
              ? "Anyone can view this tournament."
              : visibility === "private"
                ? "Only you" +
                  (leagueId ? " & league members" : "") +
                  " can view it."
                : `Follows the league setting (${inLeague?.visibility === "public" ? "public" : "private — members only"}).`}
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
      <Card title={`Players (${names.length})`}>
        {/* Cari & tambah dulu, daftar pemain terpilih di bawahnya. */}
        <PlayerPicker
          registered={registeredList}
          selectedIds={selected.map((s) => s.id)}
          onToggle={togglePlayer}
          onAddGuest={addGuest}
        />

        {names.length === 0 ? (
          <p className="mt-3 text-sm text-on-surface-variant">
            No players yet. Search a name and add it, or create a guest.
          </p>
        ) : (
          <ul className="mt-4 space-y-1 rounded-xl border border-outline-variant/50 p-1.5">
            {selected.map((sel) => {
              const guest = sel.isGuest;
              return (
                <li
                  key={sel.id}
                  className="flex items-center gap-2.5 rounded-lg bg-surface-container-low px-2 py-1.5 text-sm"
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      guest
                        ? "bg-surface-container text-on-surface-variant"
                        : "bg-primary-container text-on-primary-container"
                    }`}
                  >
                    {sel.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate font-medium text-on-surface">
                      {sel.name}
                    </span>
                    <span
                      className={`rounded px-1 text-[10px] font-semibold uppercase ${
                        guest
                          ? "bg-elo-bronze/15 text-elo-bronze"
                          : "bg-primary-container text-on-primary-container"
                      }`}
                    >
                      {guest ? "guest" : "account"}
                    </span>
                  </span>
                  <button
                    onClick={() => togglePlayer(sel)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-lg text-on-surface-variant hover:bg-error-container hover:text-error"
                    aria-label={`Remove ${sel.name}`}
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
          placeholder="Search name / @username, or add…"
          className="input w-full pl-9 pr-9"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        )}
      </div>

      {/* Hint sebelum cukup huruf. */}
      {term.length > 0 && term.length < 3 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400 shadow-lg">
          Type at least 3 characters…
        </div>
      )}

      {/* Dropdown hasil — mulai 3 huruf. */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between px-3 pt-2 text-[11px] text-slate-400">
            <span>Search results</span>
            {loading ? <span>searching…</span> : <span>{merged.length}</span>}
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
                          {p.isAccount ? "account" : "guest"}
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
              Add “{term}” as a guest
            </button>
          )}

          {merged.length === 0 && exactExists && (
            <p className="px-3 py-3 text-center text-xs text-slate-400">
              Already added.
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
  if (eventQ.loading) return <p className="text-slate-400">Loading session…</p>;
  if (!eventQ.data) return <p>Session not found.</p>;
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

  const { user } = useAuth();
  // Pembuat turnamen ATAU admin/owner liga boleh acak, ubah jadwal & skor.
  // Peserta/tamu hanya bisa melihat. (RLS Supabase juga menegakkan ini.)
  const leagueQ = useAsync(
    () =>
      event.leagueId ? getLeague(event.leagueId) : Promise.resolve(undefined),
    [event.leagueId]
  );
  const isLeagueAdmin =
    leagueQ.data?.myRole === "owner" || leagueQ.data?.myRole === "admin";
  const canEdit = !!user && (user.id === event.ownerId || isLeagueAdmin);

  const session = useSession(
    { config, players: event.players, restore, initialTeams: event.teams },
    () => onExit(event)
  );

  // Persist perubahan ronde/skor/tim ke Supabase (debounce 600ms).
  // Hanya organizer yang menulis — non-owner ditolak RLS, jadi tak perlu coba.
  useEffect(() => {
    if (!canEdit) return;
    const t = setTimeout(() => {
      void updateEvent(event.id, {
        rounds: session.rounds,
        scores: session.scores,
        teams: session.teams,
      });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, session.rounds, session.scores, session.teams, canEdit]);

  return (
    <div className="space-y-5">
      <MetaBar session={session} event={event} onExit={onExit} canEdit={canEdit} />
      {(event.description || event.notes || event.photoUrl) && (
        <Card title="ℹ️ About this tournament">
          {event.photoUrl && (
            <img
              src={event.photoUrl}
              alt=""
              className="mb-3 h-40 w-full rounded-xl object-cover"
            />
          )}
          {event.description && (
            <p className="text-sm text-on-surface-variant">
              {event.description}
            </p>
          )}
          {event.notes && (
            <div className={event.description ? "mt-2" : ""}>
              <NotesHtml html={event.notes} />
            </div>
          )}
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <RoundsPanel session={session} canEdit={canEdit} />
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
  canEdit,
}: {
  session: Session;
  event: DbEvent;
  onExit: (ev: DbEvent | undefined) => void;
  canEdit: boolean;
}) {
  const { config, rounds } = session;
  const items = [
    FORMAT_LABEL[config.format],
    scoreSpec(config.scoring).label,
    `${session.players.length} players`,
    `${rounds.length} rounds`,
    `${config.courts} courts`,
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
            BACK
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
        {canEdit && (
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
            Mark finished
          </button>
        )}
      </div>
    </section>
  );
}

function RoundsPanel({
  session,
  canEdit,
}: {
  session: Session;
  canEdit: boolean;
}) {
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
    <Card title="Match Rounds">
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
              Resting: {round.resting.join(", ")}
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
                  <span>COURT {m.court}</span>
                  {played && (
                    <span className="rounded-full bg-primary-container px-2 py-0.5 text-on-primary-container">
                      DONE
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Sisi kiri: klik → pilih skor tim A */}
                  <button
                    onClick={() => setPicking({ court: m.court, side: "a" })}
                    disabled={!canEdit}
                    className="flex flex-1 items-center justify-between gap-2 rounded-lg p-1 text-left transition enabled:hover:bg-surface-container-high disabled:cursor-default"
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
                    disabled={!canEdit}
                    className="flex flex-1 items-center justify-between gap-2 rounded-lg p-1 text-right transition enabled:hover:bg-surface-container-high disabled:cursor-default"
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

      {canEdit && (
      <div className="mt-4 flex gap-2">
        {isScheduledFormat(config.format) ? (
          // Americano: semua ronde tampil. Saat jadwal habis → tambah 1 siklus
          // baru (lanjut tanpa sesi baru); + opsi acak ulang jadwal.
          <>
            <button
              onClick={session.extendSchedule}
              className="flex-1 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Add round +
            </button>
            <button
              onClick={session.reshuffle}
              title="Reshuffle schedule"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-outline-variant px-4 py-2.5 text-sm font-semibold hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-[18px]">
                shuffle
              </span>
              Shuffle
            </button>
          </>
        ) : (
          <>
            <button
              onClick={session.nextRound}
              disabled={!session.canAddRound}
              className="flex-1 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-outline"
            >
              {!session.lastRoundComplete
                ? "Complete this round's scores first"
                : "Next round →"}
            </button>
            {isLast && (
              <button
                onClick={session.reshuffle}
                className="rounded-xl border border-outline-variant px-4 py-2.5 text-sm font-semibold hover:bg-surface-container-low"
              >
                Reshuffle
              </button>
            )}
          </>
        )}
      </div>
      )}

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
          ROUND {roundIndex + 1} · COURT {match.court}
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
          Pick score · {spec.label}
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
            Close
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
    <Card
      title="🏆 Standings"
      action={
        <ShareButton
          title={session.config.name}
          rows={buildShareRows(standings)}
          label="Share"
        />
      }
    >
      {(
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/30 text-left font-label-caps text-label-caps text-on-surface-variant">
                <th className="pb-2 pr-2">#</th>
                <th className="pb-2">Player</th>
                <th className="pb-2 text-right">P</th>
                <th className="pb-2 text-right" title="Compensation (+M)">
                  +M
                </th>
                <th className="pb-2 text-right" title="Wins-Losses-Ties">
                  W-L-T
                </th>
                <th className="pb-2 text-right" title="Matches played">
                  Played
                </th>
                <th className="pb-2 text-right" title="Point difference">
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
          ["P", "Points (already includes +M)"],
          ["+M", "Compensation points for playing fewer matches (bye)"],
          ["W-L-T", "Wins - Losses - Ties"],
          ["Played", "Matches played"],
          ["Diff", "Point difference (scored − conceded)"],
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
    <Card title="🏆 Team Standings">
      {(
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/30 text-left font-label-caps text-label-caps text-on-surface-variant">
                <th className="pb-2 pr-2">#</th>
                <th className="pb-2">Team</th>
                <th className="pb-2 text-right">P</th>
                <th className="pb-2 text-right" title="Wins-Losses-Ties">
                  W-L-T
                </th>
                <th className="pb-2 text-right" title="Matches played">
                  Played
                </th>
                <th className="pb-2 text-right" title="Point difference">
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
          ["P", "Total points"],
          ["W-L-T", "Wins - Losses - Ties"],
          ["Played", "Matches played"],
          ["Diff", "Point difference (scored − conceded)"],
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
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold">{title}</h3>
        {action}
      </div>
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
        Team {index + 1}
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
        <p className={EMPTY_HINT}>Select at least 4 players to form teams.</p>
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
                waiting for partner
              </div>
            </TeamCard>
          )}
        </div>
      )}
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-slate-400">
          {hasLeftover
            ? `${leftover.length} players not yet on a team (an even count is needed).`
            : "Pairs are formed automatically."}
        </p>
        {(teams.length > 0 || hasLeftover) && (
          <button
            onClick={onReshuffle}
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            ↻ Reshuffle
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
        <p className={EMPTY_HINT}>Select at least 4 players to form teams.</p>
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
                          aria-label="Clear seat"
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
                          Pick player
                        </span>
                        <span aria-hidden>▾</span>
                      </button>
                    )}

                    {isOpen && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                        {pool.length === 0 ? (
                          <p className="px-2 py-1.5 text-xs text-slate-400">
                            No players left.
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
            ? "All players are on a team."
            : `${pool.length} players not yet on a team.`}
        </p>
        {pool.length >= 1 && (
          <button
            onClick={autoFill}
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Auto-fill the rest
          </button>
        )}
      </div>
    </div>
  );
}

