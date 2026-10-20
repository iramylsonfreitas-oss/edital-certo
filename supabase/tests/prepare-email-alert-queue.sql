-- Development only. All synthetic records and simulated delivery states roll back.
begin;
do $$
declare actor uuid:=extensions.gen_random_uuid(); colleague uuid:=extensions.gen_random_uuid(); org uuid; profile uuid; alert uuid;
begin
  insert into auth.users(id,email,email_confirmed_at) values(actor,'queue-'||actor||'@example.invalid',now()),(colleague,'queue-'||colleague||'@example.invalid',now());
  perform set_config('request.jwt.claim.sub',actor::text,true);
  insert into public.organizations(name,slug,created_by) values('Queue validation','queue-'||actor,actor) returning id into org;
  update public.subscriptions set plan_id=(select id from public.plans where plan_key='pro') where organization_id=org;
  insert into public.memberships(organization_id,user_id,role) values(org,colleague,'analyst');
  insert into public.interest_profiles(organization_id,created_by,name,segment_key,required_keywords)
    values(org,actor,'Nobreak queue validation','it',array['nobreak']) returning id into profile;
  insert into public.alerts(organization_id,profile_id,frequency,minimum_score,email_enabled)
    values(org,profile,'immediate',80,true) returning id into alert;
  insert into public.tenders(id,source_key,source_id,title,object,proposal_close_at,raw_data,created_at)
  select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'pncp','queue-validation-'||actor||'-'||i,
    'Nobreak para servidor de rede','Nobreak para servidor de rede',now()+interval '10 days','{"situacaoCompraId":1}'::jsonb,'2000-01-01'
  from generate_series(1,101) i;
  insert into public.tenders(id,source_key,source_id,title,object,proposal_close_at,raw_data,created_at)
  values('00000000-0000-0000-0000-000000000102','pncp','queue-validation-'||actor||'-expired','Nobreak para servidor de rede','Nobreak para servidor de rede',now()-interval '1 second','{"situacaoCompraId":1}','2000-01-01'),
    ('00000000-0000-0000-0000-000000000103','pncp','queue-validation-'||actor||'-suspended','Nobreak para servidor de rede','Nobreak para servidor de rede',now()+interval '10 days','{"situacaoCompraId":4}','2000-01-01');
  insert into public.email_alert_scans(alert_id,profile_id,config_key,scan_started_at)
    values(alert,profile,private.email_alert_config_key(alert,profile),'2001-01-01');
  perform set_config('test.queue.actor',actor::text,true);
  perform set_config('test.queue.colleague',colleague::text,true);
  perform set_config('test.queue.org',org::text,true);
  perform set_config('test.queue.profile',profile::text,true);
  perform set_config('test.queue.alert',alert::text,true);
end $$;
set local role service_role;
do $$
declare page jsonb; replacement jsonb; result jsonb; matches jsonb; alert uuid:=current_setting('test.queue.alert')::uuid; profile uuid:=current_setting('test.queue.profile')::uuid;
begin
  if private.email_alert_ready_at('daily','America/Boa_Vista','08:00','2026-10-20T11:00:00Z')<>'2026-10-20T12:00:00Z'::timestamptz
    or private.email_alert_ready_at('daily','America/Boa_Vista','08:00','2026-10-20T12:00:00Z')<>'2026-10-20T12:00:00Z'::timestamptz
    or private.email_alert_ready_at('daily','America/Boa_Vista','08:00','2026-10-20T12:00:01Z')<>'2026-10-21T12:00:00Z'::timestamptz
    or private.email_alert_ready_at('daily','America/Sao_Paulo','08:00','2026-10-20T10:00:00Z')<>'2026-10-20T11:00:00Z'::timestamptz then raise exception 'DAILY_TIMEZONE_WRONG'; end if;
  page:=public.claim_email_alert_page();
  if jsonb_array_length(page->'tenders')<>100 then raise exception 'PAGE_BOUND_WRONG'; end if;
  if public.claim_email_alert_page() is not null then raise exception 'ACTIVE_LEASE_RECLAIMED'; end if;
  update public.email_alert_scans set lease_until=clock_timestamp()-interval '1 second' where alert_id=alert;
  replacement:=public.claim_email_alert_page();
  if replacement->>'claim_token'=page->>'claim_token' then raise exception 'LEASE_TOKEN_REUSED'; end if;
  begin
    perform public.save_email_alert_page(alert,profile,(page->>'claim_token')::uuid,'[]');
    raise exception 'STALE_TOKEN_ACCEPTED';
  exception when serialization_failure then null; end;
  select jsonb_agg(jsonb_build_object('tender_id',value->>'id','score',100,'explanation',jsonb_build_array('nobreak'))) into matches from jsonb_array_elements(replacement->'tenders');
  result:=public.save_email_alert_page(alert,profile,(replacement->>'claim_token')::uuid,matches);
  if (result->>'prepared')::integer<>100 or (result->>'cycle_complete')::boolean then raise exception 'FIRST_PAGE_NOT_COMMITTED'; end if;
  -- Replaying a committed lease cannot duplicate records.
  begin
    perform public.save_email_alert_page(alert,profile,(replacement->>'claim_token')::uuid,matches);
    raise exception 'COMMITTED_TOKEN_ACCEPTED';
  exception when serialization_failure then null; end;
  page:=public.claim_email_alert_page();
  if jsonb_array_length(page->'tenders')<>1 or page->'tenders'->0->>'id'<>'00000000-0000-0000-0000-000000000101' then raise exception 'CURSOR_DID_NOT_RESUME'; end if;
  perform public.fail_email_alert_page(alert,profile,(page->>'claim_token')::uuid);
  if public.claim_email_alert_page() is not null then raise exception 'FAILURE_BACKOFF_MISSING'; end if;
  update public.email_alert_scans set next_scan_at=now() where alert_id=alert;
  page:=public.claim_email_alert_page();
  result:=public.save_email_alert_page(alert,profile,(page->>'claim_token')::uuid,jsonb_build_array(jsonb_build_object('tender_id',page->'tenders'->0->>'id','score',100,'explanation',jsonb_build_array('nobreak'))));
  if (result->>'prepared')::integer<>1 or not (result->>'cycle_complete')::boolean then raise exception 'SECOND_PAGE_NOT_COMPLETED'; end if;
  if (select count(*) from public.email_alert_queue where organization_id=current_setting('test.queue.org')::uuid)<>101 then raise exception 'QUEUE_COUNT_WRONG'; end if;
  if exists(select 1 from public.email_alert_queue where tender_id in ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000103')) then raise exception 'EXPIRED_OR_SUSPENDED_QUEUED'; end if;
  if public.claim_email_alert_page() is not null then raise exception 'CYCLE_THROTTLE_MISSING'; end if;
end $$;
reset role;
-- Another profile/alert may match the same tender; the recipient queue stays unique.
do $$
declare profile uuid; alert uuid;
begin
  insert into public.interest_profiles(organization_id,created_by,name,segment_key,required_keywords)
    values(current_setting('test.queue.org')::uuid,current_setting('test.queue.actor')::uuid,'Overlapping profile','it',array['servidor de rede']) returning id into profile;
  insert into public.alerts(organization_id,profile_id,frequency,minimum_score,email_enabled)
    values(current_setting('test.queue.org')::uuid,profile,'immediate',80,true) returning id into alert;
  insert into public.email_alert_scans(alert_id,profile_id,config_key,scan_started_at)
    values(alert,profile,private.email_alert_config_key(alert,profile),'2001-01-01');
  perform set_config('test.queue.second_profile',profile::text,true);
  perform set_config('test.queue.second_alert',alert::text,true);
end $$;
set local role service_role;
do $$
declare page jsonb; result jsonb; matches jsonb;
begin
  page:=public.claim_email_alert_page();
  select jsonb_agg(jsonb_build_object('tender_id',value->>'id','score',100,'explanation',jsonb_build_array('servidor de rede'))) into matches from jsonb_array_elements(page->'tenders');
  perform public.save_email_alert_page((page->>'alert_id')::uuid,(page->>'profile_id')::uuid,(page->>'claim_token')::uuid,matches);
  if (select count(*) from public.email_alert_queue where organization_id=current_setting('test.queue.org')::uuid)<>101 then raise exception 'OVERLAPPING_PROFILE_DUPLICATED'; end if;
  page:=public.claim_email_alert_page();
  -- A profile change invalidates the whole in-flight page, even within one transaction.
  update public.interest_profiles set required_keywords=array['notebook'] where id=current_setting('test.queue.second_profile')::uuid;
  result:=public.save_email_alert_page((page->>'alert_id')::uuid,(page->>'profile_id')::uuid,(page->>'claim_token')::uuid,'[]');
  if result->>'status'<>'invalidated' then raise exception 'CHANGED_CONFIG_COMMITTED'; end if;
  -- Recheck a frozen first page after source changes: changed/expired rows are skipped.
  update public.email_alert_scans set next_scan_at=now(),config_key=private.email_alert_config_key(alert_id,profile_id),scan_started_at='2001-01-01' where alert_id=current_setting('test.queue.alert')::uuid;
  update public.alerts set is_enabled=false where id=current_setting('test.queue.second_alert')::uuid;
  page:=public.claim_email_alert_page();
  update public.tenders set uf='RR' where id='00000000-0000-0000-0000-000000000001';
  update public.tenders set proposal_close_at=now()-interval '1 second' where id='00000000-0000-0000-0000-000000000002';
  update public.email_alert_queue set status='canceled' where organization_id=current_setting('test.queue.org')::uuid;
  update public.email_alert_queue set status='sent' where tender_id='00000000-0000-0000-0000-000000000003' and organization_id=current_setting('test.queue.org')::uuid;
  select jsonb_agg(jsonb_build_object('tender_id',value->>'id','score',100,'explanation',jsonb_build_array('nobreak'))) into matches from jsonb_array_elements(page->'tenders');
  result:=public.save_email_alert_page((page->>'alert_id')::uuid,(page->>'profile_id')::uuid,(page->>'claim_token')::uuid,matches);
  if (result->>'prepared')::integer<>97 then raise exception 'STALE_TENDER_OR_SENT_ROW_REQUEUED'; end if;
  if (select status from public.email_alert_queue where recipient_user_id=current_setting('test.queue.actor')::uuid and tender_id='00000000-0000-0000-0000-000000000003')<>'sent' then raise exception 'SENT_TOMBSTONE_LOST'; end if;
  update public.alerts set is_enabled=false where id=current_setting('test.queue.alert')::uuid;
  perform public.cancel_ineligible_email_alerts();
  if exists(select 1 from public.email_alert_queue where organization_id=current_setting('test.queue.org')::uuid and status='prepared') then raise exception 'PAUSED_ALERT_STILL_PREPARED'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.queue.actor'),true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.email_alert_queue where organization_id=current_setting('test.queue.org')::uuid)<>101 then raise exception 'OWNER_CANNOT_READ_QUEUE'; end if;
  if has_function_privilege('authenticated','public.claim_email_alert_page()','execute')
    or has_function_privilege('anon','public.claim_email_alert_page()','execute')
    or has_table_privilege('authenticated','public.email_alert_queue','INSERT')
    or has_table_privilege('authenticated','public.email_alert_scans','SELECT') then raise exception 'WORKER_PRIVILEGE_LEAK'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.queue.colleague'),true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.email_alert_queue where organization_id=current_setting('test.queue.org')::uuid) then raise exception 'COLLEAGUE_READ_QUEUE'; end if;
end $$;
reset role;
-- An unverified email or withdrawn membership cannot produce another page.
update public.alerts set is_enabled=true where id=current_setting('test.queue.alert')::uuid;
update public.email_alert_scans set next_scan_at=now() where alert_id=current_setting('test.queue.alert')::uuid;
update auth.users set email_confirmed_at=null where id=current_setting('test.queue.actor')::uuid;
set local role service_role;
do $$ begin if public.claim_email_alert_page() is not null then raise exception 'UNVERIFIED_EMAIL_CLAIMED'; end if; end $$;
reset role;
update auth.users set email_confirmed_at=now() where id=current_setting('test.queue.actor')::uuid;
delete from public.memberships where organization_id=current_setting('test.queue.org')::uuid and user_id=current_setting('test.queue.actor')::uuid;
set local role service_role;
do $$ begin if public.claim_email_alert_page() is not null then raise exception 'REMOVED_MEMBER_CLAIMED'; end if; end $$;
reset role;
select 'pagination, lease replay, resume, retries, overlapping profiles, stale config/source, sent tombstone, timezone, RLS, consent and membership passed; no email sent' as result;
rollback;
