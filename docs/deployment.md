# Deployment

Pedal Padel = SPA statis (web) + Supabase (data). Web bisa di-deploy lewat Docker atau host statis mana pun.

## 1. Supabase (database + auth)

1. Buat project gratis di https://supabase.com (Region **Singapore** agar dekat).
2. **SQL Editor → New query** → tempel isi [`supabase/schema.sql`](../supabase/schema.sql) → **Run**. Aman dijalankan ulang (pakai `if not exists`).
3. Aktifkan **Auth → Email** (atau Magic Link).
4. Ambil **Project URL** + **anon public key** dari **Settings → API**.

> `anon key` aman ditaruh di frontend — akses dilindungi **RLS**. Jangan pernah pakai `service_role` di klien.

## 1b. Google SSO (opsional)

Kode tombol **"Lanjut dengan Google"** sudah ada di [`apps/web/src/auth.tsx`](../apps/web/src/auth.tsx) (`signInWithGoogle` → `supabase.auth.signInWithOAuth({ provider: "google" })`). Tombol baru berfungsi setelah provider diaktifkan di Google Cloud + Supabase. **Tanpa perubahan schema/build** — murni runtime OAuth.

**A. Google Cloud Console** — buat OAuth Client:
1. [console.cloud.google.com](https://console.cloud.google.com) → buat/pilih project.
2. **APIs & Services → OAuth consent screen** → tipe **External** → isi nama app, email support → scope `email`, `profile`.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application**.
4. **Authorized redirect URIs** → callback Supabase (dari `VITE_SUPABASE_URL`):
   ```
   https://<PROJECT_REF>.supabase.co/auth/v1/callback
   ```
5. **Authorized JavaScript origins** → origin app: `http://localhost:5173`, `http://IP-SERVER:8080`, domain produksi.
6. Salin **Client ID** + **Client Secret**.

**B. Supabase Dashboard**:
1. **Authentication → Providers → Google** → **Enable** → tempel Client ID + Secret → Save.
2. **Authentication → URL Configuration** → set **Site URL** (URL produksi) + tambahkan semua origin app ke **Redirect URLs** (localhost, server, produksi) agar redirect balik tidak ditolak.

**Cara kerja:** klik tombol → redirect ke Google → balik ke `window.location.origin` → `onAuthStateChange` menangkap sesi. Trigger `handle_new_user` otomatis bikin profil + self-player untuk user Google baru (pakai `name` dari metadata Google).

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

## 3b. Produksi: Docker Hub + server Linux

Image produksi: **`akhaza/pedalpadel-client:latest`**.

**Build & push (multi-arch amd64+arm64).** Vite mem-*bake* env saat build, jadi
build-arg **wajib** diisi nilai asli dari `.env` — **jangan** pakai placeholder
`...` (pernah keliru → image dengan `VITE_SUPABASE_URL="..."` yang gagal connect
Supabase). Build dari Mac (arm64) ke server amd64 → harus multi-arch:

```bash
set -a && . ./.env && set +a
docker buildx build --builder pedalbuilder --platform linux/amd64,linux/arm64 \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  -t akhaza/pedalpadel-client:latest --push .
```

**Jalankan di server** (env sudah di-bake, tak perlu `.env` di server):

```bash
docker pull akhaza/pedalpadel-client:latest
docker rm -f pedalpadel
docker run -d --name pedalpadel -p 8080:80 --restart unless-stopped \
  akhaza/pedalpadel-client:latest
# → http://SERVER:8080  (8080 = host, 80 = nginx di dalam container)
```

Verifikasi versi terpull: `docker image inspect akhaza/pedalpadel-client:latest --format '{{index .RepoDigests 0}}'`.

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
