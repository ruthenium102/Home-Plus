-- v26 — client error telemetry (release-review R7)
-- Uncaught client errors are written here by src/lib/errorReporting.ts so
-- production crashes are visible without an external service. Write-only from
-- clients: INSERT for authenticated users on their own auth id; no
-- SELECT/UPDATE/DELETE policies — read via the dashboard / service role.
-- Idempotent.

create table if not exists client_errors (
  id            uuid primary key default uuid_generate_v4(),
  auth_user_id  uuid not null,
  message       text not null,
  stack         text,
  source        text,
  app_version   text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_client_errors_created on client_errors(created_at desc);

alter table client_errors enable row level security;
drop policy if exists "Authenticated report own errors" on client_errors;
create policy "Authenticated report own errors" on client_errors
  for insert to authenticated with check (auth_user_id = auth.uid());
