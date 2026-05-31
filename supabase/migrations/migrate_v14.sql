-- Home Plus — Migration v14
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times (idempotent).
--
-- Architecture / backend release-blocker batch. Covers:
--   • A2 (FULL)   — create the missing `recipes` and `meal_plans` tables
--     (the Kitchen client upserts them but they exist in neither schema.sql
--     nor any prior migration), with family-scoped RLS.
--   • A1 (DB side)— add `updated_at` columns + an auto-touch trigger to the
--     five hot tables so the client can date-window loads and (later) delta-
--     poll. The client-side date-windowing + poll-interval bump live in
--     src/lib/db.ts and src/context/FamilyContext.tsx.
--   • A3 has no DB change (it's an Edge Function fix in send-invite).
--
-- Cheap 🟡 DB should-fixes folded in:
--   • Restrict Google refresh_token (google_calendar_integrations) to parents
--     only — every family member could previously SELECT it via RLS.
--   • Invite tokens: lifetime 7d → 24h, single-use (consumed_at) enforced in
--     accept_invitation().
--   • Family-creation INSERT policy on family_members — let a brand-new owner
--     insert their own first parent row (chicken-and-egg with is_family_member).
--   • family_id indexes on day_plan_blocks and activity_pool_items.
--
-- (drop.sql → dev-only-drop.sql rename + guard, and reset.sql table-name
--  fixes, are file changes, not SQL run here.)

-- ============================================================================
-- A2 — recipes + meal_plans tables (missing entirely)
-- ============================================================================
-- Columns inferred from the TypeScript Row types the typed client upserts:
--   src/types/index.ts  → Recipe / MealPlan / Ingredient
--   src/types/supabase.ts → TableShape<Recipe> / TableShape<MealPlan>
-- ingredients is an array of {quantity, unit, item}; steps is text[]. These
-- are stored as jsonb / text[] respectively. created_by references a
-- family_members row (nullable, set null on member delete) to match the
-- created_by pattern used by events/todo_lists.

create table if not exists recipes (
  id           uuid primary key default uuid_generate_v4(),
  family_id    uuid not null references families(id) on delete cascade,
  title        text not null,
  icon         text,
  servings     integer not null default 1,
  prep_minutes integer,
  cook_minutes integer,
  ingredients  jsonb not null default '[]'::jsonb,
  steps        text[] not null default '{}',
  notes        text,
  source_url   text,
  favorite     boolean not null default false,
  created_by   uuid references family_members(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_recipes_family on recipes(family_id);

create table if not exists meal_plans (
  id                uuid primary key default uuid_generate_v4(),
  family_id         uuid not null references families(id) on delete cascade,
  recipe_id         uuid not null references recipes(id) on delete cascade,
  date              date not null,
  meal_type         text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  servings          integer not null default 1,
  calendar_event_id uuid references events(id) on delete set null,
  notes             text,
  created_by        uuid references family_members(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_meal_plans_family on meal_plans(family_id);
create index if not exists idx_meal_plans_recipe on meal_plans(recipe_id);
create index if not exists idx_meal_plans_family_date on meal_plans(family_id, date);

alter table recipes    enable row level security;
alter table meal_plans enable row level security;

-- Family-scoped CRUD via the existing is_family_member() SECURITY DEFINER
-- helper, consistent with every other synced table.
drop policy if exists "Members manage recipes" on recipes;
create policy "Members manage recipes" on recipes
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

drop policy if exists "Members manage meal_plans" on meal_plans;
create policy "Members manage meal_plans" on meal_plans
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- ============================================================================
-- A1 — updated_at columns + auto-touch trigger (delta-poll groundwork)
-- ============================================================================
-- The five hot tables get an updated_at that defaults to now() and is bumped
-- on every UPDATE by a shared trigger. This is what lets the client (a) date-
-- window loads on created/for-date columns now and (b) move to delta polling
-- (where updated_at > last_seen) later without another migration.

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'chore_completions',
    'habit_check_ins',
    'day_plan_blocks',
    'redemptions',
    'events'
  ])
  loop
    execute format(
      'alter table %I add column if not exists updated_at timestamptz not null default now()', t
    );
    execute format('drop trigger if exists trg_touch_updated_at on %I', t);
    execute format(
      'create trigger trg_touch_updated_at before update on %I
         for each row execute function public.touch_updated_at()', t
    );
    -- Index for future delta polling (where updated_at > :since per family).
    execute format(
      'create index if not exists %I on %I(family_id, updated_at)',
      'idx_' || t || '_family_updated', t
    );
  end loop;
end$$;

-- ============================================================================
-- 🟡 Restrict Google refresh_token to parents only
-- ============================================================================
-- "members read gci" let every family member SELECT the whole row including
-- refresh_token / access_token. Parents need the full row (connect/refresh
-- flows); non-parent members only need the non-secret display fields, which
-- they already get via the get_family_google_integration() SECURITY DEFINER
-- RPC. So we narrow the table SELECT policy to parents.
drop policy if exists "members read gci" on google_calendar_integrations;
drop policy if exists "parents read gci"  on google_calendar_integrations;
create policy "parents read gci" on google_calendar_integrations
  for select using (public.is_family_parent(family_id));

-- ============================================================================
-- 🟡 Invite tokens: 24h lifetime + single-use
-- ============================================================================
-- Shorten the default lifetime from 7 days to 24 hours for any NEW invitation.
alter table invitations
  alter column expires_at set default now() + interval '24 hours';

-- Single-use marker. accept_invitation() stamps this on the first successful
-- accept; a second accept by anyone other than the already-joined member is
-- rejected. (We intentionally do NOT consume on get_invitation_preview() —
-- the preview runs on the signup screen BEFORE the user has an account, so
-- consuming there would make every invite un-acceptable.)
alter table invitations
  add column if not exists consumed_at timestamptz;

-- Backfill: any already-accepted invite is considered consumed.
update invitations set consumed_at = accepted_at
 where consumed_at is null and accepted_at is not null;

-- accept_invitation: same behaviour as before, plus it now records consumed_at
-- and treats a consumed token as single-use (idempotent only for the member
-- who already joined on it).
drop function if exists public.accept_invitation(uuid);
create or replace function public.accept_invitation(p_token uuid)
returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  inv         invitations%rowtype;
  caller_uid  uuid := auth.uid();
  caller_em   text;
  existing    uuid;
  linked      int;
begin
  if caller_uid is null then
    raise exception 'Not authenticated';
  end if;

  select email into caller_em from auth.users where id = caller_uid;

  select * into inv from invitations where token = p_token;
  if not found then
    raise exception 'Invitation not found';
  end if;

  -- Single-use: a consumed/accepted token is only honoured for the member who
  -- already joined on it (idempotent re-call), otherwise it is dead.
  if inv.consumed_at is not null or inv.accepted_at is not null then
    if exists (
      select 1 from family_members
       where family_id = inv.family_id and auth_user_id = caller_uid
    ) then
      return inv.family_id;
    end if;
    raise exception 'Invitation already used';
  end if;

  if inv.expires_at <= now() then
    raise exception 'Invitation expired';
  end if;
  if caller_em is null or lower(caller_em) <> lower(inv.email) then
    raise exception 'This invitation was sent to %, but you are signed in as %',
      inv.email, coalesce(caller_em, '(no email)');
  end if;

  -- Already a member? Return idempotently and mark consumed.
  select id into existing
    from family_members
   where family_id = inv.family_id and auth_user_id = caller_uid
   limit 1;

  if existing is not null then
    update invitations set accepted_at = now(), consumed_at = now() where token = p_token;
    return inv.family_id;
  end if;

  -- Try to link a named placeholder row first.
  update family_members
     set auth_user_id = caller_uid,
         email        = coalesce(inv.email, email),
         role         = coalesce(inv.role, role)
   where family_id     = inv.family_id
     and auth_user_id  is null
     and lower(name)   = lower(coalesce(inv.name, ''))
     and inv.name is not null
     and inv.name <> '';

  get diagnostics linked = row_count;

  if linked = 0 then
    insert into family_members (family_id, name, role, color, auth_user_id, email)
    values (
      inv.family_id,
      coalesce(inv.name, split_part(coalesce(caller_em, 'Member'), '@', 1)),
      coalesce(inv.role, 'child'),
      'sage',
      caller_uid,
      inv.email
    );
  end if;

  update invitations set accepted_at = now(), consumed_at = now() where token = p_token;
  return inv.family_id;
end;
$$;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- ============================================================================
-- 🟡 Family-creation INSERT policy on family_members (owner chicken-and-egg)
-- ============================================================================
-- "Member can insert family rows" required is_family_member(family_id), which
-- is false for a brand-new family's very first member (the owner) because no
-- family_members row exists yet — so the owner's own row could never be
-- inserted under RLS. Allow a caller to insert their OWN first parent row in a
-- family they own (families.owner_user_id = auth.uid()), in addition to the
-- normal "existing member can add members" path.
drop policy if exists "Member can insert family rows" on family_members;
create policy "Member can insert family rows" on family_members
  for insert with check (
    public.is_family_member(family_id)
    or (
      auth_user_id = auth.uid()
      and exists (
        select 1 from families f
         where f.id = family_members.family_id
           and f.owner_user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- 🟡 family_id indexes on day_plan_blocks / activity_pool_items
-- ============================================================================
-- Both tables only had member-scoped indexes; the family-scoped loads/RLS
-- filter on family_id, so add matching family_id indexes.
create index if not exists idx_day_plan_blocks_family on day_plan_blocks(family_id);
create index if not exists idx_activity_pool_family on activity_pool_items(family_id);

-- ============================================================================
-- A3 — indexed auth-user lookup by email (replaces the O(N) listUsers scan)
-- ============================================================================
-- supabase-js's admin client has no getUserByEmail; the send-invite Edge
-- Function previously paginated auth.admin.listUsers up to 50×200=10k. This
-- SECURITY DEFINER helper does a single indexed lookup on auth.users.email
-- (which carries a unique index) and returns just what send-invite needs.
-- Locked to service_role (the Edge Function's admin client) only.
create or replace function public.get_auth_user_by_email(p_email text)
returns table (id uuid, email text, email_confirmed_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email, u.email_confirmed_at
    from auth.users u
   where lower(u.email) = lower(p_email)
   limit 1;
$$;
revoke execute on function public.get_auth_user_by_email(text) from public;
revoke execute on function public.get_auth_user_by_email(text) from anon;
revoke execute on function public.get_auth_user_by_email(text) from authenticated;
grant  execute on function public.get_auth_user_by_email(text) to service_role;

-- ============================================================================
-- Realtime — add the new tables to the publication (idempotent)
-- ============================================================================
do $$
declare t text;
begin
  for t in select unnest(array['recipes', 'meal_plans'])
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when others then null;
    end;
  end loop;
end$$;

notify pgrst, 'reload schema';
