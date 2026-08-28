# TCC Community Onboarding v8

## Workflow
1. Authorized admin or department head provisions a member by email and department.
2. The account receives a Supabase invitation if it does not already exist.
3. `member_access.status` is `pending` — this is **not** community access yet.
4. The member may complete the Supabase account invitation, but Community remains blocked.
5. An authorized admin/department head verifies the member and chooses **Verify & Approve**.
6. The system changes status to `active`, records `verified_by`/`verified_at`, and notifies the member.
7. Only active members can discover, connect, or chat.

## Scope
- Super Admin: all departments.
- Department Head: only their assigned department.
- No client-side role or URL can bypass the approval check.

## Migration
Run `supabase/community_onboarding_v8.sql` after the existing community migrations.
