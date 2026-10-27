alter table private.evaluation_access add column last_access_at timestamptz;
comment on column private.evaluation_access.last_access_at is 'Last authenticated evaluator navigation, server clock, at most one write per minute. Not a measure of time spent or online presence.';

-- Same live access check as before, with a throttled self-only timestamp write.
-- No identity or timestamp can be supplied by the caller.
create function private.record_evaluator_access()
returns boolean language plpgsql security definer set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null or not private.current_account_access() then return false; end if;
  update private.evaluation_access
  set last_access_at = statement_timestamp()
  where user_id = caller and enabled
    and (last_access_at is null or last_access_at < statement_timestamp() - interval '1 minute');
  return true;
end;
$$;
revoke all on function private.record_evaluator_access() from public, anon;
grant execute on function private.record_evaluator_access() to authenticated;

create function public.record_evaluator_access()
returns boolean language sql security invoker set search_path = ''
as $$ select private.record_evaluator_access(); $$;
revoke all on function public.record_evaluator_access() from public, anon;
grant execute on function public.record_evaluator_access() to authenticated;

-- Keep managed_evaluators() unchanged for compatibility with deployed clients.
create function private.managed_evaluator_activity()
returns table(user_id uuid, email text, label text, enabled boolean, last_access_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.user_id, u.email::text, e.label, e.enabled, e.last_access_at, u.last_sign_in_at
  from private.evaluation_access e join auth.users u on u.id = e.user_id
  where e.manager_id = (select auth.uid()) and private.current_account_access();
$$;
revoke all on function private.managed_evaluator_activity() from public, anon;
grant execute on function private.managed_evaluator_activity() to authenticated;

create function public.managed_evaluator_activity()
returns table(user_id uuid, email text, label text, enabled boolean, last_access_at timestamptz, last_sign_in_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.managed_evaluator_activity(); $$;
revoke all on function public.managed_evaluator_activity() from public, anon;
grant execute on function public.managed_evaluator_activity() to authenticated;
