-- Installed-schema tests with disposable synthetic data. All changes roll back.
begin;
do $$
declare actor uuid:=extensions.gen_random_uuid(); org uuid; profile uuid; alert uuid; target uuid; q uuid; ids uuid[]:='{}'; i integer;
begin
 insert into auth.users(id,email,email_confirmed_at) values(actor,'maintenance-'||actor||'@example.invalid',now());
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.organizations(name,slug,created_by) values('Maintenance test','maintenance-'||actor,actor) returning id into org;
 update public.subscriptions set plan_id=(select id from public.plans where plan_key='pro') where organization_id=org;
 insert into public.interest_profiles(organization_id,created_by,name,segment_key,required_keywords)
 values(org,actor,'Maintenance test','it',array['nobreak']) returning id into profile;
 insert into public.alerts(organization_id,profile_id,frequency,minimum_score,email_enabled)
 values(org,profile,'immediate',80,true) returning id into alert;
 for i in 1..8 loop
  target:=extensions.gen_random_uuid();
  insert into public.tenders(id,source_key,source_id,title,object,proposal_close_at,raw_data)
  values(target,'pncp','maintenance-'||target,'Nobreak para servidor de rede','Nobreak para servidor de rede',now()+interval '10 days','{"situacaoCompraId":1}');
  insert into public.email_alert_queue(recipient_user_id,organization_id,tender_id,alert_id,profile_id,config_key,tender_version,score,explanation,ready_at)
  select actor,org,target,alert,profile,private.email_alert_config_key(alert,profile),
   md5(jsonb_build_object('tender',to_jsonb(t),'agency',null)::text),100,'["nobreak"]',now()
  from public.tenders t where t.id=target returning id into q;
  ids:=array_append(ids,q);
 end loop;
 perform set_config('test.maintenance.queues',ids::text,true);
 perform set_config('test.maintenance.actor',actor::text,true);
end $$;
set local role service_role;
do $$
declare ids uuid[]:=current_setting('test.maintenance.queues')::uuid[]; msgs uuid[]:='{}'; m uuid; token uuid; payload text;
 result jsonb; i integer;
begin
 payload:=json_build_array('sender@example.invalid',private.email_message_verified_address(current_setting('test.maintenance.actor')::uuid),'Resumo','<p>Teste</p>','Teste')::text;
 for i in 1..8 loop
  m:=public.reserve_email_message(array[ids[i]]);
  perform public.freeze_email_message(m,payload);
  msgs:=array_append(msgs,m);
  -- Terminal fixtures do not retain the active-recipient lock for the next case.
  if i=1 then
   token:=extensions.gen_random_uuid();
   update public.email_messages set status='dispatching',attempts=1,first_attempt_at=now()-interval '24 hours',
    claim_token=token,lease_until=now()-interval '1 minute',created_at=now()-interval '100 days' where id=m;
   insert into public.email_message_attempts(message_id,attempt_number,claim_token,started_at)
    values(m,1,token,now()-interval '24 hours');
   result:=public.maintain_email_message_history(1);
   if result->>'quarantined'<>'1' then raise exception 'EXPIRED_LEASE_NOT_QUARANTINED'; end if;
  elsif i=7 then
   update public.email_messages set status='retry',attempts=1,first_attempt_at=now()-interval '24 hours' where id=m;
   insert into public.email_message_attempts(message_id,attempt_number,claim_token,started_at,finished_at,outcome)
    values(m,1,extensions.gen_random_uuid(),now()-interval '24 hours',now()-interval '24 hours','retryable');
   result:=public.maintain_email_message_history(1);
   if result->>'expired_failed'<>'1' then raise exception 'EXPIRED_RETRY_NOT_CLOSED'; end if;
  elsif i=8 then
   token:=extensions.gen_random_uuid();
   update public.email_messages set status='dispatching',attempts=1,first_attempt_at=now()-interval '24 hours',
    claim_token=token,lease_until=now()+interval '1 minute' where id=m;
   insert into public.email_message_attempts(message_id,attempt_number,claim_token,started_at)
    values(m,1,token,now()-interval '24 hours');
  elsif i=4 then
   perform public.cancel_unattempted_email_message(m);
   update public.email_messages set created_at=now()-interval '31 days' where id=m;
  else
   update public.email_messages set status=case when i=3 then 'failed' else 'accepted' end,
    attempts=1,first_attempt_at=case when i=5 then now() else now()-interval '100 days' end,
    created_at=case when i=5 then now() else now()-interval '100 days' end where id=m;
   insert into public.email_message_attempts(message_id,attempt_number,claim_token,started_at,finished_at,outcome)
    values(m,1,extensions.gen_random_uuid(),case when i=5 then now() else now()-interval '100 days' end,
     case when i=5 then now() else now()-interval '100 days' end,case when i=3 then 'permanent' else 'accepted' end);
   if i in (2,5) then update public.email_alert_queue set status='sent' where id=ids[i]; end if;
  end if;
 end loop;
 if public.claim_email_message(msgs[1]) is not null then raise exception 'QUARANTINED_MESSAGE_RECLAIMED'; end if;
 if (select outcome from public.email_message_attempts where message_id=msgs[1])<>'unknown'
 or not exists(select 1 from public.email_message_items where message_id=msgs[1])
 then raise exception 'UNCERTAINTY_EVIDENCE_LOST'; end if;
 result:=public.maintain_email_message_history(1);
 if result->>'purged_accepted'<>'1' or result->>'purged_canceled'<>'0'
 then raise exception 'ACCEPTED_RETENTION_OR_BUDGET_FAILED'; end if;
 if exists(select 1 from public.email_messages where id=msgs[2])
 or exists(select 1 from public.email_message_attempts where message_id=msgs[2])
 or (select status from public.email_alert_queue where id=ids[2])<>'sent'
 then raise exception 'SENT_TOMBSTONE_NOT_PRESERVED'; end if;
 begin perform public.reserve_email_message(array[ids[2]]); raise exception 'PURGED_ACCEPTED_REQUEUED'; exception when check_violation then null; end;
 result:=public.maintain_email_message_history(1);
 if result->>'purged_canceled'<>'1' then raise exception 'CANCELED_RETENTION_FAILED'; end if;
 result:=public.maintain_email_message_history(100);
 if result<>'{"quarantined":0,"expired_failed":0,"purged_accepted":0,"purged_canceled":0}'::jsonb
 then raise exception 'PROTECTED_MESSAGES_TOUCHED'; end if;
 if (select count(*) from public.email_messages where id=any(msgs))<>6 then raise exception 'RETENTION_COUNT_WRONG'; end if;
 if (select status from public.email_messages where id=msgs[8])<>'dispatching' then raise exception 'LIVE_LEASE_TERMINATED'; end if;
 for i in 0..1 loop
  begin perform public.maintain_email_message_history(case when i=0 then 0 else 101 end);
   raise exception 'INVALID_BUDGET_ALLOWED'; exception when invalid_parameter_value then null; end;
 end loop;
 if has_function_privilege('anon','public.maintain_email_message_history(integer)','EXECUTE')
 or has_function_privilege('authenticated','public.maintain_email_message_history(integer)','EXECUTE')
 then raise exception 'MAINTENANCE_PRIVILEGE_LEAK'; end if;
end $$;
reset role;
select 'maintenance passed: terminal quarantine, preserved uncertain/failed/recent records, bounded retention, sent tombstone, rejected requeue and service-only access; rolling back' as result;
rollback;
