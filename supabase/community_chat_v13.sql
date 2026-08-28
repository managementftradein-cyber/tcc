-- TCC Community v13: richer messaging (reactions, replies, media attachments).
-- Run after community_privacy_v12.sql and previous community migrations.

alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists attachment_url text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_type text;

alter table public.department_group_messages add column if not exists reply_to_id uuid references public.department_group_messages(id) on delete set null;
alter table public.department_group_messages add column if not exists attachment_url text;
alter table public.department_group_messages add column if not exists attachment_name text;
alter table public.department_group_messages add column if not exists attachment_type text;

create table if not exists public.message_reactions(
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check(length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key(message_id,user_id)
);

create table if not exists public.department_group_reactions(
  message_id uuid not null references public.department_group_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check(length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key(message_id,user_id)
);

alter table public.message_reactions enable row level security;
alter table public.department_group_reactions enable row level security;

drop policy if exists "message reactions read" on public.message_reactions;
create policy "message reactions read" on public.message_reactions for select to authenticated using (
  exists (select 1 from public.messages m join public.conversation_members cm on cm.conversation_id=m.conversation_id where m.id=message_reactions.message_id and cm.user_id=auth.uid() and public.is_community_member(auth.uid()))
);
drop policy if exists "message reactions own write" on public.message_reactions;
create policy "message reactions own write" on public.message_reactions for all to authenticated using (user_id=auth.uid() and public.is_community_member(auth.uid())) with check (user_id=auth.uid() and public.is_community_member(auth.uid()));

drop policy if exists "group reactions read" on public.department_group_reactions;
create policy "group reactions read" on public.department_group_reactions for select to authenticated using (
  exists (select 1 from public.department_group_messages m join public.department_group_members gm on gm.group_id=m.group_id where m.id=department_group_reactions.message_id and gm.user_id=auth.uid() and public.is_community_member(auth.uid()))
);
drop policy if exists "group reactions own write" on public.department_group_reactions;
create policy "group reactions own write" on public.department_group_reactions for all to authenticated using (user_id=auth.uid() and public.is_community_member(auth.uid())) with check (user_id=auth.uid() and public.is_community_member(auth.uid()));

create index if not exists message_reactions_message_idx on public.message_reactions(message_id);
create index if not exists group_reactions_message_idx on public.department_group_reactions(message_id);
create index if not exists messages_reply_idx on public.messages(reply_to_id);
create index if not exists group_messages_reply_idx on public.department_group_messages(reply_to_id);

-- Private bucket: uploads are performed server-side by the protected community API.
insert into storage.buckets(id,name,public) values ('community-chat-media','community-chat-media',false) on conflict (id) do nothing;
