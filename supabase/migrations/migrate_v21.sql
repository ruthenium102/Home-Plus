-- Home Plus — Migration v21
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times (idempotent).
--
-- Adds events.exdates: occurrence start-time ISO strings to suppress from a
-- recurring series. This lets a single recurring occurrence be "moved" — the
-- original occurrence is excluded here and a one-off event is created on the
-- new day. Without it, dragging a recurring event was a no-op.

do $$ begin
  alter table events add column if not exists exdates text[] not null default '{}';
end $$;

notify pgrst, 'reload schema';
