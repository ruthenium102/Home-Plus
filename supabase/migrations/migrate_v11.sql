-- Home Plus — Migration v11
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times.
--
-- Adds 'pick_days' to the habit_cadence enum. The client has had a
-- "Pick days" cadence option for a while (src/types/index.ts and
-- HabitEditor) but the DB enum was missing it, so any habit created with
-- this cadence was rejected silently — the client's optimistic row got
-- erased by the next 20s reconcile poll, making habits "disappear after
-- save" (Ben hit this on 2026-05-24).

do $$ begin
  alter type habit_cadence add value if not exists 'pick_days';
exception when others then null; end $$;

-- Tell PostgREST to reload its schema cache so the new enum value is
-- usable immediately without a project restart.
notify pgrst, 'reload schema';
