-- Development only. No emails or permanent records. Run after the migration.
begin;
do $$
declare actor uuid:=extensions.gen_random_uuid(); colleague uuid:=extensions.gen_random_uuid(); outsider uuid:=extensions.gen_random_uuid(); org uuid; other_org uuid;
begin
  insert into auth.users(id) values(actor),(colleague),(outsider);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  insert into public.organizations(name,slug,created_by) values('Alert test','alert-'||actor,actor) returning id into org;
  update public.subscriptions set plan_id=(select id from public.plans where plan_key='pro') where organization_id=org;
  insert into public.memberships(organization_id,user_id,role) values(org,colleague,'analyst');
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  insert into public.organizations(name,slug,created_by) values('Other alert test','alert-'||outsider,outsider) returning id into other_org;
  perform set_config('test.alert.actor',actor::text,true);
  perform set_config('test.alert.colleague',colleague::text,true);
  perform set_config('test.alert.outsider',outsider::text,true);
  perform set_config('test.alert.org',org::text,true);
  perform set_config('test.alert.other_org',other_org::text,true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
end $$;
set local role authenticated;
do $$
declare alert uuid; consent timestamptz; org uuid:=current_setting('test.alert.org')::uuid;
begin
  insert into public.alerts(organization_id,email_enabled,email_consent_at,timezone) values(org,true,'2000-01-01','America/Boa_Vista') returning id,email_consent_at into alert,consent;
  if not exists(select 1 from public.alerts where id=alert and recipient_user_id=auth.uid()) then raise exception 'RECIPIENT_DEFAULT_FAILED'; end if;
  if consent<'2026-01-01' then raise exception 'FORGED_CONSENT_ACCEPTED'; end if;
  perform set_config('test.alert.id',alert::text,true);
  update public.alerts set is_enabled=false,email_consent_at='2000-01-01' where id=alert;
  update public.alerts set is_enabled=true where id=alert;
  if (select email_consent_at from public.alerts where id=alert) is distinct from consent then raise exception 'PAUSE_CHANGED_CONSENT'; end if;
  update public.alerts set email_enabled=false where id=alert;
  if (select email_consent_at from public.alerts where id=alert) is not null then raise exception 'WITHDRAWAL_KEPT_CONSENT'; end if;
  update public.alerts set email_enabled=true,email_consent_at='2000-01-01' where id=alert;
  if (select email_consent_at from public.alerts where id=alert)<'2026-01-01' then raise exception 'RECONSENT_FORGED'; end if;
  begin
    insert into public.alerts(organization_id,email_enabled,timezone) values(org,true,'America/Boa_Vista');
    raise exception 'DUPLICATE_ALLOWED';
  exception when unique_violation then null; end;
  begin
    update public.alerts set recipient_user_id=current_setting('test.alert.colleague')::uuid where id=alert;
    raise exception 'REDIRECT_ALLOWED';
  exception when check_violation then null; end;
  begin
    insert into public.alerts(organization_id,recipient_user_id,email_enabled) values(org,current_setting('test.alert.colleague')::uuid,true);
    raise exception 'OTHER_RECIPIENT_INSERT_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.alerts(organization_id,email_enabled,timezone) values(org,true,'Invented/Zone');
    raise exception 'INVALID_TIMEZONE_ALLOWED';
  exception when check_violation then null; end;
  begin
    insert into public.alerts(organization_id,email_enabled,daily_send_time) values(org,true,'08:00:01');
    raise exception 'SECOND_PRECISION_ALLOWED';
  exception when check_violation then null; end;
end $$;
reset role;
-- Create history to test isolation within the SAME organization.
do $$
declare profile uuid; tender uuid; match uuid; org uuid:=current_setting('test.alert.org')::uuid;
begin
  insert into public.interest_profiles(organization_id,created_by,name,segment_key) values(org,current_setting('test.alert.actor')::uuid,'Alert test','it') returning id into profile;
  insert into public.tenders(source_key,source_id,title,object) values('alert-test',profile::text,'Teste','Teste') returning id into tender;
  insert into public.matches(organization_id,profile_id,tender_id,score) values(org,profile,tender,100) returning id into match;
  insert into public.alert_deliveries(organization_id,alert_id,match_id,channel) values(org,current_setting('test.alert.id')::uuid,match,'email');
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.alert.colleague'),true);
set local role authenticated;
do $$
declare n integer;
begin
  if exists(select 1 from public.alerts where id=current_setting('test.alert.id')::uuid) then raise exception 'COLLEAGUE_READ_ALERT'; end if;
  if exists(select 1 from public.alert_deliveries where alert_id=current_setting('test.alert.id')::uuid) then raise exception 'COLLEAGUE_READ_DELIVERY'; end if;
  update public.alerts set is_enabled=false where id=current_setting('test.alert.id')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'COLLEAGUE_CHANGED_ALERT'; end if;
  delete from public.alerts where id=current_setting('test.alert.id')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'COLLEAGUE_DELETED_ALERT'; end if;
  -- A second person can choose identical settings for their own email.
  insert into public.alerts(organization_id,email_enabled,timezone) values(current_setting('test.alert.org')::uuid,true,'America/Boa_Vista');
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.alert.outsider'),true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.alerts where id=current_setting('test.alert.id')::uuid) then raise exception 'CROSS_ORG_READ'; end if;
  begin
    insert into public.alerts(organization_id,email_enabled) values(current_setting('test.alert.org')::uuid,true);
    raise exception 'CROSS_ORG_INSERT';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Downgrades must never prevent someone from pausing or deleting consent.
update public.subscriptions set plan_id=(select id from public.plans where plan_key='pro') where organization_id=current_setting('test.alert.org')::uuid;
select set_config('request.jwt.claim.sub',current_setting('test.alert.actor'),true);
set local role authenticated;
update public.alerts set frequency='immediate',minimum_score=80 where id=current_setting('test.alert.id')::uuid;
reset role;
update public.subscriptions set plan_id=(select id from public.plans where plan_key='free') where organization_id=current_setting('test.alert.org')::uuid;
update public.memberships set role='reader' where organization_id=current_setting('test.alert.org')::uuid and user_id=current_setting('test.alert.actor')::uuid;
set local role authenticated;
do $$
declare n integer;
begin
  if not exists(select 1 from public.alert_deliveries where alert_id=current_setting('test.alert.id')::uuid) then raise exception 'OWNER_CANNOT_READ_HISTORY'; end if;
  update public.alerts set is_enabled=false where id=current_setting('test.alert.id')::uuid;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'READER_CANNOT_PAUSE'; end if;
  begin
    update public.alerts set is_enabled=true where id=current_setting('test.alert.id')::uuid;
    raise exception 'DOWNGRADED_PLAN_RESUMED_IMMEDIATE';
  exception when check_violation then null; end;
  begin
    insert into public.alerts(organization_id,email_enabled) values(current_setting('test.alert.org')::uuid,true);
    raise exception 'READER_INSERT_ALLOWED';
  exception when insufficient_privilege then null; end;
  delete from public.alerts where id=current_setting('test.alert.id')::uuid;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'READER_CANNOT_DELETE'; end if;
end $$;
reset role;
select 'recipient isolation, consent, timezone, duplicates, history, pause, downgrade and deletion passed' as result;
rollback;
