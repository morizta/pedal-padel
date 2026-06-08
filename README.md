# 🎾 Pedal Padel

Aplikasi **matchmaking padel** dengan **leaderboard individual per pemain** (rating ELO global yang persisten lintas event).

Terinspirasi [PDLUP](https://app.pdlup.com/) (matchmaking + format sosial) dan [Tarkams](https://tarkams.com/) (liga komunitas + gamifikasi). Pembeda utama: penekanan pada **ranking individual jangka panjang**, bukan hanya skor per-event.

---

## ✨ Fitur

- **Matchmaking otomatis** — engine TypeScript murni mengatur pasangan & lawan tiap ronde (Americano, Mexicano, Team).
- **Leaderboard event** — akumulasi poin individual tiap sesi (poin → selisih game → menang).
- **Rating ELO global** — rating persisten per pemain lintas semua event (margin-aware, K-factor dinamis).
- **Pemain akun & tamu** — main dengan teman tanpa harus semua punya akun.
- **Persistensi Supabase** — Postgres + Auth + RLS (lihat [`supabase/schema.sql`](supabase/schema.sql)).

---

## 🧱 Struktur Monorepo

```
pedal-padel/
├── packages/
│   └── engine/        # TS murni: matchmaking + ELO (no UI, no DB), unit-tested
├── apps/
│   └── web/           # Vite + React + Tailwind v4 (SPA)
├── supabase/
│   └── schema.sql     # skema DB (Postgres + RLS)
└── docs/              # dokumentasi (lihat di bawah)
```

Engine inti dipakai ulang di web maupun mobile (fase lanjut). Backend penuh ditangani Supabase — tidak ada kode server yang di-hosting sendiri.

---

## 🚀 Quickstart

```bash
# 1. Install dependency (npm workspaces)
npm install

# 2. Jalankan web app (http://localhost:5173)
npm run dev --workspace=@pedal/web

# 3. Jalankan test engine (39 test)
npm test
```

### Konfigurasi Supabase

Salin `.env.example` → `.env` di `apps/web/`, lalu isi dari Supabase (Settings → API):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

> `anon key` aman untuk frontend (dilindungi RLS). **Jangan** pakai `service_role`.

Setup database: buka Supabase → SQL Editor → tempel isi [`supabase/schema.sql`](supabase/schema.sql) → Run.

---

## 🐳 Deploy dengan Docker

```bash
# Isi .env di root (lihat .env.example), lalu:
docker compose up --build
# Web tersedia di http://localhost:8080
```

Build multi-stage: Vite build statis → disajikan via nginx. Env Supabase di-*inline* saat build (build args). Detail di [docs/deployment.md](docs/deployment.md).

---

## 📜 Scripts

| Perintah | Kegunaan |
|---|---|
| `npm test` | Unit test engine (vitest) |
| `npm run dev --workspace=@pedal/web` | Dev server web |
| `npm run build --workspace=@pedal/web` | Build produksi web |
| `npm run typecheck --workspace=@pedal/web` | Typecheck web |
| `npm run build:engine` | Compile engine (tsc) |

---

## 📚 Dokumentasi

| Dokumen | Isi |
|---|---|
| [DESIGN.md](DESIGN.md) | Dokumen desain sistem lengkap (visi, model data, algoritma, fase) |
| [docs/architecture.md](docs/architecture.md) | Arsitektur monorepo & alur data |
| [docs/engine.md](docs/engine.md) | Referensi API engine (matchmaking + ELO) |
| [docs/deployment.md](docs/deployment.md) | Deploy (Docker, Supabase, hosting statis) |

---

## 🛠️ Tech Stack

| Layer | Pilihan |
|---|---|
| Bahasa | TypeScript |
| Frontend | Vite + React 18 + Tailwind v4 |
| Backend/DB | Supabase (Postgres + Auth + Realtime) |
| Engine | Paket TS terpisah (`@pedal/engine`) |
| Deploy | Docker (nginx) / Vercel-Netlify + Supabase |

---

## 📌 Status

- [x] Engine: ELO, Americano, Mexicano, Team, standings — **39 test lolos**
- [x] Web SPA: setup pemain → generate ronde → input skor → leaderboard event + ELO global
- [x] Integrasi Supabase (skema, auth, persistensi)
- [ ] Format Mexicano & King of the Hill di UI
- [ ] Halaman profil & history pemain
- [ ] Share link publik leaderboard

Roadmap detail per fase ada di [DESIGN.md §8](DESIGN.md).
