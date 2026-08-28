create extension if not exists pgcrypto;
create table if not exists subscribers(id uuid primary key default gen_random_uuid(),email text unique not null,created_at timestamptz default now());
create table if not exists sermons(id uuid primary key default gen_random_uuid(),title text not null,speaker text,date date,video_url text,description text,created_at timestamptz default now());
create table if not exists events(id uuid primary key default gen_random_uuid(),title text not null,date timestamptz not null,location text,description text,created_at timestamptz default now());
create table if not exists announcements(id uuid primary key default gen_random_uuid(),title text not null,body text not null,created_at timestamptz default now());
create table if not exists prayer_requests(id uuid primary key default gen_random_uuid(),name text,email text,subject text,message text not null,status text default 'new',created_at timestamptz default now());
create table if not exists visitors(id uuid primary key default gen_random_uuid(),name text not null,email text,phone text,message text,status text default 'new',created_at timestamptz default now());
create table if not exists giving_records(id uuid primary key default gen_random_uuid(),donor_name text,amount numeric(12,2) not null,currency text default 'NGN',reference text,status text default 'pending',created_at timestamptz default now());
create table if not exists church_settings(id integer primary key default 1,church_name text,email text,phone text,location text,service_times text,updated_at timestamptz default now());
alter table subscribers enable row level security;
alter table sermons enable row level security;
alter table events enable row level security;
alter table announcements enable row level security;
alter table prayer_requests enable row level security;
alter table visitors enable row level security;
alter table giving_records enable row level security;
alter table church_settings enable row level security;
create policy "public read sermons" on sermons for select using(true);
create policy "public read events" on events for select using(true);
create policy "public read announcements" on announcements for select using(true);
create policy "public insert subscribers" on subscribers for insert with check(true);
create policy "public insert prayer" on prayer_requests for insert with check(true);
create policy "public insert visitors" on visitors for insert with check(true);

-- v2.2.0: gallery, departments, and a backend data-storage toggle
create table if not exists gallery_photos(id uuid primary key default gen_random_uuid(),url text not null,caption text,category text default 'general',display_order integer default 0,is_active boolean default true,created_at timestamptz default now());
create table if not exists departments(id uuid primary key default gen_random_uuid(),name text not null,description text,icon text default '✦',contact_email text,display_order integer default 0,is_active boolean default true,created_at timestamptz default now());
alter table church_settings add column if not exists store_visitor_data boolean default true;
alter table gallery_photos enable row level security;
alter table departments enable row level security;
create policy "public read active gallery photos" on gallery_photos for select using(is_active = true);
create policy "public read active departments" on departments for select using(is_active = true);

-- Storage bucket for admin-uploaded gallery photos (public read, uploads go through the
-- authenticated /api/upload endpoint which uses the service-role key, so no extra storage
-- policies are required).
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

-- Seed the three starter departments referenced on the homepage. Safe to run more than once.
insert into departments (name, description, icon, display_order)
select 'Music', 'Lead the church in worship — vocals, instruments, and sound.', '🎵', 1
where not exists (select 1 from departments where name = 'Music');
insert into departments (name, description, icon, display_order)
select 'Ushering', 'Welcome every guest and keep services running smoothly.', '🤝', 2
where not exists (select 1 from departments where name = 'Ushering');
insert into departments (name, description, icon, display_order)
select 'Media', 'Run the cameras, livestream, and sound for every service.', '🎥', 3
where not exists (select 1 from departments where name = 'Media');
-- Contact/messages are stored in visitors for the admin inbox.
create index if not exists visitors_created_at_idx on visitors(created_at desc);
create index if not exists events_date_idx on events(date);
