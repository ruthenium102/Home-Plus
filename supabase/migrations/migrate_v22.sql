-- v22 — Virtual pet gameplay economy (phase 3)
-- Adds a coin balance, owned-accessory inventory, and a daily care streak to
-- virtual_pets. Idempotent.

alter table virtual_pets
  add column if not exists coins integer not null default 0;

alter table virtual_pets
  add column if not exists owned_accessories jsonb not null default '[]'::jsonb;

alter table virtual_pets
  add column if not exists care_streak integer not null default 0;

-- Local YYYY-MM-DD of the last day a daily care bonus was claimed.
alter table virtual_pets
  add column if not exists last_care_date text;
