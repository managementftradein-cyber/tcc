# Vercel Hobby deployment fix

This build consolidates the previous multiple `/api/*.js` Serverless Functions into one Vercel Function:

- `/api/index.js` is the only file in `/api`.
- Existing public URLs such as `/api/news`, `/api/community?action=members`, `/api/admin?resource=news`, etc. are preserved by `vercel.json` rewrites.
- Shared backend code lives in `/lib`, which is not deployed as separate Vercel Functions.
- Added `/api/prayer-requests`, which is referenced by `prophetic-room.html` and was missing from the original API folder.

## GitHub → Vercel

1. Replace the old repository contents with this project (keep the project root as `tcc-v13`, or upload its contents directly if that is your repository root).
2. Commit and push to GitHub.
3. In Vercel, open the existing project and redeploy the latest commit.
4. Keep the existing environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_EMAILS`

No Vercel Pro upgrade is required just to get past the 12-function limit with this structure.
