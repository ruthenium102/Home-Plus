-- reset.sql — Wipes all app data for a clean re-registration.
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- After running this script:
--   1. Go to Authentication → Users and delete any existing auth users manually.
--   2. Reload the app — the SEED_VERSION bump will clear localStorage and
--      redirect to the signup screen.
--
-- WARNING: This is irreversible. All family data will be deleted.

-- Truncate only tables that exist (safe if schema was partially applied)
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'invitations','activity_pool_items','day_plan_blocks',
    'chore_completions','chores','habit_checkins','habits',
    'redemptions','reward_goals','reward_categories',
    'todo_items','todo_lists','calendar_events',
    'family_members','families'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('TRUNCATE TABLE public.%I CASCADE', tbl);
    END IF;
  END LOOP;
END $$;
