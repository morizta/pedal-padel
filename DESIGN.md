# Pedal Padel — Dokumen Desain Sistem

Aplikasi **matchmaking padel** dengan **leaderboard individual per pemain**.
Terinspirasi [PDLUP](https://app.pdlup.com/) (matchmaking + format sosial) dan
[Tarkams](https://tarkams.com/) (liga komunitas "tarkam" + gamifikasi).

Status: **Tahap Desain** — belum ada kode. Dokumen ini acuan sebelum implementasi.

---

## 1. Visi Produk

Platform di mana komunitas padel bisa:

- Membuat **event/sesi** main bareng (Americano, Mexicano, King of the Hill).
- Sistem otomatis mengatur **siapa pasangan & lawan tiap ronde** (matchmaking).
- Input skor → **leaderboard event** (juara hari itu) dihitung otomatis.
- Setiap pemain punya **rating global (ELO)** yang persisten lintas event →
  **leaderboard individual** jangka panjang.

Pembeda dari PDLUP: penekanan pada **leaderboard individual persisten** (ranking
pemain antar komunitas/kota), bukan cuma skor per-event.

---

## 2. Tantangan Inti: Skor Individual di Olahraga Ganda

Padel **selalu 2 vs 2**. Untuk leaderboard individual butuh dua mekanisme:

| Mekanisme | Cakupan | Tujuan |
|---|---|---|
| **Poin Event** | 1 sesi | Akumulasi poin game per orang → juara event |
| **Rating ELO Global** | Lintas event | Ranking persisten antar semua pemain |

Format **Americano/Mexicano** sengaja merotasi pasangan tiap ronde, sehingga skor
individual terbentuk alami. ELO global menambah lapisan ranking jangka panjang.

---

## 3. Rekomendasi Tech Stack

**Prinsip:** seringan mungkin — fokus tenaga hanya ke **UI** dan **engine TS murni**.
Tidak ada server backend yang dibangun/di-hosting sendiri (Supabase yang menangani).
Engine inti (matchmaking + ELO) dipakai ulang di web maupun mobile nanti.

| Layer | Pilihan | Alasan |
|---|---|---|
| **Bahasa** | TypeScript | Satu bahasa untuk engine, web, & (nanti) mobile |
| **Frontend** | Vite + React + Tailwind | SPA ringan, dev cepat, sedikit konsep, pola sama seperti PDLUP |
| **Backend/DB** | Supabase (Postgres + Auth + Realtime) | Backend lengkap tanpa menulis kode server; API auto-generate |
| **Engine** | Paket TS terpisah (`/packages/engine`) | Matchmaking & ELO murni, unit-testable, reusable |
| **Mobile (fase lanjut)** | Expo (React Native) | Seperti PDLUP; pakai Supabase & engine yang sama (mulus dari SPA) |
| **Hosting** | Vercel/Netlify (web statis) + Supabase (data) | Deploy mudah, free tier cukup |

**Kenapa Vite + Supabase (bukan Next.js)?** Prioritas Anda: **seringan mungkin**.
Vite = SPA ringan tanpa kerumitan server/client component. Supabase = backend penuh
(DB + Auth + Realtime) **tanpa menulis kode backend**. Hasilnya cukup kelola 2 hal:
UI dan engine. Trade-off: leaderboard publik kurang SEO-friendly — tidak masalah
untuk MVP, bisa diatasi belakangan.

**Struktur monorepo:**

```
pedal-padel/
├── packages/
│   └── engine/          # TS murni: matchmaking + ELO (no UI, no DB)
│       ├── americano.ts
│       ├── mexicano.ts
│       ├── kingofthehill.ts
│       ├── elo.ts
│       └── *.test.ts
├── apps/
│   └── web/             # Next.js
└── supabase/            # migrasi skema DB
```

---

## 4. Model Data (Skema)

```
Player
  id, name, avatar_url, home_club, city
  rating          (ELO, default 1000)
  reliability     (0–100%, naik seiring jumlah match)
  matches_played
  created_at

Event                    # satu sesi main bareng
  id, name, format ('americano'|'mexicano'|'koth'|'team_americano'...)
  date, location, courts (jumlah lapangan)
  points_per_game        (mis. 24 / 32 — poin yang diperebutkan per game)
  status ('draft'|'live'|'finished')
  created_by (admin)

EventPlayer              # pemain yang ikut sebuah event (many-to-many)
  event_id, player_id, checked_in

Round
  id, event_id, index

Match
  id, event_id, round_id, court
  team_a_player1, team_a_player2   # untuk Americano individual, 'tim' = pasangan ronde itu
  team_b_player1, team_b_player2
  score_a, score_b
  status ('pending'|'live'|'done')

PlayerScore              # akumulasi poin individual dalam 1 event
  event_id, player_id, points, wins, games_diff

RatingHistory            # jejak perubahan ELO (untuk grafik & leaderboard global)
  player_id, match_id, rating_before, rating_after, delta, created_at
```

Catatan: untuk format **individual** (Americano/Mexicano), kolom "team" di `Match`
hanya menyimpan dua pemain yang kebetulan jadi pasangan di ronde itu — bukan tim tetap.

---

## 5. Algoritma Matchmaking

### 5.1 Americano (individual)
Tujuan: dalam satu sesi, tiap pemain **berpasangan & melawan** sebanyak mungkin
orang lain secara merata. Pasangan **acak/terjadwal**, tidak berdasarkan skor.

- Untuk N pemain & C lapangan, hasilkan jadwal ronde di mana tiap ronde
  4 pemain mengisi 1 lapangan (pasangan ditukar tiap ronde).
- Pakai **jadwal round-robin** baku (mis. tabel untuk 4/8/12/16 pemain) agar
  distribusi pasangan-lawan seimbang.
- Tiap game diperebutkan poin tetap (mis. 24). Poin yang diraih masuk ke
  `PlayerScore.points` masing-masing individu.

### 5.2 Mexicano (individual, dinamis)
Tujuan: makin kompetitif — pasangan ditentukan **berdasarkan klasemen sementara**.

- Ronde 1: acak atau by seed.
- Ronde berikutnya: urutkan pemain by `points`. Pola umum per lapangan:
  **peringkat 1 + 4 vs 2 + 3** (menyeimbangkan kekuatan tiap lapangan).
- Hitung ulang tiap ronde → leaderboard event terus bergerak.

### 5.3 King of the Hill
- Lapangan disusun berjenjang ("hill"). Pemenang **naik** lapangan, yang kalah
  **turun**. Setelah sejumlah ronde, posisi lapangan = ranking.

### 5.4 Versi Team (Team Americano/Mexicano)
- Sama, tapi **tim tetap** (pasangan tidak ditukar). Skor masuk ke tim,
  bukan individu — untuk ini leaderboard event berbasis tim.

---

## 6. Algoritma Rating ELO (Individual, untuk Ganda)

Setiap pemain punya `rating`. Setelah tiap match:

```
# Rating tim = rata-rata 2 pemain
R_A = (rating_a1 + rating_a2) / 2
R_B = (rating_b1 + rating_b2) / 2

# Ekspektasi menang tim A
E_A = 1 / (1 + 10^((R_B - R_A) / 400))
E_B = 1 - E_A

# Hasil aktual (S): bisa 1/0 (menang/kalah) ATAU rasio skor untuk margin
S_A = score_a / (score_a + score_b)
S_B = 1 - S_A

# K-factor dinamis berdasarkan reliability (swing besar di awal)
K = reliability < 85% ? 40 : 20

# Update tiap pemain di tim
delta_A = K * (S_A - E_A)
rating_a1 += delta_A ; rating_a2 += delta_A
rating_b1 += delta_B ; rating_b2 += delta_B   # delta_B = K * (S_B - E_B)
```

- **Reliability**: naik tiap match (mis. +5%/match sampai 100%). Di bawah ±85%
  (≈15–25 match) rating dianggap belum stabil → swing besar (K tinggi).
- Tiap perubahan dicatat di `RatingHistory` untuk grafik progres & audit.
- **Pertimbangan**: bisa upgrade ke **Glicko-2** (pakai rating deviation) bila
  butuh akurasi lebih untuk pemain yang jarang main. ELO cukup untuk MVP.

---

## 7. Leaderboard

- **Leaderboard Event** — `SELECT ... FROM PlayerScore WHERE event_id=? ORDER BY points DESC, games_diff DESC`.
  Tie-breaker: poin → selisih game → head-to-head.
- **Leaderboard Global** — `SELECT ... FROM Player ORDER BY rating DESC`,
  filter opsional by kota/klub. Tampilkan rating + reliability + jumlah match.
- **Real-time** — pakai Supabase Realtime agar leaderboard & scoreboard update
  langsung saat skor diinput (live scoreboard ala PDLUP).

---

## 8. Daftar Fitur (per Fase)

### Fase 1 — MVP (engine + web)
- [ ] Auth & profil pemain (nama, foto, kota/klub)
- [ ] Buat event Americano (pilih pemain & jumlah lapangan)
- [ ] Generate jadwal ronde otomatis
- [ ] Input skor per match
- [ ] Leaderboard event otomatis
- [ ] Rating ELO global + leaderboard global
- [ ] Halaman publik leaderboard (bisa dishare)

### Fase 2 — Format & sosial
- [ ] Mexicano & King of the Hill
- [ ] Versi Team
- [ ] Live scoreboard real-time + share match link
- [ ] Multi-admin per event
- [ ] Grafik progres rating per pemain

### Fase 3 — Komunitas & gamifikasi (ala Tarkams)
- [ ] Klub/komunitas & leaderboard per klub
- [ ] Badge/achievement
- [ ] (Opsional) sistem koin & reward
- [ ] Mobile app (Expo) memakai engine & backend yang sama

---

## 9. Keputusan Final (terkunci)

1. **Margin di ELO** — ✅ pakai **rasio skor** (margin-aware). Menang telak
   menggeser rating lebih besar daripada menang tipis.
2. **ELO vs Glicko-2** — ✅ mulai **ELO** (sederhana). Glicko-2 dipertimbangkan
   nanti bila perlu akurasi lebih untuk pemain jarang main.
3. **Rating awal** — ✅ **1000** untuk semua pemain baru.
4. **Koin/reward ala Tarkams** — ❌ **tidak** untuk MVP. Fokus kompetitif
   (ELO + leaderboard). Bisa ditambah di Fase 3.

## 10. Engine (sudah dibangun)

Paket `@pedal/engine` (`packages/engine`) — TypeScript murni, tanpa UI/DB,
teruji 22 unit test (`npm test`). API publik:

| Fungsi | Kegunaan |
|---|---|
| `generateAmericano(players, {courts, rounds})` | Jadwal Americano (4 pemain = jadwal sempurna 3 ronde) |
| `nextMexicanoRound(rankedPlayers, idx, {courts})` | Satu ronde Mexicano dinamis dari klasemen terbaru |
| `computeStandings(results)` | Leaderboard event (poin → selisih game → menang) |
| `rateMatch(result, players)` | Perubahan ELO 4 pemain dari satu match |
| `expectedScore` / `actualScore` / `kFactor` / `reliability` | Primitif ELO |

Konstanta: `DEFAULT_RATING=1000`, `PROVISIONAL_MATCHES=20`,
`K_PROVISIONAL=40`, `K_STABLE=20`.

**Contoh alur Americano satu sesi:**
```ts
import { generateAmericano, computeStandings, rateMatch } from "@pedal/engine";

const ids = ["a", "b", "c", "d"];
const rounds = generateAmericano(ids);          // 3 ronde
// ...mainkan, kumpulkan MatchResult[] dari skor yang diinput...
const standings = computeStandings(results);    // leaderboard event
// untuk leaderboard global, panggil rateMatch per match → simpan ke RatingHistory
```

**Americano = round-robin pasangan (circle method):** tiap pemain berpasangan
dengan tiap pemain lain tepat sekali; pasangan diadu sebagai match lalu dipak ke
lapangan (ronde terakhir bisa < jumlah lapangan). Sempurna untuk N kelipatan 4;
untuk N ≡ 2 (mod 4) ada satu pasangan beristirahat tiap ronde (keterbatasan
kombinatorik wajar).

**Team Americano = round-robin tim:** tiap tim (pasangan tetap) melawan semua
tim lain tepat sekali (n−1 match/tim), dipak ke lapangan dengan ronde terakhir
bisa memakai lebih sedikit lapangan.

## 11. Status & Langkah Berikutnya

- [x] Monorepo (npm workspaces) + git
- [x] Engine: ELO, Americano, Mexicano, standings + 22 test lolos
- [x] `apps/web` — Vite + React + TS + Tailwind v4 (build & dev OK)
- [x] UI demo Americano: setup pemain → generate ronde → input skor →
      klasemen event + leaderboard ELO global (in-memory, real-time saat ketik)
- [ ] Integrasi Supabase (skema DB §4 + Auth + Realtime) — persistensi
- [ ] Auth pemain & event multi-user, simpan RatingHistory
- [ ] Format Mexicano & King of the Hill di UI

Jalankan: `npm install` lalu `npm run dev --workspace=@pedal/web`
(buka http://localhost:5173). Test engine: `npm test`.

---

## 12. Spesifikasi Parity PDLUP (dari screenshot referensi)

Target fitur lengkap yang ingin ditiru, diambil dari UI PDLUP asli.

### 12.1 Form "Create Tournament"
- **Tournament Name**
- **Match Type** (dropdown, dikelompokkan — lihat 12.2)
- **Tournament Date** (tanggal + jam)
- **Number of Courts** (stepper +/−)
- **Scoring Type**: `Point Scoring` | `Normal Scoring`
  - Point Scoring → **Points per Match**: 16 / 21 / 24 / 32 / *Undefined Amount*
  - Normal Scoring → **Match length**: *First to N* (3–7) | *Total of N* (3–7) | *Undefined*
- **Add Players** — input "nama atau @username" + tambah; pemain terdaftar (akun)
  atau pemain tamu (nama saja)
- **Advanced Settings** (lihat 12.3)
- Tombol **Create**

### 12.2 Match Type (daftar format lengkap)
| Grup | Format | Deskripsi |
|---|---|---|
| Americano | **Americano** | Main dengan & melawan semua. Skor individual. |
| | **Team Americano** | Tim tetap. Melawan semua tim. |
| | **Mix Americano** | Tim campuran (♂♀). Main dengan & melawan semua. |
| Mexicano | **Mexicano** | Matchup seimbang tiap ronde berdasarkan ranking. |
| | **Team Mexicano** | Tim tetap. Matchup seimbang tiap ronde. |
| | **Mixicano** | Tim campuran (♂♀). Matchup seimbang tiap ronde. |
| King of the Hill | **KOTH** | Menang naik court, kalah turun. Court atas poin lebih besar. |
| | **Team KOTH** | Sama, tapi tim tetap. |
| Club | **Club Team Americano** | Dua klub. Pasangan tetap. Tiap pasangan lawan semua pasangan lawan. |
| | **Club Americano** | Dua klub. Pasangan hanya sesama klub. Partneran sekali vs klub lawan. |
| | **Club Mexicano** | Dua klub. Pasangan dinamis tiap ronde berdasarkan ranking. |
| Bracket & Groups | **Knockout** | Eliminasi. Kalah gugur. |
| | **Group Stage** | Round-robin per grup. Juara grup lanjut ke knockout. |

### 12.3 Advanced Settings
- **Sort Leaderboard By** (default *Points*; opsi lain mis. Win Rate, Diff)
- **Initial Player Order**: `Randomize` | `Keep as entered`
- **Hide Public Leaderboard** — sembunyikan ranking di link publik;
  baru terungkap saat turnamen selesai

### 12.4 Halaman Live Turnamen
- **Header**: nama, ikon share (link publik), menu overflow
- **Meta bar**: format · tanggal · poin/match · jumlah pemain · jumlah ronde · jumlah court
- **Leaderboard** (panel kiri): sort dropdown, kolom:
  - `G` = Game Played (match terlewat) · `W-L-T` = Win-Loss-Tie · `WR` = Win Rate ·
    `DIFF` = selisih poin · `+M` = poin kompensasi karena main lebih sedikit · `P` = Poin
- **Match Rounds** (panel kanan): tab ronde, kartu per court (skor A | B, label court
  bisa diedit, dua tim), tombol **Finish** (kunci ronde) & **Reshuffle** (acak ulang)

### 12.5 Daftar Turnamen
- Filter **All / Active / Past**, dikelompokkan per bulan
- Kartu: ikon format, nama format, tanggal/jam, nama event, "N Players · M Courts", menu

### 12.6 Konsep penting yang baru muncul
- **`+M` (compensation points)** — di Americano/Mexicano dengan bye, pemain yang main
  lebih sedikit diberi poin kompensasi (mis. rata-rata poin per match × match terlewat)
  agar leaderboard adil. **Belum ada di engine — perlu ditambah.**
- **Pemain akun vs tamu** — `@username` (terdaftar) vs nama lepas.
- **Link publik & visibilitas leaderboard** — butuh Supabase + routing publik.

### 12.7 Status engine terhadap parity ini
| Fitur | Engine sekarang | Catatan |
|---|---|---|
| Americano (individual) | ✅ | jadwal rotasi |
| Mexicano (individual) | ✅ | `nextMexicanoRound` |
| Standings dasar (poin/diff/win) | ✅ | `computeStandings` |
| ELO global | ✅ | `rateMatch` |
| `+M` compensation | ❌ | tambah ke standings |
| W-L-T & Win Rate | ⚠️ | ada wins; tambah losses/ties + WR |
| Team / Mix / KOTH / Club / Bracket | ❌ | format lanjutan |
| Points-per-match & match-length config | ❌ | parameter event |
| Reshuffle / Finish round | ❌ | logika sesi (UI + engine) |
```

---

## 13. Rencana Supabase + Auth + History (fase produk)

Target: app "proper" multi-perangkat, **user daftar sendiri**, riwayat (history)
pertandingan per pemain tercatat. localStorage tetap dipakai sebagai cache/offline,
sumber kebenaran pindah ke Supabase.

### 13.1 Yang dibutuhkan dari pemilik project
1. Buat project gratis di https://supabase.com (Region: Singapore agar dekat).
2. Aktifkan **Auth → Email** (atau Magic Link).
3. Kirim ke developer: **Project URL** + **anon public key**
   (Settings → API). *anon key aman ditaruh di frontend.*

### 13.2 Skema database (Postgres)
```
profiles        id (=auth.users.id), name, avatar_url, created_at
players         id, display_name, user_id (nullable → akun pemilik),
                created_by, created_at      # guest = user_id null
leagues         id, name, owner_id, created_at
league_members  league_id, player_id        # "join liga"
events          id, league_id (nullable), owner_id, name, format,
                courts, scoring (jsonb), randomize_start, status, created_at
event_players   event_id, player_id, seat   # peserta sesi
matches         id, event_id, round_index, court,
                team_a (player_id[]), team_b (player_id[]),
                score_a, score_b, played_at
```
History pemain = query `matches` yang memuat `player_id` tertentu → daftar
pertandingan + statistik (menang/kalah, poin, lawan). Klasemen liga = agregasi
`matches` per `event.league_id`.

### 13.3 Auth & peran
- **User** daftar sendiri (email) → otomatis punya `profile` + bisa "klaim"
  satu `player` (jadi pemain itu = dirinya, history nyambung).
- **Guest** = player tanpa `user_id` (ditambah admin saat sesi). Bisa diklaim
  nanti oleh user yang daftar.
- **Owner** sesi/liga bisa edit; anggota & publik (link share) bisa lihat.
- **RLS** (Row Level Security) mengatur akses per baris.

### 13.4 Migrasi bertahap
1. Buat client Supabase + env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
2. Layer data `store.ts` → ganti implementasi ke Supabase (API sama, mudah swap).
3. Tambah Auth (login/daftar) + halaman **Profil** & **History**.
4. Share link liga/turnamen (read-only publik).

### 13.5 Status polish UI (selesai sebagian)
- [x] Hapus sesi & liga (konfirmasi) + auto-refresh
- [x] Tanggal & info format di kartu sesi
- [ ] Edit nama sesi/liga
- [ ] Halaman profil & history (butuh Supabase)
- [ ] Share link publik (butuh Supabase)
