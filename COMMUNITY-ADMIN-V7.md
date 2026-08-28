# Community Administration v7

Adds a controlled Community Management area for department/group administration.

## Supabase
Run `supabase/community_admin_structure_v7.sql` after the existing community migrations.

## Admin
Super Admin can:
- view active departments and their group chats
- rename/create departmental group chats
- assign a department head to an approved active member
- remove a department head

Department Heads can:
- view only their assigned department
- rename only their departmental group

All sensitive actions are checked server-side in `api/community.js`.
