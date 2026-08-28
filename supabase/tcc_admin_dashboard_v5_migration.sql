-- TCC v5: additive migration; does NOT assume a published column.
create table if not exists public.user_roles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'admin' check(role='admin'),
 created_at timestamptz default now()
);
alter table public.user_roles enable row level security;
create or replace function public.is_tcc_admin() returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin');$$;
revoke all on function public.is_tcc_admin() from public;
grant execute on function public.is_tcc_admin() to authenticated;
alter table if exists public.church_settings add column if not exists hero_eyebrow text,add column if not exists hero_title text,add column if not exists hero_description text,add column if not exists hero_interval integer default 5000,add column if not exists about_label text,add column if not exists about_heading text,add column if not exists about_text text,add column if not exists about_quote text,add column if not exists about_image_url text,add column if not exists map_url text,add column if not exists latitude numeric,add column if not exists longitude numeric;
alter table if exists public.gallery_photos add column if not exists category text default 'Gallery',add column if not exists storage_path text,add column if not exists display_order integer default 0;
drop policy if exists "tcc admin read own role" on public.user_roles;
create policy "tcc admin read own role" on public.user_roles for select to authenticated using(user_id=auth.uid());
drop policy if exists "tcc admins manage roles" on public.user_roles;
create policy "tcc admins manage roles" on public.user_roles for all to authenticated using(public.is_tcc_admin()) with check(public.is_tcc_admin());
