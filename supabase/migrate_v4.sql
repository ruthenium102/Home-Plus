-- Home Plus — Migration v4
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times (all statements use IF NOT EXISTS).

-- Root cause this fixes:
-- The Settings → Pages section writes to family_members.{chores_enabled,
-- habits_enabled, kitchen_enabled}. These columns are declared in schema.sql
-- (the "Add my_day_enabled and per-page visibility flags" block) but the
-- production database created from earlier schema runs was missing them.
-- Without the columns, dbUpsert('family_members', ...) silently failed in
-- PostgREST, the optimistic toggle held for ~10s while pending, then the
-- 20s background poll re-fetched the unchanged row and snapped the
-- checkbox back. Adding the columns lets the upsert succeed.

alter table family_members
  add column if not exists chores_enabled boolean not null default true;

alter table family_members
  add column if not exists habits_enabled boolean not null default true;

alter table family_members
  add column if not exists kitchen_enabled boolean not null default false;
