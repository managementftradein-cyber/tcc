-- TCC Community + private chat, controlled access only.
create extension if not exists pgcrypto;

-- Extend existing admin role table so department heads can be scoped.
alter table public.user_roles add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check check (role in ('admin','department_head'));

create table if not exists public.member_profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  username text unique,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_access(
  user_id uuid primary key references auth.users(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  status text not null default 'pending' check(status in ('pending','active','suspended','revoked')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.connections(
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(requester_id, recipient_id),
  check(requester_id <> recipient_id)
);

create table if not exists public.conversations(
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check(kind='direct'),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members(
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);

create table if not exists public.messages(
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check(length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.blocks(
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check(blocker_id <> blocked_id)
);

create table if not exists public.community_reports(
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null check(length(trim(reason)) between 3 and 1000),
  status text not null default 'open' check(status in ('open','reviewed','closed')),
  created_at timestamptz not null default now()
);

create index if not exists member_access_department_idx on public.member_access(department_id,status);
create index if not exists connections_requester_idx on public.connections(requester_id,status);
create index if not exists connections_recipient_idx on public.connections(recipient_id,status);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at);

-- Helpers used by RLS and server-side policy checks.
create or replace function public.is_community_member(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.member_access where user_id=uid and status='active');
$$;

create or replace function public.is_tcc_department_head(uid uuid default auth.uid(), dept uuid default null) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=uid and role='department_head' and (dept is null or department_id=dept));
$$;

revoke all on function public.is_community_member(uuid) from public;
grant execute on function public.is_community_member(uuid) to authenticated;
revoke all on function public.is_tcc_department_head(uuid,uuid) from public;
grant execute on function public.is_tcc_department_head(uuid,uuid) to authenticated;

alter table public.member_profiles enable row level security;
alter table public.member_access enable row level security;
alter table public.connections enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.community_reports enable row level security;

-- Members may see only approved community profiles.
drop policy if exists "community active profiles read" on public.member_profiles;
create policy "community active profiles read" on public.member_profiles for select to authenticated
using (public.is_community_member(user_id) and public.is_community_member(auth.uid()));

-- Members can create/update their own profile.
drop policy if exists "community own profile insert" on public.member_profiles;
create policy "community own profile insert" on public.member_profiles for insert to authenticated
with check (user_id=auth.uid() and public.is_community_member(auth.uid()));
drop policy if exists "community own profile update" on public.member_profiles;
create policy "community own profile update" on public.member_profiles for update to authenticated
using (user_id=auth.uid() and public.is_community_member(auth.uid()))
with check (user_id=auth.uid() and public.is_community_member(auth.uid()));

-- Users may see/manage their own connection requests and accepted connections.
drop policy if exists "community connections read" on public.connections;
create policy "community connections read" on public.connections for select to authenticated
using (public.is_community_member(auth.uid()) and (requester_id=auth.uid() or recipient_id=auth.uid()));
drop policy if exists "community connections insert" on public.connections;
create policy "community connections insert" on public.connections for insert to authenticated
with check (requester_id=auth.uid() and public.is_community_member(auth.uid()) and public.is_community_member(recipient_id));
drop policy if exists "community connections update" on public.connections;
create policy "community connections update" on public.connections for update to authenticated
using (requester_id=auth.uid() or recipient_id=auth.uid())
with check (requester_id=auth.uid() or recipient_id=auth.uid());

-- Conversation membership is private.
drop policy if exists "community conversation members read" on public.conversation_members;
create policy "community conversation members read" on public.conversation_members for select to authenticated
using (user_id=auth.uid() and public.is_community_member(auth.uid()));
drop policy if exists "community conversation members insert" on public.conversation_members;
create policy "community conversation members insert" on public.conversation_members for insert to authenticated
with check (user_id=auth.uid() and public.is_community_member(auth.uid()));

-- Messages only visible to members of the conversation.
drop policy if exists "community messages read" on public.messages;
create policy "community messages read" on public.messages for select to authenticated
using (sender_id=auth.uid() or exists(select 1 from public.conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid()));
drop policy if exists "community messages insert" on public.messages;
create policy "community messages insert" on public.messages for insert to authenticated
with check (sender_id=auth.uid() and public.is_community_member(auth.uid()) and exists(select 1 from public.conversation_members cm where cm.conversation_id=messages.conversation_id and cm.user_id=auth.uid()));
drop policy if exists "community messages update" on public.messages;
create policy "community messages update" on public.messages for update to authenticated
using (sender_id=auth.uid()) with check (sender_id=auth.uid());

-- Blocks and reports belong to the reporting/blocking user.
drop policy if exists "community blocks own" on public.blocks;
create policy "community blocks own" on public.blocks for all to authenticated
using (blocker_id=auth.uid()) with check (blocker_id=auth.uid() and public.is_community_member(auth.uid()));
drop policy if exists "community reports own" on public.community_reports;
create policy "community reports own" on public.community_reports for insert to authenticated
with check (reporter_id=auth.uid() and public.is_community_member(auth.uid()));

-- Keep realtime scoped to chat messages.
alter publication supabase_realtime add table public.messages;
