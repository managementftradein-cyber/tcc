-- TCC Community v11: managed profile-photo storage.
-- Run after community_identity_v10.sql.

insert into storage.buckets (id, name, public)
values ('community-avatars', 'community-avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "community avatars public read" on storage.objects;
create policy "community avatars public read"
on storage.objects for select
using (bucket_id = 'community-avatars');

drop policy if exists "community avatars own insert" on storage.objects;
create policy "community avatars own insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'community-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.extension(name) in ('jpg','jpeg','png','webp','gif'))
);

drop policy if exists "community avatars own update" on storage.objects;
create policy "community avatars own update"
on storage.objects for update to authenticated
using (bucket_id = 'community-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'community-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "community avatars own delete" on storage.objects;
create policy "community avatars own delete"
on storage.objects for delete to authenticated
using (bucket_id = 'community-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Tighten profile editing: only active community members may update their profile.
drop policy if exists "community own profile update" on public.member_profiles;
create policy "community own profile update"
on public.member_profiles for update to authenticated
using (user_id = auth.uid() and exists(select 1 from public.member_access ma where ma.user_id=auth.uid() and ma.status='active' and ma.identity_status='verified'))
with check (user_id = auth.uid() and exists(select 1 from public.member_access ma where ma.user_id=auth.uid() and ma.status='active' and ma.identity_status='verified'));
