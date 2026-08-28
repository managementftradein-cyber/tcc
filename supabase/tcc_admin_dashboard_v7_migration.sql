-- TCC v7: safe additions for the functional admin dashboard.
-- Run this AFTER your existing TCC schema. It intentionally does not add/remove columns
-- from existing content tables except the explicitly listed optional settings/gallery columns.

create extension if not exists pgcrypto;

alter table if exists public.church_settings
  add column if not exists about_label text,
  add column if not exists about_heading text,
  add column if not exists about_body text,
  add column if not exists about_quote text,
  add column if not exists about_image_url text,
  add column if not exists hero_eyebrow text,
  add column if not exists hero_title text,
  add column if not exists hero_body text,
  add column if not exists hero_interval_seconds integer default 6,
  add column if not exists map_url text,
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists youtube_url text,
  add column if not exists spotify_url text;

alter table if exists public.gallery_photos
  add column if not exists storage_path text,
  add column if not exists category text default 'Gallery',
  add column if not exists caption text,
  add column if not exists display_order integer default 0,
  add column if not exists is_active boolean default true;

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  excerpt text,
  content text,
  image_url text,
  published boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.prophetic_words (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text,
  scripture text,
  image_url text,
  published boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.live_status (
  id integer primary key default 1,
  title text default 'TCC Live',
  description text,
  stream_url text,
  embed_url text,
  is_live boolean default false,
  updated_at timestamptz default now()
);

insert into public.live_status(id) values (1)
on conflict (id) do nothing;

alter table public.news enable row level security;
alter table public.prophetic_words enable row level security;
alter table public.live_status enable row level security;

drop policy if exists "public read published news" on public.news;
create policy "public read published news" on public.news
for select using (published = true);

drop policy if exists "public read published prophetic" on public.prophetic_words;
create policy "public read published prophetic" on public.prophetic_words
for select using (published = true);

drop policy if exists "public read live status" on public.live_status;
create policy "public read live status" on public.live_status
for select using (true);

-- Storage bucket. If the bucket already exists, this is harmless.
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do update set public = true;

-- Publicly viewable gallery files.
drop policy if exists "Public gallery images" on storage.objects;
create policy "Public gallery images" on storage.objects
for select using (bucket_id = 'gallery');
