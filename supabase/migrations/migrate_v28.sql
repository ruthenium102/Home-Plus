-- v28 — recurring meal plans (release-review A3)
-- One meal_plans row + a recurrence rule expands client-side
-- (src/lib/mealRecurrence.ts) instead of materialising a row + calendar event
-- per occurrence (~728 rows for one "repeat forever"). The linked calendar
-- event carries the same rule via the events recurrence machinery.
-- exdates holds YYYY-MM-DD occurrence dates removed from the series.
-- Existing materialised rows keep working as one-offs. Idempotent.

alter table meal_plans
  add column if not exists recurrence jsonb;

alter table meal_plans
  add column if not exists exdates text[] not null default '{}';
