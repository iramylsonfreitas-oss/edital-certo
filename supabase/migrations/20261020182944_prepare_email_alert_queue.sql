-- Preparation only: no provider credentials, email payloads or send routine.
grant usage on schema private to service_role;
create table public.email_alert_scans (
  alert_id uuid not null references public.alerts(id) on delete cascade,
  profile_id uuid not null references public.interest_profiles(id) on delete cascade,
  cursor_id uuid,
  scan_started_at timestamptz not null default clock_timestamp(),
  config_key text not null default '',
  next_scan_at timestamptz not null default now(),
  last_completed_at timestamptz,
  claim_token uuid,
  lease_until timestamptz,
  page_ids uuid[] not null default '{}',
  page_versions jsonb not null default '{}',
  pages_completed bigint not null default 0,
  candidates_checked bigint not null default 0,
  last_error text,
  primary key(alert_id,profile_id)
);
alter table public.email_alert_scans enable row level security;
revoke all on public.email_alert_scans from anon,authenticated;
grant all on public.email_alert_scans to service_role;
create index email_alert_scans_due_idx on public.email_alert_scans(next_scan_at,alert_id,profile_id);
create index email_alert_scans_profile_idx on public.email_alert_scans(profile_id);

create table public.email_alert_queue (
  id uuid primary key default extensions.gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tender_id uuid not null references public.tenders(id) on delete cascade,
  alert_id uuid references public.alerts(id) on delete set null,
  profile_id uuid references public.interest_profiles(id) on delete set null,
  config_key text not null,
  tender_version text not null,
  score smallint not null check(score between 1 and 100),
  explanation jsonb not null check(jsonb_typeof(explanation)='array'),
  ready_at timestamptz not null,
  status text not null default 'prepared' check(status in ('prepared','canceled','sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(recipient_user_id,tender_id)
);
alter table public.email_alert_queue enable row level security;
revoke all on public.email_alert_queue from anon,authenticated;
grant select on public.email_alert_queue to authenticated;
grant all on public.email_alert_queue to service_role;
create policy email_alert_queue_read_self on public.email_alert_queue for select to authenticated
using (recipient_user_id=(select auth.uid()) and (select private.has_org_role(organization_id)));
create index email_alert_queue_due_idx on public.email_alert_queue(ready_at) where status='prepared';
create index email_alert_queue_org_idx on public.email_alert_queue(organization_id);
create index email_alert_queue_alert_idx on public.email_alert_queue(alert_id);
create index email_alert_queue_profile_idx on public.email_alert_queue(profile_id);
create index email_alert_queue_tender_idx on public.email_alert_queue(tender_id);

-- Privileged only to inspect verified auth state; never returns the email address.
create function private.email_alert_is_eligible(p_alert_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.alerts a join auth.users u on u.id=a.recipient_user_id
    join public.memberships m on m.organization_id=a.organization_id and m.user_id=u.id
    where a.id=p_alert_id and a.is_enabled and a.email_enabled and a.email_consent_at is not null
      and u.email_confirmed_at is not null and coalesce(u.email,'')<>''
      and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and coalesce((
        select (p.features->>case when a.frequency='immediate' then 'immediate_alerts' else 'daily_alerts' end)::boolean
        from public.subscriptions s join public.plans p on p.id=s.plan_id
        where s.organization_id=a.organization_id and s.status in ('active','trialing') and p.is_active
          and (s.current_period_end is null or s.current_period_end>now())
        order by s.created_at desc limit 1
      ),(
        select (p.features->>case when a.frequency='immediate' then 'immediate_alerts' else 'daily_alerts' end)::boolean
        from public.plans p where p.plan_key='free' and p.is_active limit 1
      ),false)
  );
$$;
revoke all on function private.email_alert_is_eligible(uuid) from public,anon,authenticated;
grant execute on function private.email_alert_is_eligible(uuid) to service_role;

create function private.email_alert_config_key(p_alert_id uuid,p_profile_id uuid)
returns text language sql stable security invoker set search_path=''
as $$
  select pg_catalog.md5(jsonb_build_object('alert',to_jsonb(a),'profile',to_jsonb(p))::text)
  from public.alerts a join public.interest_profiles p on p.organization_id=a.organization_id
  where a.id=p_alert_id and p.id=p_profile_id and p.is_active and p.segment_key='it'
    and (a.profile_id is null or a.profile_id=p.id);
$$;
revoke all on function private.email_alert_config_key(uuid,uuid) from public,anon,authenticated;
grant execute on function private.email_alert_config_key(uuid,uuid) to service_role;

create function private.email_alert_ready_at(p_frequency public.alert_frequency,p_timezone text,p_time time,p_now timestamptz)
returns timestamptz language sql stable security invoker set search_path=''
as $$
  select case when p_frequency='immediate' then p_now
    else ((p_now at time zone p_timezone)::date + p_time
      + case when (p_now at time zone p_timezone)::time>p_time then interval '1 day' else interval '0' end)
      at time zone p_timezone end;
$$;
revoke all on function private.email_alert_ready_at(public.alert_frequency,text,time,timestamptz) from public,anon,authenticated;
grant execute on function private.email_alert_ready_at(public.alert_frequency,text,time,timestamptz) to service_role;

-- A claim freezes one page and a config fingerprint. Only its token can commit it.
create function public.claim_email_alert_page()
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare job public.email_alert_scans; a public.alerts; p public.interest_profiles; key text; rows jsonb;
begin
  insert into public.email_alert_scans(alert_id,profile_id)
  select al.id,pr.id from public.alerts al
  join public.interest_profiles pr on pr.organization_id=al.organization_id and pr.is_active and pr.segment_key='it'
    and (al.profile_id is null or al.profile_id=pr.id)
  where private.email_alert_is_eligible(al.id)
    and not exists(select 1 from public.email_alert_scans s where s.alert_id=al.id and s.profile_id=pr.id)
  order by al.created_at,al.id,pr.id limit 200 on conflict do nothing;

  select s.* into job from public.email_alert_scans s
  join public.alerts al on al.id=s.alert_id
  join public.interest_profiles pr on pr.id=s.profile_id and pr.organization_id=al.organization_id
  where s.next_scan_at<=now() and (s.lease_until is null or s.lease_until<=clock_timestamp())
    and pr.is_active and pr.segment_key='it' and (al.profile_id is null or al.profile_id=pr.id)
    and private.email_alert_is_eligible(al.id)
  order by s.next_scan_at,s.alert_id,s.profile_id for update of s skip locked limit 1;
  if not found then return null; end if;
  select * into a from public.alerts where id=job.alert_id;
  select * into p from public.interest_profiles where id=job.profile_id;
  key:=private.email_alert_config_key(a.id,p.id);
  if key is distinct from job.config_key then
    job.cursor_id:=null;
    job.scan_started_at:=clock_timestamp();
  end if;
  select coalesce(jsonb_agg(x.data order by x.id),'[]'::jsonb),coalesce(array_agg(x.id order by x.id),'{}'::uuid[]),coalesce(jsonb_object_agg(x.id::text,x.version),'{}'::jsonb)
  into rows,job.page_ids,job.page_versions
  from (
    select t.id,pg_catalog.md5(jsonb_build_object('tender',to_jsonb(t),'agency',to_jsonb(ag))::text) as version,
      jsonb_build_object('id',t.id,'title',t.title,'object',t.object,'items_search_text',t.items_search_text,
        'uf',t.uf,'municipality_code',t.municipality_code,'modality_code',t.modality_code,
        'estimated_value',t.estimated_value,'exclusive_me_epp',t.exclusive_me_epp,'agency_name',ag.name,'sphere',ag.sphere) as data
    from public.tenders t left join public.agencies ag on ag.id=t.agency_id
    where t.source_key='pncp' and t.is_ti and t.raw_data->>'situacaoCompraId'='1'
      and t.proposal_close_at>now() and t.created_at<=job.scan_started_at
      and (job.cursor_id is null or t.id>job.cursor_id)
    order by t.id limit 100
  ) x;
  job.claim_token:=extensions.gen_random_uuid();
  update public.email_alert_scans set cursor_id=job.cursor_id,scan_started_at=job.scan_started_at,
    config_key=key,claim_token=job.claim_token,lease_until=clock_timestamp()+interval '2 minutes',
    page_ids=job.page_ids,page_versions=job.page_versions,last_error=null
  where alert_id=a.id and profile_id=p.id;
  return jsonb_build_object('alert_id',a.id,'profile_id',p.id,'claim_token',job.claim_token,
    'minimum_score',a.minimum_score,'profile',to_jsonb(p),'tenders',rows);
end;
$$;

create function public.save_email_alert_page(p_alert_id uuid,p_profile_id uuid,p_claim_token uuid,p_results jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare job public.email_alert_scans; a public.alerts; result jsonb; t public.tenders; ag public.agencies;
  due timestamptz; prepared integer:=0; accepted integer; version text;
begin
  select * into job from public.email_alert_scans where alert_id=p_alert_id and profile_id=p_profile_id for update;
  if not found or p_claim_token is null or job.claim_token is null or job.claim_token is distinct from p_claim_token or job.lease_until<=clock_timestamp() then
    raise exception 'ALERT_PAGE_LEASE_LOST' using errcode='40001';
  end if;
  select * into a from public.alerts where id=p_alert_id for share;
  perform 1 from public.interest_profiles where id=p_profile_id for share;
  if not private.email_alert_is_eligible(a.id) or job.config_key is distinct from private.email_alert_config_key(a.id,p_profile_id) then
    update public.email_alert_scans set claim_token=null,lease_until=null,cursor_id=null,config_key='',next_scan_at=now(),page_ids='{}',page_versions='{}' where alert_id=p_alert_id and profile_id=p_profile_id;
    return jsonb_build_object('status','invalidated','prepared',0);
  end if;
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results)>100 then
    raise exception 'ALERT_PAGE_RESULTS_INVALID' using errcode='22023';
  end if;
  due:=private.email_alert_ready_at(a.frequency,a.timezone,a.daily_send_time,now());
  for result in select value from jsonb_array_elements(p_results) loop
    if not (result->>'tender_id')::uuid=any(job.page_ids)
      or (result->>'score')::integer not between greatest(a.minimum_score,1) and 100
      or jsonb_typeof(result->'explanation') is distinct from 'array' then
      raise exception 'ALERT_PAGE_RESULT_NOT_ELIGIBLE' using errcode='22023';
    end if;
    select * into t from public.tenders where id=(result->>'tender_id')::uuid for share;
    if not found or t.proposal_close_at<=greatest(now(),due) or t.proposal_close_at is null
      or not t.is_ti or t.raw_data->>'situacaoCompraId' is distinct from '1' then continue; end if;
    select * into ag from public.agencies where id=t.agency_id for share;
    version:=pg_catalog.md5(jsonb_build_object('tender',to_jsonb(t),'agency',case when ag.id is null then null else to_jsonb(ag) end)::text);
    if version is distinct from job.page_versions->>t.id::text then continue; end if;
    insert into public.matches(organization_id,profile_id,tender_id,score,explanation,matched_at)
    values(a.organization_id,p_profile_id,t.id,(result->>'score')::smallint,result->'explanation',now())
    on conflict(organization_id,profile_id,tender_id) do update set score=excluded.score,explanation=excluded.explanation,matched_at=excluded.matched_at;
    insert into public.email_alert_queue(recipient_user_id,organization_id,tender_id,alert_id,profile_id,config_key,tender_version,score,explanation,ready_at)
    values(a.recipient_user_id,a.organization_id,t.id,a.id,p_profile_id,job.config_key,version,(result->>'score')::smallint,result->'explanation',due)
    on conflict(recipient_user_id,tender_id) do update set organization_id=excluded.organization_id,
      alert_id=excluded.alert_id,profile_id=excluded.profile_id,config_key=excluded.config_key,tender_version=excluded.tender_version,
      score=excluded.score,explanation=excluded.explanation,ready_at=excluded.ready_at,status='prepared',updated_at=now()
    where email_alert_queue.status<>'sent' and (
      email_alert_queue.status='canceled' or not private.email_alert_is_eligible(email_alert_queue.alert_id)
      or email_alert_queue.config_key is distinct from private.email_alert_config_key(email_alert_queue.alert_id,email_alert_queue.profile_id)
      or excluded.ready_at<email_alert_queue.ready_at or (excluded.ready_at=email_alert_queue.ready_at and excluded.score>email_alert_queue.score)
    );
    get diagnostics accepted=row_count;
    prepared:=prepared+accepted;
  end loop;
  update public.email_alert_scans set claim_token=null,lease_until=null,page_ids='{}',page_versions='{}',
    cursor_id=case when cardinality(job.page_ids)<100 then null else job.page_ids[cardinality(job.page_ids)] end,
    config_key=case when cardinality(job.page_ids)<100 then '' else job.config_key end,
    next_scan_at=case when cardinality(job.page_ids)<100 then now()+interval '15 minutes' else now() end,
    last_completed_at=case when cardinality(job.page_ids)<100 then now() else last_completed_at end,
    pages_completed=pages_completed+1,candidates_checked=candidates_checked+cardinality(job.page_ids),last_error=null
  where alert_id=p_alert_id and profile_id=p_profile_id;
  return jsonb_build_object('status','saved','prepared',prepared,'checked',cardinality(job.page_ids),'cycle_complete',cardinality(job.page_ids)<100);
end;
$$;

create function public.fail_email_alert_page(p_alert_id uuid,p_profile_id uuid,p_claim_token uuid)
returns void language sql security invoker set search_path=''
as $$
  update public.email_alert_scans set claim_token=null,lease_until=null,page_ids='{}',page_versions='{}',
    next_scan_at=now()+interval '5 minutes',last_error='Falha ao preparar página; nova tentativa agendada.'
  where alert_id=p_alert_id and profile_id=p_profile_id and claim_token=p_claim_token;
$$;

-- Bounded cleanup. Sending will need another eligibility check immediately before dispatch.
create function public.cancel_ineligible_email_alerts()
returns integer language plpgsql security invoker set search_path=''
as $$
declare n integer;
begin
  with invalid as (
    select q.id from public.email_alert_queue q join public.tenders t on t.id=q.tender_id
    where q.status='prepared' and (
      not private.email_alert_is_eligible(q.alert_id)
      or q.config_key is distinct from private.email_alert_config_key(q.alert_id,q.profile_id)
      or t.proposal_close_at is null or t.proposal_close_at<=greatest(now(),q.ready_at)
      or not t.is_ti or t.raw_data->>'situacaoCompraId' is distinct from '1'
      or q.tender_version is distinct from pg_catalog.md5(jsonb_build_object('tender',to_jsonb(t),'agency',(select to_jsonb(ag) from public.agencies ag where ag.id=t.agency_id))::text)
    ) order by q.ready_at for update of q skip locked limit 500
  ) update public.email_alert_queue set status='canceled',updated_at=now() where id in(select id from invalid);
  get diagnostics n=row_count;
  return n;
end;
$$;

revoke all on function public.claim_email_alert_page() from public,anon,authenticated;
revoke all on function public.save_email_alert_page(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.fail_email_alert_page(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.cancel_ineligible_email_alerts() from public,anon,authenticated;
grant execute on function public.claim_email_alert_page() to service_role;
grant execute on function public.save_email_alert_page(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.fail_email_alert_page(uuid,uuid,uuid) to service_role;
grant execute on function public.cancel_ineligible_email_alerts() to service_role;
