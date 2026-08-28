-- TCC Community v10: identity, verification badge, member reference and audit trail.
extension if not exists pgcrypto;

alter table public.member_access add column if not exists member_reference text;
alter table public.member_access add column if not exists identity_status text not null default 'pending';
alter table public.member_access add column if not exists verified_by uuid references auth.users(id) on delete set null;
alter table public.member_access add column if not exists verified_at timestamptz;
alter table public.member_access add column if not exists verification_note text;
alter table public.member_access drop constraint if exists member_access_identity_status_check;
alter table public.member_access add constraint member_access_identity_status_check check(identity_status in ('pending','verified','suspended','revoked'));

create unique index if not exists member_access_member_reference_uidx on public.member_access(member_reference) where member_reference is not null;

create table if not exists public.community_identity_audit(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('provisioned','verified','suspended','reactivated','revoked','profile_updated','application_approved','application_rejected')),
  department_id uuid references public.departments(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists community_identity_audit_user_idx on public.community_identity_audit(user_id,created_at desc);
create index if not exists community_identity_audit_created_idx on public.community_identity_audit(created_at desc);
alter table public.community_identity_audit enable row level security;
drop policy if exists "identity audit admin read" on public.community_identity_audit;
create policy "identity audit admin read" on public.community_identity_audit for select to authenticated using (
  exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role='admin')
  or exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role='department_head' and ur.department_id=community_identity_audit.department_id)
);

create sequence if not exists public.tcc_member_reference_seq;
create or replace function public.generate_member_reference()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.member_reference is null then
    new.member_reference := 'TCC-' || lpad(nextval('public.tcc_member_reference_seq')::text,6,'0');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_member_reference on public.member_access;
create trigger trg_member_reference before insert on public.member_access for each row execute function public.generate_member_reference();

select setval('public.tcc_member_reference_seq', greatest((select count(*) from public.member_access where member_reference like 'TCC-%'),1), true);
update public.member_access set member_reference='TCC-'||lpad(nextval('public.tcc_member_reference_seq')::text,6,'0') where member_reference is null;

update public.member_access set identity_status=case when status='active' then 'verified' when status='suspended' then 'suspended' when status='revoked' then 'revoked' else 'pending' end where identity_status is null or identity_status='pending';

-- Keep the badge deterministic: active + verified only.
create or replace function public.is_verified_community_member(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.member_access where user_id=uid and status='active' and identity_status='verified');
$$;
revoke all on function public.is_verified_community_member(uuid) from public;
grant execute on function public.is_verified_community_member(uuid) to authenticated;
