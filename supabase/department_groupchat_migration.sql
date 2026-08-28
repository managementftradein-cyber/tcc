-- TCC departmental group chats. Only active community members in the same department can join.
create table if not exists public.department_group_chats(
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null unique references public.departments(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.department_group_members(
  group_id uuid not null references public.department_group_chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(group_id,user_id)
);

create table if not exists public.department_group_messages(
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.department_group_chats(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check(length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists dgm_user_idx on public.department_group_members(user_id);
create index if not exists dgm_group_idx on public.department_group_members(group_id);
create index if not exists dgm_messages_idx on public.department_group_messages(group_id,created_at);

alter table public.department_group_chats enable row level security;
alter table public.department_group_members enable row level security;
alter table public.department_group_messages enable row level security;

-- A group belongs to exactly one department; active members may read that department's group.
drop policy if exists "department group read" on public.department_group_chats;
create policy "department group read" on public.department_group_chats for select to authenticated
using (
  public.is_community_member(auth.uid()) and exists (
    select 1 from public.member_access ma where ma.user_id=auth.uid() and ma.status='active' and ma.department_id=department_group_chats.department_id
  )
);

-- Membership is read-only from the client; server API manages membership safely.
drop policy if exists "department group members read" on public.department_group_members;
create policy "department group members read" on public.department_group_members for select to authenticated
using (
  user_id=auth.uid() and public.is_community_member(auth.uid())
);

-- Messages are visible only to active members of the group and may only be posted by the sender.
drop policy if exists "department group messages read" on public.department_group_messages;
create policy "department group messages read" on public.department_group_messages for select to authenticated
using (
  exists(select 1 from public.department_group_members gm where gm.group_id=department_group_messages.group_id and gm.user_id=auth.uid())
  and public.is_community_member(auth.uid())
);

drop policy if exists "department group messages insert" on public.department_group_messages;
create policy "department group messages insert" on public.department_group_messages for insert to authenticated
with check (
  sender_id=auth.uid() and public.is_community_member(auth.uid())
  and exists(select 1 from public.department_group_members gm where gm.group_id=department_group_messages.group_id and gm.user_id=auth.uid())
);

alter publication supabase_realtime add table public.department_group_messages;
