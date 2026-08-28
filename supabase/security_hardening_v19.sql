-- TCC Security Hardening v19
-- Run after all previous migrations (order doesn't matter relative to the
-- Community v5-v18 chain — this only touches schema.sql's public tables and
-- adds a new table of its own).

-- ---------------------------------------------------------------------------
-- 1. Close the direct-insert bypass on public-facing tables.
--
-- schema.sql's original policies let ANY holder of the public anon key
-- (which is always embedded in every page's client-side JS — that's normal
-- and expected for Supabase) insert directly into these tables via the
-- Supabase REST API, with no validation at all. The app itself never uses
-- this path: /api/contact.js, /api/subscribe.js write through the
-- service-role key (which bypasses RLS regardless), so these anon-insert
-- policies serve no purpose for the app but do let anyone script mass
-- spam/garbage submissions straight past your API's validation, honeypot
-- fields and rate limiting.
drop policy if exists "public insert subscribers" on public.subscribers;
drop policy if exists "public insert prayer" on public.prayer_requests;
drop policy if exists "public insert visitors" on public.visitors;

-- ---------------------------------------------------------------------------
-- 2. Lightweight abuse throttling for public POST endpoints.
--
-- Vercel serverless functions are stateless between invocations, so an
-- in-memory counter doesn't work for rate limiting. This table gives
-- api/contact.js, api/subscribe.js and api/community-application.js a
-- shared place to record and check submission counts per IP, without
-- needing an external service like Redis.
create table if not exists public.rate_limit_log (
  id bigint generated always as identity primary key,
  bucket text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_log_lookup_idx
  on public.rate_limit_log(bucket, ip_hash, created_at desc);

-- Old rows are only ever useful for a short sliding window; keep the table
-- small by letting old entries be pruned by the API layer (see _ratelimit.js)
-- rather than growing forever. No RLS policies are added — only the
-- service-role API reads/writes this table.
alter table public.rate_limit_log enable row level security;
