# Supabase migration run order

Run these in the Supabase SQL Editor **in this exact order**. Each file is
idempotent (`create table if not exists`, `add column if not exists`, etc.),
so it's safe to re-run the whole list on a database that already has some of
it applied.

This list was reconstructed from the per-file header comments and the
`COMMUNITY-*.md` / `README.md` docs, plus the actual `references`/foreign-key
dependencies between tables — several of the docs didn't state a run order at
all, and a couple of migrations conflicted with each other in ways only
visible by reading the actual columns (noted below).

1. `schema.sql` — base site tables (sermons, events, announcements, prayer
   requests, visitors, subscribers, giving, church settings, gallery,
   departments) and the `gallery` storage bucket.
2. `tcc_admin_dashboard_v5_migration.sql` — `user_roles` table + `is_tcc_admin()`.
3. `tcc_admin_dashboard_v7_migration.sql` — admin dashboard content columns,
   `news`, `prophetic_words`, `live_status`.
   **Skip `tcc_admin_dashboard_v6_migration.sql` — v7 is a strict superset of
   it and is what `ADMIN-DEPLOYMENT-GUIDE.md` tells you to run. v6 is kept in
   the repo for history only.**
4. `tcc_editable_content_migration.sql` — editable About/Hero/map fields.
5. `community_chat_migration.sql` — core community tables: `member_profiles`,
   `member_access`, `connections`, `conversations`, `conversation_members`,
   `messages`, `blocks`, `community_reports`, plus `is_community_member()`.
6. `community_profile_v6_migration.sql` — adds `member_profiles.last_seen_at`.
7. `department_groupchat_migration.sql` — `department_group_chats`,
   `department_group_members`, `department_group_messages`.
8. `community_engagement_migration.sql` — notifications + read receipts.
   Has a hard foreign-key dependency on `department_group_chats`/
   `department_group_messages`, so it must run after step 7.
9. `community_admin_structure_v7.sql` — department-head administration.
   **Previously this file only created an index on `user_roles.department_id`
   without ever adding that column, and without loosening the v5 migration's
   `check(role='admin')` constraint — so assigning a department head, or
   `department-head.html` loading at all, would fail with a Postgres error.
   Fixed: the file now also adds `department_id` and updates the check
   constraint to allow `'department_head'`.**
10. `community_identity_v10.sql` — identity/verification + member reference.
11. `community_profile_v11.sql` — managed avatar storage (needs step 10).
12. `community_privacy_v12.sql` — privacy controls (needs step 11).
13. `community_chat_v13.sql` — reactions/replies/media (needs step 12).
14. `community_onboarding_v8.sql` — verification fields on `member_access`.
15. `community_onboarding_v9.sql` — public application flow
    (`community_applications`).
16. `community_social_feed_v14.sql` — the community social feed (needs
    step 13 and `member_access`/`departments`).
17. `community_groups_events_v15.sql` — official groups, events, RSVPs,
    announcements.
18. `community_admin_content_v16.sql` — event/announcement admin fields +
    `community_content_audit` (needs step 17).
19. `community_notifications_v17.sql` — notification center.
    **`community_engagement_migration.sql` (step 8) already creates a
    `community_notifications` table with an older, incompatible schema (no
    `link`/`metadata` columns, narrower `kind` list). Because that migration
    runs first, this file's own `create table if not exists` used to be a
    silent no-op — several notification inserts in `api/community.js` (feed
    comments, admin-generated notifications, the v18 connection-request flow)
    would fail with "column does not exist". Fixed: this file now `ALTER`s
    the existing table and reconciles the `kind` check constraint to cover
    every value actually used across the codebase.**
20. `community_connections_v18.sql` — new `community_connections` table
    (member connection requests) with its own RLS.
    **This is now the live connections system: `community.html`'s
    Discover/Connections views and `api/community.js`'s `connect`/
    `connection-update`/old `connections`-table routes have been retired and
    replaced with `connection-request`/`connection-response`/this table.
    Fixed along the way: the request/response/can-chat routes referenced a
    nonexistent `member_privacy` table with wrong column names (would have
    thrown a 500 on every call); re-requesting after a decline used `insert`
    against a table whose primary key would reject it (fixed to `upsert`);
    and a redundant `connection-block` action/status has been removed in
    favor of the existing `block`/`unblock`/`blocked` routes (the `blocks`
    table), which were already fully wired to the chat header's Block button
    and the Profile tab's blocked list — keeping one blocking mechanism
    instead of two that could drift out of sync.**
21. `security_hardening_v19.sql` — closes a direct-insert RLS bypass on
    `subscribers`/`prayer_requests`/`visitors` (the public anon key could
    previously be used to insert into these tables directly via the Supabase
    REST API, skipping all of `api/contact.js`'s and `api/subscribe.js`'s
    validation), and adds a `rate_limit_log` table used by the new rate
    limiting in `api/_ratelimit.js`.

## Two extra files you can ignore

- `tcc_v8_safe_migration.sql` — an earlier, self-contained alternative to
  `schema.sql` covering the same base tables (`church_settings`,
  `live_status`, `departments`, plus RLS on `gallery_photos`/`news`). It's
  redundant with `schema.sql` + `tcc_admin_dashboard_v7_migration.sql`, which
  this list already has you running. Safe to skip; harmless to run too since
  everything in it is `if not exists`.
- `fix_permissions.sql` — not part of the numbered chain, but worth running
  once (any time after `schema.sql`) if you ever see "permission denied for
  table ..." errors from the admin dashboard. It grants the Postgres-level
  privileges that RLS policies alone don't cover for the service-role key.

## API route consolidation (kept under Vercel's Hobby-plan function limit)

The Hobby plan caps a deployment at 12 Serverless Functions. This project's
`api/` folder used to have one file per endpoint (`contact.js`, `subscribe.js`,
`news.js`, `live-status.js`, `departments.js`, `photos.js`, `site-content.js`,
`health.js`, `config.js` — 9 small files), which pushed the count well past
that limit once the Community features were added. Those have been merged
into three dispatcher files that route on a `?type=` query param:

- `api/content.js` — all public GET reads: `?type=site-content`, `news`,
  `events`, `departments`, `photos`, `prophetic-words`, `live-status`.
- `api/forms.js` — all public POST submissions: `?type=contact`, `subscribe`,
  `prayer-requests`.
- `api/system.js` — small utility GETs: `?type=config`, `health`,
  `auth-status`.

Every frontend page was updated to call the new URLs. Two real bugs were
found and fixed in the process, both pre-existing and unrelated to this
consolidation itself:

- `live.html` checked `d.isLive`/`d.embedUrl` (camelCase) but the database
  columns are `is_live`/`embed_url` (snake_case) — the live banner never
  actually appeared even when an admin marked a stream live. Fixed in
  `content.js`'s `live-status` handler, which now returns both forms.
- `news.html` expected the response to be a bare array (`d.length`, `d.map`)
  but the endpoint has always returned `{items:[...]}` — the news page
  always showed "No news has been published yet," regardless of what was
  actually published. Fixed in `news.html`.
- `prophetic-room.html`'s prayer-request form posted to `/api/prayer-requests`,
  which never existed as its own file — every submission 404'd. Now posts to
  `/api/forms?type=prayer-requests`.

Current function count: `admin.js`, `community.js`, `community-application.js`,
`community-profile.js`, `content.js`, `forms.js`, `system.js`, `upload.js` = 8
(files prefixed `_` are helper modules, not routes, and don't count). That
leaves headroom before hitting the Hobby-plan limit again.


## After running everything

- Confirm `ADMIN_EMAILS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
  `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`) are set in Vercel.
- Hit `/api/system?type=health` after deploying — it checks all four are present.
- To use department heads: an admin grants an active member community access
  in a department (Admin → Community Management), then assigns them as
  department head from the admin dashboard's Community Structure panel.
- To manage hero background photos: Admin → Gallery & Media → filter to
  "Hero" → upload/edit/reorder there. Up to 8 show on the homepage,
  crossfading in ascending "order".
