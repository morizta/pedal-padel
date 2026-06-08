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
    "Pemain"
  );
}

async function signUp(
  email: string,
  password: string,
  name: string,
  username: string
) {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
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
  if (!supabase) throw new Error("Supabase belum dikonfigurasi.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
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
  return (user.email?.split("@")[0] ?? "pemain").toLowerCase();
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
        className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-lime-400 text-xs font-bold text-slate-900">
          {displayName(user).charAt(0).toUpperCase()}
        </span>
        <span className="hidden sm:inline">{displayName(user)}</span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-lime-400 px-4 py-1.5 text-sm font-semibold text-slate-900 hover:bg-lime-300"
      >
        Masuk / Daftar
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
          throw new Error("Username minimal 3 huruf (a-z, 0-9, _).");
        }
        if (uOk === false) throw new Error("Username sudah dipakai.");
        await signUp(email, password, name, cleanUser);
        setInfo(
          "Pendaftaran berhasil. Cek email untuk verifikasi (jika diminta), lalu masuk."
        );
        setMode("login");
      } else {
        await signIn(email, password);
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-4 text-slate-900"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-sm">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 font-medium ${
                mode === m ? "bg-white shadow-sm" : "text-slate-500"
              }`}
            >
              {m === "login" ? "Masuk" : "Daftar"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mode === "signup" && (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama lengkap (boleh sama dengan orang lain)"
                className="input w-full"
              />
              <div>
                <div className="flex items-center rounded-lg border border-slate-300 px-3 focus-within:border-lime-500">
                  <span className="text-slate-400">@</span>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username (unik)"
                    className="w-full py-2 text-sm focus:outline-none"
                  />
                </div>
                {cleanUser.length > 0 && cleanUser.length < 3 && (
                  <p className="mt-1 text-xs text-slate-400">
                    Minimal 3 huruf (a-z, 0-9, _).
                  </p>
                )}
                {cleanUser.length >= 3 && uOk === true && (
                  <p className="mt-1 text-xs text-emerald-600">
                    @{cleanUser} tersedia ✓
                  </p>
                )}
                {cleanUser.length >= 3 && uOk === false && (
                  <p className="mt-1 text-xs text-red-600">
                    @{cleanUser} sudah dipakai
                  </p>
                )}
              </div>
            </>
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="input w-full"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Password (min. 6 karakter)"
            className="input w-full"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-emerald-600">{info}</p>}
          <button
            onClick={submit}
            disabled={
              busy ||
              !email ||
              password.length < 6 ||
              (mode === "signup" && (cleanUser.length < 3 || uOk === false))
            }
            className="w-full rounded-lg bg-lime-400 px-4 py-2.5 font-semibold text-slate-900 hover:bg-lime-300 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Daftar"}
          </button>
        </div>
      </div>
    </div>
  );
}
