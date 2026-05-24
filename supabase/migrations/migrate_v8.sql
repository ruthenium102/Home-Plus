-- Home Plus — Migration v8
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times.
--
-- Adds the invitations table to the supabase_realtime publication so the
-- Settings → Pending invitations UI can subscribe to INSERT / UPDATE /
-- DELETE events and stay in sync without a manual Refresh button.

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table invitations';
  exception when others then
    -- Already a member of the publication, or publication missing — no-op.
    null;
  end;
end$$;
