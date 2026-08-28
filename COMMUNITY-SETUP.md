# TCC Community & Chat Setup

## 1. Run the migration
In Supabase SQL Editor, run `supabase/community_chat_migration.sql` once.

## 2. Realtime
The migration adds `messages` to `supabase_realtime`. If Supabase reports that it is already a member of the publication, that statement can be skipped.

## 3. Admin access
The existing `ADMIN_EMAILS` Vercel environment variable remains the super-admin list. Those accounts can grant community access to any department.

Department heads are stored in `user_roles` with:
- `role = 'department_head'`
- `department_id = <their department UUID>`

Department heads are intentionally not added to the existing super-admin `ADMIN_EMAILS` list. Their management API is department-scoped.

## 4. Granting a member access
Use the community management API/UI that you can add to the admin dashboard next. A grant can invite an email through Supabase Auth and immediately create an active `member_access` record.

There is deliberately no public "create community account" path.

## 5. Member flow
Approved member signs in -> `/community.html` -> member directory -> connection request -> acceptance -> private chat.

RLS blocks unapproved users from reading community profiles, connections, conversations and messages.

## Departmental group chats
Run `supabase/department_groupchat_migration.sql` after the community/chat migration. Each department gets one private group room. Only active community members assigned to that department are enrolled automatically. Department heads are restricted to their own department; administrators can create/manage departmental rooms.
