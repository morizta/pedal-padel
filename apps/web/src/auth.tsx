/**
 * Autentikasi (Supabase Auth) — user daftar & login sendiri.
 * Diisolasi di sini agar UI tidak bergantung langsung ke Supabase.
 */
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, supabaseEnabled } from "./supabase";
import { isUsernameTaken } from "./db";

export interface AuthState {
  user: User | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export function displayName(user: User): string {
  return (
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Player"
  );
}

async function signUp(
  email: string,
  password: string,
  name: string,
  username: string
) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, username },
      // Link verifikasi email kembali ke URL tempat user daftar (bukan default).
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

async function signIn(email: string, password: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Login via Google (OAuth). Mengarahkan ke Google lalu balik ke origin. */
export async function signInWithGoogle() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase?.auth.signOut();
}

export async function updateName(name: string) {
  if (!supabase) return;
  const clean = name.trim();
  if (!clean) return;
  await supabase.auth.updateUser({ data: { name: clean } });
}

/** Handle @username sederhana dari email. */
export function handle(user: User): string {
  return (user.email?.split("@")[0] ?? "player").toLowerCase();
}

/* ---------- UI ---------- */

export function AuthBar({
  user,
  onProfile,
}: {
  user: User | null;
  onProfile: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!supabaseEnabled) return null;

  if (user) {
    return (
      <button
        onClick={onProfile}
        className="flex items-center gap-2 rounded-xl border border-white/15 px-2.5 py-1.5 text-sm text-white/90 transition hover:bg-white/10"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-fixed text-xs font-bold text-on-primary-fixed">
          {displayName(user).charAt(0).toUpperCase()}
        </span>
        <span className="hidden font-medium sm:inline">{displayName(user)}</span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-primary-fixed px-4 py-2 text-sm font-bold text-on-primary-fixed shadow-sm transition hover:bg-primary-fixed-dim"
      >
        <span className="material-symbols-outlined text-[18px]">login</span>
        Sign in
      </button>
      {open && <AuthModal onClose={() => setOpen(false)} />}
    </>
  );
}

function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Status ketersediaan username: null=belum cek, true=tersedia, false=dipakai.
  const [uOk, setUOk] = useState<boolean | null>(null);

  const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  useEffect(() => {
    if (mode !== "signup" || cleanUser.length < 3) {
      setUOk(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const taken = await isUsernameTaken(cleanUser);
        if (!cancelled) setUOk(!taken);
      } catch {
        if (!cancelled) setUOk(null);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cleanUser, mode]);

  async function submit() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signup") {
        if (cleanUser.length < 3) {
          throw new Error("Username must be at least 3 characters (a-z, 0-9, _).");
        }
        if (uOk === false) throw new Error("Username is already taken.");
        await signUp(email, password, name, cleanUser);
        setInfo(
          "Sign up successful. Check your email to verify (if prompted), then sign in."
        );
        setMode("login");
      } else {
        await signIn(email, password);
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle(); // redirect ke Google; balik lewat onAuthStateChange
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sign in with Google.");
      setBusy(false);
    }
  }

  const inputWrap =
    "flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20";
  const inputCls =
    "w-full bg-transparent py-2.5 text-sm text-on-surface placeholder:text-outline focus:outline-none";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl bg-surface-container-lowest text-on-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header brand */}
        <div className="relative bg-navy px-6 pb-5 pt-6 text-white">
          <span className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-primary-fixed/15 blur-2xl" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
          <div className="relative flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-fixed text-on-primary-fixed shadow-sm">
              <span className="material-symbols-outlined">sports_tennis</span>
            </span>
            <div className="min-w-0">
              <div className="font-display text-xl font-extrabold tracking-tight">
                SICOPA
              </div>
              <div className="text-xs text-white/55">
                {mode === "login"
                  ? "Sign in to play & see your ranking"
                  : "Sign up free — start playing now"}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="mb-4 flex rounded-xl border border-outline-variant/40 bg-surface-container p-1 text-sm">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-lg py-2 font-semibold transition ${
                  mode === m
                    ? "bg-surface-container-lowest text-on-surface shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {m === "login" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <button
            onClick={google}
            disabled={busy}
            className="mb-3 flex w-full items-center justify-center gap-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold text-on-surface transition hover:bg-surface-container-low disabled:opacity-60"
          >
            <svg
              className="h-[18px] w-[18px]"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="mb-3 flex items-center gap-3 text-xs text-on-surface-variant">
            <span className="h-px flex-1 bg-outline-variant/50" />
            or email
            <span className="h-px flex-1 bg-outline-variant/50" />
          </div>

          <div className="space-y-3">
            {mode === "signup" && (
              <>
                <label className={inputWrap}>
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                    person
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className={inputCls}
                  />
                </label>
                <div>
                  <label className={inputWrap}>
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                      alternate_email
                    </span>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="username (unique)"
                      className={inputCls}
                    />
                    {cleanUser.length >= 3 && uOk === true && (
                      <span className="material-symbols-outlined text-[18px] text-primary">
                        check_circle
                      </span>
                    )}
                    {cleanUser.length >= 3 && uOk === false && (
                      <span className="material-symbols-outlined text-[18px] text-error">
                        cancel
                      </span>
                    )}
                  </label>
                  {cleanUser.length > 0 && cleanUser.length < 3 && (
                    <p className="mt-1 px-1 text-xs text-on-surface-variant">
                      At least 3 characters (a-z, 0-9, _).
                    </p>
                  )}
                  {cleanUser.length >= 3 && uOk === true && (
                    <p className="mt-1 px-1 text-xs text-primary">
                      @{cleanUser} available ✓
                    </p>
                  )}
                  {cleanUser.length >= 3 && uOk === false && (
                    <p className="mt-1 px-1 text-xs text-error">
                      @{cleanUser} is already taken
                    </p>
                  )}
                </div>
              </>
            )}
            <label className={inputWrap}>
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                mail
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className={inputCls}
              />
            </label>
            <label className={inputWrap}>
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                lock
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Password (min. 6 characters)"
                className={inputCls}
              />
            </label>

            {error && (
              <p className="flex items-center gap-1.5 rounded-lg bg-error-container/50 px-3 py-2 text-sm text-error">
                <span className="material-symbols-outlined text-[18px]">
                  error
                </span>
                {error}
              </p>
            )}
            {info && (
              <p className="flex items-center gap-1.5 rounded-lg bg-primary-container/40 px-3 py-2 text-sm text-on-primary-container">
                <span className="material-symbols-outlined text-[18px]">
                  check_circle
                </span>
                {info}
              </p>
            )}

            <button
              onClick={submit}
              disabled={
                busy ||
                !email ||
                password.length < 6 ||
                (mode === "signup" && (cleanUser.length < 3 || uOk === false))
              }
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary-fixed px-4 py-3 font-semibold text-on-primary-fixed shadow-sm transition hover:bg-primary-fixed-dim disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-outline disabled:shadow-none"
            >
              {busy ? (
                "Processing…"
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">
                    {mode === "login" ? "login" : "person_add"}
                  </span>
                  {mode === "login" ? "Sign in" : "Sign up"}
                </>
              )}
            </button>

            <p className="text-center text-xs text-on-surface-variant">
              {mode === "login" ? "Don't have an account? " : "Already have an account? "}
              <button
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="font-semibold text-primary hover:underline"
              >
                {mode === "login" ? "Sign up free" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
