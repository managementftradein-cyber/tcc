-- TCC Community onboarding & verification v8
-- Members are provisioned by an admin/department head but remain pending until explicitly approved.

alter table public.member_access add column if not exists verified_by uuid references auth.users(id) on delete set null;
alter table public.member_access add column if not exists verified_at timestamptz;
alter table public.member_access add column if not exists verification_note text;

create index if not exists member_access_status_created_idx on public.member_access(status, created_at desc);
create index if not exists member_access_verified_idx on public.member_access(verified_at desc);

-- Prevent active access from being created directly through the client.
-- Server-side provisioning/approval uses the Supabase service role after role checks.
drop policy if exists "community member access self read" on public.member_access;
create policy "community member access self read" on public.member_access
for select to authenticated
using (user_id = auth.uid() and status in ('active','suspended','revoked','pending'));

-- Keep community access itself server-managed; no client insert/update/delete policies are granted.
