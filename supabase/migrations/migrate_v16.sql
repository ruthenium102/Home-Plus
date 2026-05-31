-- Home Plus — Migration v16
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times (idempotent).
--
-- Should-fix batch 1 (data integrity). Covers:
--   • Persist virtual-pet state to Supabase (data-loss bug). The pet's state
--     was only ever written to localStorage, so reinstalling/resetting the
--     device wiped the child's pet. A `virtual_pets` table has existed since
--     migrate_v1, but (a) it was never wired into the client load/upsert path
--     and (b) its column shape drifted away from the current VirtualPet TS
--     type (hydration → thirst, last_played_at → last_interacted_at,
--     rewards_unlocked → unlocked_actions) and is missing the fields the app
--     added later (accessories, custom_image_data, custom_eyes).
--
--     We reshape virtual_pets so each row equals the VirtualPet TS interface
--     (flat columns; jsonb for the small fluid fields), which lets pets flow
--     through the same generic load / realtime / poll-merge / dbUpsert path as
--     every other entity. Family-scoped RLS via is_family_member(family_id),
--     consistent with all other tables, and added to the realtime publication.
--
-- Design note (pet-state model): the stable, queryable fields (level/xp,
-- stats, timestamps, name, animal) are real columns. The genuinely fluid bits
-- the UI keeps growing (worn accessory ids, the custom-drawing data URL + eye
-- placement) are kept as jsonb / text so future additions don't need a
-- migration. We did NOT collapse everything into a single `state jsonb` blob
-- because most of the shape is stable and row===entity keeps the client sync
-- plumbing uniform with the other tables.

-- ============================================================================
-- virtual_pets — reshape to match the VirtualPet TS type, add RLS + realtime
-- ============================================================================

-- The table has existed since v1; create it here too so a fresh DB that only
-- runs the recent migrations still gets it. New shape uses thirst /
-- last_interacted_at / unlocked_actions and the fluid jsonb/text fields.
create table if not exists public.virtual_pets (
  id                 uuid primary key default gen_random_uuid(),
  family_id          uuid not null references public.families(id) on delete cascade,
  member_id          uuid not null references public.family_members(id) on delete cascade,
  animal             text not null,
  name               text not null,
  hunger             integer not null default 80,
  thirst             integer not null default 80,
  happiness          integer not null default 80,
  xp                 integer not null default 0,
  unlocked_actions   text[] not null default '{}',
  last_fed_at        timestamptz,
  last_watered_at    timestamptz,
  last_interacted_at timestamptz,
  accessories        jsonb not null default '[]'::jsonb,
  custom_image_data  text,
  custom_eyes        jsonb,
  created_at         timestamptz not null default now(),
  unique (family_id, member_id)
);

-- ---- Reshape an older v1-era table in place (idempotent) -------------------
-- v1 created the table with: hydration, last_played_at, rewards_unlocked and
-- without the fluid fields. Bring such a table up to the current shape, copy
-- the old values across, then drop the legacy columns. All guarded with
-- IF [NOT] EXISTS so re-running after the reshape is a no-op.

-- New columns (no-op if the create table above already made them).
alter table public.virtual_pets
  add column if not exists thirst             integer not null default 80,
  add column if not exists last_interacted_at timestamptz,
  add column if not exists unlocked_actions   text[] not null default '{}',
  add column if not exists accessories        jsonb not null default '[]'::jsonb,
  add column if not exists custom_image_data  text,
  add column if not exists custom_eyes        jsonb;

-- Copy legacy → new where the legacy columns still exist, then drop them.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='virtual_pets'
               and column_name='hydration') then
    update public.virtual_pets set thirst = hydration where thirst is null or thirst = 80;
    alter table public.virtual_pets drop column hydration;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='virtual_pets'
               and column_name='last_played_at') then
    update public.virtual_pets
       set last_interacted_at = coalesce(last_interacted_at, last_played_at);
    alter table public.virtual_pets drop column last_played_at;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='virtual_pets'
               and column_name='rewards_unlocked') then
    update public.virtual_pets
       set unlocked_actions = coalesce(rewards_unlocked, '{}');
    alter table public.virtual_pets drop column rewards_unlocked;
  end if;
end$$;

create index if not exists idx_virtual_pets_family on public.virtual_pets(family_id);
create index if not exists idx_virtual_pets_member on public.virtual_pets(member_id);

alter table public.virtual_pets enable row level security;

-- Family-scoped RLS, consistent with every other data table.
drop policy if exists "Members manage virtual_pets" on public.virtual_pets;
create policy "Members manage virtual_pets" on public.virtual_pets
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- Add to the realtime publication so pet state syncs cross-device. Wrapped so
-- re-running (table already in the publication) is a no-op.
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table virtual_pets';
  exception when others then null;
  end;
end$$;

notify pgrst, 'reload schema';
