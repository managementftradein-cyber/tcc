-- TCC Community v6: profile/presence-ready fields and realtime publication safety.
alter table public.member_profiles add column if not exists last_seen_at timestamptz;
create index if not exists member_profiles_last_seen_idx on public.member_profiles(last_seen_at desc);

-- Allow the profile table to receive realtime updates for future presence/profile enhancements.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='member_profiles') then
    alter publication supabase_realtime add table public.member_profiles;
  end if;
end $$;
