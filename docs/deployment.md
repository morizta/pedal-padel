# Deployment

Pedal Padel = SPA statis (web) + Supabase (data). Web bisa di-deploy lewat Docker atau host statis mana pun.

## 1. Supabase (database + auth)

1. Buat project gratis di https://supabase.com (Region **Singapore** agar dekat).
2. **SQL Editor → New query** → tempel isi [`supabase/schema.sql`](../supabase/schema.sql) → **Run**. Aman dijalankan ulang (pakai `if not exists`).
3. Aktifkan **Auth → Email** (atau Magic Link).
4. Ambil **Project URL** + **anon public key** dari **Settings → API**.

> `anon key` aman ditaruh di frontend — akses dilindungi **RLS**. Jangan pernah pakai `service_role` di klien.

## 2. Environment

Vite meng-*inline* env saat **build**, jadi nilainya harus tersedia saat build (bukan runtime).

`.env` (root, untuk docker-compose) atau `apps/web/.env` (untuk dev):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 3. Deploy via Docker

Build multi-stage: `node:22-alpine` build Vite → statis disajikan `nginx:alpine`.

```bash
# isi .env di root lebih dulu (lihat .env.example)
docker compose up --build
# → http://localhost:8080
```

Atau manual:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
  --build-arg VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
  -t pedal-padel-web .
docker run -p 8080:80 pedal-padel-web
```

## 4. Deploy ke host statis (Vercel / Netlify / Cloudflare Pages)

```bash
npm install
npm run build --workspace=@pedal/web   # output: apps/web/dist
```

- **Build command**: `npm run build --workspace=@pedal/web`
- **Output dir**: `apps/web/dist`
- **Env**: set `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY` di dashboard host.
- SPA routing: arahkan semua path ke `index.html` (fallback). nginx sudah dikonfigurasi di [`apps/web/nginx.conf`](../apps/web/nginx.conf) untuk kasus Docker.

## Catatan

- Karena SPA, leaderboard publik kurang SEO-friendly — dapat diterima untuk MVP, bisa diatasi belakangan dengan SSR/prerender bila perlu.
- localStorage dipakai sebagai cache; sumber kebenaran ada di Supabase.
