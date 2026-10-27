-- Post-install development verification. Always run as a single transaction.
-- No DDL, provider calls, persistent test data or changes to existing accounts.
begin;
set local statement_timeout = '30s';
do $$
declare actor uuid:=extensions.gen_random_uuid(); org uuid; profile uuid; alert uuid;
 tender uuid:=extensions.gen_random_uuid(); q uuid;
begin
 insert into auth.users(id,email,email_confirmed_at)
 values(actor,'installed-'||actor||'@example.invalid',now());
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.organizations(name,slug,created_by)
 values('Installed message verification','installed-'||actor,actor) returning id into org;
 update public.subscriptions set plan_id=(select id from public.plans where plan_key='pro') where organization_id=org;
 insert into public.interest_profiles(organization_id,created_by,name,segment_key,required_keywords)
 values(org,actor,'Installed verification','it',array['nobreak']) returning id into profile;
 insert into public.alerts(organization_id,profile_id,frequency,minimum_score,email_enabled)
 values(org,profile,'immediate',80,true) returning id into alert;
 insert into public.tenders(id,source_key,source_id,title,object,proposal_close_at,raw_data)
 values(tender,'pncp','installed-'||actor,'Nobreak para servidor de rede','Nobreak para servidor de rede',now()+interval '10 days','{"situacaoCompraId":1}');
 insert into public.email_alert_queue(recipient_user_id,organization_id,tender_id,alert_id,profile_id,
 config_key,tender_version,score,explanation,ready_at)
 select actor,org,tender,alert,profile,private.email_alert_config_key(alert,profile),
 md5(jsonb_build_object('tender',to_jsonb(t),'agency',null)::text),100,'["nobreak"]',now()
 from public.tenders t where t.id=tender returning id into q;
 if not private.email_message_item_current(q,(select md5(to_jsonb(x)::text) from public.email_alert_queue x where id=q))
 then raise exception 'INSTALLED_FIXTURE_INELIGIBLE'; end if;
 perform set_config('test.installed.queue',q::text,true);
 perform set_config('test.installed.actor',actor::text,true);
end $$;
set local role service_role;
do $$
declare q uuid:=current_setting('test.installed.queue')::uuid; msg uuid; claim jsonb; recovered jsonb;
 payload text; target text;
begin
 target:=private.email_message_verified_address(current_setting('test.installed.actor')::uuid);
 payload:=json_build_array('sender@example.invalid',target,'Resumo de homologação','<p>Teste</p>','Teste')::text;
 msg:=public.reserve_email_message(array[q]);
 if public.claim_email_message(msg) is not null then raise exception 'DRAFT_CLAIMED'; end if;
 begin
  perform public.reserve_email_message(array[q]);
  raise exception 'DUPLICATE_RESERVATION';
 exception when unique_violation then null; end;
 if public.freeze_email_message(msg,payload)<>encode(extensions.digest(convert_to(payload,'UTF8'),'sha256'),'hex')
 then raise exception 'HASH_MISMATCH'; end if;
 claim:=public.claim_email_message(msg);
 if claim is null or not public.validate_email_message_claim(msg,(claim->>'claim_token')::uuid)
 then raise exception 'CLAIM_NOT_VALID'; end if;
 if public.claim_email_message(msg) is not null then raise exception 'LEASE_NOT_EXCLUSIVE'; end if;
 update public.email_messages set lease_until=clock_timestamp()-interval '1 second' where id=msg;
 recovered:=public.claim_email_message(msg);
 if recovered is null or recovered->>'claim_token'=claim->>'claim_token'
 or recovered->>'payload_bytes'<>payload or recovered->>'idempotency_key'<>claim->>'idempotency_key'
 then raise exception 'RECOVERY_IDENTITY_CHANGED'; end if;
 begin
  perform public.finish_email_message_attempt(msg,(claim->>'claim_token')::uuid,'accepted','never-sent');
  raise exception 'STALE_COMPLETION_ALLOWED';
 exception when serialization_failure then null; end;
 if public.finish_email_message_attempt(msg,(recovered->>'claim_token')::uuid,'conflict')<>'uncertain'
 then raise exception 'CONFLICT_NOT_TERMINAL'; end if;
 if public.claim_email_message(msg) is not null then raise exception 'UNCERTAIN_RETRIED'; end if;
 begin
  perform public.reserve_email_message(array[q]);
  raise exception 'UNCERTAIN_ITEM_RELEASED';
 exception when unique_violation then null; end;
 if (select count(*) from public.email_message_attempts where message_id=msg)<>2
 then raise exception 'ATTEMPT_HISTORY_MISSING'; end if;
 if (select status from public.email_alert_queue where id=q)<>'prepared'
 then raise exception 'SIMULATION_CHANGED_QUEUE_TO_SENT'; end if;
end $$;
reset role;
do $$
declare table_name text; proc regprocedure;
begin
 foreach table_name in array array['email_messages','email_message_items','email_message_attempts'] loop
  if not (select relrowsecurity from pg_class where oid=('public.'||table_name)::regclass)
  or has_table_privilege('anon','public.'||table_name,'SELECT')
  or has_table_privilege('authenticated','public.'||table_name,'SELECT')
  then raise exception 'TABLE_ACCESS_LEAK'; end if;
 end loop;
 for proc in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('reserve_email_message','reserve_next_email_digest',
 'recover_email_message_drafts','freeze_email_message','claim_email_message','validate_email_message_claim',
 'finish_email_message_attempt','cancel_unattempted_email_message') loop
  if has_function_privilege('anon',proc,'EXECUTE') or has_function_privilege('authenticated',proc,'EXECUTE')
  or not has_function_privilege('service_role',proc,'EXECUTE') then raise exception 'FUNCTION_ACCESS_LEAK'; end if;
 end loop;
end $$;
select 'installed schema: reservation, frozen hash, lease recovery, stale response rejection, terminal conflict, retained queue, RLS and RPC grants passed; no email sent; rolling back' as result;
rollback;
