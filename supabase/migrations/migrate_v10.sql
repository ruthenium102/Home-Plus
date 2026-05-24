-- Home Plus — Migration v10
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times.
--
-- Simplifies the v9 Google Calendar integration to one connection per
-- family (instead of one per parent). The Google account can be a shared
-- family Gmail and doesn't need to match any parent's email.
--
-- Schema changes:
--   * google_calendar_integrations: unique on family_id (was family_member_id);
--     family_member_id renamed to connected_by_member_id (still required to
--     be a parent so RLS can enforce who clicks Connect).
--   * event_google_sync join table is removed — each Home Plus event now
--     has a single events.google_event_id text column.
--   * RLS: any family member can READ the connection status; only parents
--     can INSERT/UPDATE/DELETE.
--   * get_family_google_integrations now returns at most one row per family.

-- ----------------------------------------------------------------------------
-- 1) Drop v9 join table + recreate google_calendar_integrations with new shape
-- ----------------------------------------------------------------------------
drop table if exists event_google_sync cascade;
drop table if exists google_calendar_integrations cascade;
drop function if exists public.gci_require_parent() cascade;
drop function if exists public.get_family_google_integrations(uuid) cascade;

create table google_calendar_integrations (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references families(id) on delete cascade,
  connected_by_member_id uuid not null references family_members(id) on delete restrict,
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
  unique (family_id)
);

create index if not exists idx_gci_channel
  on google_calendar_integrations(channel_id) where channel_id is not null;

-- Defense-in-depth: only parents can be recorded as the connector.
create or replace function public.gci_require_parent()
returns trigger language plpgsql as $$
declare r member_role;
begin
  select role into r from family_members where id = NEW.connected_by_member_id;
  if r is null then raise exception 'connected_by_member_id does not exist'; end if;
  if r <> 'parent' then
    raise exception 'Only parents can connect Google Calendar (member role = %)', r;
  end if;
  return NEW;
end;
$$;

create trigger trg_gci_require_parent
  before insert or update on google_calendar_integrations
  for each row execute function public.gci_require_parent();

alter table google_calendar_integrations enable row level security;

-- Any family member can see whether their family is connected (and the
-- google account email, last sync time). Only parents can write.
create policy "members read gci" on google_calendar_integrations
  for select using (public.is_family_member(family_id));

create policy "parents insert gci" on google_calendar_integrations
  for insert with check (
    exists (
      select 1 from family_members fm
      where fm.family_id = google_calendar_integrations.family_id
        and fm.auth_user_id = auth.uid()
        and fm.role = 'parent'
    )
  );

create policy "parents update gci" on google_calendar_integrations
  for update using (
    exists (
      select 1 from family_members fm
      where fm.family_id = google_calendar_integrations.family_id
        and fm.auth_user_id = auth.uid()
        and fm.role = 'parent'
    )
  ) with check (
    exists (
      select 1 from family_members fm
      where fm.family_id = google_calendar_integrations.family_id
        and fm.auth_user_id = auth.uid()
        and fm.role = 'parent'
    )
  );

create policy "parents delete gci" on google_calendar_integrations
  for delete using (
    exists (
      select 1 from family_members fm
      where fm.family_id = google_calendar_integrations.family_id
        and fm.auth_user_id = auth.uid()
        and fm.role = 'parent'
    )
  );

-- ----------------------------------------------------------------------------
-- 2) Per-event Google id (replaces the v9 event_google_sync join table)
-- ----------------------------------------------------------------------------
do $$ begin
  alter table events
    add column if not exists google_event_id text;
end $$;

create index if not exists idx_events_google_event_id
  on events(google_event_id) where google_event_id is not null;

-- ----------------------------------------------------------------------------
-- 3) Safe summary RPC — returns 0 or 1 row.
-- ----------------------------------------------------------------------------
create or replace function public.get_family_google_integration(p_family_id uuid)
returns table (
  google_account_email text,
  connected_by_name text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_sync_error text
)
language sql stable security definer set search_path = public as $$
  select gci.google_account_email,
         fm.name,
         gci.connected_at,
         gci.last_synced_at,
         gci.last_sync_error
    from google_calendar_integrations gci
    join family_members fm on fm.id = gci.connected_by_member_id
   where gci.family_id = p_family_id
     and public.is_family_member(p_family_id);
$$;
revoke execute on function public.get_family_google_integration(uuid) from public;
grant execute on function public.get_family_google_integration(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Realtime
-- ----------------------------------------------------------------------------
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table google_calendar_integrations';
  exception when others then null;
  end;
end$$;
