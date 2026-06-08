-- Pedal Padel — skema database Supabase.
-- Jalankan di Supabase: SQL Editor → New query → tempel semua → Run.
-- Aman dijalankan ulang (idempotent-ish) karena pakai "if not exists".

-- ────────────────────────────────────────────────────────────────────
-- 1. Tabel
-- ────────────────────────────────────────────────────────────────────

-- Profil user terdaftar (1:1 dengan auth.users)
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text,
  created_at  timestamptz not null default now()
);

-- Registry pemain. Guest = user_id null. owner_id = yang membuat.
create table if not exists public.players (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  user_id       uuid references auth.users on delete set null,
  owner_id      uuid not null references auth.users on delete cascade,
  created_at    timestamptz not null default now()
);

create table if not exists public.leagues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.league_members (
  league_id   uuid references public.leagues on delete cascade,
  player_id   uuid references public.players on delete cascade,
  primary key (league_id, player_id)
);

create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  league_id        uuid references public.leagues on delete set null,
  owner_id         uuid not null references auth.users on delete cascade,
  name             text not null,
  format           text not null,
  courts           int  not null,
  scoring          jsonb not null,
  randomize_start  boolean not null default true,
  status           text not null default 'live',
  player_ids       uuid[] not null default '{}',   -- peserta (urut)
  teams            jsonb  not null default '[]',
  rounds           jsonb  not null default '[]',
  scores           jsonb  not null default '{}',
  created_at       timestamptz not null default now()
);

-- Snapshot nama peserta (dipakai engine sbg identitas + tampil di history).
alter table public.events
  add column if not exists player_names text[] not null default '{}';

-- Username unik (handle) + avatar untuk profil.
alter table public.profiles add column if not exists username   text;
alter table public.profiles add column if not exists avatar_url text;
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

create index if not exists events_league_idx on public.events (league_id);
create index if not exists events_owner_idx  on public.events (owner_id);
create index if not exists players_owner_idx on public.players (owner_id);

-- Sosial: liga private/public + kode join.
alter table public.leagues
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private', 'public'));
alter table public.leagues
  add column if not exists join_code text;
create unique index if not exists leagues_join_code_key
  on public.leagues (join_code) where join_code is not null;

-- Keanggotaan USER pada liga (beda dari league_members = roster pemain).
--   status: pending (menunggu approval) | member ; role: owner | admin | member
create table if not exists public.league_users (
  league_id  uuid not null references public.leagues on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  status     text not null default 'pending' check (status in ('pending','member')),
  role       text not null default 'member'  check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index if not exists league_users_user_idx on public.league_users (user_id);

-- ────────────────────────────────────────────────────────────────────
-- 2. Auto-buat profil saat user daftar
-- ────────────────────────────────────────────────────────────────────
-- Pastikan username unik: pakai input apa adanya bila bebas, kalau bentrok
-- tambahkan angka (pengaman terhadap race / backfill akun lama).
create or replace function public.ensure_unique_username(base text)
returns text
language plpgsql
as $$
declare
  clean text := lower(regexp_replace(coalesce(base, 'user'), '[^a-z0-9_]', '', 'g'));
  candidate text;
  n int := 0;
begin
  if clean = '' then clean := 'user'; end if;
  candidate := clean;
  while exists (select 1 from public.profiles where lower(username) = candidate) loop
    n := n + 1;
    candidate := clean || n::text;
  end loop;
  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  pname text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  uname text := public.ensure_unique_username(
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
begin
  insert into public.profiles (id, name, username)
  values (new.id, pname, uname)
  on conflict (id) do nothing;

  -- Tiap user otomatis jadi 1 "self-player" (tertaut akunnya) supaya bisa
  -- ditambahkan ke liga/sesi orang lain & history-nya nyambung.
  insert into public.players (display_name, user_id, owner_id)
  select pname, new.id, new.id
  where not exists (
    select 1 from public.players where user_id = new.id
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill: buat self-player untuk user yang sudah daftar sebelum perubahan ini.
insert into public.players (display_name, user_id, owner_id)
select coalesce(p.name, 'Pemain'), p.id, p.id
from public.profiles p
where not exists (
  select 1 from public.players pl where pl.user_id = p.id
);

-- Backfill username untuk akun lama yang belum punya (bisa diedit nanti).
update public.profiles
set username = lower(regexp_replace(coalesce(name, 'user'), '[^a-z0-9_]', '', 'g'))
               || substr(id::text, 1, 4)
where username is null;

-- Owner liga otomatis jadi anggota (role owner) tiap liga baru.
create or replace function public.add_league_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.league_users (league_id, user_id, status, role)
  values (new.id, new.owner_id, 'member', 'owner')
  on conflict do nothing;
  return new;
end; $$;
drop trigger if exists on_league_created on public.leagues;
create trigger on_league_created after insert on public.leagues
  for each row execute procedure public.add_league_owner();

-- Backfill: owner liga lama jadi anggota.
insert into public.league_users (league_id, user_id, status, role)
select id, owner_id, 'member', 'owner' from public.leagues
on conflict (league_id, user_id) do nothing;

-- Helper: apakah uid admin/owner sebuah liga (SECURITY DEFINER → tak rekursif RLS).
create or replace function public.is_league_admin(lid uuid, uid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.league_users
    where league_id = lid and user_id = uid
      and status = 'member' and role in ('owner','admin')
  );
$$;

-- ────────────────────────────────────────────────────────────────────
-- 3. Row Level Security
--    Baca: publik (mendukung link share read-only).
--    Tulis: hanya pemilik (owner_id = auth.uid()).
-- ────────────────────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.players        enable row level security;
alter table public.leagues        enable row level security;
alter table public.league_members enable row level security;
alter table public.league_users   enable row level security;
alter table public.events         enable row level security;

-- profiles
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- players
drop policy if exists players_read on public.players;
create policy players_read on public.players for select using (true);
drop policy if exists players_write on public.players;
create policy players_write on public.players for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- leagues
drop policy if exists leagues_read on public.leagues;
create policy leagues_read on public.leagues for select using (true);
drop policy if exists leagues_write on public.leagues;
create policy leagues_write on public.leagues for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- league_members (ikut izin owner liga)
drop policy if exists members_read on public.league_members;
create policy members_read on public.league_members for select using (true);
drop policy if exists members_write on public.league_members;
create policy members_write on public.league_members for all
  using (exists (select 1 from public.leagues l
                 where l.id = league_id and l.owner_id = auth.uid()))
  with check (exists (select 1 from public.leagues l
                      where l.id = league_id and l.owner_id = auth.uid()));

-- league_users (keanggotaan user; insert sensitif lewat RPC SECURITY DEFINER)
drop policy if exists lu_read on public.league_users;
create policy lu_read on public.league_users for select using (true);
drop policy if exists lu_delete on public.league_users;
create policy lu_delete on public.league_users for delete
  using (user_id = auth.uid() or public.is_league_admin(league_id, auth.uid()));
drop policy if exists lu_admin_update on public.league_users;
create policy lu_admin_update on public.league_users for update
  using (public.is_league_admin(league_id, auth.uid()))
  with check (public.is_league_admin(league_id, auth.uid()));

-- events
drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (true);
drop policy if exists events_write on public.events;
create policy events_write on public.events for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ────────────────────────────────────────────────────────────────────
-- 4. RPC sosial (dipanggil client lewat supabase.rpc). Inserts keanggotaan
--    lewat sini supaya user tak bisa menambah diri jadi member/owner.
-- ────────────────────────────────────────────────────────────────────

-- Request gabung liga PUBLIC → status pending (perlu approval).
create or replace function public.request_join(lid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select visibility into v from public.leagues where id = lid;
  if v is null then raise exception 'Liga tidak ditemukan'; end if;
  if v <> 'public' then
    raise exception 'Liga privat — butuh kode atau undangan';
  end if;
  insert into public.league_users (league_id, user_id, status, role)
  values (lid, auth.uid(), 'pending', 'member')
  on conflict (league_id, user_id) do nothing;
end; $$;

-- Gabung liga PRIVATE via kode → langsung member.
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

-- Undang user (oleh admin/owner) → langsung member.
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

grant execute on function public.request_join(uuid)         to authenticated;
grant execute on function public.join_with_code(text)       to authenticated;
grant execute on function public.invite_user(uuid, uuid)    to authenticated;
grant execute on function public.is_league_admin(uuid,uuid) to authenticated;
