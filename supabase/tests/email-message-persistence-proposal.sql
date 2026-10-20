-- Proposal validation only: administrative connection to disposable development database.
-- psql exits on failure; closing the failed connection rolls back the open transaction.
\set ON_ERROR_STOP on
begin;
\ir ../ops/drafts/email-message-persistence.sql

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
declare page jsonb; q uuid; msg uuid; claimed jsonb; second jsonb; payload text; fingerprint text; target text; n integer;
begin
 page:=public.claim_email_alert_page();
 perform public.save_email_alert_page((page->>'alert_id')::uuid,(page->>'profile_id')::uuid,(page->>'claim_token')::uuid,
 jsonb_build_array(jsonb_build_object('tender_id',page->'tenders'->0->>'id','score',100,'explanation',jsonb_build_array('nobreak'))));
 select id into strict q from public.email_alert_queue where organization_id=current_setting('test.queue.org')::uuid;
 msg:=public.reserve_email_message(array[q]);
 if not public.cancel_unattempted_email_message(msg) then raise exception 'DRAFT_NOT_RELEASED'; end if;
 msg:=public.reserve_email_message(array[q]);
 perform set_config('test.message.id',msg::text,true);
 if public.claim_email_message(msg) is not null then raise exception 'UNFROZEN_MESSAGE_CLAIMED'; end if;
 begin perform public.reserve_email_message(array[q]); raise exception 'DUPLICATE_MESSAGE_ALLOWED'; exception when unique_violation then null; end;
 target:=private.email_message_verified_address(current_setting('test.queue.actor')::uuid);
 payload:=json_build_array('sender@example.invalid',target,'Resumo','<p>Resumo de teste</p>','Resumo de teste')::text;
 begin
 perform public.freeze_email_message(msg,json_build_array('sender@example.invalid','another@example.invalid','Resumo','<p>Teste</p>','Teste')::text);
 raise exception 'RECIPIENT_REDIRECTION_ALLOWED';
 exception when check_violation then null; end;
 fingerprint:=public.freeze_email_message(msg,payload);
 if fingerprint<>encode(extensions.digest(convert_to(payload,'UTF8'),'sha256'),'hex') then raise exception 'SNAPSHOT_HASH_WRONG'; end if;
 begin update public.email_messages set payload_bytes='[]' where id=msg; raise exception 'FROZEN_PAYLOAD_CHANGED'; exception when check_violation then null; end;
 claimed:=public.claim_email_message(msg);
 if claimed->>'payload_bytes'<>payload or claimed->>'idempotency_key'<>'edital-certo/'||msg then raise exception 'CLAIM_PAYLOAD_OR_KEY_WRONG'; end if;
 if public.claim_email_message(msg) is not null then raise exception 'ACTIVE_MESSAGE_LEASE_RECLAIMED'; end if;
 update public.email_messages set lease_until=clock_timestamp()-interval '1 second' where id=msg;
 second:=public.claim_email_message(msg);
 if claimed->>'claim_token'=second->>'claim_token' or claimed->>'idempotency_key'<>second->>'idempotency_key'
 or second->>'payload_bytes'<>payload then raise exception 'RECOVERY_CHANGED_IDENTITY'; end if;
 begin perform public.finish_email_message_attempt(msg,(claimed->>'claim_token')::uuid,'accepted','fake-old-response'); raise exception 'STALE_ATTEMPT_ACCEPTED'; exception when serialization_failure then null; end;
 if public.finish_email_message_attempt(msg,(second->>'claim_token')::uuid,'retryable')<>'retry' then raise exception 'RETRY_NOT_SAVED'; end if;
 if public.claim_email_message(msg) is not null then raise exception 'BACKOFF_IGNORED'; end if;
 update public.email_messages set next_attempt_at=clock_timestamp()-interval '1 second' where id=msg;
 claimed:=public.claim_email_message(msg);
 if public.finish_email_message_attempt(msg,(claimed->>'claim_token')::uuid,'accepted','simulated-only')<>'accepted' then raise exception 'ACCEPTANCE_NOT_SAVED'; end if;
 if public.claim_email_message(msg) is not null then raise exception 'ACCEPTED_MESSAGE_RECLAIMED'; end if;
 if (select count(*) from public.email_message_attempts where message_id=msg)<>3 then raise exception 'ATTEMPT_HISTORY_MISSING'; end if;
 if (select outcome from public.email_message_attempts where message_id=msg and attempt_number=1)<>'unknown' then raise exception 'INTERRUPTION_NOT_RECORDED'; end if;
 if (select status from public.email_alert_queue where id=q)<>'sent' then raise exception 'QUEUE_NOT_COMPLETED'; end if;
 if not (select had_unknown_outcome from public.email_messages where id=msg) then raise exception 'UNCERTAINTY_HISTORY_LOST'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.queue.actor'),true);
set local role authenticated;
do $$ begin
 if has_table_privilege('authenticated','public.email_messages','SELECT')
 or has_table_privilege('authenticated','public.email_message_attempts','INSERT')
 or has_function_privilege('authenticated','public.claim_email_message(uuid)','EXECUTE')
 or has_function_privilege('anon','public.reserve_email_message(uuid[])','EXECUTE') then raise exception 'OUTBOX_PRIVILEGE_LEAK'; end if;
end $$;
reset role;
select 'message reservation, frozen bytes/hash, exclusive lease, replay rejection, restart recovery, backoff, acceptance, attempt history and private access passed; all changes roll back; no email sent' as result;


set local role service_role;
do $$
declare page jsonb; q uuid; msg uuid; payload text; claim jsonb; outcome text; i integer;
begin
 page:=public.claim_email_alert_page();
 perform public.save_email_alert_page((page->>'alert_id')::uuid,(page->>'profile_id')::uuid,(page->>'claim_token')::uuid,jsonb_build_array(jsonb_build_object('tender_id',page->'tenders'->0->>'id','score',100,'explanation',jsonb_build_array('nobreak'))));
 select id into strict q from public.email_alert_queue where organization_id=current_setting('test.queue.org')::uuid and status='prepared';
 payload:=json_build_array('sender@example.invalid',private.email_message_verified_address(current_setting('test.queue.actor')::uuid),'Resumo','<p>Teste</p>','Teste')::text;
 msg:=public.reserve_email_message(array[q]);
 perform public.freeze_email_message(msg,payload);
 update public.alerts set is_enabled=false where id=current_setting('test.queue.alert')::uuid;
 claim:=public.claim_email_message(msg);
 if claim is not null or (select status from public.email_messages where id=msg)<>'canceled' then raise exception 'PAUSED_MESSAGE_CLAIMED'; end if;
 if exists(select 1 from public.email_message_items where message_id=msg) then raise exception 'UNATTEMPTED_ITEM_NOT_RELEASED'; end if;
 update public.alerts set is_enabled=true where id=current_setting('test.queue.alert')::uuid;
 update public.email_alert_scans set next_scan_at=now(),config_key='' where alert_id=current_setting('test.queue.alert')::uuid;
 page:=public.claim_email_alert_page();
 perform public.save_email_alert_page((page->>'alert_id')::uuid,(page->>'profile_id')::uuid,(page->>'claim_token')::uuid,
 '[{"tender_id":"00000000-0000-0000-0000-000000000004","score":100,"explanation":["nobreak"]},{"tender_id":"00000000-0000-0000-0000-000000000005","score":100,"explanation":["nobreak"]}]');
 select id into strict q from public.email_alert_queue where organization_id=current_setting('test.queue.org')::uuid and tender_id='00000000-0000-0000-0000-000000000004';
 msg:=public.reserve_email_message(array[q]); perform public.freeze_email_message(msg,payload);
 update public.email_messages set first_attempt_at=clock_timestamp()-interval '24 hours' where id=msg;
 claim:=public.claim_email_message(msg);
 if claim is not null or (select status from public.email_messages where id=msg)<>'failed' then raise exception 'RETRY_WINDOW_NOT_ENFORCED'; end if;
 select id into strict q from public.email_alert_queue where organization_id=current_setting('test.queue.org')::uuid and tender_id='00000000-0000-0000-0000-000000000005';
 msg:=public.reserve_email_message(array[q]); perform public.freeze_email_message(msg,payload);
 for i in 1..5 loop
  update public.email_messages set next_attempt_at=clock_timestamp()-interval '1 second' where id=msg;
  claim:=public.claim_email_message(msg);
  outcome:=public.finish_email_message_attempt(msg,(claim->>'claim_token')::uuid,'unknown');
 end loop;
 if outcome<>'uncertain' or public.claim_email_message(msg) is not null or (select attempts from public.email_messages where id=msg)<>5 then raise exception 'UNCERTAIN_ATTEMPT_LIMIT_BROKEN'; end if;
 begin perform public.reserve_email_message(array[q]); raise exception 'UNCERTAIN_ITEM_RESERVED_AGAIN'; exception when unique_violation then null; end;
end $$;
reset role;
select 'all SQL tests passed: recovery, hash/identity, fencing, backoff, accepted simulation, pause, retry window, five-attempt limit, uncertainty retention and private access; no email sent' as result;

rollback;
