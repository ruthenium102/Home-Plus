-- Run this ONCE in the Supabase SQL editor to wipe the schema clean.
-- Then run schema.sql to recreate everything correctly.
-- CASCADE handles foreign-key dependencies automatically.

drop table if exists invitations           cascade;
drop table if exists activity_pool_items   cascade;
drop table if exists day_plan_blocks       cascade;
drop table if exists redemptions           cascade;
drop table if exists reward_goals          cascade;
drop table if exists reward_categories     cascade;
drop table if exists habit_check_ins       cascade;
drop table if exists habits                cascade;
drop table if exists todo_items            cascade;
drop table if exists todo_lists            cascade;
drop table if exists chore_completions     cascade;
drop table if exists chores                cascade;
drop table if exists events                cascade;
drop table if exists family_members        cascade;
drop table if exists families              cascade;

drop type if exists member_role            cascade;
drop type if exists member_color           cascade;
drop type if exists event_category         cascade;
drop type if exists chore_frequency        cascade;
drop type if exists chore_completion_status cascade;
drop type if exists redemption_status      cascade;
drop type if exists list_item_repeat       cascade;
drop type if exists habit_cadence          cascade;
drop type if exists habit_visibility       cascade;

drop function if exists set_member_pin(uuid, text)     cascade;
drop function if exists verify_member_pin(uuid, text)  cascade;
drop function if exists accept_invitation(uuid)        cascade;
