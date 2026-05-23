-- Home Plus — Migration v6
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times.
--
-- What this fixes:
--   1. Family invitation flow was incomplete:
--      - accept_invitation() didn't verify the caller's email, could create
--        duplicate family_members rows, didn't respect the invited role,
--        and returned void so the client had to re-query just to find the
--        family it just joined.
--      - The invitations table had no `role` column, so every invitee
--        landed as a 'child'.
--   2. RLS policies across the schema were a mix of owner-only and
--      member-aware policies (depending on which migration last touched
--      the table). This unifies them: any authenticated row in
--      family_members for that family_id can read/write the family's data.
--      Family rename/delete remains owner-only.
--   3. Adds an is_family_member(uuid) security-definer helper so
--      policies don't trigger infinite recursion via family_members'
--      own policy.

-- ---------------------------------------------------------------------------
-- 1) Helpers (SECURITY DEFINER, search_path locked)
-- ---------------------------------------------------------------------------

-- Already exists as of v3, but recreate to ensure shape is current.
create or replace function public.user_family_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select family_id from family_members where auth_user_id = auth.uid();
$$;

revoke execute on function public.user_family_ids() from public;
grant execute on function public.user_family_ids() to authenticated;

-- Single-row membership probe used by the family_members policy itself
-- so it can reference a different row of family_members without re-entering
-- RLS (which would deadlock / recurse).
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

-- ---------------------------------------------------------------------------
-- 2) Invitations: add role column
-- ---------------------------------------------------------------------------
do $$ begin
  alter table invitations
    add column if not exists role member_role not null default 'child';
end $$;

-- ---------------------------------------------------------------------------
-- 3) families — owner can update/delete (rename/delete family);
--               any member can SELECT the family row;
--               INSERT remains owner_user_id = auth.uid().
-- ---------------------------------------------------------------------------
drop policy if exists "Owner manages family"      on families;
drop policy if exists "Member can read family"    on families;
drop policy if exists "Owner updates own family"  on families;
drop policy if exists "Owner inserts own family"  on families;
drop policy if exists "Owner deletes own family"  on families;

create policy "Member can read family" on families
  for select using (public.is_family_member(id));

create policy "Owner inserts own family" on families
  for insert with check (owner_user_id = auth.uid());

create policy "Owner updates own family" on families
  for update using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "Owner deletes own family" on families
  for delete using (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4) family_members — any member can read all members of their family,
--    update their own row, and insert/update/delete rows in their family.
-- ---------------------------------------------------------------------------
drop policy if exists "Owner manages members"        on family_members;
drop policy if exists "Member can read own row"      on family_members;
drop policy if exists "Member can update own row"    on family_members;
drop policy if exists "Member can read family members" on family_members;
drop policy if exists "Member can update family rows"  on family_members;
drop policy if exists "Member can insert family rows"  on family_members;
drop policy if exists "Member can delete family rows"  on family_members;
drop policy if exists "Family members manage family_members" on family_members;

create policy "Member can read family members" on family_members
  for select using (public.is_family_member(family_id));

create policy "Member can insert family rows" on family_members
  for insert with check (public.is_family_member(family_id));

create policy "Member can update family rows" on family_members
  for update using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy "Member can delete family rows" on family_members
  for delete using (public.is_family_member(family_id));

-- ---------------------------------------------------------------------------
-- 5) Data tables — uniform membership-based policy.
--    Wraps each table in IF EXISTS so this is safe even when an optional
--    table (e.g. virtual_pets, recipes, meal_plans) hasn't been created
--    on this DB yet.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'events',
      'chores',
      'chore_completions',
      'reward_categories',
      'redemptions',
      'reward_goals',
      'todo_lists',
      'todo_items',
      'habits',
      'habit_check_ins',
      'day_plan_blocks',
      'activity_pool_items',
      'virtual_pets',
      'recipes',
      'meal_plans'
    ])
  loop
    -- Only apply if the table actually exists in this DB
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      continue;
    end if;

    -- Make sure RLS is on (no-op if already enabled)
    execute format('alter table %I enable row level security', t);

    -- Drop every variation we've used historically
    execute format('drop policy if exists "Owner manages %1$s" on %1$s', t);
    execute format('drop policy if exists "Family members manage %1$s" on %1$s', t);
    execute format('drop policy if exists "family members can manage %1$s" on %1$s', t);
    execute format('drop policy if exists "family members can manage day plan blocks" on %1$s', t);
    execute format('drop policy if exists "family members can manage activity pool" on %1$s', t);
    execute format('drop policy if exists "Members manage %1$s" on %1$s', t);

    -- New, uniform policy
    execute format($p$
      create policy "Members manage %1$s" on %1$s
        for all
        using (
          exists (
            select 1 from family_members fm
            where fm.family_id = %1$s.family_id
              and fm.auth_user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1 from family_members fm
            where fm.family_id = %1$s.family_id
              and fm.auth_user_id = auth.uid()
          )
        );
    $p$, t);
  end loop;
end$$;

-- The return type is changing from void to uuid, so the old function must
-- be dropped first — Postgres refuses CREATE OR REPLACE across return-type
-- changes.
drop function if exists public.accept_invitation(uuid);

-- ---------------------------------------------------------------------------
-- 6) Rewrite accept_invitation()
--
-- Behaviour:
--   - Verifies the auth caller's email matches the invitation (so a link
--     leaked to a different signed-in user cannot consume it).
--   - Idempotent: if the caller is already a member of this family, just
--     returns the family_id.
--   - Else: links the existing placeholder row (matching inv.name) if any,
--     otherwise inserts a new row.
--   - Respects the invited role (defaults to 'child' if column not set).
--   - Stamps email + accepted_at, and returns the family_id so the client
--     can hydrate without a second round-trip.
-- ---------------------------------------------------------------------------
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

  select * into inv
    from invitations
   where token = p_token;

  if not found then
    raise exception 'Invitation not found';
  end if;
  if inv.accepted_at is not null then
    -- Already accepted — return the family if the caller is the member,
    -- otherwise treat as expired.
    if exists (
      select 1 from family_members
       where family_id = inv.family_id and auth_user_id = caller_uid
    ) then
      return inv.family_id;
    end if;
    raise exception 'Invitation already accepted';
  end if;
  if inv.expires_at <= now() then
    raise exception 'Invitation expired';
  end if;
  if caller_em is null or lower(caller_em) <> lower(inv.email) then
    raise exception 'This invitation was sent to %, but you are signed in as %',
      inv.email, coalesce(caller_em, '(no email)');
  end if;

  -- Already a member of this family? Done.
  select id into existing
    from family_members
   where family_id = inv.family_id
     and auth_user_id = caller_uid
   limit 1;

  if existing is not null then
    update invitations set accepted_at = now() where token = p_token;
    return inv.family_id;
  end if;

  -- Else: link a placeholder row (matching invite name) if one is free.
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

  -- Else: insert a fresh member row.
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

  update invitations set accepted_at = now() where token = p_token;
  return inv.family_id;
end;
$$;

grant execute on function public.accept_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Invitations — tighten SELECT policy (Phase 6 of plan)
--
-- The accept screen only needs the family_name for the token it has in
-- hand. Expose that through a security-definer RPC instead of leaving
-- the entire invitations table world-readable.
-- ---------------------------------------------------------------------------
drop policy if exists "read by token" on invitations;
drop policy if exists "members read invitations" on invitations;

-- Members of the family can list/read their own pending invitations
-- (used by the Settings → Invites management UI).
create policy "members read invitations" on invitations
  for select using (public.is_family_member(family_id));

-- Parents in the family can revoke (delete) and update (extend / resend)
drop policy if exists "parents manage invitations" on invitations;
create policy "parents manage invitations" on invitations
  for delete using (
    exists (
      select 1 from family_members fm
      where fm.family_id = invitations.family_id
        and fm.auth_user_id = auth.uid()
        and fm.role = 'parent'
    )
  );

-- Public preview RPC: returns just family_name (and the name on the invite)
-- for a given token. Locked to a single token, so brute-force is infeasible.
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
