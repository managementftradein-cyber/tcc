# The Christocentric Church — Gold & Black

A deployment-ready church website with a premium black/gold visual system, cinematic hero,
SPA-style page transitions, clean routes, responsive navigation, Supabase data storage and
an authenticated admin dashboard.

## Pages
- `/` Home
- `/about`
- `/programs`
- `/partnership`
- `/college`
- `/contact`
- `/give`
- `/admin/`

Each navigation item is a real route. Clicking a page triggers a curtain transition and then
renders the destination page independently, rather than simply jumping down the homepage.

## Backend
Supabase tables are defined in `supabase/schema.sql` plus a set of additive
migrations for the Community features. **Run them in the order listed in
`supabase/RUN-ORDER.md`** — several of the community migrations have foreign-key
dependencies on each other that aren't obvious from the filenames alone.
Vercel serverless functions live under `api/`.

Required Vercel environment variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS`

Never put `SUPABASE_SERVICE_ROLE_KEY` in frontend JavaScript.

## Deploy
1. Create/import a Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Create an Auth user whose email is included in `ADMIN_EMAILS`.
4. Push this folder to GitHub.
5. Import the repository into Vercel.
6. Add the four environment variables in Vercel.
7. Deploy.
8. Open `/admin/` and sign in with the authorized Supabase Auth account.

## Important
The reference source supplied for the design study contained the original site's branding,
URLs, metadata and WordPress/Elementor assets. Those references are not used as the identity
of this build. This project uses its own The Christocentric Church identity, content and assets,
while implementing the requested interaction patterns: separate page views, animated route
transitions, hero crossfade, reveals, hover motion, gallery zoom and responsive navigation.

## TCC additions
- TCC Prophetic Room
- TCC News
- TCC Live with live-stream status endpoint
- Cinematic page transitions

## TCC v3 UX update
- Mobile app-style bottom navigation: Home, About, Contact, Give, More.
- TCC News, Prophetic Room and Live are grouped under More on mobile.
- Desktop TCC Hub strip keeps News, Prophetic Room and Live out of the main header.
- Responsive layouts for phones and tablets.
- Directions/map section added. Set `window.TCC_CHURCH_ADDRESS` in `tcc-config.js` or connect it to the admin settings.

## Editable content
- Admin Settings now controls the homepage hero words, hero timing, About page text, About quote and About photo URL.
- Gallery category `Hero` (enter exactly `Hero`, not `Hero Background`) controls the crossfading homepage hero photos. Manage this from Admin → Gallery & Media → Hero filter, which supports add/edit/reorder/hide, not just add.
- Gallery images can be uploaded, hidden or deleted; storage paths are tracked for cleanup.
- Run `supabase/tcc_editable_content_migration.sql` in Supabase SQL Editor before using these fields.

## Community v13
Richer mobile messaging is included: replies, emoji reactions, image attachments, unread conversation indicators, and a mobile-first chat composer. Run `supabase/community_chat_v13.sql` after the v12 privacy migration.


## Community v14
Run `supabase/community_social_feed_v14.sql` after the v13 migration to enable the social feed.
