# Arsitektur

Pedal Padel adalah **monorepo npm workspaces** dengan tiga bagian yang dipisah tegas: engine murni, UI web, dan database.

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web  (Vite + React + Tailwind)                          │
│  ┌───────────────┐   ┌───────────────┐   ┌────────────────┐   │
│  │  UI komponen  │──▶│  db.ts /      │──▶│ supabase-js    │──▶ Supabase
│  │  (App.tsx)    │   │  session.ts   │   │ (auth + data)  │   │ (Postgres+Auth+RLS)
│  └───────┬───────┘   └───────────────┘   └────────────────┘   │
│          │ panggil fungsi murni                               │
│          ▼                                                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  @pedal/engine  (TS murni — no UI, no DB)             │    │
│  │  matchmaking (americano/mexicano/teams) + ELO + std.  │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Prinsip

1. **Engine bebas efek samping.** `@pedal/engine` tidak menyentuh DOM, jaringan, atau DB — hanya fungsi murni input→output. Karena itu mudah di-unit-test (39 test) dan dipakai ulang di web maupun mobile (Expo) nanti.
2. **Tidak ada server sendiri.** Backend penuh (DB, Auth, Realtime) ditangani Supabase. UI bicara langsung ke Supabase lewat `supabase-js`; keamanan akses diatur **RLS** di Postgres, bukan kode middleware.
3. **Engine = sumber kebenaran logika.** UI tidak mengulang aturan matchmaking/scoring; semua dihitung di engine agar konsisten lintas platform.

## Lapisan kode web

| File | Tanggung jawab |
|---|---|
| `apps/web/src/App.tsx` | Komponen UI utama (setup event, ronde, input skor, leaderboard) |
| `apps/web/src/session.ts` | State sesi/event di sisi klien (ronde, skor berjalan) |
| `apps/web/src/db.ts` | Layer data — baca/tulis ke Supabase |
| `apps/web/src/auth.tsx` | Auth (login/daftar) + konteks user |
| `apps/web/src/supabase.ts` | Inisialisasi client supabase-js dari env |
| `apps/web/src/ratings.ts` | Glue antara hasil match dan `rateMatch` engine |

## Alur data satu sesi Americano

1. Admin pilih pemain & jumlah lapangan → `generateAmericano(players)` menghasilkan jadwal ronde.
2. Skor tiap match diinput → dikumpulkan jadi `MatchResult[]`.
3. `computeStandings(results)` → leaderboard event (poin → selisih game → menang).
4. Per match, `rateMatch(result, players)` → delta ELO 4 pemain → disimpan ke `RatingHistory` untuk leaderboard global.

Detail algoritma di [engine.md](engine.md). Model data lengkap di [../DESIGN.md §4 & §13](../DESIGN.md).

## Database (Supabase)

Skema didefinisikan di [`supabase/schema.sql`](../supabase/schema.sql). Tabel inti: `profiles`, `players` (akun atau tamu), `leagues`, `league_members`, `events`, `event_players`, `matches`. Akses diatur per-baris lewat **Row Level Security** — owner bisa edit, publik bisa lihat lewat link share.
