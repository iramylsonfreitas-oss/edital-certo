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
declare q uuid:=current_setting('test.installed.queue')::uuid; actor uuid:=current_setting('test.installed.actor')::uuid;
 msg uuid; token text; target text; payload text; claim jsonb; result text; alert uuid; provider uuid:=extensions.gen_random_uuid();
 from_hash text; to_hash text; event_hash text:=repeat('a',64);
begin
 select alert_id into alert from public.email_alert_queue where id=q;
 target:=private.email_message_verified_address(actor);
 msg:=public.reserve_email_message(array[q]);
 token:=public.create_email_unsubscribe_token(msg);
 if length(token)<>64 then raise exception 'UNSUBSCRIBE_TOKEN_WEAK'; end if;
 if exists(select 1 from public.email_unsubscribe_tokens where token_hash=token) then raise exception 'RAW_TOKEN_STORED'; end if;
 payload:=json_build_array('sender@example.invalid',target,'Resumo','<p>Teste</p>','Teste')::text;
 perform public.freeze_email_message(msg,payload);
 if public.select_email_delivery_candidate('sender@example.invalid',array[target]) is distinct from msg
 or public.select_email_delivery_candidate('another@example.invalid',array[target]) is not null
 or public.select_email_delivery_candidate('sender@example.invalid',array['another@example.invalid']) is not null
 then raise exception 'DELIVERY_CANDIDATE_SCOPE_WRONG'; end if;
 claim:=public.claim_email_message(msg);
 if not public.validate_email_delivery_claim(msg,(claim->>'claim_token')::uuid,'sender@example.invalid',token)
 or public.validate_email_delivery_claim(msg,(claim->>'claim_token')::uuid,'sender@example.invalid',repeat('b',64))
 then raise exception 'DELIVERY_TOKEN_BINDING_WRONG'; end if;
 perform public.finish_email_message_attempt(msg,(claim->>'claim_token')::uuid,'unknown');
 if not public.unsubscribe_email_token(token) or not public.unsubscribe_email_token(token)
 then raise exception 'UNSUBSCRIBE_NOT_IDEMPOTENT'; end if;
 if private.email_alert_is_eligible(alert) or (select is_enabled or email_enabled from public.alerts where id=alert)
 then raise exception 'UNSUBSCRIBE_DID_NOT_PAUSE'; end if;
 if public.unsubscribe_email_token(repeat('0',64)) then raise exception 'UNKNOWN_TOKEN_ACCEPTED'; end if;
 from_hash:=encode(extensions.digest('sender@example.invalid','sha256'),'hex');
 to_hash:=encode(extensions.digest(lower(target),'sha256'),'hex');
 result:=public.record_email_provider_event('event-verified',provider,msg,'delivered',now(),event_hash,from_hash,to_hash);
 if result<>'processed' or (select status from public.email_messages where id=msg)<>'accepted'
 or (select delivery_state from public.email_messages where id=msg)<>'delivered'
 or (select status from public.email_alert_queue where id=q)<>'sent'
 then raise exception 'SIGNED_RECEIPT_DID_NOT_RECONCILE'; end if;
 if public.record_email_provider_event('event-verified',provider,msg,'delivered',now(),event_hash,from_hash,to_hash)<>'duplicate'
 then raise exception 'PROVIDER_REPLAY_NOT_DEDUPED'; end if;
 begin
  perform public.record_email_provider_event('event-verified',provider,msg,'delivered',now(),repeat('b',64),from_hash,to_hash);
  raise exception 'EVENT_IDENTITY_REUSED';
 exception when check_violation then null; end;
 perform public.record_email_provider_event('event-late-sent',provider,msg,'sent',now(),repeat('c',64),from_hash,to_hash);
 if (select delivery_state from public.email_messages where id=msg)<>'delivered' then raise exception 'LATE_EVENT_REGRESSED'; end if;
 perform set_config('test.provider.msg',msg::text,true);
 perform set_config('test.provider.token',token,true);
 perform set_config('test.provider.id',provider::text,true);
 perform set_config('test.provider.from_hash',from_hash,true);
 perform set_config('test.provider.to_hash',to_hash,true);
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.installed.actor'),true);
set local role authenticated;
do $$ begin
 if public.resume_email_after_unsubscribe(true) is distinct from true then raise exception 'SELF_RESUME_FAILED'; end if;
 if exists(select 1 from public.email_delivery_blocks) then raise exception 'UNSUBSCRIBE_BLOCK_NOT_CLEARED'; end if;
 if has_function_privilege('authenticated','public.record_email_provider_event(text,uuid,uuid,text,timestamptz,text,text,text)','EXECUTE')
 or has_function_privilege('anon','public.unsubscribe_email_token(text)','EXECUTE') then raise exception 'PROVIDER_RPC_EXPOSED'; end if;
 begin perform public.resume_email_after_unsubscribe(false); raise exception 'CONSENT_NOT_REQUIRED'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$
declare msg uuid:=current_setting('test.provider.msg')::uuid; provider uuid:=current_setting('test.provider.id')::uuid;
 token text:=current_setting('test.provider.token'); from_hash text:=current_setting('test.provider.from_hash'); to_hash text:=current_setting('test.provider.to_hash');
begin
 if (select is_enabled from public.alerts where id=(select alert_id from public.email_alert_queue where id=current_setting('test.installed.queue')::uuid))
 then raise exception 'RESUME_AUTOMATICALLY_ENABLED'; end if;
 perform public.record_email_provider_event('event-bounce',provider,msg,'bounced',now(),repeat('d',64),from_hash,to_hash);
 perform public.record_email_provider_event('event-complaint',provider,msg,'complained',now(),repeat('e',64),from_hash,to_hash);
 perform public.record_email_provider_event('event-late-delivery',provider,msg,'delivered',now(),repeat('f',64),from_hash,to_hash);
 if (select reason from public.email_delivery_blocks where recipient_user_id=current_setting('test.installed.actor')::uuid)<>'complained'
 or (select delivery_state from public.email_messages where id=msg)<>'complained' then raise exception 'SUPPRESSION_REGRESSED'; end if;
 perform public.unsubscribe_email_token(token);
 if (select reason from public.email_delivery_blocks where recipient_user_id=current_setting('test.installed.actor')::uuid)<>'complained'
 then raise exception 'UNSUBSCRIBE_DOWNGRADED_COMPLAINT'; end if;
 if public.record_email_provider_event('event-wrong-address',provider,msg,'sent',now(),repeat('1',64),from_hash,repeat('0',64))<>'pending'
 then raise exception 'WRONG_RECIPIENT_RECEIPT_ACCEPTED'; end if;
 delete from public.email_messages where id=msg;
 if not public.unsubscribe_email_token(token) then raise exception 'CANCEL_LINK_DIED_WITH_RETENTION'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
 if public.resume_email_after_unsubscribe(true) then raise exception 'COMPLAINT_BLOCK_CLEARED'; end if;
end $$;
reset role;
select 'provider SQL passed: tokens, unsubscribe, explicit resume, pilot scope, receipt reconciliation, replay, event order, suppression, retained links and privileges; all changes roll back' as result;
rollback;
