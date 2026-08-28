# TCC Community v16 — Content Management

Adds `/admin/community-content.html` for authorized Super Admins and Department Heads.

Capabilities:
- Create/edit/delete official events.
- Publish/draft events.
- Create/edit/delete official announcements.
- Church-wide or department-specific scope.
- Department Heads are server-side restricted to their own department.
- Super Admin can manage church-wide and all department content.
- Administrative changes are recorded in `community_content_audit`.

Supabase:
Run `supabase/community_admin_content_v16.sql` after the v15 migration.
