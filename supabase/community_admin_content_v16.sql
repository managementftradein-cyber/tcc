-- TCC Community v16: Admin/Department Head Event & Announcement Management
-- Run after community_groups_events_v15.sql and all earlier Community migrations.

-- These RLS policies intentionally leave creation/update/delete to the existing
-- service-role API. The API performs the role + department checks server-side.
-- Do NOT grant broad direct client write access to these tables.

alter table public.community_events add column if not exists published boolean not null default true;
alter table public.community_events add column if not exists cancelled boolean not null default false;
alter table public.community_events add column if not exists max_attendees integer null check (max_attendees is null or max_attendees > 0);

create index if not exists community_events_published_idx
  on public.community_events(published, cancelled, starts_at);

-- Helpful audit table for administrative changes.
create table if not exists public.community_content_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  department_id uuid null references public.departments(id) on delete set null,
  content_type text not null check (content_type in ('event','announcement')),
  content_id uuid not null,
  action text not null check (action in ('create','update','publish','unpublish','cancel','delete')),
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists community_content_audit_idx
  on public.community_content_audit(created_at desc);

alter table public.community_content_audit enable row level security;

-- No broad insert/update/delete policies are added here.
-- Admin API uses service-role credentials after enforcing authorization.
