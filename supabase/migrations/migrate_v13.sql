-- Home Plus — Migration v13
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times.
--
-- Security batch 2 (within-household privilege). Covers:
--   • S1 (FULL)   — harden the PIN RPCs AND hide pin_hash from clients by
--     moving it into a SECURITY-DEFINER-only `member_pins` table. A readable
--     `family_members.has_pin` boolean replaces the hash for the UI.
--   • S2 (full)   — stop a child from self-promoting to parent (or moving
--     families / re-pointing auth_user_id) via a BEFORE UPDATE trigger.
--   • S3 (FULL)   — make reward balances server-authoritative: a SECURITY
--     DEFINER `redeem_reward` RPC + `apply_chore_payout` /
--     `set_completion_status` / `set_redemption_status` RPCs do all balance
--     arithmetic; direct client writes to family_members.reward_balances are
--     blocked by a trigger (only the RPCs, which set a session flag, or a
--     service-role context may change them), and approval transitions on
--     chore_completions / redemptions are parent-only.
--
-- NEW in this revision (Ben's decisions, 2026-05-31):
--   • S1 member_pins table + has_pin column + data migration + drop pin_hash.
--   • S3 reward_balances guard + redeem_reward / payout / status RPCs.

-- ============================================================================
-- S1 — Hide pin_hash from clients (member_pins table) + harden the PIN RPCs
-- ============================================================================
-- Previously pin_hash lived on family_members, which every family member can
-- SELECT (and which Realtime replicates), so any child could read a parent's
-- hash and brute-force a 4-digit PIN offline. We move the hash into a
-- dedicated table that NO client role can touch — it is reachable only via
-- the SECURITY DEFINER RPCs below — and expose a readable has_pin boolean on
-- family_members so the UI can still show whether a member has a PIN set.

create extension if not exists pgcrypto with schema extensions;

-- The hash store. No RLS policies and ALL privileges revoked from client
-- roles => unreachable except through SECURITY DEFINER functions (which run
-- as the function owner, bypassing the grant check).
create table if not exists public.member_pins (
  member_id  uuid primary key references public.family_members(id) on delete cascade,
  pin_hash   text not null,
  updated_at timestamptz not null default now()
);
alter table public.member_pins enable row level security;
-- No policies => no row is visible/writable to authenticated/anon at all.
revoke all on table public.member_pins from public;
revoke all on table public.member_pins from anon;
revoke all on table public.member_pins from authenticated;

-- Readable, secret-free indicator the client CAN select.
alter table public.family_members
  add column if not exists has_pin boolean not null default false;

-- One-time data migration: lift any existing family_members.pin_hash values
-- into member_pins and mark has_pin. Guarded so it is a no-op once the
-- pin_hash column has been dropped (re-running the file stays safe).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'family_members'
      and column_name  = 'pin_hash'
  ) then
    insert into public.member_pins (member_id, pin_hash)
    select id, pin_hash
      from public.family_members
     where pin_hash is not null
    on conflict (member_id) do update set pin_hash = excluded.pin_hash;

    update public.family_members
       set has_pin = (pin_hash is not null);

    -- The hash no longer lives here. Drop it so no client can ever read it
    -- and Realtime stops replicating it.
    alter table public.family_members drop column pin_hash;
  end if;
end$$;

-- set_member_pin: only a parent in the member's family, or the member
-- themselves (matched via auth_user_id), may set/clear a PIN. Writes the
-- hash to member_pins and keeps family_members.has_pin in sync.
create or replace function public.set_member_pin(member uuid, pin text)
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

revoke execute on function public.set_member_pin(uuid, text) from public;
revoke execute on function public.set_member_pin(uuid, text) from anon;
grant  execute on function public.set_member_pin(uuid, text) to authenticated;

-- verify_member_pin: only callers in the same family may verify (prevents
-- using it as a cross-family PIN oracle). Returns true when the member has
-- no PIN set (unchanged behaviour). Reads the hash from member_pins.
create or replace function public.verify_member_pin(member uuid, pin text)
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

  -- Cross-family probing is not allowed.
  if caller is not null and not exists (
    select 1 from family_members where family_id = fam and auth_user_id = caller
  ) then
    return false;
  end if;

  select pin_hash into h from member_pins where member_id = member;
  if h is null then return true; end if;   -- no PIN set
  return h = crypt(pin, h);
end;
$$;

revoke execute on function public.verify_member_pin(uuid, text) from public;
revoke execute on function public.verify_member_pin(uuid, text) from anon;
grant  execute on function public.verify_member_pin(uuid, text) to authenticated;

-- ============================================================================
-- S2 — Block child self-promotion / family hopping / auth re-pointing
-- ============================================================================
-- The family_members UPDATE policy only checks is_family_member(family_id),
-- so an authenticated *invited* child (a member with their own auth_user_id)
-- could run `update family_members set role='parent'` on themselves. A
-- BEFORE UPDATE trigger now rejects changes to the privileged columns
-- (role / family_id / auth_user_id) unless the caller is a parent of that
-- family — while still allowing accept_invitation() to claim an unlinked
-- placeholder row (auth_user_id NULL -> value) with its parent-issued role.

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
language plpgsql
security definer set search_path = public as $$
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

  -- Never move a member into another family.
  if new.family_id is distinct from old.family_id then
    raise exception 'Only a parent can change a member''s family';
  end if;

  -- Role may only change while claiming an unlinked placeholder row
  -- (auth_user_id NULL -> value), which is exactly what accept_invitation()
  -- does with the parent-issued invited role. Any other role change (e.g. an
  -- established child promoting itself) is rejected.
  if new.role is distinct from old.role then
    if not (old.auth_user_id is null and new.auth_user_id is not null) then
      raise exception 'Only a parent can change a member''s role';
    end if;
  end if;

  -- auth_user_id may only go NULL -> value (initial claim), never be
  -- re-pointed to a different account.
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

-- ============================================================================
-- S3 — Server-authoritative reward balances
-- ============================================================================
-- Today the client writes family_members.reward_balances directly and any
-- family member can approve their own redemption / chore and edit balances.
-- We lock balances down so they can ONLY change via the SECURITY DEFINER RPCs
-- below, and make approval transitions parent-only.
--
-- Mechanism: the RPCs set a transaction-local flag (app.reward_mutation='1')
-- before touching reward_balances. A BEFORE UPDATE trigger on family_members
-- rejects any reward_balances change unless that flag is set (RPC context) or
-- there is no JWT (service-role / SQL editor). SECURITY DEFINER functions keep
-- the caller's auth.uid(), so we can't distinguish them by uid alone — the
-- session flag is what authorises the write.

create or replace function public.guard_reward_balances()
returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  if new.reward_balances is distinct from old.reward_balances then
    -- Service-role / SQL-editor (no JWT): trusted.
    if auth.uid() is null then
      return new;
    end if;
    -- Otherwise only an RPC that has set the mutation flag may change balances.
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

-- Internal helper: add a payout map (json of {category: delta}) to a member's
-- balances, clamping at 0. Sets the mutation flag so the guard allows it.
create or replace function public._apply_balance_delta(p_member uuid, p_delta jsonb)
returns void
language plpgsql
security definer set search_path = public as $$
declare
  k   text;
  v   numeric;
  cur jsonb;
begin
  perform set_config('app.reward_mutation', '1', true);
  select reward_balances into cur from family_members where id = p_member for update;
  if cur is null then cur := '{}'::jsonb; end if;
  for k, v in select key, value::numeric from jsonb_each_text(p_delta) loop
    cur := jsonb_set(
      cur, array[k],
      to_jsonb(greatest(0, coalesce((cur->>k)::numeric, 0) + v))
    );
  end loop;
  update family_members set reward_balances = cur where id = p_member;
  perform set_config('app.reward_mutation', '', true);
end;
$$;
revoke execute on function public._apply_balance_delta(uuid, jsonb) from public;
revoke execute on function public._apply_balance_delta(uuid, jsonb) from anon;
revoke execute on function public._apply_balance_delta(uuid, jsonb) from authenticated;

-- Caller must be a parent of, or belong to, the member's family. Returns the
-- member's family or raises.
create or replace function public._require_family_for_member(p_member uuid, p_parent_only boolean)
returns uuid
language plpgsql
security definer set search_path = public as $$
declare
  fam    uuid;
  caller uuid := auth.uid();
begin
  select family_id into fam from family_members where id = p_member;
  if fam is null then raise exception 'Member not found'; end if;
  if caller is null then return fam; end if;  -- service-role / SQL editor
  if p_parent_only then
    if not public.is_family_parent(fam) then
      raise exception 'Only a parent can do that';
    end if;
  else
    if not public.is_family_member(fam) then
      raise exception 'Not a member of this family';
    end if;
  end if;
  return fam;
end;
$$;
revoke execute on function public._require_family_for_member(uuid, boolean) from public;
revoke execute on function public._require_family_for_member(uuid, boolean) from anon;
revoke execute on function public._require_family_for_member(uuid, boolean) from authenticated;

-- redeem_reward: atomically create a redemption and (if approved) debit the
-- balance. A member may request their own redemption; only a parent may
-- create one pre-approved (status='approved'). Returns the new redemption row.
create or replace function public.redeem_reward(
  p_member   uuid,
  p_category text,
  p_amount   integer,
  p_reason   text,
  p_status   text default 'pending_approval'
)
returns redemptions
language plpgsql
security definer set search_path = public as $$
declare
  fam uuid;
  row redemptions;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  fam := public._require_family_for_member(p_member, false);

  -- Only a parent may mint an already-approved redemption (auto-approve under
  -- a threshold is a parent-configured rule, so it's a parent action).
  if p_status = 'approved' and auth.uid() is not null and not public.is_family_parent(fam) then
    raise exception 'Only a parent can approve a redemption';
  end if;
  if p_status not in ('pending_approval', 'approved') then
    raise exception 'invalid status';
  end if;

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

-- set_redemption_status: parent-only approve/reject of a pending redemption.
-- On approve, debits the balance. Idempotent on non-pending rows.
create or replace function public.set_redemption_status(p_id uuid, p_status text)
returns redemptions
language plpgsql
security definer set search_path = public as $$
declare
  r   redemptions;
  fam uuid;
begin
  select * into r from redemptions where id = p_id;
  if r.id is null then raise exception 'Redemption not found'; end if;
  fam := r.family_id;
  if auth.uid() is not null and not public.is_family_parent(fam) then
    raise exception 'Only a parent can change a redemption status';
  end if;
  if r.status <> 'pending_approval' then
    return r;  -- already decided
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid status';
  end if;

  update redemptions
     set status      = p_status::redemption_status,
         approved_by = (select id from family_members
                         where family_id = fam and auth_user_id = auth.uid() limit 1),
         approved_at = now()
   where id = p_id
   returning * into r;

  if p_status = 'approved' then
    perform public._apply_balance_delta(r.member_id, jsonb_build_object(r.category, -r.amount));
  end if;
  return r;
end;
$$;
revoke execute on function public.set_redemption_status(uuid, text) from public;
revoke execute on function public.set_redemption_status(uuid, text) from anon;
grant  execute on function public.set_redemption_status(uuid, text) to authenticated;

-- apply_chore_payout: credit (direction 1) or reverse (direction -1) a chore's
-- payout to a member. Used when a no-approval chore is completed/uncompleted.
-- Any family member may complete their own chore, so this is family-scoped,
-- not parent-only.
create or replace function public.apply_chore_payout(
  p_member uuid, p_payout jsonb, p_direction integer
)
returns void
language plpgsql
security definer set search_path = public as $$
declare
  scaled jsonb := '{}'::jsonb;
  k text; v numeric;
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

-- set_completion_status: parent-only approve/reject of a pending chore
-- completion. On approve, credits the captured payout to the member.
create or replace function public.set_completion_status(p_id uuid, p_status text)
returns chore_completions
language plpgsql
security definer set search_path = public as $$
declare
  c   chore_completions;
  fam uuid;
begin
  select * into c from chore_completions where id = p_id;
  if c.id is null then raise exception 'Completion not found'; end if;
  fam := c.family_id;
  if auth.uid() is not null and not public.is_family_parent(fam) then
    raise exception 'Only a parent can approve or reject a chore';
  end if;
  if c.status <> 'pending_approval' then
    return c;  -- already decided
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid status';
  end if;

  update chore_completions
     set status      = p_status::chore_completion_status,
         approved_by = (select id from family_members
                         where family_id = fam and auth_user_id = auth.uid() limit 1),
         approved_at = now()
   where id = p_id
   returning * into c;

  if p_status = 'approved' then
    perform public.apply_chore_payout(c.member_id, c.payout, 1);
  end if;
  return c;
end;
$$;
revoke execute on function public.set_completion_status(uuid, text) from public;
revoke execute on function public.set_completion_status(uuid, text) from anon;
grant  execute on function public.set_completion_status(uuid, text) to authenticated;

-- Parent-only guard on approval transitions of chore_completions / redemptions
-- via the table policies (defence in depth alongside the RPCs above). A
-- non-parent may INSERT (request a redemption / log a completion) and may only
-- UPDATE rows that keep status unchanged; flipping status or setting
-- approved_by requires a parent. (Balance debits/credits still only happen via
-- the RPCs, since reward_balances writes are blocked by trg_guard_reward_balances.)
create or replace function public.guard_approval_transition()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;  -- service-role / SQL editor
  end if;
  if public.is_family_parent(old.family_id) then
    return new;
  end if;
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

notify pgrst, 'reload schema';
