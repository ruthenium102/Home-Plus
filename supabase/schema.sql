-- Home Plus — Supabase schema
-- Phase 1: Foundation (families, members, events)
-- Phase 2: Chores, rewards, redemptions, goals
-- Phase 3: Lists, habits, location status
-- Phase 4: My Day (day_plan_blocks, activity_pool_items)
-- Phase 5: Multi-user auth (auth_user_id on family_members, invitations)
-- Designed so Kitchen Plus tables migrate in cleanly.
-- Run this in the Supabase SQL editor.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================================
-- Families
-- ============================================================================
create table if not exists families (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  timezone text not null default 'UTC',
  -- Single auth user (the family account email/password). Tablet uses PIN
  -- to switch between members within this auth session.
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_families_owner on families(owner_user_id);

-- ============================================================================
-- Family members (profiles within a family)
-- ============================================================================
do $$ begin create type member_role as enum ('parent', 'child'); exception when duplicate_object then null; end $$;

do $$ begin create type member_color as enum ('terracotta', 'sage', 'sand', 'dusty-blue', 'plum', 'rose', 'olive', 'slate'); exception when duplicate_object then null; end $$;

create table if not exists family_members (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  role member_role not null default 'parent',
  color member_color not null default 'terracotta',
  avatar_url text,
  -- bcrypt hash of PIN (managed via a postgres function below); null = no PIN
  pin_hash text,
  birthday date,
  current_location text,
  -- Flexible reward balance map: { stars: 142, screen_minutes: 45, ... }
  reward_balances jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_family_members_family on family_members(family_id);

-- Helper function to set/verify PINs server-side using pgcrypto.
-- We never trust client-hashed PINs.
create or replace function set_member_pin(member uuid, pin text)
returns void
language plpgsql
security definer
as $$
begin
  if pin is null or length(pin) < 4 then
    update family_members set pin_hash = null where id = member;
  else
    update family_members set pin_hash = crypt(pin, gen_salt('bf')) where id = member;
  end if;
end;
$$;

create or replace function verify_member_pin(member uuid, pin text)
returns boolean
language plpgsql
security definer
as $$
declare h text;
begin
  select pin_hash into h from family_members where id = member;
  if h is null then return true; end if;
  return h = crypt(pin, h);
end;
$$;

-- ============================================================================
-- Calendar events
-- ============================================================================
do $$ begin create type event_category as enum ('general', 'school', 'work', 'sport', 'medical', 'social', 'travel', 'meal'); exception when duplicate_object then null; end $$;

create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  category event_category not null default 'general',
  -- Member ids this event applies to. Empty array = whole family.
  member_ids uuid[] not null default '{}',
  -- Recurrence as JSON for flexibility (matches src/types Recurrence)
  recurrence jsonb,
  -- Reminder offsets in minutes (e.g. [10, 60])
  reminder_offsets int[] not null default '{}',
  created_by uuid references family_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_family_start on events(family_id, start_at);
create index if not exists idx_events_family_recurring on events(family_id) where recurrence is not null;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table families enable row level security;
alter table family_members enable row level security;
alter table events enable row level security;

-- Owner can do everything on their own family
drop policy if exists "Owner manages family" on families;
create policy "Owner manages family"
  on families for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owner manages members" on family_members;
create policy "Owner manages members"
  on family_members for all
  using (
    exists (
      select 1 from families f where f.id = family_id and f.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from families f where f.id = family_id and f.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Owner manages events" on events;
create policy "Owner manages events"
  on events for all
  using (
    exists (
      select 1 from families f where f.id = family_id and f.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from families f where f.id = family_id and f.owner_user_id = auth.uid()
    )
  );

-- ============================================================================
-- Phase 2 — Chores, Rewards, Redemptions, Goals
-- ============================================================================

-- Reward categories: stars, screen time, savings — per family so each
-- family can rename labels / set their own auto-approve thresholds.
create table if not exists reward_categories (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  key text not null,                       -- 'stars' | 'screen_minutes' | 'savings_cents'
  label text not null,
  unit text not null,
  auto_approve_under integer,              -- null = always auto, 0 = always require
  created_at timestamptz not null default now(),
  unique (family_id, key)
);
create index if not exists idx_reward_categories_family on reward_categories(family_id);

-- Chores
do $$ begin create type chore_frequency as enum ('daily','weekdays','weekend','weekly','monthly','one_off'); exception when duplicate_object then null; end $$;

create table if not exists chores (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid[] not null default '{}',  -- member ids
  frequency chore_frequency not null default 'daily',
  weekdays integer[] not null default '{}',  -- 0=Sun..6=Sat (used when frequency='weekly')
  payout jsonb not null default '{}'::jsonb, -- { stars: 5, screen_minutes: 10 }
  active_from date not null default current_date,
  requires_photo boolean not null default false,
  requires_approval boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_chores_family on chores(family_id);
create index if not exists idx_chores_archived on chores(family_id, archived);

-- Chore completions
do $$ begin create type chore_completion_status as enum ('pending_approval','approved','rejected'); exception when duplicate_object then null; end $$;

create table if not exists chore_completions (
  id uuid primary key default uuid_generate_v4(),
  chore_id uuid not null references chores(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  for_date date not null,
  status chore_completion_status not null default 'approved',
  photo_url text,
  payout jsonb not null default '{}'::jsonb, -- captured at completion time
  approved_by uuid references family_members(id) on delete set null,
  approved_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  -- Prevent double-completing the same chore on the same day for the same kid
  unique (chore_id, member_id, for_date)
);
create index if not exists idx_completions_family on chore_completions(family_id);
create index if not exists idx_completions_member_date on chore_completions(member_id, for_date desc);
do $$
begin
  -- Add status column if table pre-dates this column
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'chore_completions'
      and column_name  = 'status'
  ) then
    alter table chore_completions
      add column status chore_completion_status not null default 'approved';
  end if;
  -- Create partial index if it doesn't exist yet
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename  = 'chore_completions'
      and indexname  = 'idx_completions_pending'
  ) then
    create index idx_completions_pending on chore_completions(family_id, status)
      where status = 'pending_approval';
  end if;
end $$;

-- Redemptions (kids spending points)
do $$ begin create type redemption_status as enum ('pending_approval','approved','rejected'); exception when duplicate_object then null; end $$;

create table if not exists redemptions (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  category text not null,           -- matches reward_categories.key
  amount integer not null check (amount > 0),
  reason text not null,
  status redemption_status not null default 'pending_approval',
  approved_by uuid references family_members(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_redemptions_family on redemptions(family_id);
create index if not exists idx_redemptions_member on redemptions(member_id, created_at desc);
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'redemptions'
      and column_name  = 'status'
  ) then
    alter table redemptions
      add column status redemption_status not null default 'pending_approval';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename  = 'redemptions'
      and indexname  = 'idx_redemptions_pending'
  ) then
    create index idx_redemptions_pending on redemptions(family_id, status)
      where status = 'pending_approval';
  end if;
end $$;

-- Reward goals (Sophie's AirPods, Henry's skateboard, etc.)
create table if not exists reward_goals (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  title text not null,
  category text not null,
  target_amount integer not null check (target_amount > 0),
  achieved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_goals_family on reward_goals(family_id);
create index if not exists idx_goals_member on reward_goals(member_id);

-- ----------------------------------------------------------------------------
-- RLS for Phase 2 tables
-- ----------------------------------------------------------------------------
alter table reward_categories enable row level security;
alter table chores enable row level security;
alter table chore_completions enable row level security;
alter table redemptions enable row level security;
alter table reward_goals enable row level security;

-- Helper: a single policy template applied to each Phase 2 table.
-- The owner of the family is allowed to do everything; everything else is denied.
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'reward_categories',
      'chores',
      'chore_completions',
      'redemptions',
      'reward_goals'
    ])
  loop
    execute format($p$
      drop policy if exists "Owner manages %1$s" on %1$s;
      create policy "Owner manages %1$s"
        on %1$s for all
        using (
          exists (
            select 1 from families f
            where f.id = family_id and f.owner_user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1 from families f
            where f.id = family_id and f.owner_user_id = auth.uid()
          )
        );
    $p$, t);
  end loop;
end$$;

-- ============================================================================
-- Future tables — sketched here so we can plan the merge
-- ============================================================================
-- todo_lists, todo_items
-- habits, habit_check_ins
-- locations (location history + travel statuses)
-- (Kitchen Plus tables: recipes, meal_plan, shopping_list, cupboard)
--
-- Migration plan for Kitchen Plus tables:
--   1. Add family_id foreign key to each KP table
--   2. Backfill from current single-family rows
--   3. Add member_id where it makes sense (e.g. recipe favorites per member)
--   4. Apply matching RLS policies

-- ============================================================================
-- Phase 3 — Lists, Habits, Location
-- ============================================================================

-- Named lists. owner_id null = shared, otherwise = private to that member.
create table if not exists todo_lists (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  owner_id uuid references family_members(id) on delete cascade,
  icon text,
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_todo_lists_family on todo_lists(family_id);
create index if not exists idx_todo_lists_owner on todo_lists(owner_id);

do $$ begin create type list_item_repeat as enum ('never','daily','weekly','monthly','quarterly','biannually','yearly'); exception when duplicate_object then null; end $$;

create table if not exists todo_items (
  id uuid primary key default uuid_generate_v4(),
  list_id uuid not null references todo_lists(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  notes text,
  done boolean not null default false,
  done_at timestamptz,
  repeat list_item_repeat not null default 'never',
  next_due date,
  due_date date,
  assigned_to uuid references family_members(id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_todo_items_list on todo_items(list_id);
create index if not exists idx_todo_items_family on todo_items(family_id);
create index if not exists idx_todo_items_due on todo_items(family_id, next_due, due_date);

-- Habits
do $$ begin create type habit_cadence as enum ('daily','weekdays','weekend','weekly'); exception when duplicate_object then null; end $$;
do $$ begin create type habit_visibility as enum ('private','shared'); exception when duplicate_object then null; end $$;

create table if not exists habits (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  title text not null,
  description text,
  cadence habit_cadence not null default 'daily',
  visibility habit_visibility not null default 'private',
  streak_rewards boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_habits_family on habits(family_id);
create index if not exists idx_habits_member on habits(member_id);

create table if not exists habit_check_ins (
  id uuid primary key default uuid_generate_v4(),
  habit_id uuid not null references habits(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  for_date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, member_id, for_date)
);
create index if not exists idx_checkins_family on habit_check_ins(family_id);
create index if not exists idx_checkins_member_date on habit_check_ins(member_id, for_date desc);

-- Add location_until to family_members (Phase 3)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'family_members' and column_name = 'location_until'
  ) then
    alter table family_members add column location_until timestamptz;
  end if;
end$$;

-- ----------------------------------------------------------------------------
-- RLS for Phase 3 tables
-- ----------------------------------------------------------------------------
alter table todo_lists enable row level security;
alter table todo_items enable row level security;
alter table habits enable row level security;
alter table habit_check_ins enable row level security;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'todo_lists',
      'todo_items',
      'habits',
      'habit_check_ins'
    ])
  loop
    execute format($p$
      drop policy if exists "Owner manages %1$s" on %1$s;
      create policy "Owner manages %1$s"
        on %1$s for all
        using (
          exists (
            select 1 from families f
            where f.id = family_id and f.owner_user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1 from families f
            where f.id = family_id and f.owner_user_id = auth.uid()
          )
        );
    $p$, t);
  end loop;
end$$;

-- ============================================================================
-- Phase 4: My Day
-- ============================================================================

create table if not exists day_plan_blocks (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  date date not null,
  section text not null check (section in ('morning', 'afternoon', 'evening')),
  source text not null check (source in ('chore', 'habit', 'other', 'event')),
  source_id text not null,
  title text not null,
  icon text,
  duration_min integer not null default 20,
  position integer not null default 0,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_day_plan_blocks_member_date
  on day_plan_blocks(member_id, date);

create table if not exists activity_pool_items (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  title text not null,
  icon text,
  default_duration_min integer not null default 20,
  usage_count integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_pool_member on activity_pool_items(member_id);

-- Add my_day_enabled and per-page visibility flags to family_members (safe migration)
do $$ begin
  alter table family_members add column if not exists my_day_enabled boolean not null default false;
  alter table family_members add column if not exists chores_enabled boolean not null default true;
  alter table family_members add column if not exists habits_enabled boolean not null default true;
  alter table family_members add column if not exists kitchen_enabled boolean not null default false;
  alter table family_members add column if not exists email text;
end $$;

-- Add chore rotation fields (safe migration)
do $$ begin
  alter table chores add column if not exists mode text not null default 'standard';
  alter table chores add column if not exists rotation_roster text[] not null default '{}';
  alter table chores add column if not exists rotation_pointer integer not null default 0;
  alter table chores add column if not exists rotation_anchor_iso_week text;
  alter table chores add column if not exists roster_role_name text;
end $$;

-- ============================================================================
-- Phase 5: Multi-user auth — each family member can have their own login
-- ============================================================================

-- Link family_members to Supabase auth users.
do $$ begin
  alter table family_members
    add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
end $$;

create index if not exists idx_family_members_auth_user
  on family_members(auth_user_id) where auth_user_id is not null;

-- ---- Invitations -----------------------------------------------------------

create table if not exists invitations (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  email text not null,
  name text,
  token uuid not null default gen_random_uuid(),
  invited_by_auth_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days'
);

create unique index if not exists idx_invitations_token on invitations(token);
create index if not exists idx_invitations_email on invitations(email);

alter table invitations enable row level security;

-- Anyone can read an invitation (used client-side to show family name on accept flow).
-- In practice the token is a secret UUID so brute-force is infeasible.
drop policy if exists "read by token" on invitations;
create policy "read by token" on invitations for select using (true);

drop policy if exists "parents can insert invitations" on invitations;
create policy "parents can insert invitations" on invitations
  for insert with check (
    exists (
      select 1 from family_members fm
      where fm.family_id = invitations.family_id
        and fm.auth_user_id = auth.uid()
        and fm.role = 'parent'
    )
  );

alter table day_plan_blocks enable row level security;
alter table activity_pool_items enable row level security;

drop policy if exists "family members can manage day plan blocks" on day_plan_blocks;
create policy "family members can manage day plan blocks" on day_plan_blocks
  for all using (
    exists (
      select 1 from family_members fm
      where fm.family_id = day_plan_blocks.family_id
        and fm.auth_user_id = auth.uid()
    )
  );

drop policy if exists "family members can manage activity pool" on activity_pool_items;
create policy "family members can manage activity pool" on activity_pool_items
  for all using (
    exists (
      select 1 from family_members fm
      where fm.family_id = activity_pool_items.family_id
        and fm.auth_user_id = auth.uid()
    )
  );

-- ---- Helper: accept an invitation after signup -----------------------------

create or replace function accept_invitation(p_token uuid)
returns void language plpgsql security definer as $$
declare
  inv invitations%rowtype;
begin
  select * into inv
  from invitations
  where token = p_token and accepted_at is null and expires_at > now();

  if not found then
    raise exception 'Invitation not found or expired';
  end if;

  -- Link to existing placeholder member if name matches
  update family_members
  set auth_user_id = auth.uid()
  where family_id = inv.family_id
    and lower(name) = lower(coalesce(inv.name, ''))
    and auth_user_id is null;

  -- Otherwise create a new member row
  if not found then
    insert into family_members (family_id, name, role, color, auth_user_id)
    values (
      inv.family_id,
      coalesce(inv.name, split_part(auth.jwt() ->> 'email', '@', 1)),
      'child', 'sage', auth.uid()
    );
  end if;

  update invitations set accepted_at = now() where token = p_token;
end;
$$;

-- ============================================================================
-- Realtime — enable for all tables that need cross-device sync
-- Wrapped in a loop so re-running is safe (duplicate_object is swallowed).
-- ============================================================================
do $$
declare t text;
begin
  for t in select unnest(array[
    'families',
    'family_members',
    'events',
    'chores',
    'chore_completions',
    'todo_lists',
    'todo_items',
    'habits',
    'habit_check_ins',
    'reward_goals',
    'redemptions',
    'day_plan_blocks',
    'activity_pool_items'
  ])
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when others then null;
    end;
  end loop;
end$$;
