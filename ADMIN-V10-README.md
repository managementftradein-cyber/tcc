# TCC Admin v10

This version focuses on the premium black/gold control-center layout shown in the supplied reference screenshot while retaining the functional Supabase/Vercel admin flow.

Deployment:
- Keep all files at repository root.
- Vercel Root Directory: `.`
- Framework Preset: Other
- Build Command: empty
- Output Directory: empty
- Keep the existing Supabase environment variables.
- Do not run a new SQL migration solely because this package contains the existing migration files.

Test:
1. `/`
2. `/api/system?type=health`
3. `/admin/`
4. Sign in
5. Dashboard counts
6. Edit Hero/About
7. Create News
8. Upload Gallery/ Hero media
9. Live Control
