-- Live authorization, separate from JWT claims and tenant memberships.
create table private.evaluation_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  manager_id uuid not null references auth.users(id) on delete restrict,
  label text not null check (length(label) between 1 and 100),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  check (user_id <> manager_id)
);
alter table private.evaluation_access enable row level security;
create index evaluation_access_manager_idx on private.evaluation_access(manager_id);
revoke all on private.evaluation_access from public, anon, authenticated;
grant all on private.evaluation_access to service_role;

-- Definer is necessary only for this private lookup; callers cannot choose an identity.
create function private.current_account_access()
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and coalesce(
    (select enabled from private.evaluation_access where user_id = (select auth.uid())), true
  );
$$;
revoke all on function private.current_account_access() from public, anon;
grant execute on function private.current_account_access() to authenticated;

create function public.current_account_access()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.current_account_access(); $$;
revoke all on function public.current_account_access() from public, anon;
grant execute on function public.current_account_access() to authenticated;

create function private.managed_evaluators()
returns table(user_id uuid, email text, label text, enabled boolean, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select e.user_id, u.email::text, e.label, e.enabled, e.updated_at
  from private.evaluation_access e join auth.users u on u.id = e.user_id
  where e.manager_id = (select auth.uid()) and private.current_account_access();
$$;
revoke all on function private.managed_evaluators() from public, anon;
grant execute on function private.managed_evaluators() to authenticated;

create function public.managed_evaluators()
returns table(user_id uuid, email text, label text, enabled boolean, updated_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.managed_evaluators(); $$;
revoke all on function public.managed_evaluators() from public, anon;
grant execute on function public.managed_evaluators() to authenticated;

create function private.set_evaluator_access(target_user uuid, access_enabled boolean)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.current_account_access() or access_enabled is null then
    raise insufficient_privilege using message = 'Acesso negado';
  end if;
  update private.evaluation_access set enabled = access_enabled, updated_at = now()
  where user_id = target_user and manager_id = (select auth.uid());
  if not found then raise insufficient_privilege using message = 'Acesso negado'; end if;
  return access_enabled;
end;
$$;
revoke all on function private.set_evaluator_access(uuid, boolean) from public, anon;
grant execute on function private.set_evaluator_access(uuid, boolean) to authenticated;

create function public.set_evaluator_access(target_user uuid, access_enabled boolean)
returns boolean language sql security invoker set search_path = ''
as $$ select private.set_evaluator_access(target_user, access_enabled); $$;
revoke all on function public.set_evaluator_access(uuid, boolean) from public, anon;
grant execute on function public.set_evaluator_access(uuid, boolean) to authenticated;

-- A restrictive policy ANDs with existing tenant/ownership policies. Service jobs are unchanged.
-- Apply to the complete current exposed RLS surface, including catalog and write tables.
do $$
declare target record;
begin
  for target in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
  loop
    execute format('create policy evaluation_access_required on public.%I as restrictive for all to authenticated using ((select private.current_account_access())) with check ((select private.current_account_access()))', target.relname);
  end loop;
end;
$$;

comment on table private.evaluation_access is 'Operator-provisioned evaluation accounts. Only the assigned manager can toggle access through guarded RPCs. Never delete a row to revoke access: set enabled=false.';
