-- TCC Community v18: Member Connections & Private Chat Gate
-- Run after community_notifications_v17.sql and all previous Community migrations.
--
-- This table now fully replaces the older public.connections table (created
-- in community_chat_migration.sql) — api/community.js and community.html no
-- longer read or write to public.connections at all. That table is left in
-- place rather than dropped here (in case you want to keep its history), but
-- it's safe to drop manually once you've confirmed you don't need the old
-- connection data: `drop table if exists public.connections;`

create table if not exists public.community_connections (
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists community_connections_addressee_idx
  on public.community_connections(addressee_id, status);
create index if not exists community_connections_requester_idx
  on public.community_connections(requester_id, status);

alter table public.community_connections enable row level security;

drop policy if exists "connections own read" on public.community_connections;
create policy "connections own read"
on public.community_connections for select to authenticated
using (requester_id=auth.uid() or addressee_id=auth.uid());

-- Direct writes are deliberately restricted to the server-side API.
-- This prevents users from bypassing connection checks with crafted client requests.

do $$ begin
  alter publication supabase_realtime add table public.community_connections;
exception when duplicate_object then null; end $$;
