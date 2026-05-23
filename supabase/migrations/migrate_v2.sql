-- Home Plus — Migration v2
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times (uses IF NOT EXISTS).

-- ============================================================================
-- 1. day_plan_blocks.start_min
-- ============================================================================
-- Added in client v1.0.5 when My Day moved to a timeline view (Outlook style).
-- Without this column, the dbUpsert from My Day silently failed in PostgREST,
-- so My Day data wasn't syncing across devices.
ALTER TABLE day_plan_blocks
  ADD COLUMN IF NOT EXISTS start_min INTEGER;
