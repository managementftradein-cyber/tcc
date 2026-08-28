-- TCC Community v14: Social Feed
-- Run after community_chat_v13.sql and all earlier Community migrations.

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid null references public.departments(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_created_idx
  on public.community_posts(created_at desc);
create index if not exists community_posts_department_idx
  on public.community_posts(department_id);

create table if not exists public.community_post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists community_post_comments_idx
  on public.community_post_comments(post_id, created_at);

alter table public.community_posts enable row level security;
alter table public.community_post_likes enable row level security;
alter table public.community_post_comments enable row level security;

-- API uses the Supabase service role, but these policies also protect direct client access.
drop policy if exists "community posts select active members" on public.community_posts;
create policy "community posts select active members"
on public.community_posts for select to authenticated
using (
  exists (
    select 1 from public.member_access ma
    where ma.user_id = auth.uid() and ma.status = 'active'
  )
  and (
    department_id is null
    or department_id = (
      select ma.department_id from public.member_access ma
      where ma.user_id = auth.uid() and ma.status = 'active'
    )
  )
);

drop policy if exists "community posts insert active members" on public.community_posts;
create policy "community posts insert active members"
on public.community_posts for insert to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.member_access ma
    where ma.user_id = auth.uid() and ma.status = 'active'
  )
  and (
    department_id is null
    or department_id = (
      select ma.department_id from public.member_access ma
      where ma.user_id = auth.uid() and ma.status = 'active'
    )
  )
);

drop policy if exists "community posts update own" on public.community_posts;
create policy "community posts update own"
on public.community_posts for update to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

drop policy if exists "community posts delete own" on public.community_posts;
create policy "community posts delete own"
on public.community_posts for delete to authenticated
using (author_id = auth.uid());

drop policy if exists "community post likes active" on public.community_post_likes;
create policy "community post likes active"
on public.community_post_likes for all to authenticated
using (
  exists (
    select 1 from public.member_access ma
    where ma.user_id = auth.uid() and ma.status = 'active'
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.member_access ma
    where ma.user_id = auth.uid() and ma.status = 'active'
  )
);

drop policy if exists "community comments active" on public.community_post_comments;
create policy "community comments active"
on public.community_post_comments for all to authenticated
using (
  exists (
    select 1 from public.member_access ma
    where ma.user_id = auth.uid() and ma.status = 'active'
  )
)
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.member_access ma
    where ma.user_id = auth.uid() and ma.status = 'active'
  )
);

-- Realtime for live feed updates.
do $$
begin
  alter publication supabase_realtime add table public.community_posts;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.community_post_likes;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.community_post_comments;
exception when duplicate_object then null;
end $$;
