# TCC v9 authentication fix

1. Deploy this package to the same Vercel project.
2. Keep the existing Supabase environment variables.
3. Confirm `ADMIN_EMAILS` contains the exact email used in Supabase Authentication → Users.
4. In Supabase Authentication → Users, ensure that user exists and is confirmed.
5. Open `/admin/` and sign in.
6. If sign-in fails, the login box now displays the actual Supabase reason instead of silently failing.
7. Optional diagnostic: `/api/auth-status?email=YOUR-ADMIN-EMAIL` reports only whether that email is listed in `ADMIN_EMAILS`; it never returns secrets.
