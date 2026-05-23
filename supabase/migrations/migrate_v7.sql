-- Home Plus — Migration v7
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times.
--
-- Backfills two columns that existed in schema.sql but were never carried
-- forward by an explicit migration, so production DBs were missing them.
--
-- Symptoms observed before this fix:
--   - "Add member" added a member optimistically; ~10s later the row
--     vanished from the UI. Root cause: dbUpsert sends an `email` column
--     that didn't exist on family_members, PostgREST 400s, the optimistic
--     row falls out of the merge window, the next poll fetches the table
--     without it, and it disappears.
--   - Setting a per-event colour silently reverted. Same shape: events.color
--     was missing, PostgREST 400, optimistic colour lost on next sync.

alter table family_members add column if not exists email text;
alter table events         add column if not exists color text;
