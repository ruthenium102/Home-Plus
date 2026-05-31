-- dev-only-drop.sql — DESTRUCTIVE. Wipes the entire Home Plus schema clean.
-- Then run schema.sql to recreate everything correctly.
-- CASCADE handles foreign-key dependencies automatically.
--
-- ⚠️  SAFETY GUARD ⚠️
-- This script REFUSES to run unless current_database() is in the dev
-- allow-list below. Supabase prod and local both use the database name
-- "postgres", so name alone cannot distinguish them — the guard therefore
-- defaults to an impossible name and you MUST consciously edit
-- `v_allowed_dbs` to include your actual non-prod database name before this
-- will do anything. If you paste this into a prod SQL editor unedited, it
-- aborts with an exception and changes nothing.

do $$
declare
  -- EDIT ME: list the database name(s) you are SURE are dev/scratch.
  -- Leave the placeholder in to keep the script inert.
  v_allowed_dbs text[] := array['__SET_YOUR_DEV_DB_NAME_HERE__'];
  v_db          text   := current_database();
begin
  if not (v_db = any(v_allowed_dbs)) then
    raise exception
      'dev-only-drop.sql refused to run on database "%". Edit v_allowed_dbs to opt in.', v_db;
  end if;

  -- Order matters only loosely thanks to CASCADE, but we drop dependents first.
  drop table if exists meal_plans                  cascade;
  drop table if exists recipes                     cascade;
  drop table if exists google_oauth_states         cascade;
  drop table if exists google_calendar_integrations cascade;
  drop table if exists invitations                 cascade;
  drop table if exists activity_pool_items         cascade;
  drop table if exists day_plan_blocks             cascade;
  drop table if exists redemptions                 cascade;
  drop table if exists reward_goals                cascade;
  drop table if exists reward_categories           cascade;
  drop table if exists habit_check_ins             cascade;
  drop table if exists habits                      cascade;
  drop table if exists todo_items                  cascade;
  drop table if exists todo_lists                  cascade;
  drop table if exists chore_completions           cascade;
  drop table if exists chores                      cascade;
  drop table if exists events                      cascade;
  drop table if exists member_pins                 cascade;
  drop table if exists family_members              cascade;
  drop table if exists families                    cascade;

  drop type if exists member_role             cascade;
  drop type if exists member_color            cascade;
  drop type if exists event_category          cascade;
  drop type if exists chore_frequency         cascade;
  drop type if exists chore_completion_status cascade;
  drop type if exists redemption_status       cascade;
  drop type if exists list_item_repeat        cascade;
  drop type if exists habit_cadence           cascade;
  drop type if exists habit_visibility        cascade;

  drop function if exists set_member_pin(uuid, text)    cascade;
  drop function if exists verify_member_pin(uuid, text) cascade;
  drop function if exists accept_invitation(uuid)       cascade;
end$$;
