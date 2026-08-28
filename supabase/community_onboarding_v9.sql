-- TCC Community onboarding v9: public application, controlled review and provisioning.
create table if not exists public.community_applications(
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  department_id uuid not null references public.departments(id) on delete restrict,
  username text,
  bio text,
  reason text,
  status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  provisioned_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists community_applications_status_created_idx on public.community_applications(status,created_at desc);
create index if not exists community_applications_department_status_idx on public.community_applications(department_id,status);
create unique index if not exists community_applications_pending_email_idx on public.community_applications(lower(email)) where status in ('pending','approved');
alter table public.community_applications enable row level security;
-- Applications are intentionally server-managed. The public application endpoint uses the service role.
drop policy if exists "community applications none client" on public.community_applications;
