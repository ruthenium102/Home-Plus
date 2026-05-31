-- Home Plus — Migration v18
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times (idempotent).
--
-- Security/ops hardening for the Google Calendar integration:
--
--  1. google_oauth_states cleanup — each "Connect Google Calendar" click inserts
--     a short-lived CSRF state row. Completed flows delete their row in the
--     callback (one-time use), but abandoned flows leave rows that never expire
--     out of the table. Add a SECURITY DEFINER reaper the API calls
--     opportunistically (and that a cron could call) to delete expired rows.
--
--  2. google_calendar_integrations.channel_token — the secret we set when opening
--     a Google push channel. Google echoes it back as the X-Goog-Channel-Token
--     header on every notification; the /api/google/webhook receiver validates it
--     so a forged push (channel id guessed, token unknown) can't trigger a sync.

-- ── 1. OAuth state cleanup ──────────────────────────────────────────────────

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

-- Service-role (the API admin client) bypasses RLS and grants, but lock the
-- function down anyway: callers go through the service role only.
revoke execute on function public.cleanup_google_oauth_states() from public;
revoke execute on function public.cleanup_google_oauth_states() from anon;
revoke execute on function public.cleanup_google_oauth_states() from authenticated;

-- ── 2. Channel token for push-notification validation ───────────────────────

alter table google_calendar_integrations
  add column if not exists channel_token text;

notify pgrst, 'reload schema';
