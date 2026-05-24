-- Home Plus — Migration v9
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times.
--
-- Adds Google Calendar 2-way sync (parents only):
--   * google_calendar_integrations  — one row per connected parent (holds
--     refresh token, the dedicated "Home Plus" Google calendar id, watch
--     channel state, sync token). Owner-only RLS so other family members
--     never see another parent's tokens.
--   * google_oauth_states           — short-lived CSRF state for the OAuth
--     redirect flow.
--   * event_google_sync             — join table mapping a Home Plus event
--     to its mirror google_event_id on each connected parent's calendar
--     (one Home Plus event → N Google copies, one per parent).
--   * events.sync_to_google         — per-event opt-out toggle.
--   * get_family_google_integrations(p_family_id) — SECURITY DEFINER RPC
--     that returns safe connection-summary fields (member, email,
--     connected_at, last_synced_at) without exposing tokens.

-- ----------------------------------------------------------------------------
-- 1) google_calendar_integrations
-- ----------------------------------------------------------------------------
create table if not exists google_calendar_integrations (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  family_member_id uuid not null references family_members(id) on delete cascade,
  google_account_email text not null,
  google_calendar_id text not null,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  sync_token text,
  channel_id text,
  channel_resource_id text,
  channel_expires_at timestamptz,
  last_synced_at timestamptz,
  last_sync_error text,
  connected_at timestamptz not null default now(),
  unique (family_member_id)
);

create index if not exists idx_gci_family on google_calendar_integrations(family_id);
create index if not exists idx_gci_channel on google_calendar_integrations(channel_id) where channel_id is not null;

-- Enforce parent-only at the DB layer (RLS handles the auth side, this is a
-- defense-in-depth check against rogue server inserts).
create or replace function public.gci_require_parent()
returns trigger
language plpgsql
as $$
declare r member_role;
begin
  select role into r from family_members where id = NEW.family_member_id;
  if r is null then
    raise exception 'family_member_id does not exist';
  end if;
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

-- The owning parent can manage their own integration row (read tokens, update,
-- delete). Other family members CANNOT read this row at all — they go through
-- the get_family_google_integrations() RPC for safe summary fields.
drop policy if exists "owner reads own gci"   on google_calendar_integrations;
drop policy if exists "owner inserts own gci" on google_calendar_integrations;
drop policy if exists "owner updates own gci" on google_calendar_integrations;
drop policy if exists "owner deletes own gci" on google_calendar_integrations;
create policy "owner reads own gci" on google_calendar_integrations
  for select using (
    exists (
      select 1 from family_members fm
      where fm.id = google_calendar_integrations.family_member_id
        and fm.auth_user_id = auth.uid()
    )
  );
create policy "owner inserts own gci" on google_calendar_integrations
  for insert with check (
    exists (
      select 1 from family_members fm
      where fm.id = google_calendar_integrations.family_member_id
        and fm.auth_user_id = auth.uid()
        and fm.role = 'parent'
    )
  );
create policy "owner updates own gci" on google_calendar_integrations
  for update using (
    exists (
      select 1 from family_members fm
      where fm.id = google_calendar_integrations.family_member_id
        and fm.auth_user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from family_members fm
      where fm.id = google_calendar_integrations.family_member_id
        and fm.auth_user_id = auth.uid()
    )
  );
create policy "owner deletes own gci" on google_calendar_integrations
  for delete using (
    exists (
      select 1 from family_members fm
      where fm.id = google_calendar_integrations.family_member_id
        and fm.auth_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 2) google_oauth_states (CSRF protection for the OAuth redirect)
-- ----------------------------------------------------------------------------
create table if not exists google_oauth_states (
  state text primary key,
  family_member_id uuid not null references family_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);

create index if not exists idx_google_oauth_states_expiry on google_oauth_states(expires_at);

alter table google_oauth_states enable row level security;
-- No RLS policies → only service_role can read/write. The OAuth flow runs
-- exclusively through serverless endpoints using the service role key.

-- ----------------------------------------------------------------------------
-- 3) event_google_sync — per-parent mirror of each Home Plus event
-- ----------------------------------------------------------------------------
create table if not exists event_google_sync (
  event_id uuid not null references events(id) on delete cascade,
  integration_id uuid not null references google_calendar_integrations(id) on delete cascade,
  google_event_id text not null,
  last_synced_at timestamptz not null default now(),
  primary key (event_id, integration_id)
);

create index if not exists idx_egs_integration_event on event_google_sync(integration_id, google_event_id);

alter table event_google_sync enable row level security;

-- Family members of the event's family can read the sync rows (so the UI can
-- show "synced to Google" badges). Writes are service-role only.
drop policy if exists "members read event_google_sync" on event_google_sync;
create policy "members read event_google_sync" on event_google_sync
  for select using (
    exists (
      select 1
        from events e
        join family_members fm on fm.family_id = e.family_id
       where e.id = event_google_sync.event_id
         and fm.auth_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 4) events.sync_to_google — per-event opt-out
-- ----------------------------------------------------------------------------
do $$ begin
  alter table events
    add column if not exists sync_to_google boolean not null default true;
end $$;

-- ----------------------------------------------------------------------------
-- 5) Safe summary RPC — read connection status across the family without
--    leaking refresh tokens. Returns one row per connected parent.
-- ----------------------------------------------------------------------------
create or replace function public.get_family_google_integrations(p_family_id uuid)
returns table (
  family_member_id uuid,
  member_name text,
  google_account_email text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_sync_error text
)
language sql stable security definer set search_path = public as $$
  select gci.family_member_id,
         fm.name,
         gci.google_account_email,
         gci.connected_at,
         gci.last_synced_at,
         gci.last_sync_error
    from google_calendar_integrations gci
    join family_members fm on fm.id = gci.family_member_id
   where gci.family_id = p_family_id
     and public.is_family_member(p_family_id);
$$;
revoke execute on function public.get_family_google_integrations(uuid) from public;
grant execute on function public.get_family_google_integrations(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) Realtime — surface integration changes to all of the family's devices
--    so disconnecting on one device immediately updates the Settings UI on
--    the others. event_google_sync is broadcast too so sync badges appear
--    without a refresh.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array[
    'google_calendar_integrations',
    'event_google_sync'
  ])
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when others then null;
    end;
  end loop;
end$$;
