# SICOPA — Dokumen Analisis Sistem

> Dokumen analisis sistem (System Analysis Document) untuk aplikasi **SICOPA** —
> platform *social matchmaking* padel. Ditulis dari sudut pandang sistem analis:
> menjelaskan **apa** yang dilakukan sistem (kebutuhan, aktor, aturan bisnis,
> proses, model data konseptual) — **bukan bagaimana** mengimplementasikannya.
>
> Untuk desain teknis & tech stack lihat [DESIGN.md](../DESIGN.md); untuk model
> data fisik (SQL) lihat [supabase/schema-v2.sql](../supabase/schema-v2.sql);
> untuk detail engine ranking lihat [docs/engine.md](engine.md).

| | |
|---|---|
| **Versi** | 0.1 (draf konsep) |
| **Status** | Pembahasan konsep — acuan sebelum implementasi schema v2 |
| **Cakupan** | Matchmaking, komunitas, sistem peringkat 3-tingkat, sosial, **multi-sport racket** (padel dulu; tenis/badminton dst disiapkan). **Tidak** termasuk reservasi lapangan. |

---

## 1. Pendahuluan

### 1.1 Latar Belakang
Padel selalu dimainkan **2 lawan 2**, sehingga "siapa yang terbaik" sulit diukur
hanya dari skor tim. SICOPA menjawabnya dengan: (a) mengatur pasangan/lawan tiap
ronde secara otomatis (matchmaking), (b) menghitung peringkat individual yang
adil lintas pertandingan (ELO). Di atas itu, SICOPA dirancang sebagai **aplikasi
sosial** — wadah beberapa komunitas (kantor, kampus, grup teman) yang masing-masing
punya ranking sendiri, sekaligus ranking global lintas seluruh aplikasi sebagai
ajang "siapa terbaik" dan sarana menemukan teman/lawan baru.

### 1.2 Tujuan Dokumen
Menjadi **sumber kebenaran konsep** yang disepakati sebelum menulis kode: definisi
istilah, aktor, kebutuhan fungsional & non-fungsional, aturan bisnis, alur proses,
dan model data konseptual.

### 1.3 Ruang Lingkup
- **Termasuk:** identitas pemain (akun & tamu), komunitas (privat/publik), event/
  turnamen + matchmaking, input skor, **tiga tingkat leaderboard**, profil &
  discovery sosial, moderasi (superadmin), kerangka monetisasi (belum aktif),
  **multi-sport racket** (padel dulu, dimensi sport disiapkan untuk tenis/badminton/dst;
  bentuk tunggal 1v1 & ganda 2v2).
- **Tidak termasuk (out of scope):** reservasi/booking lapangan, pembayaran antar
  pemain, jadwal venue. (Lihat §15.)

---

## 2. Visi & Positioning

**SICOPA = social matchmaking app untuk padel.**

- **Bukan** sistem booking lapangan (berbeda dari aplikasi venue-management).
- **Bukan** B2B multi-tenant club; tidak ada isolasi data antar-organisasi
  berbayar. Komunitas adalah grup sosial, bukan tenant terisolasi.
- **Adalah** tempat satu orang bergabung ke beberapa komunitas, bermain, dan
  punya peringkat di tiga tingkat (turnamen, komunitas, global).
- **Multi-sport (racket):** padel lebih dulu; tenis/badminton/squash menyusul.
  Rating & leaderboard **selalu per sport** (tak pernah dicampur). Komunitas
  bersifat lintas-sport.

Pembeda utama: **leaderboard individual persisten 3-tingkat** + **dimensi sosial**
(temukan pemain lewat ranking global, gabung komunitas via undangan/kode).

---

## 3. Glosarium

> "Liga" pada kode lama adalah **istilah sementara**. Istilah baku yang dipakai
> dokumen ini adalah **Komunitas**.

| Istilah | Definisi |
|---|---|
| **Pemain** (Player) | Entitas yang bisa bertanding. Bisa **akun** (punya login) atau **tamu** (dibuat orang lain, tanpa login). Identitas berbasis **ID stabil**, bukan nama. |
| **Akun** (User) | Pemain dengan kredensial login (email/Google). Punya profil & username. |
| **Tamu** (Guest) | Pemain tanpa login, dibuat oleh seorang akun untuk mengisi peserta. Bisa di-*merge* ke akun nanti. |
| **Komunitas** (Community) | Grup sosial (kantor, kampus, dll). Wadah event & punya leaderboard sendiri. Bisa **privat** atau **publik**. |
| **Event / Turnamen** | Satu sesi main (Americano, Mexicano, dll). Bisa berdiri sendiri atau di dalam komunitas. |
| **Ronde** (Round) | Satu putaran di sebuah event; berisi beberapa match (1 per lapangan) + pemain istirahat. |
| **Match** | Satu pertandingan 2v2 di satu lapangan pada satu ronde; punya skor A & B. |
| **Sport** (Cabang) | Cabang racket yang dipertandingkan (padel, tenis, badminton, …). Rating & leaderboard selalu **per sport**. |
| **Format** | Aturan main = ukuran tim (**tunggal 1v1 / ganda 2v2**) + gaya matchmaking (Americano, Mexicano, …). Bergantung sport. |
| **Matchmaking** | Pengaturan otomatis pasangan & lawan tiap ronde sesuai format. |
| **ELO** | Rating skill individual yang naik/turun tiap match; menumpuk lintas event. |
| **Poin Event** | Total skor yang dikumpulkan pemain dalam satu turnamen (menentukan juara turnamen). |
| **Leaderboard** | Papan peringkat. Ada **tiga tingkat**: turnamen, komunitas, global (§8). |
| **Superadmin** | Moderator platform; akses penuh untuk pengelolaan/penghapusan. |

---

## 4. Aktor & Peran

| Aktor | Deskripsi | Hak utama |
|---|---|---|
| **Pengunjung (Guest-viewer)** | Belum login. | Lihat beranda, jelajah, leaderboard, profil pemain (read-only). |
| **Akun (Pemain terdaftar)** | Sudah login. | Buat komunitas/event, ikut bertanding, kelola tamu miliknya, edit profil. |
| **Anggota Komunitas (member)** | Akun yang tergabung di komunitas. | Lihat & ikut event komunitas. |
| **Admin Komunitas** | Dipromosikan owner/admin. | Kelola event komunitas, roster, undang anggota, atur pengaturan komunitas. |
| **Owner Komunitas** | Pembuat komunitas. | Semua hak admin + hapus komunitas + kelola peran admin. |
| **Superadmin** | Moderator platform. | Akses penuh lintas komunitas/event/pemain; hapus & merge. |

> Catatan: peran **komunitas** (owner/admin/member) berbeda dari **kepemilikan
> tamu** (owner_id pada pemain tamu). Satu akun bisa member di komunitas A dan
> admin di komunitas B.

---

## 5. Kebutuhan Fungsional (Functional Requirements)

> Kode `FR-<area>-<no>`. Status: ✅ ada · 🟡 sebagian · ⬜ rencana.

### 5.1 Identitas & Akun
| ID | Kebutuhan | Status |
|---|---|---|
| FR-ID-1 | Pengunjung dapat menjelajah app tanpa login (mode tamu-viewer). | ✅ |
| FR-ID-2 | User dapat daftar/masuk via email & Google SSO. | ✅ |
| FR-ID-3 | Tiap akun otomatis punya satu "self-player" (identitas bertanding). | ✅ |
| FR-ID-4 | Akun dapat membuat **pemain tamu** untuk mengisi peserta. | ✅ |
| FR-ID-5 | Identitas pemain berbasis **ID stabil**; dua pemain bernama sama tetap terpisah. | 🟡 |
| FR-ID-6 | Superadmin dapat **merge tamu → akun** (history pindah, baris tamu dihapus) dengan pratinjau & konfirmasi. | ✅ |
| FR-ID-7 | User dapat edit profil: nama, username unik, foto. | ✅ |

#### Rincian perilaku & aturan — Identitas

**Anatomi `players`:** `id` (stabil), `display_name`, `user_id` (null = tamu),
`owner_id` (pembuat). **`isGuest = (user_id == null)`**.

**Akun vs Tamu — dua identitas berbeda walau senama (BR-1):**

| | Akun | Tamu |
|---|---|---|
| Login | ya | tidak |
| `user_id` | terisi | null |
| Dibuat | otomatis saat daftar | oleh sebuah akun (penyelenggara) |
| Bisa dimiliki | dirinya sendiri | `owner_id` = pembuatnya |

**Self-player (FR-ID-3):** saat **daftar**, trigger `handle_new_user` membuat **satu**
player tertaut akun; saat **login**, `ensureSelfPlayer` memastikannya ada (idempoten).
Inilah identitas user saat bertanding & muncul di ranking. Edit nama profil
**menyinkronkan** `display_name` self-player.

**Membuat tamu (FR-ID-4) — aturan dedup penting:**
- `createPlayer(nama)` **men-dedup per-owner, case-insensitive**: bila owner sudah punya
  pemain bernama sama → **memakai yang ada** (id stabil), tidak bikin baru.
- Konsekuensi: dalam satu owner, "Budi" selalu **satu** id. ⚠️ **Edge case:** bila owner
  punya **dua orang berbeda** bernama "Budi", keduanya kolaps jadi satu tamu —
  pembedaan butuh nama unik (mis. "Budi K."). Antar-owner, "Budi" = id berbeda (benar).

**Merge tamu → akun (FR-ID-6):** menyatukan riwayat tamu ke sebuah akun. **Superadmin-only** (RLS).
1. **Pratinjau** dulu: tampilkan turnamen & match yang terdampak (jumlah event).
2. **Guard anti-bentrok:** bila tamu & akun **pernah main di turnamen yang sama** →
   merge **dibatalkan** (cegah satu orang ada di dua tim).
3. **Konfirmasi** ("apakah Anda yakin") → riwayat tamu menjadi milik akun, lalu **baris
   tamu dihapus**.
4. Bila nama tamu **sudah sama** dengan akun → cukup hapus baris tamu (riwayat sudah nyatu).
- ⚠️ **Catatan teknis:** implementasi merge sekarang masih **berbasis nama** (menulis
  ulang `player_names/player_ids/teams/rounds`). Saat migrasi by-ID (FR-ID-5) tuntas,
  merge cukup mengganti **id** — lebih sederhana & aman.

**Mode tamu-viewer (FR-ID-1):** pengunjung belum login bisa **membaca** beranda,
jelajah, ranking, profil (RLS baca publik). Aksi tulis → prompt **Masuk/Daftar**.

### 5.2 Komunitas
| ID | Kebutuhan | Status |
|---|---|---|
| FR-CM-1 | User dapat membuat komunitas (privat/publik). | ✅ |
| FR-CM-2 | Komunitas **publik**: user lain bisa minta gabung (perlu approval). | ✅ |
| FR-CM-3 | Komunitas **privat**: gabung hanya via **kode** atau **undangan** admin. | ✅ |
| FR-CM-4 | Owner/Admin dapat mengelola anggota, peran (promosi/demosi admin), & roster pemain. | ✅ |
| FR-CM-5 | Komunitas punya detail: deskripsi, catatan, foto. | ✅ |
| FR-CM-6 | "Privat" hanya membatasi **bergabung**, **bukan** menyembunyikan hasil dari ranking global. | ✅ |
| FR-CM-7 | Toggle **"butuh persetujuan admin"** per komunitas — berlaku untuk join via minta-gabung **maupun** kode. | ⬜ |
| FR-CM-8 | Komunitas & klasemennya dapat **dibagikan** (link share + kartu PNG). | 🟡 |

#### Rincian perilaku & aturan — Komunitas

**Dua jenis keanggotaan (jangan tertukar):**
- **Anggota-akun** (`league_users`): siapa yang punya **akses & peran** (owner/admin/
  member). Inilah yang dimaksud "gabung komunitas".
- **Roster-pemain** (`league_members`/`league_players`): daftar **pemain** (termasuk
  tamu) yang bisa dimasukkan ke event komunitas. Tamu tak punya akun → ada di roster,
  tak ada di anggota-akun.

**Mode visibilitas & cara bergabung:**

| Mode | Kode join | Cara orang luar masuk | Status setelah masuk |
|---|---|---|---|
| **Publik** | tidak ada | **Minta gabung** (`requestJoin`) → menunggu persetujuan | `pending` → `member` setelah admin **approve** |
| **Privat** | **ada** (auto-generate saat dibuat) | **Masukkan kode** (`joinWithCode`) **atau** **diundang** admin | langsung `member` |

**Approval join (FR-CM-7 — target, mengubah perilaku sekarang):**
- Komunitas punya toggle **"butuh persetujuan admin"**. Bila **ON**, baik **minta
  gabung** (publik) **maupun masuk via kode** (privat) menghasilkan status `pending`
  → admin **approve** dulu. Bila **OFF**, langsung `member`.
- **Undangan admin selalu langsung `member`** (admin sudah menyetujui dgn mengundang)
  — tak terpengaruh toggle.
- **Status sekarang:** publik **selalu** approval; privat-via-kode & undangan
  **langsung** member (belum ada toggle). Target = jadikan approval **konfigurabel**
  & berlaku ke kode juga. **schema-v2 sudah menyiapkan** kolom `require_approval` +
  RPC join yang menghormatinya (tinggal app).
- **Approver** = owner atau admin ("admin atau lainnya" = pemegang peran admin).

- Ganti **Publik → Privat**: sistem **meng-generate kode** baru bila belum ada.
  **Privat → Publik**: kode **dihapus** (publik tak pakai kode).
- Kode di-normalisasi **uppercase + trim** saat dipakai.

**Alur "diundang" (FR-CM-3) — detail yang kamu minta:**
1. Admin/owner mencari **user terdaftar** (harus sudah punya akun) lalu `inviteUser`.
2. User yang diundang **langsung menjadi `member`** — **tanpa langkah "terima
   undangan"**, tanpa status pending.
3. ⚠️ **Gap saat ini:** **tak ada notifikasi** ke yang diundang — ia baru sadar saat
   komunitas muncul di daftarnya. (Backlog: notifikasi undangan — lihat FR-SO-5.)
4. Tak bisa mengundang orang yang **belum punya akun** (butuh `user_id`). Untuk
   non-akun, pakai jalur **tamu** (roster) atau bagikan **kode**.

**Tentang "privat = kode" vs "murni undangan saja":**
- Saat ini **Privat selalu punya kode**. Untuk efek "undangan saja", admin cukup
  **tidak membagikan kode**. **Belum ada** mode terpisah "matikan kode, undangan
  saja". (Backlog bila diinginkan: toggle `join_code` aktif/non-aktif.)

**Peran & pengelolaan (FR-CM-4):**
- Peran: **owner** (pembuat) > **admin** > **member**.
- **Owner & admin** boleh: kelola event komunitas, roster, undang, **promosi/demosi
  admin**. **Hapus komunitas: owner saja.**
- Promosi/demosi memunculkan **dialog konfirmasi**. **Approve/tolak** permintaan
  `pending`, **keluarkan** anggota, atau **keluar sendiri** (`leaveLeague`).

**BR terkait:** privat **tidak** menyembunyikan hasil — event komunitas privat tetap
masuk ranking global (BR-2). Komunitas **lintas-sport** (BR-12).

### 5.3 Event / Turnamen & Matchmaking
| ID | Kebutuhan | Status |
|---|---|---|
| FR-EV-1 | User dapat membuat event dengan format Americano/Mexicano (team variant). | ✅ |
| FR-EV-2 | Sistem menghasilkan pasangan & lawan tiap ronde otomatis sesuai format. | ✅ |
| FR-EV-3 | User dapat input skor tiap match. | ✅ |
| FR-EV-4 | Event terjadwal dapat **menambah ronde** lanjutan tanpa membuat sesi baru. | ✅ |
| FR-EV-5 | Event punya visibilitas: inherit (ikut komunitas) / privat / publik. | ✅ |
| FR-EV-6 | Event bisa berdiri sendiri (tanpa komunitas) atau di dalam komunitas. | ✅ |
| FR-EV-7 | Event punya detail: deskripsi, catatan, foto. | ✅ |
| FR-EV-8 | Orang luar dapat **bergabung ke event** (minta-gabung / kode / undangan), mirip komunitas. | ⬜ |
| FR-EV-9 | Toggle **"butuh persetujuan"** per event — berlaku untuk minta-gabung **maupun** kode. | ⬜ |

#### Rincian perilaku & aturan — Event / Turnamen

**Model join event (FR-EV-8/9 — target; saat ini belum ada).**
- **Sekarang:** event **tak punya self-join/kode/undangan**. **Peserta ditentukan
  penyelenggara** (owner/admin) saat membuat event — memilih akun & **tamu**.
- **Target:** event bisa di-join orang luar **dengan model sama seperti komunitas** —
  visibilitas (privat→kode / publik→minta-gabung / undangan) + **toggle "butuh
  persetujuan"** per event. Approval & join jadi **konsep seragam** antara komunitas
  dan event (lihat §5.2). Tetap: penyelenggara/admin bisa menambah **tamu** langsung.

**Kepemilikan & izin tulis:**
- Event punya `owner_id` (pembuat). Boleh **edit/hapus**: pembuat, **atau admin/owner
  komunitas** bila event di dalam komunitas, **atau superadmin** (BR-9).
- Event **dalam komunitas**: hanya admin/owner komunitas yang boleh **membuat**.
  Event **lepas** (tanpa komunitas): siapa pun boleh buat untuk dirinya.

**Visibilitas event (`inherit` / `private` / `public`) — apa artinya:**

| Nilai | Arti konseptual |
|---|---|
| **inherit** | Ikut visibilitas komunitas induk (publik bila komunitasnya publik). Bila **lepas** (tanpa komunitas) → dianggap privat. |
| **private** | Tertutup secara konsep. |
| **public** | Terbuka. |

> Catatan jujur: saat ini **baca event publik** (RLS `events_read = true`) demi link
> share + ranking global — jadi visibilitas event **belum benar-benar menyembunyikan**
> dari pembaca; ia lebih sebagai penanda konsep & dasar aturan join masa depan.
> Konsisten dgn BR-2: privat membatasi *akses kelola/gabung komunitas*, bukan hasil.

**Peserta & identitas:**
- Peserta = campuran **akun** (self-player) & **tamu** (dibuat penyelenggara).
- Identitas peserta berbasis **ID** (BR-1) — dua peserta bernama sama tetap terpisah.
- Bentuk: **tunggal 1v1** atau **ganda 2v2** sesuai sport/format (BR-13).

**Siklus hidup event:**
1. **Buat** (`/main/baru`): pilih sport, format, lapangan, peserta, skor, jadwal,
   visibilitas → status `live`, ronde 1 ter-generate (lihat §9).
2. **Berlangsung** (`/main/:id`): input skor, **Ronde berikutnya** / **Tambah ronde**
   (lanjut tanpa sesi baru, FR-EV-4) / **Acak ulang**; klasemen real-time.
3. **Akhiri** → status `finished` (idealnya cap `finished_at`); hasil mengunci
   klasemen turnamen & menyumbang ELO komunitas + global (§8, BR-8).

**Backlog terkait event:**
- **Join event + approval toggle** (FR-EV-8/9) — model seragam dgn komunitas.
  **schema-v2 sudah memodelkan** (`require_approval`, `join_code`, tabel `event_users`,
  RPC `request_join_event`/`join_event_with_code`/`invite_to_event`). Tinggal app.
- Visibilitas event yang **benar-benar menyembunyikan** baca (perlu ubah RLS dari
  `using(true)` ke berbasis `event_is_public`).
- Tambah/keluarkan peserta **setelah** event berjalan (saat ini roster ditetapkan di awal).

### 5.4 Multi-Sport & Format
| ID | Kebutuhan | Status |
|---|---|---|
| FR-SP-1 | Tiap event terikat satu **sport** (padel dulu; tenis/badminton/squash disiapkan). | ⬜ |
| FR-SP-2 | Mendukung bentuk **tunggal (1v1)** & **ganda (2v2)** lewat `team_size` pada format. | 🟡 (2v2 ada, 1v1 belum) |
| FR-SP-3 | Komunitas **lintas-sport**: satu komunitas bisa main beberapa sport; leaderboard dipisah per sport. | ⬜ |
| FR-SP-4 | **ELO & semua leaderboard di-scope per sport** — rating padel ≠ tenis. | ⬜ |

#### Rincian perilaku & aturan — Multi-Sport & Format

- **Sport** = cabang racket (padel aktif; tenis/badminton/squash disiapkan, `active=false`).
  Saat buat event, user **pilih sport** dulu (default padel).
- **Format** menentukan **gaya matchmaking** (Americano/Mexicano/team) **dan**
  `team_size` (1=tunggal, 2=ganda). Daftar format **bergantung sport** (mis. tenis
  punya "tunggal"; padel umumnya ganda) — divalidasi di app, bukan CHECK kaku DB.
- **Scope rating (BR-11):** semua leaderboard (turnamen/komunitas/global) **dipisah per
  sport**. Pemain bisa #1 padel tapi belum berating di tenis.
- **Komunitas lintas-sport (BR-12):** satu komunitas bisa menggelar padel & tenis;
  klasemen/rating-nya **terpisah per sport**.
- **Engine:** ELO sudah generik (rata-rata N pemain/sisi). Matchmaking 1v1 perlu sedikit
  generalisasi saat tenis diaktifkan (engine 2v2 → N) — lihat catatan §9 / DEF.
- **Status:** kode produksi masih **padel-only** (format 2v2). Dimensi sport baru di
  schema-v2 (belum dipakai aplikasi).

### 5.5 Sistem Peringkat (3 Leaderboard)
| ID | Kebutuhan | Status |
|---|---|---|
| FR-LB-1 | **Leaderboard turnamen**: peringkat peserta dalam satu event (by poin / standings). | ✅ |
| FR-LB-2a | **Leaderboard komunitas — Klasemen**: akumulasi poin/menang-kalah lintas event komunitas. | ✅ |
| FR-LB-2b | **Leaderboard komunitas — Rating**: ELO terisolasi (hanya match di event komunitas itu). | ⬜ |
| FR-LB-3 | **Leaderboard global**: ELO lintas seluruh event di app. | 🟡 |
| FR-LB-4 | ELO margin-aware (selisih skor memengaruhi pergeseran) & K-factor dinamis. | ✅ |
| FR-LB-5 | Rating menampilkan indikator keandalan (reliability) untuk pemain <20 match. | ✅ |

#### Rincian perilaku & aturan — Sistem Peringkat

Detail metrik, rumus ELO, dan perbedaan Klasemen vs ELO ada di **§8** (Sistem
Peringkat) dan **§9** (algoritma). Ringkas aturan:
- **Turnamen** = poin (standings, dgn kompensasi `+M` bagi yang main lebih sedikit).
- **Komunitas** = dua tab: **Klasemen** (poin akumulatif) + **Rating** (ELO scoped).
- **Global** = ELO lintas semua event.
- **Reliability:** rating pemain <20 match ditandai "belum stabil" (K-factor besar).
- **Cache:** ELO komunitas & global di-cache (`player_ratings`), dihitung ulang app
  saat match berubah; turnamen dihitung live.

### 5.6 Sosial & Discovery
| ID | Kebutuhan | Status |
|---|---|---|
| FR-SO-1 | Jelajah daftar pemain global + buka profil pemain. | ✅ |
| FR-SO-2 | Profil pemain menampilkan rating, statistik, riwayat match & turnamen. | ✅ |
| FR-SO-3 | Jelajah komunitas & turnamen (terbaru / publik). | ✅ |
| FR-SO-4 | (Rencana) Pertemanan/follow antar pemain. | ⬜ |
| FR-SO-5 | (Rencana) Notifikasi (undangan, hasil, approval). | ⬜ |
| FR-SO-6 | **Bagikan klasemen** (turnamen & liga) sebagai **kartu PNG** + Web Share/unduh. | ✅ |
| FR-SO-7 | **Bagikan link** halaman (komunitas/event/profil) — URL stabil per halaman. | 🟡 |

#### Rincian perilaku & aturan — Berbagi (Share)

**Dua jenis berbagi:**
1. **Kartu klasemen (PNG)** — di-render di client (`html-to-image`), format **1080×1920
   (9:16)** untuk story/feed. Sumber: **hasil turnamen selesai** atau **klasemen liga**.
   **Isi kartu:** judul (nama event/liga) + **logo SICOPA**; peringkat dgn **medali
   🥇🥈🥉** top-3 (ada varian **podium**); per pemain **inisial avatar, nama, Menang–
   Kalah–Seri, selisih game, poin +M, poin total**; **4–5 tema**; bagikan via **Web
   Share API** atau **unduh**. Semua di client, tanpa server.
2. **Link halaman** — tiap halaman punya **URL stabil** (routing History API), jadi
   komunitas/event/profil bisa di-share sebagai tautan read-only (baca publik).

**Backlog share:**
- Tambah **kode join / QR komunitas** ke kartu (ajak gabung langsung dari gambar).
- Kartu untuk **jadwal matchmaking** (ronde/pasangan), bukan hanya klasemen.
- Tambah **format & tanggal** ke kartu.
- Snapshot kartu masih pakai **nama** (perlu ikut migrasi by-ID, BR-1).

### 5.7 Moderasi & Platform
| ID | Kebutuhan | Status |
|---|---|---|
| FR-AD-1 | Superadmin punya panel khusus untuk moderasi. | ✅ |
| FR-AD-2 | Superadmin dapat hapus pemain & kelola lintas komunitas/event. | ✅ |
| FR-AD-3 | Semua tabel mencatat audit (created/updated by/at). | ✅ |
| FR-AD-4 | (Rencana) Soft-delete agar penghapusan tak merusak ranking pemain lain. | ⬜ |

#### Rincian perilaku & aturan — Moderasi

- **Superadmin** = peran platform, **diisi manual** lewat SQL (tak ada write-policy →
  user tak bisa angkat diri). Status hanya terlihat oleh dirinya sendiri.
- **Akses penuh** lewat policy permissive (di-OR dgn policy biasa): kelola/hapus liga,
  event, pemain, keanggotaan lintas semua entitas.
- **Panel `/admin`** (FR-AD-1): tab **Liga / Turnamen / Pemain**; hapus entitas;
  **merge tamu → akun** dgn pratinjau (lihat §5.1 FR-ID-6).
- **Audit (FR-AD-3):** semua tabel mencatat `created_at/by` (saat INSERT, immutable) &
  `updated_at/by` (tiap UPDATE) via trigger `stamp_audit`.
- ⚠️ **Risiko (FR-AD-4):** penghapusan saat ini **hard-delete** (cascade). Untuk produk
  komersil → **soft-delete** (`deleted_at`) agar hapus akun/pemain tak menghapus match
  & merusak ELO lawan (BR-10). Belum diimplementasi.

### 5.8 Monetisasi (Kerangka, belum aktif)
| ID | Kebutuhan | Status |
|---|---|---|
| FR-MO-1 | Struktur paket (plans) & langganan (subscriptions) disiapkan; default semua `free`. | ⬜ |
| FR-MO-2 | (Belum diputuskan) Model bayar: B2C freemium vs lain. Gating menyusul. | ⬜ |

#### Rincian perilaku & aturan — Monetisasi

- **Belum aktif.** Tabel `plans` (katalog + `limits` jsonb) & `subscriptions` (per user,
  default `free`) **disiapkan** agar penambahan langganan tak merombak schema.
- **Gating menyusul** lewat `plans.limits` (mis. `{"max_communities": 1}` untuk free).
- **Penulisan subscription** lewat webhook provider (RPC `SECURITY DEFINER`) / superadmin
  — **bukan** dari klien (cegah upgrade palsu).
- **Arah kandidat:** B2C freemium (pemain upgrade untuk statistik lanjutan / komunitas
  tak terbatas). **Keputusan final ditunda.**

---

## 6. Aturan Bisnis (Business Rules)

| ID | Aturan |
|---|---|
| BR-1 | Identitas pemain ditentukan oleh **ID**, bukan nama. Akun & tamu adalah identitas berbeda walau namanya sama; hanya bisa disatukan lewat **merge eksplisit**. |
| BR-2 | "Privat" pada komunitas/event hanya membatasi **siapa yang boleh bergabung**, **tidak** menyembunyikan hasil — semua match tetap dihitung di ranking global. |
| BR-3 | **Leaderboard turnamen** dihitung dari **poin** (standings) peserta dalam event itu; tidak dibawa ke event lain. |
| BR-4 | **Leaderboard komunitas** punya **dua metrik**: (a) **Klasemen** — akumulasi poin/menang-kalah lintas event komunitas (sama jenis dengan turnamen, tapi se-komunitas); (b) **Rating** — ELO terisolasi komunitas. **Leaderboard global** = **ELO**. ELO komunitas vs global berbeda **hanya pada himpunan match** yang diperhitungkan. |
| BR-5 | ELO: semua pemain mulai 1000. Delta tiap match = `K × (hasil_aktual − hasil_ekspektasi)`. Hasil aktual memakai **rasio skor** (margin-aware). Ekspektasi dari selisih rating dua tim (rata-rata 2 pemain). |
| BR-6 | "Kekuatan" tim = **rata-rata rating dua pemainnya**; tidak ada input manual — rating adalah akumulasi hasil menang/kalah sebelumnya. |
| BR-7 | K-factor besar (40) untuk pemain <20 match (cepat menemukan level), lalu kecil (20) setelah stabil. |
| BR-8 | Event **dalam komunitas** menyumbang ke ELO komunitas **dan** global. Event **lepas** (tanpa komunitas) hanya menyumbang ke global. |
| BR-9 | Hanya owner event atau admin/owner komunitas (atau superadmin) yang boleh mengubah event/match. |
| BR-10 | Penghapusan pemain yang sudah bertanding **tidak boleh** menghapus match (akan merusak ELO lawan) → gunakan soft-delete/anonimisasi. |
| BR-11 | Setiap event terikat **satu sport**. Rating ELO & **semua** leaderboard di-scope **per sport** — rating antar-sport tak pernah dicampur (padel ≠ tenis). |
| BR-12 | Komunitas bersifat **lintas-sport**: leaderboard komunitas dipisah per sport (mis. klasemen/ELO padel terpisah dari tenis). |
| BR-13 | Bentuk pertandingan: **2 sisi**, ukuran tim **1 (tunggal)** atau **2 (ganda)**. ELO tim = rata-rata rating anggotanya (berlaku 1v1 & 2v2). |
| BR-14 | **Join & approval seragam** untuk **komunitas dan event**: visibilitas (privat→kode / publik→minta-gabung / undangan) + **toggle "butuh persetujuan"** per entitas. Undangan admin selalu pre-approved (langsung member/peserta). |

---

## 7. Use Case Utama

> Format ringkas: Aktor — Tujuan — Alur normal.

**UC-1 Buat & jalankan turnamen.** *Akun* → menyelenggarakan sesi main.
1. Pilih format, jumlah lapangan, peserta (akun/tamu). 2. Sistem buat ronde 1
(matchmaking). 3. Input skor tiap match. 4. Lanjut ronde berikut / tambah ronde.
5. Akhiri → leaderboard turnamen final; ELO komunitas & global ter-update.

**UC-2 Gabung komunitas publik.** *Akun* → ikut grup.
1. Jelajah/temukan komunitas publik. 2. Minta gabung → status `pending`.
3. Admin menyetujui → status `member`.

**UC-3 Gabung komunitas privat.** *Akun* → ikut grup tertutup.
1. Terima kode/undangan. 2. Masukkan kode → langsung `member`. (atau admin
mengundang langsung.)

**UC-4 Lihat peringkat.** *Siapa pun* → tahu posisi.
1. Buka leaderboard global (semua), komunitas (per grup), atau turnamen (per event).

**UC-5 Merge tamu ke akun.** *Superadmin* → satukan identitas.
1. Pilih tamu & akun tujuan. 2. Sistem tampilkan **pratinjau** (match/turnamen
terdampak). 3. Konfirmasi → history pindah ke akun, baris tamu dihapus.

**UC-6 Jelajah sosial.** *Pengunjung/Akun* → cari teman/lawan.
1. Buka daftar pemain global / profil pemain. 2. Lihat statistik & riwayat.

---

## 8. Sistem Peringkat — Tiga Leaderboard

Inti diferensiasi produk. **Tiga tingkat; komunitas punya dua metrik.**

> **Dimensi sport (lintas-bagian):** semua leaderboard di bawah juga di-scope
> **per sport**. Jadi "global" = global-per-sport (global padel, global tenis, …),
> dan komunitas lintas-sport memisah board per sport. Tabel berikut berlaku untuk
> **satu** sport.

| # | Leaderboard | Cakupan | Metrik | Disimpan? |
|---|---|---|---|---|
| 1 | **Turnamen** | satu event | **Poin** (standings) | Live dari match event |
| 2 | **Komunitas** | satu komunitas | **Poin (Klasemen)** + **ELO (Rating)** | Klasemen live · ELO cache per (pemain, komunitas) |
| 3 | **Global** | seluruh app | **ELO** (semua match) | Cache per pemain (scope global) |

### 8.1 Leaderboard Turnamen (poin)
Jumlah skor yang dikumpulkan tiap peserta dalam event → menentukan **juara sesi**.
Berlaku lokal untuk event itu saja, tidak dibawa keluar.

### 8.2 Leaderboard Komunitas (dua tab: Klasemen + Rating)
Komunitas menampilkan **dua sudut pandang**:
- **Klasemen (poin)** — akumulasi poin/menang-kalah/win-rate semua peserta lintas
  event komunitas. Rasa "musim/liga": siapa paling produktif di grup ini.
  *(Sudah ada di app saat ini.)*
- **Rating (ELO scoped)** — rating skill terisolasi komunitas. *(Rencana.)*

### 8.3 Leaderboard Global (ELO)
ELO lintas **semua** match di app.

> **Klasemen vs ELO** berbeda sifat: Klasemen menghargai **produktivitas/konsistensi**
> (banyak main & banyak poin → naik), ELO menghargai **skill relatif** (mengalahkan
> lawan kuat → naik, tak peduli sering/jarang main).
>
> **ELO komunitas vs global** pakai rumus **persis sama**; beda **hanya himpunan
> match** yang diputar ulang (komunitas = match event komunitas itu; global = semua).
> Karena itu seorang pemain bisa #3 global tapi #1 di komunitas kantor — di kantor ia
> hanya melawan rekan kantor. Inilah nilai sosial produk: tiap grup punya "jagoan"-nya.

### 8.4 Cara ELO Bekerja (ringkas)
- Semua mulai **1000**. "Kuat/lemah" = **angka rating saat ini** (hasil akumulasi
  menang/kalah lampau), bukan penilaian manual.
- Rating tim = rata-rata 2 pemain. Selisih **400 ≈ 10× lebih mungkin menang**.
- Menang atas tim lebih kuat → naik banyak; atas lebih lemah → naik sedikit.
  Menang telak menggeser lebih besar daripada menang tipis (margin-aware).
- Pemain baru bergerak cepat (K=40), melambat setelah ~20 match (K=20).

> Logika ELO berada di satu sumber: **engine TS** (`@pedal/engine`). Leaderboard
> komunitas & global adalah **cache** yang dihitung ulang app saat ada match baru
> (atau saat match lama diedit). Lihat [docs/engine.md](engine.md).

---

## 9. Algoritma Matchmaking & Keadilan

Mesin pengatur pasangan/lawan tiap ronde. Logika murni di `@pedal/engine`
([americano.ts](../packages/engine/src/americano.ts), `mexicano.ts`, `teams.ts`).

### 9.1 Aturan dasar (berlaku semua format)
- **Kapasitas:** 1 lapangan = **4 pemain** (individual) atau **2 tim** (format tim).
- **Maks lapangan:** `floor(N/4)` (individual) · `floor(T/2)` (tim). Minimal **4 pemain**.
- **Main per ronde:** `lapangan × 4` pemain. **Istirahat per ronde** = `N − lapangan×4`.
- **Default lapangan** bila tak diisi: sebanyak mungkin (`floor(N/4)`).

### 9.2 Empat format

| Format | Pasangan | Sifat | Algoritma | Klasemen |
|---|---|---|---|---|
| **Americano** | berganti tiap ronde | **statik** (jadwal dibuat di awal) | **round-robin pasangan penuh**: bangkitkan semua C(n,2) pasangan → jodohkan greedy jadi match (2 pasangan disjoint), main merata (gap ≤1) | individual (poin) |
| **Mexicano** | berganti | **dinamis** (ikut klasemen) | tiap lapangan: 4 pemain berperingkat dipasang **(1+4) vs (2+3)** agar seimbang; ronde berikutnya pakai urutan klasemen terbaru | individual (poin) |
| **Team Americano** | **tetap** sepanjang sesi | statik | round-robin penuh antar-**tim** (circle method): tiap tim lawan semua tim sekali | per tim |
| **Team Mexicano** | tetap | dinamis | tiap ronde tim diadu by peringkat: **1v2, 3v4, …** | per tim |

### 9.3 Ekspektasi main/istirahat (hasil uji engine)

**Americano — round-robin pasangan PENUH (pasca DEF-2, gap ≤1 semua N):**

| N (mod 4) | gap main | pasangan terpakai |
|---|---|---|
| ≡ 0/1 (4,5,8,9,12,13,16) | **0** (semua sama, main n−1×) | **penuh** = C(n,2) |
| ≡ 2/3 (6,7,10,11,14,15) | **1** (2 pemain main n−2×) | C(n,2) − 1 (tepat 1 pasangan absen) |

> Contoh 7p/1ct: **10 ronde, main 5–6, partner 20/21** — setara Americano lengkap
> aplikasi sejenis. Jumlah **lapangan tak mengubah keadilan** — hanya memampatkan ronde.

**Team Americano — selalu adil:** tiap tim main tepat **T−1** kali (gap 0, semua N).

**Mexicano / Team Mexicano:** istirahat dirotasi adil via `restCount` (pasca DEF-3) —
tak ada lagi bench permanen.

### 9.4 Cacat keadilan yang diketahui (BACKLOG)

> Ditemukan lewat uji engine + kasus produksi (trial). Prioritas perbaikan
> sebelum skala komersil.

| ID | Cacat | Bukti | Akar masalah | Usulan perbaikan | Prioritas |
|---|---|---|---|---|---|
| **DEF-1** | **Americano: main beruntun** — pemain main banyak ronde berturut tanpa istirahat. | Kasus trial 7p/1ct: satu pemain **main 4 ronde beruntun** (R4–R7); lain **istirahat 3 beruntun**. | Tahap-2 pemaketan match ke ronde **greedy first-fit** ([americano.ts L100-111](../packages/engine/src/americano.ts#L100-L111)) — tak mempertimbangkan "siapa baru main"; urutan ronde = urutan match digenerate. | **✅ DIPERBAIKI** — pemaketan **recency-aware** (skor = Σ streak-main per match; pilih match dgn pemain paling baru istirahat). 7p/1ct: beruntun **4→3**; ada tes regresi (`≤3`). Round-robin pasangan & invarian "ronde penuh" tetap. **Residu:** N dgn slot-istirahat sedikit (mis. 10p/2ct, 8 dari 10 main/ronde) masih bisa streak panjang — terbatas struktur, ditunda. | ✅ Selesai |
| **DEF-2** | **Americano: timpang total** untuk N≡2,3 (mod 4) — selisih main 1–2 match. | Matriks §9.3 (N=6,7,10,11). | Algoritma lama **membuang** pasangan sisa tiap ronde (tak menjadwalkannya ulang) → round-robin pasangan tak tuntas; total main timpang & variasi partner kurang. | **✅ DIPERBAIKI** — penjadwal diganti ke **round-robin pasangan PENUH**: bangkitkan semua C(n,2) pasangan lalu jodohkan greedy jadi match (2 pasangan disjoint). Gap **≤2 → ≤1** semua N (N≡0/1: gap 0; N≡2/3: tepat 1 pasangan absen → gap 1). **7p/1ct kini 10 ronde, main 5–6, partner 20/21** — setara Americano lengkap aplikasi sejenis. Esensi "semua berpasangan" terjaga; tes mengunci. | ✅ Selesai |
| **DEF-3** | **Mexicano/Team Mexicano: bench permanen** — pemain yang sekali kena bye di ronde awal bisa istirahat selamanya. | Simulasi 12 ronde N=5–9: ada pemain main **0×**, lain main **12×**. | Istirahat = peringkat terbawah; pemain istirahat tak dapat poin → tetap di dasar → istirahat lagi. `rankPlayers` menaruh yang belum main di rank `∞`. | **✅ DIPERBAIKI** — rotasi bye adil: `restCount` (id/tim → jumlah istirahat) diteruskan dari session ke engine; tiap ronde istirahatkan yang **paling sedikit** istirahat (bukan peringkat bawah), independen skor. Simulasi N=5–9 × 12 ronde: rest-gap **0..12 → ≤1**. Tes regresi mengunci. | ✅ Selesai |

---

## 10. Peta Halaman & Alur (Page Inventory)

SPA mobile-first; routing **History API** (URL berubah per halaman, mendukung
back/forward + link share). Sebagian besar halaman **bisa dilihat tamu** (belum
login); aksi tulis memicu prompt login.

> Format tiap entri: **path** — Isi (konten) · Fungsi & alur.

**`/` — Beranda (Home / Dashboard).** *Isi:* sapaan + "match berikutnya", kartu
statistik ELO/rank-ku, kartu ber-tab **Terbaru** (liga/turnamen global terbaru)
& **Saya** (punyaku), ringkasan **Ranking Global** top-5. *Alur:* titik masuk;
tombol **Kelola** → `/liga-saya` & `/turnamen-saya`; FAB **Main** (mobile) →
`/main/baru`; "Lihat semua" ranking → `/ranking`.

**`/jelajah` — Jelajah (Explore).** *Isi:* tab **Liga / Turnamen / Pemain** +
pencarian; tombol tambah muncul per-tab; input **kode gabung** liga. *Fungsi:*
discovery; tiap item → halaman detailnya. *Alur:* Liga → `/liga/:id`; Turnamen →
`/main/:id`; Pemain → `/pemain/:id`.

**`/liga/:id` — Detail Liga/Komunitas.** *Isi:* nama, deskripsi, catatan, foto;
daftar anggota + peran; **Klasemen Liga** (akumulasi poin); daftar event liga;
kontrol admin (undang, kelola peran, pengaturan). *Alur:* gabung (kode/approval)
atau keluar; admin buat event → `/main/baru?liga=:id`; event → `/main/:id`.

**`/liga/baru` — Buat Liga.** *Isi:* form nama, visibilitas (privat/publik),
deskripsi, catatan, foto. *Alur:* simpan → owner otomatis jadi anggota → ke
`/liga/:id`.

**`/main/baru` — Buat Sesi/Turnamen.** *Isi:* pilih **format** (Americano/
Mexicano/team), jumlah lapangan, **peserta** (tambah akun/tamu), konfigurasi
skor, visibilitas, jadwal. *Alur:* buat → langsung ke `/main/:id` (ronde 1
ter-generate). Bila dari liga, `?liga=:id` mengikat event ke komunitas.

**`/main/:id` — Sesi Berlangsung (Tournament Live).** *Isi:* tab ronde; kartu
match per lapangan dgn **input skor**; daftar **istirahat**; tombol **Ronde
berikutnya** / **Tambah ronde** / **Acak ulang**; **Klasemen** event (poin);
tombol **Akhiri**. *Fungsi:* jantung matchmaking + skoring. *Alur:* hanya
owner/admin yang boleh edit (RLS); skor → klasemen real-time + (nanti) update ELO;
akhiri → status `finished`.

**`/turnamen-saya` — Turnamen Saya.** *Isi:* turnamen yang kuikuti — **berlangsung**
& **selesai**, dengan **peringkatku** di tiap turnamen. *Alur:* item → `/main/:id`;
hapus (bila pemilik).

**`/liga-saya` — Liga Saya.** *Isi:* komunitas yang kukelola/ikuti. *Alur:* item →
`/liga/:id`.

**`/pertandingan-saya` — Semua Pertandingan Saya.** *Isi:* riwayat lengkap match-ku
(partner, lawan, skor, hasil). *Alur:* dari ringkasan di `/profil` ("Lihat semua").

**`/ranking` — Ranking Global (Leaderboard).** *Isi:* **podium top-3**, tabel
peringkat ELO, daftar **belum-main/unranked**, pencarian. *Alur:* pemain →
`/pemain/:id`; menandai "saya".

**`/pemain/:id` — Profil Pemain.** *Isi:* rating ELO, statistik, **riwayat match**
& **riwayat turnamen + peringkat**. *Fungsi:* identitas publik by-**ID** (dua nama
sama tetap terpisah). *Alur:* dibuka dari ranking/jelajah/klasemen.

**`/temukan` — Temukan (Discover).** *Isi:* discovery pemain/komunitas (sosial).
*Alur:* → profil pemain / detail liga.

**`/profil` — Profil Saya.** *Isi:* edit nama/username/foto; statistik-ku;
**Pertandingan** (limit 5 + lihat semua) & **Turnamen Terakhir** (limit 5 + rank);
tautan **/admin** bila superadmin. *Alur:* "Lihat semua" → `/pertandingan-saya`;
edit → simpan profil.

**`/admin` — Panel Superadmin.** *Isi:* moderasi terpusat — tab **Liga / Turnamen
/ Pemain**; hapus entitas; **merge tamu → akun** (pratinjau + konfirmasi). *Fungsi:*
hanya superadmin (RLS). *Alur:* hapus pemain; merge dgn pratinjau match terdampak.

---

## 11. Model Data Konseptual (ERD Naratif)

> Entitas konseptual & relasi. Bentuk fisik (kolom/SQL) di
> [schema-v2.sql](../supabase/schema-v2.sql).

```
                 ┌────────────┐
                 │   AKUN     │ (auth user)
                 └─────┬──────┘
            1:1 │      │ memiliki         membuat
        ┌───────▼──┐   │ ┌────────────┐  ┌──────────────┐
        │ PROFIL   │   └▶│  PEMAIN    │  │  KOMUNITAS   │
        │(username,│ 1:1 │(akun/tamu, │  │(privat/publik│
        │ avatar)  │ self│ ID stabil) │  │ kode join)   │
        └──────────┘     └─────┬──────┘  └──────┬───────┘
                               │                 │
            ┌──────────────────┼─────────────────┤
            │ peserta          │ roster          │ keanggotaan akun
            ▼                  ▼                  ▼
     ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
     │   EVENT     │◀──│ EVENT_       │   │ KOMUNITAS_   │
     │ (turnamen,  │   │ PESERTA      │   │ ANGGOTA      │
     │  format,    │   │(player+nama  │   │(role: owner/ │
     │  komunitas?)│   │ snapshot)    │   │ admin/member,│
     └──────┬──────┘   └──────────────┘   │ status)      │
            │ 1:N                          └──────────────┘
            ▼
     ┌─────────────┐   ┌──────────────┐
     │   MATCH      │◀─│ MATCH_PEMAIN │ (tim A/B, slot) → FK PEMAIN
     │(ronde,court, │  └──────────────┘
     │ skor A/B)    │
     └──────────────┘

     ┌────────────────────┐     ┌──────────┐   ┌───────────────┐
     │ RATING_PEMAIN       │     │ PLANS    │   │ SUBSCRIPTIONS │
     │ (player, komunitas? │     └──────────┘   │ (user, plan)  │
     │  null=global; ELO)  │                    └───────────────┘
     └────────────────────┘     ┌──────────────┐
                                 │ SUPERADMINS  │
                                 └──────────────┘
```

**Relasi kunci:**
- AKUN 1:1 PROFIL; AKUN 1:1 PEMAIN-self (tamu = pemain tanpa akun).
- KOMUNITAS 1:N EVENT (event bisa tanpa komunitas).
- EVENT N:M PEMAIN lewat **EVENT_PESERTA** (ganti parallel array `player_ids[]`/
  `player_names[]` — id & nama snapshot satu baris, tak bisa desync).
- EVENT 1:N MATCH; MATCH N:M PEMAIN lewat **MATCH_PEMAIN** (FK ke PEMAIN → integritas).
- **SPORT** (padel/tenis/…): tiap EVENT terikat **satu sport**; komunitas **lintas-sport**.
- **Keanggotaan-akun seragam**: KOMUNITAS_ANGGOTA (`league_users`) & **EVENT_ANGGOTA**
  (`event_users`) — keduanya status `pending`/`member` + toggle `require_approval`
  (BR-14). Berbeda dari **peserta-pemain** (EVENT_PESERTA, termasuk tamu).
- RATING_PEMAIN di-scope **per (pemain, sport, komunitas|global)** — satu baris
  global per sport + satu baris per (komunitas, sport).

**Prinsip data (vs versi lama):** match adalah **baris relasional** (bukan blob
jsonb), identitas **murni via FK** (bukan nama dalam jsonb) → masalah tabrakan
nama hilang **secara desain**.

---

## 12. Kebutuhan Non-Fungsional (NFR)

| ID | Kebutuhan |
|---|---|
| NFR-1 | **Mobile-first**: seluruh UI baru harus nyaman di layar ponsel lebih dulu. |
| NFR-2 | **Skalabilitas baca**: riwayat & leaderboard tak boleh menarik+memproses seluruh data tiap render (gunakan query terindeks + cache rating). |
| NFR-3 | **Integritas data**: relasi pemain↔match dijaga FK; tak ada parallel array. |
| NFR-4 | **Privasi**: data publik (nama, ranking) memang terbuka untuk leaderboard/share; data sensitif tidak. Sediakan jalur hapus akun (right-to-be-forgotten). |
| NFR-5 | **Auditability**: semua perubahan tercatat (created/updated by/at). |
| NFR-6 | **Reusabilitas engine**: logika matchmaking & ELO murni TS, dipakai web & (nanti) mobile. |
| NFR-7 | **Ketersediaan**: backend dikelola Supabase (Auth/DB/RLS); tak ada server kustom. |

---

## 13. Visibilitas & Privasi

| Objek | Baca | Tulis |
|---|---|---|
| Profil, pemain, leaderboard | Publik (mendukung discovery & link share) | Pemilik / superadmin |
| Komunitas/event privat | Hasil **tetap publik** (BR-2); yang dibatasi hanya **bergabung** | Owner/admin komunitas, owner event, superadmin |
| Langganan (subscriptions) | Hanya milik sendiri / superadmin | Lewat provider/superadmin (bukan klien) |
| Status superadmin | Hanya diri sendiri | Manual (SQL) |

---

## 14. Monetisasi (Masa Depan)

Model bayar **belum diputuskan**. Kerangka disiapkan agar penambahan langganan tak
merombak schema: tabel `plans` (katalog + `limits` jsonb) & `subscriptions` (per
user, default `free`). Gating fitur menyusul lewat `plans.limits`. Kandidat arah:
B2C freemium (pemain upgrade untuk statistik lanjutan / komunitas tak terbatas).

---

## 15. Di Luar Lingkup (Out of Scope)

- **Reservasi/booking lapangan** & manajemen venue (jam buka, slot, ketersediaan).
- **Pembayaran antar pemain** / pembagian biaya sewa.
- **Multi-tenant B2B** (isolasi data antar-club berbayar) — komunitas cukup sebagai grup sosial.

---

## 16. Status Implementasi (Ringkas)

| Sudah jalan (produksi) | Rencana / dalam transisi |
|---|---|
| Auth (email + Google), mode tamu-viewer | Migrasi ke schema v2 (match relasional) |
| Komunitas privat/publik, join/kode/undangan, peran | Rating **ELO komunitas** (FR-LB-2b) |
| Event Americano/Mexicano + matchmaking + skor | Identitas penuh by-ID (FR-ID-5) |
| Leaderboard turnamen, **klasemen komunitas (poin)**, global (ELO) | Soft-delete (FR-AD-4) |
| Profil, riwayat, jelajah, panel superadmin, merge tamu | Pertemanan/notifikasi, monetisasi |
| Audit kolom semua tabel | Foto ke Storage (kini base64) |
| Format padel 2v2 (Americano/Mexicano) | **Multi-sport**: dimensi sport + tunggal 1v1 (FR-SP-*) |

---

## 17. Referensi Silang

- [DESIGN.md](../DESIGN.md) — desain sistem & tech stack.
- [supabase/schema-v2.sql](../supabase/schema-v2.sql) — model data fisik (target).
- [docs/engine.md](engine.md) — detail engine matchmaking & ELO.
- [docs/architecture.md](architecture.md) — arsitektur aplikasi.
