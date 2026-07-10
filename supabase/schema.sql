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
  -- L1/L2/L4 — account-holder acceptance captured at sign-up (migrate_v20).
  tos_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  owner_attested_adult_at timestamptz,
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
  -- Whether the member has a PIN set. The bcrypt hash itself lives in the
  -- SECURITY-DEFINER-only member_pins table (see below), never here, so no
  -- client and no Realtime stream can ever read it. (S1 — migrate_v13)
  has_pin boolean not null default false,
  birthday date,
  current_location text,
  -- Flexible reward balance map: { stars: 142, screen_minutes: 45, ... }
  -- Server-authoritative: only the reward RPCs (redeem_reward etc.) may write
  -- this; direct client writes are blocked by trg_guard_reward_balances (S3).
  reward_balances jsonb not null default '{}'::jsonb,
  -- L4 — per-child consent (migrate_v20). NULL until a parent grants it.
  -- voice_consent_at NULL ⇒ voice intake is blocked for this child profile.
  parental_consent_at timestamptz,
  voice_consent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_family_members_family on family_members(family_id);

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- member_pins (S1) — the bcrypt PIN hash store.
--
-- No RLS policies + ALL privileges revoked from client roles => unreachable
-- except through the SECURITY DEFINER RPCs below (which run as the function
-- owner and bypass the grant check). This is what keeps pin_hash out of every
-- client SELECT and out of Realtime replication.
-- ----------------------------------------------------------------------------
create table if not exists member_pins (
  member_id  uuid primary key references family_members(id) on delete cascade,
  pin_hash   text not null,
  updated_at timestamptz not null default now()
);
alter table member_pins enable row level security;
revoke all on table member_pins from public;
revoke all on table member_pins from anon;
revoke all on table member_pins from authenticated;

-- Helper functions to set/verify PINs server-side using pgcrypto.
-- We never trust client-hashed PINs. Both functions are caller-authorised
-- (migrate_v13): set_member_pin requires the caller to be a parent in the
-- member's family or the member themselves; verify_member_pin only works for
-- callers in the same family (so it can't be used as a cross-family
-- brute-force oracle). The hash is read/written from member_pins; has_pin on
-- family_members mirrors whether a PIN exists.
create or replace function set_member_pin(member uuid, pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fam            uuid;
  caller         uuid := auth.uid();
  caller_allowed boolean;
begin
  select family_id into fam from family_members where id = member;
  if fam is null then
    raise exception 'Member not found';
  end if;

  -- Service-role / SQL-editor context has no auth.uid(); allow it through.
  if caller is not null then
    select exists (
      select 1 from family_members
       where family_id = fam and auth_user_id = caller and role = 'parent'
    ) or exists (
      select 1 from family_members
       where id = member and auth_user_id = caller
    ) into caller_allowed;

    if not caller_allowed then
      raise exception 'Only a parent or the member themselves can change this PIN';
    end if;
  end if;

  if pin is null or length(pin) < 4 then
    delete from member_pins where member_id = member;
    update family_members set has_pin = false where id = member;
  else
    insert into member_pins (member_id, pin_hash, updated_at)
    values (member, crypt(pin, gen_salt('bf')), now())
    on conflict (member_id)
      do update set pin_hash = excluded.pin_hash, updated_at = now();
    update family_members set has_pin = true where id = member;
  end if;
end;
$$;
revoke execute on function set_member_pin(uuid, text) from public;
revoke execute on function set_member_pin(uuid, text) from anon;
grant  execute on function set_member_pin(uuid, text) to authenticated;

create or replace function verify_member_pin(member uuid, pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h      text;
  fam    uuid;
  caller uuid := auth.uid();
begin
  select family_id into fam from family_members where id = member;
  if fam is null then
    return false;
  end if;
  if caller is not null and not exists (
    select 1 from family_members where family_id = fam and auth_user_id = caller
  ) then
    return false;
  end if;
  select pin_hash into h from member_pins where member_id = member;
  if h is null then return true; end if;
  return h = crypt(pin, h);
end;
$$;
revoke execute on function verify_member_pin(uuid, text) from public;
revoke execute on function verify_member_pin(uuid, text) from anon;
grant  execute on function verify_member_pin(uuid, text) to authenticated;

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
  -- Occurrence start ISO timestamps excluded from the series (migrate_v21) —
  -- lets a single recurring occurrence be "moved" (excluded here + recreated
  -- as a one-off event on the new day).
  exdates text[] not null default '{}',
  -- Reminder offsets in minutes (e.g. [10, 60])
  reminder_offsets int[] not null default '{}',
  -- Per-event opt-out for Google Calendar sync (Phase 6)
  sync_to_google boolean not null default true,
  -- Mirror id on the family's connected Google Calendar (Phase 6 v10)
  google_event_id text,
  created_by uuid references family_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_google_event_id
  on events(google_event_id) where google_event_id is not null;

create index if not exists idx_events_family_start on events(family_id, start_at);
create index if not exists idx_events_family_recurring on events(family_id) where recurrence is not null;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table families enable row level security;
alter table family_members enable row level security;
alter table events enable row level security;

-- ----------------------------------------------------------------------------
-- RLS helpers
--
-- Two SECURITY DEFINER helpers let RLS policies probe family_members without
-- re-triggering RLS on the table itself (which would recurse). Used by every
-- policy below.
-- ----------------------------------------------------------------------------
create or replace function public.user_family_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select family_id from family_members where auth_user_id = auth.uid();
$$;
revoke execute on function public.user_family_ids() from public;
grant execute on function public.user_family_ids() to authenticated;

create or replace function public.is_family_member(p_family_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from family_members
    where family_id = p_family_id
      and auth_user_id = auth.uid()
  );
$$;
revoke execute on function public.is_family_member(uuid) from public;
grant execute on function public.is_family_member(uuid) to authenticated;

-- families: members can read; owner can insert/update/delete (rename, delete).
drop policy if exists "Owner manages family"     on families;
drop policy if exists "Member can read family"   on families;
drop policy if exists "Owner inserts own family" on families;
drop policy if exists "Owner updates own family" on families;
drop policy if exists "Owner deletes own family" on families;
-- Owner is included even before their first member row exists: the
-- family_members INSERT owner-exception runs an EXISTS over families AS THE
-- CALLER, so without owner visibility a fresh signup could never insert their
-- first parent row (v25 — the second chicken-and-egg fix).
create policy "Member can read family"   on families for select using (public.is_family_member(id) or owner_user_id = auth.uid());
create policy "Owner inserts own family" on families for insert with check (owner_user_id = auth.uid());
create policy "Owner updates own family" on families for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "Owner deletes own family" on families for delete using (owner_user_id = auth.uid());

-- family_members: any member of the family can manage all members of that
-- family. Uses is_family_member() to avoid recursion on this same table.
drop policy if exists "Owner manages members"          on family_members;
drop policy if exists "Member can read own row"        on family_members;
drop policy if exists "Member can update own row"      on family_members;
drop policy if exists "Member can read family members" on family_members;
drop policy if exists "Member can update family rows"  on family_members;
drop policy if exists "Member can insert family rows"  on family_members;
drop policy if exists "Member can delete family rows"  on family_members;
create policy "Member can read family members" on family_members
  for select using (public.is_family_member(family_id));
-- Existing members can add members; additionally a brand-new family owner can
-- insert their OWN first parent row (chicken-and-egg with is_family_member — v14).
create policy "Member can insert family rows"  on family_members
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
create policy "Member can update family rows"  on family_members
  for update using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));
create policy "Member can delete family rows"  on family_members
  for delete using (public.is_family_member(family_id));

-- Privilege guard (migrate_v13): the UPDATE policy above lets any family member
-- update any member row, which on its own would let an authenticated *invited*
-- child run `update family_members set role='parent'` on themselves. This
-- trigger rejects changes to the privileged columns (role / family_id /
-- auth_user_id) unless the caller is a parent of that family — while still
-- allowing accept_invitation() to claim an unlinked placeholder row
-- (auth_user_id NULL -> value) with its parent-issued role.
create or replace function public.is_family_parent(p_family_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from family_members
     where family_id = p_family_id
       and auth_user_id = auth.uid()
       and role = 'parent'
  );
$$;
revoke execute on function public.is_family_parent(uuid) from public;
revoke execute on function public.is_family_parent(uuid) from anon;
grant  execute on function public.is_family_parent(uuid) to authenticated;

create or replace function public.guard_family_member_privileges()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Service-role / SQL-editor (no JWT): trusted, allow through.
  if auth.uid() is null then
    return new;
  end if;

  -- A parent of this family may change anything.
  if public.is_family_parent(old.family_id) then
    return new;
  end if;

  -- ---- Non-parent caller from here down --------------------------------
  if new.family_id is distinct from old.family_id then
    raise exception 'Only a parent can change a member''s family';
  end if;

  -- Role may only change while claiming an unlinked placeholder row
  -- (auth_user_id NULL -> value), which is what accept_invitation() does.
  if new.role is distinct from old.role then
    if not (old.auth_user_id is null and new.auth_user_id is not null) then
      raise exception 'Only a parent can change a member''s role';
    end if;
  end if;

  -- auth_user_id may only go NULL -> value (initial claim).
  if new.auth_user_id is distinct from old.auth_user_id then
    if old.auth_user_id is not null then
      raise exception 'auth_user_id cannot be reassigned';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_family_member_privileges on family_members;
create trigger trg_guard_family_member_privileges
  before update on family_members
  for each row execute function public.guard_family_member_privileges();

drop policy if exists "Owner manages events"   on events;
drop policy if exists "Members manage events"  on events;
-- v27: the STABLE SECURITY DEFINER helper instead of an inline subquery —
-- identical semantics, initplan-cacheable on the hot bulk-load path.
create policy "Members manage events"
  on events for all
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

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
  position integer,                          -- synced display order (v23)
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

-- Membership-based RLS for the Phase 2 tables. Any authenticated user that
-- has a family_members row for the same family_id can manage these rows.
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
    execute format('drop policy if exists "Owner manages %1$s" on %1$s', t);
    execute format('drop policy if exists "Members manage %1$s" on %1$s', t);
    execute format($p$
      create policy "Members manage %1$s"
        on %1$s for all
        using (public.is_family_member(family_id))
        with check (public.is_family_member(family_id));
    $p$, t);
  end loop;
end$$;

-- ----------------------------------------------------------------------------
-- S3 (migrate_v13) — server-authoritative reward balances
--
-- reward_balances may only change via the reward RPCs below; direct client
-- writes are rejected by trg_guard_reward_balances. Approval transitions on
-- chore_completions / redemptions are parent-only (RPCs + table triggers).
-- ----------------------------------------------------------------------------
create or replace function public.guard_reward_balances()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reward_balances is distinct from old.reward_balances then
    if auth.uid() is null then
      return new;  -- service-role / SQL editor
    end if;
    if coalesce(current_setting('app.reward_mutation', true), '') <> '1' then
      raise exception 'reward_balances can only be changed via a reward RPC';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_reward_balances on family_members;
create trigger trg_guard_reward_balances
  before update on family_members
  for each row execute function public.guard_reward_balances();

create or replace function public._apply_balance_delta(p_member uuid, p_delta jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  k text; v numeric; cur jsonb;
begin
  perform set_config('app.reward_mutation', '1', true);
  select reward_balances into cur from family_members where id = p_member for update;
  if cur is null then cur := '{}'::jsonb; end if;
  for k, v in select key, value::numeric from jsonb_each_text(p_delta) loop
    cur := jsonb_set(cur, array[k],
      to_jsonb(greatest(0, coalesce((cur->>k)::numeric, 0) + v)));
  end loop;
  update family_members set reward_balances = cur where id = p_member;
  perform set_config('app.reward_mutation', '', true);
end;
$$;
revoke execute on function public._apply_balance_delta(uuid, jsonb) from public;
revoke execute on function public._apply_balance_delta(uuid, jsonb) from anon;
revoke execute on function public._apply_balance_delta(uuid, jsonb) from authenticated;

create or replace function public._require_family_for_member(p_member uuid, p_parent_only boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare fam uuid; caller uuid := auth.uid();
begin
  select family_id into fam from family_members where id = p_member;
  if fam is null then raise exception 'Member not found'; end if;
  if caller is null then return fam; end if;
  if p_parent_only then
    if not public.is_family_parent(fam) then raise exception 'Only a parent can do that'; end if;
  else
    if not public.is_family_member(fam) then raise exception 'Not a member of this family'; end if;
  end if;
  return fam;
end;
$$;
revoke execute on function public._require_family_for_member(uuid, boolean) from public;
revoke execute on function public._require_family_for_member(uuid, boolean) from anon;
revoke execute on function public._require_family_for_member(uuid, boolean) from authenticated;

create or replace function public.redeem_reward(
  p_member uuid, p_category text, p_amount integer, p_reason text,
  p_status text default 'pending_approval'
)
returns redemptions
language plpgsql security definer set search_path = public as $$
declare fam uuid; row redemptions;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  fam := public._require_family_for_member(p_member, false);
  if p_status = 'approved' and auth.uid() is not null and not public.is_family_parent(fam) then
    raise exception 'Only a parent can approve a redemption';
  end if;
  if p_status not in ('pending_approval', 'approved') then raise exception 'invalid status'; end if;
  insert into redemptions (family_id, member_id, category, amount, reason, status, approved_at)
  values (fam, p_member, p_category, p_amount, p_reason, p_status::redemption_status,
          case when p_status = 'approved' then now() else null end)
  returning * into row;
  if p_status = 'approved' then
    perform public._apply_balance_delta(p_member, jsonb_build_object(p_category, -p_amount));
  end if;
  return row;
end;
$$;
revoke execute on function public.redeem_reward(uuid, text, integer, text, text) from public;
revoke execute on function public.redeem_reward(uuid, text, integer, text, text) from anon;
grant  execute on function public.redeem_reward(uuid, text, integer, text, text) to authenticated;

create or replace function public.set_redemption_status(p_id uuid, p_status text)
returns redemptions
language plpgsql security definer set search_path = public as $$
declare r redemptions; fam uuid;
begin
  select * into r from redemptions where id = p_id;
  if r.id is null then raise exception 'Redemption not found'; end if;
  fam := r.family_id;
  if auth.uid() is not null and not public.is_family_parent(fam) then
    raise exception 'Only a parent can change a redemption status';
  end if;
  if r.status <> 'pending_approval' then return r; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'invalid status'; end if;
  update redemptions
     set status = p_status::redemption_status,
         approved_by = (select id from family_members
                         where family_id = fam and auth_user_id = auth.uid() limit 1),
         approved_at = now()
   where id = p_id returning * into r;
  if p_status = 'approved' then
    perform public._apply_balance_delta(r.member_id, jsonb_build_object(r.category, -r.amount));
  end if;
  return r;
end;
$$;
revoke execute on function public.set_redemption_status(uuid, text) from public;
revoke execute on function public.set_redemption_status(uuid, text) from anon;
grant  execute on function public.set_redemption_status(uuid, text) to authenticated;

create or replace function public.apply_chore_payout(p_member uuid, p_payout jsonb, p_direction integer)
returns void
language plpgsql security definer set search_path = public as $$
declare scaled jsonb := '{}'::jsonb; k text; v numeric;
begin
  perform public._require_family_for_member(p_member, false);
  if p_direction not in (1, -1) then raise exception 'direction must be 1 or -1'; end if;
  for k, v in select key, value::numeric from jsonb_each_text(coalesce(p_payout, '{}'::jsonb)) loop
    scaled := jsonb_set(scaled, array[k], to_jsonb(v * p_direction));
  end loop;
  perform public._apply_balance_delta(p_member, scaled);
end;
$$;
revoke execute on function public.apply_chore_payout(uuid, jsonb, integer) from public;
revoke execute on function public.apply_chore_payout(uuid, jsonb, integer) from anon;
grant  execute on function public.apply_chore_payout(uuid, jsonb, integer) to authenticated;

create or replace function public.set_completion_status(p_id uuid, p_status text)
returns chore_completions
language plpgsql security definer set search_path = public as $$
declare c chore_completions; fam uuid;
begin
  select * into c from chore_completions where id = p_id;
  if c.id is null then raise exception 'Completion not found'; end if;
  fam := c.family_id;
  if auth.uid() is not null and not public.is_family_parent(fam) then
    raise exception 'Only a parent can approve or reject a chore';
  end if;
  if c.status <> 'pending_approval' then return c; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'invalid status'; end if;
  update chore_completions
     set status = p_status::chore_completion_status,
         approved_by = (select id from family_members
                         where family_id = fam and auth_user_id = auth.uid() limit 1),
         approved_at = now()
   where id = p_id returning * into c;
  if p_status = 'approved' then
    perform public.apply_chore_payout(c.member_id, c.payout, 1);
  end if;
  return c;
end;
$$;
revoke execute on function public.set_completion_status(uuid, text) from public;
revoke execute on function public.set_completion_status(uuid, text) from anon;
grant  execute on function public.set_completion_status(uuid, text) to authenticated;

create or replace function public.guard_approval_transition()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if public.is_family_parent(old.family_id) then return new; end if;
  if new.status is distinct from old.status
     or new.approved_by is distinct from old.approved_by then
    raise exception 'Only a parent can approve or reject';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_completion_approval on chore_completions;
create trigger trg_guard_completion_approval
  before update on chore_completions
  for each row execute function public.guard_approval_transition();
drop trigger if exists trg_guard_redemption_approval on redemptions;
create trigger trg_guard_redemption_approval
  before update on redemptions
  for each row execute function public.guard_approval_transition();

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
  position integer,                          -- synced display order (v23)
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
do $$ begin create type habit_cadence as enum ('daily','weekdays','weekend','weekly','pick_days'); exception when duplicate_object then null; end $$;
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
  -- Specific weekdays (0=Sun..6=Sat) for cadence='pick_days'. Empty for others.
  weekdays integer[] not null default '{}',
  position integer,                          -- synced display order (v23)
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
    execute format('drop policy if exists "Owner manages %1$s" on %1$s', t);
    execute format('drop policy if exists "Members manage %1$s" on %1$s', t);
    execute format($p$
      create policy "Members manage %1$s"
        on %1$s for all
        using (public.is_family_member(family_id))
        with check (public.is_family_member(family_id));
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
  created_at timestamptz not null default now(),
  -- Minutes from midnight when the block is placed on the timeline.
  -- Older rows without this fall back to section + position at render time.
  start_min integer
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
-- family_id indexes (v14): loads/RLS filter on family_id.
create index if not exists idx_day_plan_blocks_family on day_plan_blocks(family_id);
create index if not exists idx_activity_pool_family on activity_pool_items(family_id);

-- ============================================================================
-- Kitchen Plus — recipes + meal_plans (v14; were upserted by the client but
-- previously missing from schema.sql and every migration — A2)
-- ============================================================================
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
  -- v28: recurring meals — one row + a rule expands client-side; exdates are
  -- YYYY-MM-DD occurrence dates removed from the series.
  recurrence        jsonb,
  exdates           text[] not null default '{}',
  created_at        timestamptz not null default now()
);
create index if not exists idx_meal_plans_family on meal_plans(family_id);
create index if not exists idx_meal_plans_recipe on meal_plans(recipe_id);
create index if not exists idx_meal_plans_family_date on meal_plans(family_id, date);

alter table recipes    enable row level security;
alter table meal_plans enable row level security;

drop policy if exists "Members manage recipes" on recipes;
create policy "Members manage recipes" on recipes
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

drop policy if exists "Members manage meal_plans" on meal_plans;
create policy "Members manage meal_plans" on meal_plans
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- ============================================================================
-- Virtual pets (v16) — one pet per member, server-synced so a device reset
-- no longer loses the child's pet. Row shape mirrors the VirtualPet TS type:
-- stable fields are real columns; the fluid bits (accessories, custom drawing)
-- are jsonb/text so future additions don't need a migration.
-- ============================================================================
create table if not exists virtual_pets (
  id                 uuid primary key default uuid_generate_v4(),
  family_id          uuid not null references families(id) on delete cascade,
  member_id          uuid not null references family_members(id) on delete cascade,
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
  coins              integer not null default 0,
  owned_accessories  jsonb not null default '[]'::jsonb,
  care_streak        integer not null default 0,
  last_care_date     text,
  achievements       jsonb not null default '[]'::jsonb,
  lifetime_stats     jsonb not null default '{}'::jsonb,
  quest_state        jsonb,
  created_at         timestamptz not null default now(),
  unique (family_id, member_id)
);
create index if not exists idx_virtual_pets_family on virtual_pets(family_id);
create index if not exists idx_virtual_pets_member on virtual_pets(member_id);

alter table virtual_pets enable row level security;

drop policy if exists "Members manage virtual_pets" on virtual_pets;
create policy "Members manage virtual_pets" on virtual_pets
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- ============================================================================
-- Client error telemetry (v26) — write-only from clients
-- ============================================================================
-- Uncaught client errors land here via src/lib/errorReporting.ts so production
-- crashes are visible without an external service. INSERT-only for
-- authenticated users on their own auth id; no SELECT/UPDATE/DELETE policies —
-- read via the dashboard / service role.
create table if not exists client_errors (
  id            uuid primary key default uuid_generate_v4(),
  auth_user_id  uuid not null,
  message       text not null,
  stack         text,
  source        text,
  app_version   text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_client_errors_created on client_errors(created_at desc);

alter table client_errors enable row level security;
drop policy if exists "Authenticated report own errors" on client_errors;
create policy "Authenticated report own errors" on client_errors
  for insert to authenticated with check (auth_user_id = auth.uid());

-- ============================================================================
-- updated_at + auto-touch trigger on hot tables (v14; delta-poll groundwork — A1)
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'chore_completions', 'habit_check_ins', 'day_plan_blocks', 'redemptions', 'events'
  ])
  loop
    execute format(
      'alter table %I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('drop trigger if exists trg_touch_updated_at on %I', t);
    execute format(
      'create trigger trg_touch_updated_at before update on %I
         for each row execute function public.touch_updated_at()', t);
    execute format(
      'create index if not exists %I on %I(family_id, updated_at)',
      'idx_' || t || '_family_updated', t);
  end loop;
end$$;

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
  -- Weekday (0=Sun..6=Sat) the rotation advances on; null = Monday (v19).
  alter table chores add column if not exists rotation_weekday integer;
  -- First day of week (0=Sun..6=Sat) for weekly-target habits; null = Monday (v19).
  alter table habits add column if not exists week_start integer;
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
  role member_role not null default 'child',
  token uuid not null default gen_random_uuid(),
  invited_by_auth_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  -- Single-use marker (v14): set on first successful accept.
  consumed_at timestamptz,
  -- 24h lifetime (v14; was 7 days).
  expires_at timestamptz not null default now() + interval '24 hours'
);
-- Bring a pre-existing invitations table up to the v14 shape.
do $$ begin
  alter table invitations add column if not exists consumed_at timestamptz;
  alter table invitations alter column expires_at set default now() + interval '24 hours';
end $$;

create unique index if not exists idx_invitations_token on invitations(token);
create index if not exists idx_invitations_email on invitations(email);

alter table invitations enable row level security;

-- Family members can list their own family's invitations (for the manage UI).
-- The accept screen reads only family_name via the get_invitation_preview RPC
-- below — the invitations table itself is no longer world-readable.
drop policy if exists "read by token" on invitations;
drop policy if exists "members read invitations" on invitations;
create policy "members read invitations" on invitations
  for select using (public.is_family_member(family_id));

drop policy if exists "parents can insert invitations" on invitations;
create policy "parents can insert invitations" on invitations
  for insert with check (public.is_family_parent(family_id));

-- Parents can revoke / delete invitations
drop policy if exists "parents manage invitations" on invitations;
create policy "parents manage invitations" on invitations
  for delete using (public.is_family_parent(family_id));

-- Public preview RPC: given a token, return only the family name, the
-- invitee's name/email and expiry. Used by the accept screen so the
-- invitations table itself stays members-only.
create or replace function public.get_invitation_preview(p_token uuid)
returns table (
  family_name text,
  invitee_name text,
  invitee_email text,
  expires_at timestamptz,
  accepted boolean
)
language sql stable security definer set search_path = public as $$
  select f.name,
         inv.name,
         inv.email,
         inv.expires_at,
         inv.accepted_at is not null
    from invitations inv
    join families f on f.id = inv.family_id
   where inv.token = p_token;
$$;
revoke execute on function public.get_invitation_preview(uuid) from public;
grant execute on function public.get_invitation_preview(uuid) to anon, authenticated;

alter table day_plan_blocks enable row level security;
alter table activity_pool_items enable row level security;

drop policy if exists "family members can manage day plan blocks" on day_plan_blocks;
create policy "family members can manage day plan blocks" on day_plan_blocks
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

drop policy if exists "family members can manage activity pool" on activity_pool_items;
create policy "family members can manage activity pool" on activity_pool_items
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

-- ---- Helper: accept an invitation after signup -----------------------------
-- Returns the family_id so the client can hydrate without a second round-trip.
-- Verifies the caller's email matches the invitation. Idempotent — calling
-- twice with the same token does not create duplicate family_members rows.
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
  -- Single-use (v14): a consumed/accepted token is only honoured for the
  -- member who already joined on it (idempotent re-call), else it is dead.
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

  -- Already a member? Return idempotently.
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
-- Realtime — enable for all tables that need cross-device sync
-- Wrapped in a loop so re-running is safe (duplicate_object is swallowed).
-- ============================================================================
-- ============================================================================
-- Phase 6: Google Calendar integration (one connection per family, 2-way sync)
-- Any parent can connect the family's Google account. The Google email need
-- not match any parent's login email — a shared family Gmail works fine.
-- ============================================================================

create table if not exists google_calendar_integrations (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  connected_by_member_id uuid not null references family_members(id) on delete restrict,
  google_account_email text not null,
  google_calendar_id text not null,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  sync_token text,
  channel_id text,
  channel_resource_id text,
  -- Secret echoed back by Google as X-Goog-Channel-Token on every push; the
  -- webhook validates it so a forged notification can't trigger a sync (v18).
  channel_token text,
  channel_expires_at timestamptz,
  last_synced_at timestamptz,
  last_sync_error text,
  connected_at timestamptz not null default now(),
  unique (family_id)
);

create index if not exists idx_gci_channel
  on google_calendar_integrations(channel_id) where channel_id is not null;

create or replace function public.gci_require_parent()
returns trigger language plpgsql set search_path = public as $$
declare r member_role;
begin
  select role into r from family_members where id = NEW.connected_by_member_id;
  if r is null then raise exception 'connected_by_member_id does not exist'; end if;
  if r <> 'parent' then
    raise exception 'Only parents can connect Google Calendar (member role = %)', r;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_gci_require_parent on google_calendar_integrations;
create trigger trg_gci_require_parent
  before insert or update on google_calendar_integrations
  for each row execute function public.gci_require_parent();

alter table google_calendar_integrations enable row level security;

drop policy if exists "members read gci"   on google_calendar_integrations;
drop policy if exists "parents read gci"   on google_calendar_integrations;
drop policy if exists "parents insert gci" on google_calendar_integrations;
drop policy if exists "parents update gci" on google_calendar_integrations;
drop policy if exists "parents delete gci" on google_calendar_integrations;
-- SELECT restricted to parents (v14): the row holds refresh_token/access_token.
-- Non-parent members get non-secret display fields via the
-- get_family_google_integration() SECURITY DEFINER RPC instead.
create policy "parents read gci" on google_calendar_integrations
  for select using (public.is_family_parent(family_id));
create policy "parents insert gci" on google_calendar_integrations
  for insert with check (public.is_family_parent(family_id));
create policy "parents update gci" on google_calendar_integrations
  for update using (public.is_family_parent(family_id))
  with check (public.is_family_parent(family_id));
create policy "parents delete gci" on google_calendar_integrations
  for delete using (public.is_family_parent(family_id));

create table if not exists google_oauth_states (
  state text primary key,
  family_member_id uuid not null references family_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index if not exists idx_google_oauth_states_expiry on google_oauth_states(expires_at);
alter table google_oauth_states enable row level security;
-- No policies → service_role only.

-- Reaper for expired/abandoned OAuth state rows (v18). Completed flows delete
-- their own row in the callback (one-time use); abandoned flows expire here.
-- Called opportunistically by /api/google/auth-init via the service role.
create or replace function public.cleanup_google_oauth_states()
returns integer
language sql
security definer
set search_path = public as $$
  with deleted as (
    delete from google_oauth_states
     where expires_at < now()
    returning 1
  )
  select count(*)::int from deleted;
$$;
revoke execute on function public.cleanup_google_oauth_states() from public;
revoke execute on function public.cleanup_google_oauth_states() from anon;
revoke execute on function public.cleanup_google_oauth_states() from authenticated;

create or replace function public.get_family_google_integration(p_family_id uuid)
returns table (
  google_account_email text,
  connected_by_name text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_sync_error text
)
language sql stable security definer set search_path = public as $$
  select gci.google_account_email,
         fm.name,
         gci.connected_at,
         gci.last_synced_at,
         gci.last_sync_error
    from google_calendar_integrations gci
    join family_members fm on fm.id = gci.connected_by_member_id
   where gci.family_id = p_family_id
     and public.is_family_member(p_family_id);
$$;
revoke execute on function public.get_family_google_integration(uuid) from public;
grant execute on function public.get_family_google_integration(uuid) to authenticated;

-- A3 (v14) — indexed auth-user lookup by email for the send-invite Edge
-- Function (supabase-js has no getUserByEmail; this replaces an O(N)
-- listUsers scan). service_role only.
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
-- L3 / R5 (v15) — in-app account deletion (Apple Guideline 5.1.1(v))
--
-- delete_account() runs the whole data cascade for the *calling* user in one
-- transaction. The user id is taken from auth.uid() inside the function, never
-- from a parameter, so a caller can only ever delete their own account. The
-- /api/account/delete route invokes this RPC and, on success, deletes the
-- auth.users row via supabase-js admin.deleteUser.
--
--   • Caller is the family OWNER (families.owner_user_id) or the SOLE parent
--     → delete the whole `families` row; every child table FKs families(id)
--     ON DELETE CASCADE, so all family data (incl. member_pins,
--     google_oauth_states) is removed. ("delete my data")
--   • Caller is one of several parents, or a child → delete only the caller's
--     own family_members row(s); member_pins / google_oauth_states cascade and
--     created_by/approved_by/assigned_to are SET NULL, leaving the shared
--     family intact for the others.
-- ============================================================================
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller       uuid := auth.uid();
  fam          uuid;
  parent_count integer;
  is_owner     boolean;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  for fam in
    select distinct family_id
      from family_members
     where auth_user_id = caller
  loop
    select (f.owner_user_id = caller)
      into is_owner
      from families f
     where f.id = fam;

    select count(*)
      into parent_count
      from family_members fm
     where fm.family_id = fam
       and fm.role = 'parent'
       and fm.auth_user_id is distinct from caller;

    if coalesce(is_owner, false) or parent_count = 0 then
      delete from families where id = fam;
    else
      delete from family_members
       where family_id = fam
         and auth_user_id = caller;
    end if;
  end loop;
end;
$$;

revoke execute on function public.delete_account() from public;
revoke execute on function public.delete_account() from anon;
grant  execute on function public.delete_account() to authenticated;

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
    'activity_pool_items',
    'recipes',
    'meal_plans',
    'virtual_pets',
    'invitations',
    'google_calendar_integrations'
  ])
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when others then null;
    end;
  end loop;
end$$;
