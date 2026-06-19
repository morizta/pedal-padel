-- ════════════════════════════════════════════════════════════════════
-- Pedal Padel — SCHEMA v2 (desain bersih / greenfield)
-- ════════════════════════════════════════════════════════════════════
-- Anggap DB kosong. File ini TIDAK mengurus migrasi dari schema lama —
-- ia adalah bentuk "benar" yang kita tuju. Perubahan inti vs v1:
--   • Match jadi BARIS relasional (matches + match_players), bukan jsonb blob.
--   • Identitas pemain murni via FK ke players(id). Tak ada player_ids[]/
--     player_names[] parallel array → mustahil desync, tak perlu shim id↔nama.
--   • Foto → Supabase Storage (kolom simpan path, bukan base64 data URL).
--   • ELO di-cache di player_ratings (di-maintain app via engine, bukan
--     dihitung ulang dari nol tiap baca).
--   • CHECK constraint pada status/format/visibility; finished_at; dst.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ────────────────────────────────────────────────────────────────────
-- 1. IDENTITAS
-- ────────────────────────────────────────────────────────────────────

-- Profil AKUN (1:1 auth.users). Hanya hal akun: handle + avatar.
-- Catatan: nama yang tampil di konteks padel ada di players.display_name
-- (sumber tunggal), bukan di sini — hindari dua sumber nama yang bisa drift.
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  username    text,
  avatar_url  text,                 -- path Supabase Storage (bukan base64)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_username_lower_key on public.profiles (lower(username));

-- PEMAIN = entitas "kompetitor". Berlaku untuk akun MAUPUN tamu.
-- Nama yang dipakai di seluruh app (ranking, match, history) hidup DI SINI.
create table public.players (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  user_id       uuid unique references auth.users on delete set null, -- null = tamu; unik = 1 self-player/akun
  owner_id      uuid not null references auth.users on delete cascade, -- pengelola (pembuat tamu)
  deleted_at    timestamptz,          -- soft-delete: history match tetap (anonim), demi ELO orang lain
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users on delete set null,
  updated_by    uuid references auth.users on delete set null
);
create index players_owner_idx on public.players (owner_id);

-- ────────────────────────────────────────────────────────────────────
-- 2. LIGA + KEANGGOTAAN
-- ────────────────────────────────────────────────────────────────────

create table public.leagues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references auth.users on delete cascade,
  description text,
  notes       text,                 -- HTML dari editor
  photo_url   text,                 -- Storage path
  visibility  text not null default 'private' check (visibility in ('private','public')),
  join_code   text,
  deleted_at  timestamptz,           -- soft-delete
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users on delete set null,
  updated_by  uuid references auth.users on delete set null
);
create unique index leagues_join_code_key on public.leagues (join_code) where join_code is not null;

-- Keanggotaan AKUN pada liga (akses + peran). Insert sensitif lewat RPC.
create table public.league_users (
  league_id  uuid not null references public.leagues on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  status     text not null default 'pending' check (status in ('pending','member')),
  role       text not null default 'member'  check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index league_users_user_idx on public.league_users (user_id);

-- Roster PEMAIN liga (termasuk tamu) — kandidat peserta event.
-- Beda jelas dari league_users: ini "siapa yang main", bukan "siapa yang punya akses".
create table public.league_players (
  league_id  uuid not null references public.leagues on delete cascade,
  player_id  uuid not null references public.players on delete cascade,
  created_at timestamptz not null default now(),
  primary key (league_id, player_id)
);

-- ────────────────────────────────────────────────────────────────────
-- 2c. SPORT (cabang racket). Multi-sport; padel dulu, sisanya disiapkan
--     (active=false). Rating & leaderboard SELALU di-scope per sport.
-- ────────────────────────────────────────────────────────────────────
create table public.sports (
  id          text primary key,          -- 'padel' | 'tennis' | 'badminton' | ...
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
insert into public.sports (id, name, active) values
  ('padel','Padel',true),
  ('tennis','Tenis',false),
  ('badminton','Badminton',false),
  ('squash','Squash',false)
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────
-- 3. EVENT (turnamen/sesi) — HANYA KONFIGURASI. Hasil ada di matches.
-- ────────────────────────────────────────────────────────────────────

create table public.events (
  id              uuid primary key default gen_random_uuid(),
  league_id       uuid references public.leagues on delete set null,
  owner_id        uuid not null references auth.users on delete cascade,
  sport_id        text not null references public.sports default 'padel',
  name            text not null,
  format          text not null,    -- gaya matchmaking; valid value bergantung sport (validasi app)
  team_size       smallint not null default 2 check (team_size in (1,2)), -- 1=tunggal, 2=ganda
  courts          int  not null check (courts >= 1),
  scoring         jsonb not null,
  randomize_start boolean not null default true,
  status          text not null default 'live' check (status in ('live','finished')),
  visibility      text not null default 'inherit'
                    check (visibility in ('inherit','private','public')),
  description     text,
  notes           text,
  photo_url       text,             -- Storage path
  start_at        timestamptz,      -- jadwal mulai (null = sekarang)
  finished_at     timestamptz,      -- diisi saat status → finished
  deleted_at      timestamptz,      -- soft-delete
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users on delete set null,
  updated_by      uuid references auth.users on delete set null
);
create index events_league_idx on public.events (league_id);
create index events_owner_idx  on public.events (owner_id);

-- PESERTA event — pengganti player_ids[]/player_names[].
-- id (FK) & nama (snapshot) jadi SATU baris → tak mungkin desync.
create table public.event_participants (
  event_id   uuid not null references public.events on delete cascade,
  player_id  uuid not null references public.players on delete restrict,
  name_snap  text not null,         -- snapshot nama saat event (history stabil walau pemain rename)
  seed       int,                   -- urutan/posisi awal
  primary key (event_id, player_id)
);
create index event_participants_player_idx on public.event_participants (player_id);

-- MATCH — satu baris per (ronde, lapangan). Skor di sini.
create table public.matches (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events on delete cascade,
  round_index  int  not null,
  court        int  not null,
  score_a      int,                 -- null = belum dimainkan
  score_b      int,
  played_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (event_id, round_index, court)
);
create index matches_event_idx on public.matches (event_id);

-- Partisipasi pemain dalam match (2 per tim). Inti query "history pemain X".
create table public.match_players (
  match_id   uuid not null references public.matches on delete cascade,
  player_id  uuid not null references public.players on delete restrict,
  team       char(1) not null check (team in ('A','B')),
  slot       int     not null check (slot in (1,2)),
  primary key (match_id, player_id)
);
create index match_players_player_idx on public.match_players (player_id);
-- "Riwayat pemain X" = select ... from match_players where player_id=$1
--   join matches m → join events e. Satu index, bukan scan semua jsonb.

-- ────────────────────────────────────────────────────────────────────
-- 4. RATING ELO (cache) — DUA CAKUPAN:
--    • GLOBAL (league_id = null) → "siapa terbaik se-aplikasi"; basis
--      discovery / cari teman (SICOPA sebagai social matchmaking app).
--    • PER-KOMUNITAS (league_id terisi) → ranking terisolasi tiap grup
--      (kantor / kampus / dll). Satu pemain bisa punya banyak baris.
--    Event tanpa komunitas → hanya berkontribusi ke global. Event dalam
--    komunitas → berkontribusi ke global DAN ke ranking komunitasnya.
--    Di-maintain app via @pedal/engine (replay match urut played_at lalu
--    upsert). ELO berurutan: edit match lama → recompute. Logika ELO satu
--    sumber: engine TS, bukan SQL.
-- ────────────────────────────────────────────────────────────────────
create table public.player_ratings (
  player_id      uuid not null references public.players on delete cascade,
  sport_id       text not null references public.sports,            -- rating selalu per sport
  league_id      uuid references public.leagues on delete cascade,  -- null = global
  rating         numeric not null default 1000,
  matches_played int not null default 0,
  updated_at     timestamptz not null default now()
);
-- Scope = (pemain, sport, komunitas|global). null tak dianggap unik di Postgres
-- → sentinel via coalesce supaya 1 baris/scope.
create unique index player_ratings_scope_key on public.player_ratings
  (player_id, sport_id, coalesce(league_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index player_ratings_league_idx on public.player_ratings (league_id, sport_id);
-- (Opsional, fase lanjut) rating_history untuk grafik tren:
-- create table public.rating_history (
--   id uuid primary key default gen_random_uuid(),
--   player_id uuid references public.players on delete cascade,
--   league_id uuid references public.leagues on delete cascade,  -- null = global
--   match_id  uuid references public.matches on delete cascade,
--   rating_before numeric, rating_after numeric,
--   created_at timestamptz not null default now()
-- );

-- ────────────────────────────────────────────────────────────────────
-- 4b. MONETISASI (SCAFFOLD — belum di-gate). Model bayar belum diputuskan;
--     tabel disiapkan agar penambahan langganan tak merombak schema nanti.
--     Default semua user = 'free'. Gating menyusul lewat plans.limits (jsonb).
-- ────────────────────────────────────────────────────────────────────
create table public.plans (
  id          text primary key,             -- 'free' | 'pro' | ...
  name        text not null,
  limits      jsonb not null default '{}',  -- mis. {"max_communities": 1}
  price_cents int,
  created_at  timestamptz not null default now()
);
insert into public.plans (id, name, limits) values ('free','Free','{}')
  on conflict (id) do nothing;

create table public.subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  plan_id      text not null references public.plans on delete restrict default 'free',
  status       text not null default 'active' check (status in ('active','canceled','past_due')),
  provider     text,                          -- 'stripe' | ...
  external_id  text,                          -- id langganan di provider
  current_period_end timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id);

-- ────────────────────────────────────────────────────────────────────
-- 5. SUPERADMIN (moderasi platform). Diisi MANUAL via SQL Editor.
-- ────────────────────────────────────────────────────────────────────
create table public.superadmins (
  user_id    uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────
-- 6. HELPER (SECURITY DEFINER → tak rekursif RLS)
-- ────────────────────────────────────────────────────────────────────
create or replace function public.is_superadmin(uid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.superadmins where user_id = uid);
$$;

create or replace function public.is_league_admin(lid uuid, uid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.league_users
    where league_id = lid and user_id = uid
      and status = 'member' and role in ('owner','admin')
  );
$$;

-- Boleh edit isi sebuah event (peserta/match)? Pembuat ATAU admin liga ATAU superadmin.
create or replace function public.can_edit_event(eid uuid, uid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = eid and (
      e.owner_id = uid
      or (e.league_id is not null and public.is_league_admin(e.league_id, uid))
      or public.is_superadmin(uid)
    )
  );
$$;

create or replace function public.event_is_public(vis text, lid uuid)
returns boolean language sql security definer set search_path = public as $$
  select case
    when vis = 'public'  then true
    when vis = 'private' then false
    else coalesce((select l.visibility = 'public' from public.leagues l where l.id = lid), false)
  end;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 7. TRIGGER: profil + self-player, owner liga, audit
-- ────────────────────────────────────────────────────────────────────

create or replace function public.ensure_unique_username(base text)
returns text language plpgsql as $$
declare
  clean text := lower(regexp_replace(coalesce(base, 'user'), '[^a-z0-9_]', '', 'g'));
  candidate text; n int := 0;
begin
  if clean = '' then clean := 'user'; end if;
  candidate := clean;
  while exists (select 1 from public.profiles where lower(username) = candidate) loop
    n := n + 1; candidate := clean || n::text;
  end loop;
  return candidate;
end; $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pname text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  uname text := public.ensure_unique_username(
                  coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)));
begin
  insert into public.profiles (id, username) values (new.id, uname)
    on conflict (id) do nothing;
  -- self-player (kompetitor tertaut akun); nama kanonik ada di players.
  insert into public.players (display_name, user_id, owner_id)
  select pname, new.id, new.id
  where not exists (select 1 from public.players where user_id = new.id);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.add_league_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.league_users (league_id, user_id, status, role)
  values (new.id, new.owner_id, 'member', 'owner') on conflict do nothing;
  return new;
end; $$;
drop trigger if exists on_league_created on public.leagues;
create trigger on_league_created after insert on public.leagues
  for each row execute procedure public.add_league_owner();

-- Audit: created_* sekali (INSERT), updated_* tiap UPDATE.
create or replace function public.stamp_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
    if to_jsonb(new) ? 'created_by' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
    if to_jsonb(new) ? 'updated_by' then new.updated_by := coalesce(new.updated_by, auth.uid()); end if;
  else
    new.created_at := old.created_at;
    new.updated_at := now();
    if to_jsonb(new) ? 'created_by' then new.created_by := old.created_by; end if;
    if to_jsonb(new) ? 'updated_by' then new.updated_by := auth.uid(); end if;
  end if;
  return new;
end; $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','players','leagues','league_users',
                           'league_players','events','event_participants',
                           'matches','match_players'] loop
    execute format('drop trigger if exists stamp_audit on public.%I', t);
    execute format('create trigger stamp_audit before insert or update on public.%I
                    for each row execute procedure public.stamp_audit()', t);
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────────
-- 8. RPC sosial (insert keanggotaan lewat sini; user tak bisa angkat diri)
-- ────────────────────────────────────────────────────────────────────
create or replace function public.request_join(lid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select visibility into v from public.leagues where id = lid;
  if v is null then raise exception 'Liga tidak ditemukan'; end if;
  if v <> 'public' then raise exception 'Liga privat — butuh kode atau undangan'; end if;
  insert into public.league_users (league_id, user_id, status, role)
  values (lid, auth.uid(), 'pending', 'member') on conflict do nothing;
end; $$;

create or replace function public.join_with_code(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare lid uuid;
begin
  select id into lid from public.leagues where join_code = code;
  if lid is null then raise exception 'Kode tidak valid'; end if;
  insert into public.league_users (league_id, user_id, status, role)
  values (lid, auth.uid(), 'member', 'member')
  on conflict (league_id, user_id) do update set status = 'member';
  return lid;
end; $$;

create or replace function public.invite_user(lid uuid, uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_league_admin(lid, auth.uid()) then
    raise exception 'Hanya admin liga yang bisa mengundang';
  end if;
  insert into public.league_users (league_id, user_id, status, role)
  values (lid, uid, 'member', 'member')
  on conflict (league_id, user_id) do update set status = 'member';
end; $$;

grant execute on function public.request_join(uuid)            to authenticated;
grant execute on function public.join_with_code(text)          to authenticated;
grant execute on function public.invite_user(uuid, uuid)       to authenticated;
grant execute on function public.is_league_admin(uuid,uuid)    to authenticated;
grant execute on function public.is_superadmin(uuid)           to authenticated;
grant execute on function public.can_edit_event(uuid,uuid)     to authenticated;

-- ────────────────────────────────────────────────────────────────────
-- 9. ROW LEVEL SECURITY
--    Baca publik (link share read-only + ranking global). Tulis: pemilik/
--    admin. private hanya membatasi BERGABUNG, bukan menyembunyikan hasil.
-- ────────────────────────────────────────────────────────────────────
alter table public.profiles           enable row level security;
alter table public.players            enable row level security;
alter table public.leagues            enable row level security;
alter table public.league_users       enable row level security;
alter table public.league_players     enable row level security;
alter table public.events             enable row level security;
alter table public.event_participants enable row level security;
alter table public.matches            enable row level security;
alter table public.match_players      enable row level security;
alter table public.sports             enable row level security;
alter table public.player_ratings     enable row level security;
alter table public.plans              enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.superadmins        enable row level security;

-- profiles
create policy profiles_read on public.profiles for select using (true);
create policy profiles_self on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- players (read publik; tulis owner; superadmin penuh)
create policy players_read  on public.players for select using (true);
create policy players_write on public.players for all
  using (auth.uid() = owner_id or public.is_superadmin(auth.uid()))
  with check (auth.uid() = owner_id or public.is_superadmin(auth.uid()));

-- leagues
create policy leagues_read   on public.leagues for select using (true);
create policy leagues_insert on public.leagues for insert with check (auth.uid() = owner_id);
create policy leagues_update on public.leagues for update
  using (public.is_league_admin(id, auth.uid()) or public.is_superadmin(auth.uid()))
  with check (public.is_league_admin(id, auth.uid()) or public.is_superadmin(auth.uid()));
create policy leagues_delete on public.leagues for delete
  using (auth.uid() = owner_id or public.is_superadmin(auth.uid()));

-- league_users
create policy lu_read on public.league_users for select using (true);
create policy lu_delete on public.league_users for delete
  using (user_id = auth.uid() or public.is_league_admin(league_id, auth.uid())
         or public.is_superadmin(auth.uid()));
create policy lu_update on public.league_users for update
  using (public.is_league_admin(league_id, auth.uid()) or public.is_superadmin(auth.uid()))
  with check (public.is_league_admin(league_id, auth.uid()) or public.is_superadmin(auth.uid()));

-- league_players (roster)
create policy lp_read  on public.league_players for select using (true);
create policy lp_write on public.league_players for all
  using (public.is_league_admin(league_id, auth.uid()) or public.is_superadmin(auth.uid()))
  with check (public.is_league_admin(league_id, auth.uid()) or public.is_superadmin(auth.uid()));

-- events
create policy events_read   on public.events for select using (true);
create policy events_insert on public.events for insert
  with check (auth.uid() = owner_id
              and (league_id is null or public.is_league_admin(league_id, auth.uid())));
create policy events_update on public.events for update
  using (public.can_edit_event(id, auth.uid())) with check (public.can_edit_event(id, auth.uid()));
create policy events_delete on public.events for delete
  using (public.can_edit_event(id, auth.uid()));

-- event_participants / matches / match_players: ikut izin edit event-nya
create policy ep_read  on public.event_participants for select using (true);
create policy ep_write on public.event_participants for all
  using (public.can_edit_event(event_id, auth.uid()))
  with check (public.can_edit_event(event_id, auth.uid()));

create policy m_read  on public.matches for select using (true);
create policy m_write on public.matches for all
  using (public.can_edit_event(event_id, auth.uid()))
  with check (public.can_edit_event(event_id, auth.uid()));

create policy mp_read  on public.match_players for select using (true);
create policy mp_write on public.match_players for all
  using (exists (select 1 from public.matches mt
                 where mt.id = match_id and public.can_edit_event(mt.event_id, auth.uid())))
  with check (exists (select 1 from public.matches mt
                 where mt.id = match_id and public.can_edit_event(mt.event_id, auth.uid())));

-- player_ratings (read publik; tulis hanya server-side/superadmin — app upsert
--   pakai service context atau RPC SECURITY DEFINER; di sini batasi ke superadmin)
create policy pr_read  on public.player_ratings for select using (true);
create policy pr_write on public.player_ratings for all
  using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

-- sports (katalog cabang; baca publik, tulis superadmin)
create policy sports_read on public.sports for select using (true);
create policy sports_admin on public.sports for all
  using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

-- plans (katalog publik) / subscriptions (user lihat miliknya; tulis lewat
--   webhook provider via RPC SECURITY DEFINER atau superadmin — bukan client)
create policy plans_read on public.plans for select using (true);
create policy subs_read_self on public.subscriptions for select
  using (user_id = auth.uid() or public.is_superadmin(auth.uid()));
create policy subs_admin on public.subscriptions for all
  using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

-- superadmins (user hanya tahu status dirinya; tak ada write-policy)
create policy sa_read_self on public.superadmins for select using (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────
-- 10. STORAGE (foto bukan base64). Buckets + policy baca publik / tulis self.
-- ────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars','avatars',true), ('league-photos','league-photos',true),
       ('event-photos','event-photos',true)
on conflict (id) do nothing;

-- Baca publik untuk ketiga bucket.
create policy storage_read on storage.objects for select
  using (bucket_id in ('avatars','league-photos','event-photos'));
-- Tulis: user terautentikasi (path/owner divalidasi di app).
create policy storage_write on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars','league-photos','event-photos'));
create policy storage_update on storage.objects for update to authenticated
  using (bucket_id in ('avatars','league-photos','event-photos'));
create policy storage_delete on storage.objects for delete to authenticated
  using (bucket_id in ('avatars','league-photos','event-photos'));

-- ────────────────────────────────────────────────────────────────────
-- 11. JOIN & APPROVAL SERAGAM (komunitas + event) — FR-CM-7, FR-EV-8/9, BR-14
--     Model sama untuk leagues & events: visibilitas + kode + undangan +
--     toggle "butuh persetujuan". Undangan admin selalu pre-approved.
-- ────────────────────────────────────────────────────────────────────

-- Toggle approval per entitas.
alter table public.leagues add column if not exists require_approval boolean not null default false;
alter table public.events  add column if not exists require_approval boolean not null default false;
-- Event kini bisa di-join → punya kode sendiri (seperti liga).
alter table public.events  add column if not exists join_code text;
create unique index if not exists events_join_code_key on public.events (join_code) where join_code is not null;

-- Keanggotaan AKUN pada event (permintaan/peserta-akun) — mirror league_users.
-- Saat status → member, app menambah self-player akun ke event_participants.
create table if not exists public.event_users (
  event_id   uuid not null references public.events on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  status     text not null default 'pending' check (status in ('pending','member')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_users_user_idx on public.event_users (user_id);

alter table public.event_users enable row level security;
drop policy if exists eu_read on public.event_users;
create policy eu_read on public.event_users for select using (true);
drop policy if exists eu_delete on public.event_users;
create policy eu_delete on public.event_users for delete
  using (user_id = auth.uid() or public.can_edit_event(event_id, auth.uid()));
drop policy if exists eu_update on public.event_users;
create policy eu_update on public.event_users for update
  using (public.can_edit_event(event_id, auth.uid()))
  with check (public.can_edit_event(event_id, auth.uid()));

-- ── RPC: join komunitas (memperhatikan require_approval) ──
-- Publik minta-gabung: member langsung bila approval OFF, else pending.
create or replace function public.request_join(lid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v text; ra boolean;
begin
  select visibility, require_approval into v, ra from public.leagues where id = lid;
  if v is null then raise exception 'Liga tidak ditemukan'; end if;
  if v <> 'public' then raise exception 'Liga privat — butuh kode atau undangan'; end if;
  insert into public.league_users (league_id, user_id, status, role)
  values (lid, auth.uid(), case when ra then 'pending' else 'member' end, 'member')
  on conflict (league_id, user_id) do nothing;
end; $$;

-- Privat via kode: member langsung bila approval OFF, else pending.
create or replace function public.join_with_code(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare lid uuid; ra boolean;
begin
  select id, require_approval into lid, ra from public.leagues where join_code = code;
  if lid is null then raise exception 'Kode tidak valid'; end if;
  insert into public.league_users (league_id, user_id, status, role)
  values (lid, auth.uid(), case when ra then 'pending' else 'member' end, 'member')
  on conflict (league_id, user_id)
    do update set status = case when ra then league_users.status else 'member' end;
  return lid;
end; $$;

-- ── RPC: join event (mirror liga) ──
create or replace function public.request_join_event(eid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare vis text; lid uuid; ra boolean;
begin
  select visibility, league_id, require_approval into vis, lid, ra from public.events where id = eid;
  if vis is null then raise exception 'Event tidak ditemukan'; end if;
  if not public.event_is_public(vis, lid) then
    raise exception 'Event tertutup — butuh kode atau undangan';
  end if;
  insert into public.event_users (event_id, user_id, status)
  values (eid, auth.uid(), case when ra then 'pending' else 'member' end)
  on conflict (event_id, user_id) do nothing;
end; $$;

create or replace function public.join_event_with_code(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare eid uuid; ra boolean;
begin
  select id, require_approval into eid, ra from public.events where join_code = code;
  if eid is null then raise exception 'Kode event tidak valid'; end if;
  insert into public.event_users (event_id, user_id, status)
  values (eid, auth.uid(), case when ra then 'pending' else 'member' end)
  on conflict (event_id, user_id)
    do update set status = case when ra then event_users.status else 'member' end;
  return eid;
end; $$;

-- Undang ke event (oleh penyelenggara/admin) → langsung member (pre-approved).
create or replace function public.invite_to_event(eid uuid, uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_event(eid, auth.uid()) then
    raise exception 'Hanya penyelenggara/admin yang bisa mengundang';
  end if;
  insert into public.event_users (event_id, user_id, status)
  values (eid, uid, 'member')
  on conflict (event_id, user_id) do update set status = 'member';
end; $$;

grant execute on function public.request_join_event(uuid)      to authenticated;
grant execute on function public.join_event_with_code(text)    to authenticated;
grant execute on function public.invite_to_event(uuid, uuid)   to authenticated;
