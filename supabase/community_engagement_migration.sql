-- TCC Community engagement, moderation, unread state, and notification layer.
create table if not exists public.community_notifications(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check(kind in ('connection_request','connection_accepted','direct_message','group_message','system')),
  title text not null,
  body text not null,
  conversation_id uuid references public.conversations(id) on delete cascade,
  group_id uuid references public.department_group_chats(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_notifications_user_idx on public.community_notifications(user_id,created_at desc);

create table if not exists public.message_reads(
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(message_id,user_id)
);
create index if not exists message_reads_user_idx on public.message_reads(user_id,read_at desc);

create table if not exists public.department_group_reads(
  message_id uuid not null references public.department_group_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(message_id,user_id)
);
create index if not exists department_group_reads_user_idx on public.department_group_reads(user_id,read_at desc);

alter table public.community_notifications enable row level security;
alter table public.message_reads enable row level security;
alter table public.department_group_reads enable row level security;

drop policy if exists "community notifications own read" on public.community_notifications;
create policy "community notifications own read" on public.community_notifications for select to authenticated
using(user_id=auth.uid() and public.is_community_member(auth.uid()));
drop policy if exists "community notifications own update" on public.community_notifications;
create policy "community notifications own update" on public.community_notifications for update to authenticated
using(user_id=auth.uid() and public.is_community_member(auth.uid()))
with check(user_id=auth.uid() and public.is_community_member(auth.uid()));

drop policy if exists "community message reads own" on public.message_reads;
create policy "community message reads own" on public.message_reads for all to authenticated
using(user_id=auth.uid() and public.is_community_member(auth.uid()))
with check(user_id=auth.uid() and public.is_community_member(auth.uid()));

drop policy if exists "community group reads own" on public.department_group_reads;
create policy "community group reads own" on public.department_group_reads for all to authenticated
using(user_id=auth.uid() and public.is_community_member(auth.uid()))
with check(user_id=auth.uid() and public.is_community_member(auth.uid()));

-- Prevent clients from creating notifications; the service-role API creates them.
-- Moderation remains server-side.

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_notifications') then
    alter publication supabase_realtime add table public.community_notifications;
  end if;
end $$;
