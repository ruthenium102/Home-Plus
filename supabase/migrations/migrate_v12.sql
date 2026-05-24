-- Home Plus — Migration v12
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times.
--
-- Adds the missing `weekdays integer[]` column to habits. The client has
-- been sending this column (for cadence='pick_days' habits) but the table
-- never had it, so PostgREST rejected every save with:
--   Could not find the 'weekdays' column of 'habits' in the schema cache
-- which made habits "disappear after save" (Ben hit this on 2026-05-24
-- after the migrate_v11 enum fix proved insufficient).

do $$ begin
  alter table habits
    add column if not exists weekdays integer[] not null default '{}';
end $$;

notify pgrst, 'reload schema';
