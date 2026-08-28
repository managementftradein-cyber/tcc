-- TCC BACKEND MIGRATION: editable About + Hero slideshow + Gallery/Storage
-- Designed for the current TCC schema (church_settings, gallery_photos).

create extension if not exists pgcrypto;

-- Editable About content and map/contact content already consumed by the site.
alter table public.church_settings add column if not exists about_label text;
alter table public.church_settings add column if not exists about_heading text;
alter table public.church_settings add column if not exists about_body text;
alter table public.church_settings add column if not exists about_quote text;
alter table public.church_settings add column if not exists about_image_url text;
alter table public.church_settings add column if not exists hero_eyebrow text;
alter table public.church_settings add column if not exists hero_title text;
alter table public.church_settings add column if not exists hero_body text;
alter table public.church_settings add column if not exists hero_interval_seconds integer default 6;

-- Let Gallery items remember their Storage object. This allows safe deletion later.
alter table public.gallery_photos add column if not exists storage_path text;

-- Existing gallery table already uses is_active, NOT published.
alter table public.gallery_photos enable row level security;
alter table public.church_settings enable row level security;

-- Replace only the policies for these current tables.
drop policy if exists "public read active gallery photos" on public.gallery_photos;
drop policy if exists "public read church settings" on public.church_settings;

create policy "public read active gallery photos"
on public.gallery_photos for select
to anon, authenticated
using (is_active = true);

create policy "public read church settings"
on public.church_settings for select
to anon, authenticated
using (true);

-- Storage bucket: create it if it does not exist.
insert into storage.buckets (id,name,public)
values ('gallery','gallery',true)
on conflict (id) do update set public=true;

-- The website uploads through the protected Vercel API using the Supabase service role.
-- Public users only need to read public bucket objects.
drop policy if exists "Public gallery images" on storage.objects;
drop policy if exists "Public read gallery" on storage.objects;
create policy "Public read gallery"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'gallery');

-- Safe seed for the editable hero/About fields. Existing content is preserved if already set.
insert into public.church_settings (id,church_name) values (1,'The Christocentric Church') on conflict (id) do nothing;
update public.church_settings
set
  about_label = coalesce(about_label,'Our Story'),
  about_heading = coalesce(about_heading,'Christ is the center, not the accessory.'),
  about_body = coalesce(about_body,'The Christocentric Church exists to help people know Christ, become like Christ and make Christ known.'),
  about_quote = coalesce(about_quote,'“In everything, Christ must have the first place.”'),
  hero_eyebrow = coalesce(hero_eyebrow,'Christ at the Center'),
  hero_title = coalesce(hero_title,'Faith that reveals Christ.'),
  hero_body = coalesce(hero_body,'A Christ-centered church family committed to worship, Scripture, community and a life that makes Jesus visible in the world.'),
  hero_interval_seconds = coalesce(hero_interval_seconds,6)
where id=1;

-- Verification: these are the actual columns used by this TCC build.
select column_name,data_type
from information_schema.columns
where table_schema='public' and table_name in ('church_settings','gallery_photos')
order by table_name,ordinal_position;
