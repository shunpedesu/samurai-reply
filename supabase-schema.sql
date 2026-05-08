-- ============================================================
-- Samurai Reply — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Unlocked users (paid customers)
create table if not exists unlocked_users (
  id                bigint generated always as identity primary key,
  email             text unique not null,
  stripe_payment_id text,
  unlocked_at       timestamptz default now(),
  created_at        timestamptz default now()
);

-- Index for fast lookup by email
create index if not exists idx_unlocked_users_email
  on unlocked_users (email);

-- 2. Free usage tracking (rate limiting)
create table if not exists free_usage (
  key        text primary key,   -- "free:{ip}:{YYYY-MM-DD}"
  count      int  default 1,
  updated_at timestamptz default now()
);

-- Auto-cleanup old usage rows (optional — run daily via pg_cron)
-- delete from free_usage where updated_at < now() - interval '2 days';

-- ============================================================
-- Row Level Security
-- ============================================================

-- unlocked_users: only service role can read/write
alter table unlocked_users enable row level security;
create policy "service_only" on unlocked_users
  using (false);   -- block all direct client access; server uses service key

-- free_usage: same
alter table free_usage enable row level security;
create policy "service_only" on free_usage
  using (false);
