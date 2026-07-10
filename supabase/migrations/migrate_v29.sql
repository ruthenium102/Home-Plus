-- v29 — defence-in-depth batch (release-review S4 + S7). Idempotent.

-- ----------------------------------------------------------------------------
-- S7: member/family consistency guard.
-- RLS WITH CHECK validates that a row's family_id belongs to the caller, but
-- not that its member_id FK points INTO that family — a caller could insert a
-- row in their own family referencing a foreign family's member. No
-- cross-family read ever resulted (RLS filters the other side), but reject
-- the inconsistency outright.
-- ----------------------------------------------------------------------------
create or replace function public.guard_member_family()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.member_id is not null and not exists (
    select 1 from family_members fm
     where fm.id = new.member_id and fm.family_id = new.family_id
  ) then
    raise exception 'member_id does not belong to family_id';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'chore_completions', 'redemptions', 'reward_goals', 'habit_check_ins'
  ]
  loop
    execute format('drop trigger if exists trg_guard_member_family on %I', t);
    execute format(
      'create trigger trg_guard_member_family before insert or update on %I
         for each row execute function public.guard_member_family()', t);
  end loop;
end$$;

-- ----------------------------------------------------------------------------
-- S4: shared fixed-window rate limiter for the AI serverless endpoints.
-- The in-process limiter is per-warm-instance; this Postgres counter is the
-- distributed backstop. Reachable ONLY by the service role (the API functions
-- call it through the admin client).
-- ----------------------------------------------------------------------------
create table if not exists rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        integer not null default 0
);
alter table rate_limits enable row level security;
revoke all on table rate_limits from public;
revoke all on table rate_limits from anon;
revoke all on table rate_limits from authenticated;

create or replace function public.check_rate_limit(
  p_key text, p_limit integer, p_window_seconds integer
)
returns boolean language plpgsql security definer set search_path = public as $$
declare allowed boolean;
begin
  insert into rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when rl.window_start < now() - make_interval(secs => p_window_seconds)
                 then 1 else rl.count + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds)
                        then now() else rl.window_start end
  returning rl.count <= p_limit into allowed;
  return allowed;
end;
$$;
revoke execute on function public.check_rate_limit(text, integer, integer) from public;
revoke execute on function public.check_rate_limit(text, integer, integer) from anon;
revoke execute on function public.check_rate_limit(text, integer, integer) from authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
