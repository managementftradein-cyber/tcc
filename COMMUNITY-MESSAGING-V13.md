# TCC Community v13 — Mobile Messaging

Adds richer private and departmental messaging while preserving controlled church membership.

## Features
- Mobile-first chat layout with safe-area support.
- Reply to messages.
- Emoji reactions (👍 ❤️ 🙏 plus any supported emoji via API).
- Image attachments (JPG/PNG/WebP/GIF, max 2 MB).
- Private storage bucket; uploads are performed server-side and returned as time-limited signed URLs.
- Conversation list shows last-message preview, time and unread count.
- Read receipts remain available.
- Department group chat supports the same reply/reaction/image features.
- Existing connection, approval, privacy, block/report and department restrictions remain in force.

## Migration
Run `supabase/community_chat_v13.sql` after `community_privacy_v12.sql` and all earlier Community migrations.

## Important
Do not expose the Supabase service-role key in frontend code. Chat-media uploads go through the protected `/api/community` endpoint.
