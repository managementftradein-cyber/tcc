-- TCC Community v12: member privacy & safety controls.
-- Run after community_profile_v11.sql.
create table if not exists public.community_privacy(
  user_id uuid primary key references auth.users(id) on delete cascade,
  discoverable boolean not null default true,
  allow_connections boolean not null default true,
  allow_messages boolean not null default true,
  show_online boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.community_privacy enable row level security;

insert into public.community_privacy(user_id)
select ma.user_id from public.member_access ma
where ma.status='active'
on conflict (user_id) do nothing;

drop policy if exists "community privacy own read" on public.community_privacy;
create policy "community privacy own read" on public.community_privacy
for select to authenticated using (user_id=auth.uid() and public.is_community_member(auth.uid()));

drop policy if exists "community privacy own insert" on public.community_privacy;
create policy "community privacy own insert" on public.community_privacy
for insert to authenticated with check (user_id=auth.uid() and public.is_community_member(auth.uid()));

drop policy if exists "community privacy own update" on public.community_privacy;
create policy "community privacy own update" on public.community_privacy
for update to authenticated using (user_id=auth.uid() and public.is_community_member(auth.uid()))
with check (user_id=auth.uid() and public.is_community_member(auth.uid()));

create index if not exists community_privacy_discoverable_idx on public.community_privacy(discoverable,allow_connections,allow_messages);
