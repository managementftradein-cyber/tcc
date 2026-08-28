# TCC Community v17 — Notification Center

Adds an approved-member notification center.

Features:
- Notification bell with unread badge.
- In-app notification panel.
- Mark one notification read.
- Mark all notifications read.
- Realtime-ready notifications table.
- Admin-generated notifications.
- Existing feed-comment notifications now link back to the community feed.
- Mobile-friendly notification panel.

Security:
- Members can only read/update their own notifications.
- Administrative notification creation is server-side restricted.
- No public notification creation endpoint is exposed.

Supabase:
Run `supabase/community_notifications_v17.sql` after the v16 migration.
