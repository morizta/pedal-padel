-- Pedal Padel — Migrasi SOSIAL: liga private/public + keanggotaan user + approval.
-- Jalankan di Supabase: SQL Editor → New query → tempel semua → Run.
-- Aman diulang (idempotent: if not exists / drop policy if exists / or replace).

-- ────────────────────────────────────────────────────────────────────
-- 1. Liga: visibilitas (private/public) + kode join (untuk private)
-- ────────────────────────────────────────────────────────────────────
alter table public.leagues
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private', 'public'));
alter table public.leagues
  add column if not exists join_code text;
create unique index if not exists leagues_join_code_key
  on public.leagues (join_code) where join_code is not null;

-- ────────────────────────────────────────────────────────────────────
-- 2. Keanggotaan USER pada liga (beda dari league_members = roster pemain).
--    status: pending (menunggu approval) | member
--    role  : owner | admin | member
-- ────────────────────────────────────────────────────────────────────
create table if not exists public.league_users (
  league_id  uuid not null references public.leagues on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  status     text not null default 'pending' check (status in ('pending','member')),
  role       text not null default 'member'  check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index if not exists league_users_user_idx on public.league_users (user_id);

-- Owner otomatis jadi anggota (role owner) tiap liga baru.
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

-- ────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ────────────────────────────────────────────────────────────────────
alter table public.league_users enable row level security;

-- Helper: apakah uid admin/owner sebuah liga (SECURITY DEFINER → tak rekursif RLS).
create or replace function public.is_league_admin(lid uuid, uid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.league_users
    where league_id = lid and user_id = uid
      and status = 'member' and role in ('owner','admin')
  );
$$;

-- Baca keanggotaan: publik (untuk discover & daftar anggota).
drop policy if exists lu_read on public.league_users;
create policy lu_read on public.league_users for select using (true);

-- Hapus: diri sendiri (batal/keluar) atau admin liga.
drop policy if exists lu_delete on public.league_users;
create policy lu_delete on public.league_users for delete
  using (user_id = auth.uid() or public.is_league_admin(league_id, auth.uid()));

-- Update status/role: hanya admin/owner liga (untuk approve & atur role).
drop policy if exists lu_admin_update on public.league_users;
create policy lu_admin_update on public.league_users for update
  using (public.is_league_admin(league_id, auth.uid()))
  with check (public.is_league_admin(league_id, auth.uid()));

-- Catatan: TIDAK ada policy INSERT terbuka. Semua penambahan anggota lewat
-- fungsi SECURITY DEFINER di bawah (mencegah user menambah diri jadi member/owner).

-- ────────────────────────────────────────────────────────────────────
-- 4. RPC (dipanggil client lewat supabase.rpc)
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

grant execute on function public.request_join(uuid)        to authenticated;
grant execute on function public.join_with_code(text)      to authenticated;
grant execute on function public.invite_user(uuid, uuid)   to authenticated;
grant execute on function public.is_league_admin(uuid,uuid) to authenticated;
