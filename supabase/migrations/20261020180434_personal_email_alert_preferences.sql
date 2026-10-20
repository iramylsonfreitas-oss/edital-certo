-- Preferences belong to the recipient, not every editor of their organization.
alter table public.alerts
  add column recipient_user_id uuid references auth.users(id) on delete cascade,
  add column email_consent_at timestamptz;
alter table public.alerts alter column recipient_user_id set default auth.uid();

-- Pausing remains possible after a subscription downgrade.
create or replace function private.enforce_alert_features()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare plan_features jsonb;
begin
  if not new.is_enabled then return new; end if;
  select p.features into plan_features
  from public.subscriptions s join public.plans p on p.id=s.plan_id
  where s.organization_id=new.organization_id and s.status in ('active','trialing') and p.is_active
  order by s.created_at desc limit 1;
  if plan_features is null then
    select p.features into plan_features from public.plans p where p.plan_key='free' and p.is_active limit 1;
  end if;
  if new.frequency='immediate' and not coalesce((plan_features->>'immediate_alerts')::boolean,false) then
    raise exception 'PLAN_IMMEDIATE_ALERTS_NOT_INCLUDED' using errcode='23514';
  end if;
  if new.telegram_enabled and not coalesce((plan_features->>'telegram_alerts')::boolean,false) then
    raise exception 'PLAN_TELEGRAM_ALERTS_NOT_INCLUDED' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger alert_features_enforced on public.alerts;
create trigger alert_features_enforced before insert or update of frequency,telegram_enabled,organization_id,is_enabled on public.alerts
for each row execute function private.enforce_alert_features();

-- Never guess a recipient or consent for legacy organization-wide rows.
update public.alerts set is_enabled=false, email_enabled=false, email_consent_at=null
where recipient_user_id is null;
alter table public.alerts alter column email_enabled set default false;
alter table public.alerts add constraint alerts_email_consent_required
  check (not email_enabled or (recipient_user_id is not null and email_consent_at is not null));

create index alerts_recipient_created_idx on public.alerts(recipient_user_id,created_at);
create unique index alerts_personal_settings_unique on public.alerts
  (recipient_user_id,organization_id,(coalesce(profile_id,'00000000-0000-0000-0000-000000000000'::uuid)),frequency,minimum_score,timezone,daily_send_time)
  where recipient_user_id is not null;

create function private.guard_personal_alert()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  if new.recipient_user_id is null then
    raise exception 'ALERT_RECIPIENT_REQUIRED' using errcode='23514';
  end if;
  if tg_op='UPDATE' and (new.recipient_user_id is distinct from old.recipient_user_id or new.organization_id is distinct from old.organization_id) then
    raise exception 'ALERT_RECIPIENT_IMMUTABLE' using errcode='23514';
  end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then
    raise exception 'ALERT_TIMEZONE_INVALID' using errcode='23514';
  end if;
  if extract(second from new.daily_send_time)<>0 then
    raise exception 'ALERT_TIME_REQUIRES_MINUTE_PRECISION' using errcode='23514';
  end if;
  -- Clients cannot backdate consent or change its timestamp on pause/resume.
  if not new.email_enabled then
    new.email_consent_at:=null;
  elsif tg_op='INSERT' then
    new.email_consent_at:=statement_timestamp();
  elsif not old.email_enabled then
    new.email_consent_at:=statement_timestamp();
  else
    new.email_consent_at:=old.email_consent_at;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_personal_alert() from public,anon,authenticated;
create trigger personal_alert_guard before insert or update on public.alerts
for each row execute function private.guard_personal_alert();

drop policy alerts_read_member on public.alerts;
drop policy alerts_insert_editor on public.alerts;
drop policy alerts_update_editor on public.alerts;
drop policy alerts_delete_editor on public.alerts;
create policy alerts_read_recipient on public.alerts for select to authenticated
using (recipient_user_id=(select auth.uid()) and (select private.has_org_role(organization_id)));
create policy alerts_insert_recipient on public.alerts for insert to authenticated
with check (recipient_user_id=(select auth.uid()) and (select private.has_org_role(organization_id,array['admin','analyst']::public.organization_role[])));
create policy alerts_update_recipient on public.alerts for update to authenticated
using (recipient_user_id=(select auth.uid()) and (select private.has_org_role(organization_id)))
with check (recipient_user_id=(select auth.uid()) and (select private.has_org_role(organization_id)));
create policy alerts_delete_recipient on public.alerts for delete to authenticated
using (recipient_user_id=(select auth.uid()) and (select private.has_org_role(organization_id)));

-- A future delivery history must follow the same recipient boundary.
drop policy alert_deliveries_read_member on public.alert_deliveries;
create policy alert_deliveries_read_recipient on public.alert_deliveries for select to authenticated
using (exists(select 1 from public.alerts a where a.id=alert_deliveries.alert_id and a.organization_id=alert_deliveries.organization_id));
