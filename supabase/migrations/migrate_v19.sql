-- Home Plus — Migration v19
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times (idempotent).
--
-- Adds two optional "which day the week turns" settings:
--
--  1. chores.rotation_weekday — for rotated / roster_role chores, the weekday
--     (0=Sun..6=Sat) the rotation advances on. NULL = Monday, preserving the
--     original ISO-week cadence.
--
--  2. habits.week_start — for weekly-target habits, the first day of the week
--     (0=Sun..6=Sat) the weekly total is measured over. NULL = Monday.

do $$ begin
  alter table chores add column if not exists rotation_weekday integer;
  alter table habits add column if not exists week_start integer;
end $$;

notify pgrst, 'reload schema';
