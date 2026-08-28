-- Community administration structure v7.
-- Backend API uses service role after authenticated role checks.
-- Keep department-head scope in user_roles.department_id.

-- The v5 migration created user_roles with a check(role='admin') constraint and no
-- department_id column. Department heads (api/community.js: manage-structure,
-- manage-members) and department-head.html both require role='department_head'
-- plus a department_id, so both need to be added here before the index below.
alter table public.user_roles add column if not exists department_id uuid references public.departments(id) on delete set null;

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check check (role in ('admin','department_head'));

create index if not exists user_roles_department_role_idx on public.user_roles(department_id, role);

-- Note: api/community.js's "assign-head" action does not remove a department's existing
-- head before assigning a new one, so a department could end up with more than one
-- department_head row if you reassign without first calling "remove-head". No DB
-- constraint is added for this here since the API doesn't currently enforce it; use
-- "Remove Head" before "Assign Head" when replacing a department's head.
