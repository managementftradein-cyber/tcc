# TCC Community v11 — Profile Photos & Mobile Polish

## What changed
- Members can upload a profile photo directly from the Community profile page.
- Accepted formats: JPG, PNG, WebP, GIF. Maximum 3 MB.
- Photos are stored in the `community-avatars` Supabase Storage bucket under the member's own user ID.
- Storage policies restrict uploads, updates and deletes to the authenticated owner.
- The member directory shows a verified badge when identity is verified.
- Profile and chat layouts remain mobile-first and responsive.

## Supabase
Run `supabase/community_profile_v11.sql` after the v10 identity migration.

The bucket is public for image delivery; access to Community itself is still protected by the existing member-access rules.
