-- v24 — Virtual pet gameplay depth (phase 4)
-- Adds earned achievements, lifetime event counters, and per-day quest state
-- to virtual_pets. Idempotent.

-- Earned achievement ids (permanent), e.g. ["a_first_feed", "a_streak_7"].
alter table virtual_pets
  add column if not exists achievements jsonb not null default '[]'::jsonb;

-- Cumulative event counters (feeds, waters, pats, plays, coins_earned,
-- minigame_catch, quest_complete, best_streak) driving achievements.
alter table virtual_pets
  add column if not exists lifetime_stats jsonb not null default '{}'::jsonb;

-- Today's quest progress: { date: 'YYYY-MM-DD', counts: {...}, claimed: [...] }.
-- Rolled over client-side when the stored local date is stale.
alter table virtual_pets
  add column if not exists quest_state jsonb;
