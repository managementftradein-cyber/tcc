# TCC Admin v7 — deployment

## 1. Replace the old project files
Upload the contents of this ZIP to the same GitHub repository and replace the old `admin/`, `admin-auth.js`, `api/`, and `supabase/` files. Do not leave the old `admin/app.js` in place.

## 2. Supabase
Run:
`supabase/tcc_admin_dashboard_v7_migration.sql`

The migration is additive. It creates the News, Prophetic Room and Live tables if they do not exist, adds the editable Hero/About settings, and creates the `gallery` Storage bucket.

## 3. Vercel Environment Variables
Set these in the Vercel project:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` OR `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS`

`ADMIN_EMAILS` must contain the exact email used by the administrator in Supabase Authentication.

## 4. Deploy
Commit/push the replacement files to GitHub. Vercel should deploy the new commit. If automatic deployment is disabled, use Vercel -> Deployments -> Redeploy.

## 5. Open
`https://YOUR-DOMAIN/admin/`

The dashboard is no longer a static mock. It authenticates with Supabase, sends the user's access token to the Vercel API, and the API verifies the administrator email before reading/writing data.

## 6. First tests
1. Sign in.
2. Open TCC News -> + New -> save a test article.
3. Edit it.
4. Delete it.
5. Open Hero & About -> change the headline -> Save.
6. Open Gallery -> upload a photo -> choose Hero.
7. Open Live Control -> toggle LIVE NOW -> Save.
8. Refresh the browser and confirm the saved data remains.

If a backend operation fails, the dashboard now displays the API/Supabase error instead of silently doing nothing.
