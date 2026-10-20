-- Public procurement data is shared; worker queues and staging are service-only.
alter table public.tenders
  add column items_complete boolean not null default false,
  add column items_checked_at timestamptz,
  add column items_source_version timestamptz,
  add column items_object_hash text,
  add column items_search_text text not null default '',
  add column is_ti_by_items boolean not null default false,
  add column ti_match_source text not null default 'none' check (ti_match_source in ('none','object','items'));

create table public.pncp_item_jobs (
  tender_id uuid primary key references public.tenders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','running','partial','succeeded','failed')),
  next_page integer not null default 1 check (next_page between 1 and 1000),
  claim_token uuid,
  lease_until timestamptz,
  retry_at timestamptz not null default now(),
  attempts integer not null default 0,
  error_message text,
  updated_at timestamptz not null default now()
);
create table public.pncp_item_staging (
  tender_id uuid not null references public.tenders(id) on delete cascade,
  item_number integer not null check (item_number>0),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  primary key(tender_id,item_number)
);
alter table public.pncp_item_jobs enable row level security;
alter table public.pncp_item_staging enable row level security;
revoke all on public.pncp_item_jobs, public.pncp_item_staging from public,anon,authenticated;
grant all on public.pncp_item_jobs, public.pncp_item_staging to service_role;
create index pncp_item_jobs_due_idx on public.pncp_item_jobs(retry_at,status);

-- Item descriptions need specific evidence; avoid ambiguous cartridges and onboard computers.
create function public.is_ti_item(p_description text) returns boolean
language sql stable security invoker set search_path=''
as $$
  select not (v ~ '(^|[^a-z0-9])(cirurg[a-z0-9]*|radiolog[a-z0-9]*|eletrocardiograf[a-z0-9]*|eletroencefalograf[a-z0-9]*|munic[a-z0-9]*|calibre|chocolate|computador de bordo)($|[^a-z0-9])')
    and not (v ~ '^(pecas? (mecanica|eletrica)|peca[[:space:]]*/[[:space:]]*acessorio[[:space:]]*-[[:space:]]*motor gerador)')
    and v ~ '(^|[^a-z0-9])(notebooks?|microcomputador(es)?|computador(es)?|desktops?|workstations?|informatica|softwares?|antivirus|antimalware|firewalls?|switch(es)?|roteador(es)?|nobreaks?|no-breaks?|tablets?|toners?|projetor(es)? multimedia|servidor(es)? de (rede|dados|rack)|servidor(es)? fisico(s)?|storage server|discos? rigidos?|memoria ram|monitor(es)? de video|rede (ip|logica|de dados|de computadores)|cabeamento estruturado|impressora(s)? (laser|jato|termica)|outsourcing de impressao)($|[^a-z0-9])'
  from (select pg_catalog.lower(extensions.unaccent(coalesce(p_description,''))) v) normalized;
$$;
revoke all on function public.is_ti_item(text) from public,anon,authenticated;
grant execute on function public.is_ti_item(text) to service_role;

create function public.queue_pncp_item_sync() returns trigger
language plpgsql security invoker set search_path=''
as $$
begin
  if new.source_key='pncp' and (tg_op='INSERT' or new.object is distinct from old.object or new.source_updated_at is distinct from old.source_updated_at) then
    insert into public.pncp_item_jobs(tender_id) values(new.id)
    on conflict(tender_id) do update set status='pending',next_page=1,claim_token=null,lease_until=null,retry_at=now(),attempts=0,error_message=null,updated_at=now();
    delete from public.pncp_item_staging where tender_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.queue_pncp_item_sync() from public,anon,authenticated;
grant execute on function public.queue_pncp_item_sync() to service_role;
create function public.claim_pncp_item_job()
returns table(tender_id uuid,source_id text,page integer,claim_token uuid)
language plpgsql security invoker set search_path=''
as $$
declare target uuid; token uuid:=extensions.gen_random_uuid();
begin
  select j.tender_id into target from public.pncp_item_jobs j join public.tenders t on t.id=j.tender_id
  where j.retry_at<=now() and (j.lease_until is null or j.lease_until<now())
    and (t.proposal_close_at is null or t.proposal_close_at>=now())
  order by case when not t.is_ti and extensions.unaccent(pg_catalog.lower(t.object)) ~ '(permanente|tecnolog|eletronic|sistema (de gestao|integrado))' then 0 when t.is_ti then 1 else 2 end,
    case when j.status='partial' then 0 else 1 end,t.proposal_close_at nulls last,j.updated_at,j.tender_id
  for update of j skip locked limit 1;
  if target is null then return; end if;
  update public.pncp_item_jobs j set status='running',claim_token=token,lease_until=now()+interval '150 seconds',updated_at=now() where j.tender_id=target;
  return query select t.id,t.source_id,j.next_page,token from public.tenders t join public.pncp_item_jobs j on j.tender_id=t.id where t.id=target;
end;
$$;

create function public.save_pncp_item_page(p_tender_id uuid,p_claim_token uuid,p_page integer,p_items jsonb,p_has_more boolean)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare j public.pncp_item_jobs; t public.tenders; item_text text; item_match boolean; veto text;
begin
  -- Same lock order as ingestion (tender, then queue) prevents cross-job deadlocks.
  select * into t from public.tenders where id=p_tender_id for update;
  select * into j from public.pncp_item_jobs where tender_id=p_tender_id for update;
  if j.claim_token is distinct from p_claim_token or p_claim_token is null or j.status<>'running' or j.next_page<>p_page or j.lease_until<now() then
    raise exception 'ITEM_JOB_STALE_LEASE';
  end if;
  if p_items is null or p_has_more is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>50 then raise exception 'ITEM_PAGE_INVALID'; end if;
  if p_page=1 then delete from public.pncp_item_staging where tender_id=p_tender_id; end if;
  insert into public.pncp_item_staging(tender_id,item_number,payload)
    select p_tender_id,(x->>'item_number')::integer,x from jsonb_array_elements(p_items) x
  on conflict(tender_id,item_number) do update set payload=excluded.payload;
  if p_has_more then
    if p_page>=1000 then raise exception 'ITEM_PAGE_LIMIT_REACHED'; end if;
    update public.pncp_item_jobs set status='partial',next_page=p_page+1,claim_token=null,lease_until=null,retry_at=now(),attempts=0,error_message=null,updated_at=now() where tender_id=p_tender_id;
    return jsonb_build_object('status','partial','next_page',p_page+1);
  end if;
  delete from public.tender_items where tender_id=p_tender_id;
  insert into public.tender_items(tender_id,source_item_id,item_number,description,unit,quantity,estimated_unit_value,estimated_total_value,raw_data)
    select p_tender_id,payload->>'item_number',item_number,payload->>'description',payload->>'unit',
      (payload->>'quantity')::numeric,
      case when (payload->>'budget_is_secret')::boolean then null else (payload->>'unit_value')::numeric end,
      case when (payload->>'budget_is_secret')::boolean then null else (payload->>'total_value')::numeric end,
      jsonb_build_object('orcamentoSigiloso',(payload->>'budget_is_secret')::boolean,'situacaoCompraItemNome',payload->>'status','catalogoCodigoItem',payload->>'catalog_code')
    from public.pncp_item_staging where tender_id=p_tender_id;
  select pg_catalog.left(coalesce(pg_catalog.string_agg(description,' ' order by item_number),''),64000),coalesce(pg_catalog.bool_or(public.is_ti_item(description)),false)
    into item_text,item_match from public.tender_items where tender_id=p_tender_id;
  -- Preserve the object's existing absolute exclusions even when a mixed purchase contains IT items.
  veto := pg_catalog.lower(extensions.unaccent(t.object));
  if veto ~ '(^|[^a-z0-9])(cirurg[a-z0-9]*|transporte vertical[a-z0-9]*|elevador[a-z0-9]*|radiolog[a-z0-9]*|raios?-?x[a-z0-9]*|raios? x[a-z0-9]*|termodesinfectora[a-z0-9]*|alimentacao e hospedagem[a-z0-9]*)($|[^a-z0-9])' then item_match:=false; end if;
  update public.tenders set items_complete=true,items_checked_at=now(),items_source_version=t.source_updated_at,
    items_object_hash=pg_catalog.md5(t.object),items_search_text=item_text,is_ti_by_items=item_match where id=p_tender_id;
  update public.pncp_item_jobs set status='succeeded',next_page=1,claim_token=null,lease_until=null,retry_at=now()+interval '24 hours',attempts=0,error_message=null,updated_at=now() where tender_id=p_tender_id;
  delete from public.pncp_item_staging where tender_id=p_tender_id;
  return jsonb_build_object('status','succeeded','items',(select count(*) from public.tender_items where tender_id=p_tender_id));
end;
$$;

create function public.fail_pncp_item_job(p_tender_id uuid,p_claim_token uuid,p_error text,p_rate_limited boolean default false)
returns void language sql security invoker set search_path=''
as $$
  update public.pncp_item_jobs set status='failed',claim_token=null,lease_until=null,attempts=attempts+1,
    retry_at=now()+case when p_rate_limited then interval '1 hour' else interval '15 minutes'*least(16,attempts+1) end,
    error_message=pg_catalog.left(p_error,500),updated_at=now()
  where tender_id=p_tender_id and claim_token=p_claim_token;
$$;
revoke all on function public.claim_pncp_item_job(), public.save_pncp_item_page(uuid,uuid,integer,jsonb,boolean), public.fail_pncp_item_job(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_pncp_item_job(), public.save_pncp_item_page(uuid,uuid,integer,jsonb,boolean), public.fail_pncp_item_job(uuid,uuid,text,boolean) to service_role;
