-- Home Plus — Migration v5
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times.

-- 1) Add 'wfh' to the event_category enum.
--    The app has supported a WFH category in code for a while, but the
--    enum on the production DB was never extended. dbUpsert('events', ...)
--    with category='wfh' was silently rejected by PostgREST (logged to
--    console only), so the optimistic update would hold for a moment then
--    be reverted by the next realtime/poll sync — appearing to the user
--    as "the WFH tag keeps getting lost".
do $$
begin
  alter type event_category add value if not exists 'wfh';
exception when others then null;
end $$;

-- 2) Add a per-event colour override.
--    Null = derive colour from member (existing behaviour). Otherwise a
--    MemberColor key (e.g. 'terracotta', 'sage') chosen in the editor.
alter table events
  add column if not exists color text;

-- 3) Add comparison operator to habits' daily target.
--    Null/missing defaults to 'gte' in code (at least N). Lets users author
--    habits like "screen time ≤ 30 min" (lte) or "exactly 1 walk" (eq).
alter table habits
  add column if not exists target_op text
  check (target_op in ('lte','eq','gte'));
