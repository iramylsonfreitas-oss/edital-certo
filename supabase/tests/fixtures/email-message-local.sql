-- Disposable local CI database only. Commit makes fixtures visible to independent REST sessions.
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
declare page jsonb;
begin
 page:=public.claim_email_alert_page();
 perform public.save_email_alert_page((page->>'alert_id')::uuid,(page->>'profile_id')::uuid,(page->>'claim_token')::uuid,
  (select jsonb_agg(jsonb_build_object('tender_id',v->>'id','score',100,'explanation',jsonb_build_array('nobreak')))
   from jsonb_array_elements(page->'tenders') with ordinality as t(v,n) where n<=20));
end $$;
commit;
