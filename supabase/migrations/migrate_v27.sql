-- v27 — RLS read-path performance + advisor hardening (release-review A4)
--
-- The data-table policies inlined `exists (select 1 from family_members …)`
-- membership subqueries, which Postgres can re-evaluate per candidate row on
-- the hot bulk-load path. The STABLE SECURITY DEFINER helpers
-- is_family_member() / is_family_parent() already exist and are used on the
-- newer tables — this swaps every remaining inline subquery to the helpers
-- (identical semantics, initplan-cacheable). Also sets search_path on the two
-- trigger functions the Supabase linter flagged. Idempotent.

-- Membership-scoped tables ("Members manage <t>" policy family)
do $$
declare t text;
begin
  foreach t in array array[
    'events', 'reward_categories', 'chores', 'chore_completions',
    'redemptions', 'reward_goals', 'todo_lists', 'todo_items',
    'habits', 'habit_check_ins'
  ]
  loop
    execute format('drop policy if exists "Members manage %1$s" on %1$s', t);
    execute format($p$
      create policy "Members manage %1$s" on %1$s for all
        using (public.is_family_member(family_id))
        with check (public.is_family_member(family_id));
    $p$, t);
  end loop;
end$$;

drop policy if exists "family members can manage day plan blocks" on day_plan_blocks;
create policy "family members can manage day plan blocks" on day_plan_blocks
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

drop policy if exists "family members can manage activity pool" on activity_pool_items;
create policy "family members can manage activity pool" on activity_pool_items
  for all using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

drop policy if exists "members read invitations" on invitations;
create policy "members read invitations" on invitations
  for select using (public.is_family_member(family_id));

drop policy if exists "parents can insert invitations" on invitations;
create policy "parents can insert invitations" on invitations
  for insert with check (public.is_family_parent(family_id));

drop policy if exists "parents manage invitations" on invitations;
create policy "parents manage invitations" on invitations
  for delete using (public.is_family_parent(family_id));

drop policy if exists "parents insert gci" on google_calendar_integrations;
create policy "parents insert gci" on google_calendar_integrations
  for insert with check (public.is_family_parent(family_id));

drop policy if exists "parents update gci" on google_calendar_integrations;
create policy "parents update gci" on google_calendar_integrations
  for update using (public.is_family_parent(family_id))
  with check (public.is_family_parent(family_id));

drop policy if exists "parents delete gci" on google_calendar_integrations;
create policy "parents delete gci" on google_calendar_integrations
  for delete using (public.is_family_parent(family_id));

-- Supabase linter: role-mutable search_path on trigger functions.
alter function public.touch_updated_at() set search_path = public;
alter function public.gci_require_parent() set search_path = public;
