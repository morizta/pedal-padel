/**
 * Client Supabase tunggal untuk seluruh app.
 *
 * Sengaja diisolasi di file ini supaya bagian lain (UI/data layer) tidak
 * bergantung langsung ke Supabase — memudahkan ganti backend nanti.
 */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true bila kredensial tersedia (kalau tidak, app jalan mode localStorage saja). */
export const supabaseEnabled = Boolean(url && anonKey);

export const supabase = supabaseEnabled
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
