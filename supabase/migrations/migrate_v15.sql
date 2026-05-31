-- Home Plus — Migration v15
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times (idempotent).
--
-- L3 / R5 — In-app account deletion (Apple Guideline 5.1.1(v)).
--
-- Adds a single SECURITY DEFINER RPC, public.delete_account(), that performs
-- the entire data cascade for the *calling* user in one transaction, so the
-- /api/account/delete route can run the data deletion atomically and only then
-- delete the auth.users row via the admin API. Deriving the user id from
-- auth.uid() inside the function means a caller can only ever delete THEIR OWN
-- account — the route passes no user id into the RPC.
--
-- Deletion semantics (mirrors the comment in api/account/delete.js):
--   For every family the caller belongs to (via family_members.auth_user_id):
--     • If the caller is the family OWNER (families.owner_user_id = caller)
--       OR the SOLE remaining parent of that family, the whole `families` row
--       is deleted. Every child table FKs families(id) ON DELETE CASCADE, so
--       all of that family's data (members, events, chores, completions,
--       redemptions, lists, items, habits, check-ins, day plans, activity
--       pool, recipes, meal plans, reward categories/goals, invitations,
--       google integration + oauth states, member_pins) cascades away. This is
--       the "delete my data" requirement.
--     • Otherwise (the caller is one of several parents, or a child), only the
--       caller's own family_members row(s) in that family are deleted. That
--       cascades their member_pins and google_oauth_states and nulls out their
--       created_by / approved_by / assigned_to references, leaving the shared
--       family intact for the others.
--
-- The auth.users row itself is NOT deleted here — supabase-js admin.deleteUser
-- does that from the route once this RPC returns successfully. (Deleting
-- auth.users from SQL is possible but the admin API is the supported path and
-- keeps the GoTrue side — refresh tokens, identities — consistent.)

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

  -- Iterate every family the caller is a member of.
  for fam in
    select distinct family_id
      from family_members
     where auth_user_id = caller
  loop
    select (f.owner_user_id = caller)
      into is_owner
      from families f
     where f.id = fam;

    -- Number of parent members in this family that are NOT the caller.
    select count(*)
      into parent_count
      from family_members fm
     where fm.family_id = fam
       and fm.role = 'parent'
       and fm.auth_user_id is distinct from caller;

    if coalesce(is_owner, false) or parent_count = 0 then
      -- Caller owns the family or is its sole parent → tear the whole family
      -- down. ON DELETE CASCADE on families(id) removes all child rows.
      delete from families where id = fam;
    else
      -- Shared family with other parents → just remove the caller's own
      -- membership row(s). member_pins / google_oauth_states cascade from
      -- family_members(id); created_by / approved_by / assigned_to FKs are
      -- ON DELETE SET NULL so shared history is preserved.
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

notify pgrst, 'reload schema';
