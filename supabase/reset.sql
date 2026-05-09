-- reset.sql — Wipes all app data for a clean re-registration.
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- After running this script:
--   1. Go to Authentication → Users and delete any existing auth users manually,
--      OR use the auth.users truncate below (requires service role access).
--   2. Reload the app — the new SEED_VERSION will clear localStorage and
--      redirect to the signup screen.
--
-- WARNING: This is irreversible. All family data will be deleted.

-- Truncate all app tables (CASCADE handles FK dependencies)
TRUNCATE TABLE
  invitations,
  activity_pool_items,
  day_plan_blocks,
  chore_completions,
  chores,
  habit_checkins,
  habits,
  redemptions,
  reward_goals,
  reward_categories,
  todo_items,
  todo_lists,
  calendar_events,
  family_members,
  families
CASCADE;

-- Optionally delete all auth users (uncomment if you have service role access)
-- DELETE FROM auth.users;
