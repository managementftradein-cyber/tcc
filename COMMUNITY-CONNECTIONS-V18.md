# TCC Community v18 — Member Connections

Adds controlled member-to-member connections.

Rules:
- Only active Community members can send/receive connection requests.
- A member's privacy setting `allow_connection_requests` is respected.
- Private chat is allowed only when the connection is `accepted`.
- The target member's `allow_private_messages` setting is checked before chat is allowed.
- Members can accept, decline, or block.
- Connection data is protected by RLS; direct writes are intentionally not exposed.
- Notifications are generated for connection requests and accepted requests.

Supabase:
Run `supabase/community_connections_v18.sql` after v17.
