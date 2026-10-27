-- Group public publications conservatively. No source or tenant record is deleted or rekeyed.
alter table public.tenders add column procurement_group_key text;
create index tenders_procurement_group_idx on public.tenders(procurement_group_key) where procurement_group_key is not null;

create function private.procurement_text(value text) returns text
language sql stable security invoker set search_path=''
as $$ select trim(pg_catalog.regexp_replace(pg_catalog.lower(extensions.unaccent(coalesce(value,''))),'[^a-z0-9]+',' ','g')); $$;
revoke all on function private.procurement_text(text) from public,anon;
grant execute on function private.procurement_text(text) to authenticated,service_role;

create function private.refresh_procurement_group_key() returns trigger
language plpgsql security invoker set search_path=''
as $$
declare unit_code text; purchase text; item_count bigint; complete_values boolean; financial_signature text; normalized_object text;
begin
  new.procurement_group_key:=null;
  if new.source_key<>'pncp' or new.agency_id is null or not new.items_complete
    or new.items_object_hash is distinct from pg_catalog.md5(new.object)
    or new.items_source_version is distinct from new.source_updated_at
    or new.proposal_close_at is null or new.estimated_value is null or new.estimated_value<=0 then return new; end if;
  unit_code:=trim(coalesce(new.raw_data->'unidadeOrgao'->>'codigoUnidade',''));
  purchase:=private.procurement_text(new.raw_data->>'numeroCompra');
  if unit_code='' or purchase='' or coalesce(new.raw_data->>'anoCompra','') !~ '^[0-9]{4}$' or new.modality_code is null then return new; end if;
  if unit_code ~ '^[0-9]+$' then unit_code:=coalesce(nullif(ltrim(unit_code,'0'),''),'0'); end if;
  normalized_object:=private.procurement_text(pg_catalog.regexp_replace(pg_catalog.lower(extensions.unaccent(new.object)), '^\s*\[(portal de compras publicas|licitanet)\]\s*-?\s*', ''));
  if length(normalized_object)<20 then return new; end if;
  select count(*),bool_and(coalesce(i.quantity>0 and i.estimated_unit_value>0 and i.estimated_total_value>0 and nullif(trim(i.unit),'') is not null,false)),
    md5(string_agg(jsonb_build_array(i.item_number,case when private.procurement_text(i.unit) in ('un','unidade','unidades','und') then 'unidade' else private.procurement_text(i.unit) end,i.quantity,i.estimated_unit_value,i.estimated_total_value)::text,'|' order by i.item_number))
    into item_count,complete_values,financial_signature from public.tender_items i where i.tender_id=new.id;
  if item_count<2 or complete_values is distinct from true then return new; end if;
  new.procurement_group_key:=md5(jsonb_build_array(new.source_key,new.agency_id,unit_code,purchase,new.raw_data->>'anoCompra',new.modality_code,new.municipality_code,normalized_object,new.estimated_value,extract(epoch from new.proposal_close_at),new.raw_data->>'srp',new.raw_data->'amparoLegal'->>'codigo',new.raw_data->>'situacaoCompraId',financial_signature)::text);
  return new;
end;
$$;
revoke all on function private.refresh_procurement_group_key() from public,anon,authenticated;
grant execute on function private.refresh_procurement_group_key() to service_role;
create trigger refresh_procurement_group_key before insert or update of object,raw_data,agency_id,modality_code,municipality_code,estimated_value,proposal_close_at,source_updated_at,items_complete,items_source_version,items_object_hash on public.tenders
for each row execute function private.refresh_procurement_group_key();

create function private.invalidate_procurement_group_key() returns trigger
language plpgsql security invoker set search_path=''
as $$
begin
  update public.tenders set procurement_group_key=null where id=coalesce(new.tender_id,old.tender_id) and procurement_group_key is not null;
  if tg_op='UPDATE' and old.tender_id is distinct from new.tender_id then
    update public.tenders set procurement_group_key=null where id=old.tender_id and procurement_group_key is not null;
  end if;
  return null;
end;
$$;
revoke all on function private.invalidate_procurement_group_key() from public,anon,authenticated;
grant execute on function private.invalidate_procurement_group_key() to service_role;
create trigger invalidate_procurement_group_key after insert or update of tender_id,item_number,description,unit,quantity,estimated_unit_value,estimated_total_value or delete on public.tender_items
for each row execute function private.invalidate_procurement_group_key();
update public.tenders set raw_data=raw_data where items_complete;

create function public.related_tender_ids(p_tender_id uuid) returns uuid[]
language plpgsql stable security invoker set search_path=''
as $$
declare group_key text; related uuid[];
begin
  select t.procurement_group_key into group_key from public.tenders t where t.id=p_tender_id;
  if not found then return '{}'::uuid[]; end if;
  if group_key is null then return array[p_tender_id]; end if;
  select array_agg(t.id order by length(t.items_search_text) desc,(t.official_url is not null) desc,t.id) into related
    from public.tenders t where t.procurement_group_key=group_key;
  if cardinality(related)<2 or cardinality(related)>20 then return array[p_tender_id]; end if;
  -- Every pair must agree: equal names, or a whole-word prefix plus additional specifications.
  if exists (
    select 1 from public.tender_items a join public.tender_items b on a.item_number=b.item_number and a.tender_id<b.tender_id
    cross join lateral (select private.procurement_text(a.description) x,private.procurement_text(b.description) y) names
    where a.tender_id=any(related) and b.tender_id=any(related)
      and not (x=y or (least(length(x),length(y))>=4 and (strpos(x,y||' ')=1 or strpos(y,x||' ')=1)))
  ) then return array[p_tender_id]; end if;
  return related;
end;
$$;
revoke all on function public.related_tender_ids(uuid) from public,anon;
grant execute on function public.related_tender_ids(uuid) to authenticated,service_role;

create function public.tender_group_members(p_tender_ids uuid[])
returns table(tender_id uuid,related_ids uuid[])
language sql stable security invoker set search_path=''
as $$ select t.id,public.related_tender_ids(t.id) from public.tenders t where t.id=any(p_tender_ids) and cardinality(p_tender_ids)<=1000; $$;
revoke all on function public.tender_group_members(uuid[]) from public,anon;
grant execute on function public.tender_group_members(uuid[]) to authenticated,service_role;

create function public.tender_group_publications(p_tender_id uuid)
returns table(tender_id uuid,source_key text,source_id text,title text,official_url text)
language sql stable security invoker set search_path=''
as $$ select t.id,t.source_key,t.source_id,t.title,t.official_url from public.tenders t where t.id=any(public.related_tender_ids(p_tender_id)) order by t.id; $$;
revoke all on function public.tender_group_publications(uuid) from public,anon;
grant execute on function public.tender_group_publications(uuid) to authenticated;

create function public.tender_group_feedback(p_tender_id uuid)
returns table(organization_id uuid,state public.tender_feedback_state)
language sql stable security invoker set search_path=''
as $$ select f.organization_id,f.state from public.tender_feedback f where f.user_id=(select auth.uid()) and f.tender_id=any(public.related_tender_ids(p_tender_id)); $$;
revoke all on function public.tender_group_feedback(uuid) from public,anon;
grant execute on function public.tender_group_feedback(uuid) to authenticated;

create function public.tender_group_pipeline(p_tender_id uuid)
returns table(organization_id uuid)
language sql stable security invoker set search_path=''
as $$ select distinct c.organization_id from public.pipeline_cards c where c.tender_id=any(public.related_tender_ids(p_tender_id)) and c.archived_at is null; $$;
revoke all on function public.tender_group_pipeline(uuid) from public,anon;
grant execute on function public.tender_group_pipeline(uuid) to authenticated;

create function public.set_tender_group_feedback(p_organization_id uuid,p_tender_id uuid,p_state public.tender_feedback_state default null)
returns void language plpgsql security invoker set search_path=''
as $$
declare ids uuid[];
begin
  if (select auth.uid()) is null or not public.current_account_access() or not private.has_org_role(p_organization_id) then raise insufficient_privilege using message='Acesso negado'; end if;
  ids:=public.related_tender_ids(p_tender_id);
  if cardinality(ids)=0 then raise exception 'Publicação indisponível'; end if;
  if p_state is null then
    delete from public.tender_feedback where organization_id=p_organization_id and user_id=(select auth.uid()) and tender_id=any(ids);
  else
    insert into public.tender_feedback(organization_id,user_id,tender_id,state)
      select p_organization_id,(select auth.uid()),id,p_state from unnest(ids) id
      on conflict(organization_id,user_id,tender_id) do update set state=excluded.state;
  end if;
end;
$$;
revoke all on function public.set_tender_group_feedback(uuid,uuid,public.tender_feedback_state) from public,anon;
grant execute on function public.set_tender_group_feedback(uuid,uuid,public.tender_feedback_state) to authenticated;

create or replace function public.follow_tender(p_organization_id uuid,p_tender_id uuid)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare ids uuid[]; existing uuid; result uuid;
begin
  if (select auth.uid()) is null or not public.current_account_access() or not private.has_org_role(p_organization_id,array['admin','analyst']::public.organization_role[]) then raise insufficient_privilege using message='Acesso negado'; end if;
  ids:=public.related_tender_ids(p_tender_id);
  if cardinality(ids)=0 then raise exception 'Publicação indisponível'; end if;
  select c.id into existing from public.pipeline_cards c where c.organization_id=p_organization_id and c.tender_id=any(ids) order by (c.archived_at is null) desc,c.created_at,c.id limit 1;
  if existing is not null then
    update public.pipeline_cards set archived_at=null where id=existing returning id into result;
    return result;
  end if;
  insert into public.pipeline_cards(organization_id,tender_id,created_by) values(p_organization_id,ids[1],(select auth.uid()))
    on conflict(organization_id,tender_id) do update set archived_at=null returning id into result;
  return result;
end;
$$;

create function public.search_tenders_grouped(
  p_query text default null,
  p_uf text default null,
  p_modality_code text default null,
  p_minimum_value numeric default null,
  p_maximum_value numeric default null,
  p_closes_before timestamptz default null,
  p_sort text default 'deadline',
  p_page integer default 1,
  p_page_size integer default 50,
  p_organization_id uuid default null,
  p_list_mode text default 'all',
  p_sphere text default null,
  p_show_closed boolean default false,
  p_segment text default 'it',
  p_health_category text default null
)
returns table (tender_id uuid, search_rank real, total_count bigint, related_ids uuid[])
language sql stable security invoker set search_path = ''
as $$
  with candidates as materialized (
    select
      t.id, public.related_tender_ids(t.id) related_ids,
      t.proposal_close_at,
      t.estimated_value,
      case
        when nullif(trim(p_query), '') is null then 0::real
        else pg_catalog.ts_rank(
          t.search_vector,
          pg_catalog.websearch_to_tsquery('portuguese', extensions.unaccent(trim(p_query)))
        )
      end as rank_value
    from public.tenders t
    where ((p_segment='it' and t.is_ti) or (p_segment='health' and cardinality(t.health_categories)>0))
      and (p_health_category is null or (p_segment='health' and t.health_categories @> array[p_health_category]))
      and (nullif(trim(p_query), '') is null or t.search_vector @@ pg_catalog.websearch_to_tsquery('portuguese', extensions.unaccent(trim(p_query))))
      and (p_uf is null or t.uf = upper(trim(p_uf)))
      and (p_modality_code is null or t.modality_code = p_modality_code)
      and (p_sphere is null or exists (
        select 1 from public.agencies a where a.id = t.agency_id and a.sphere = p_sphere
      ))
      and (p_minimum_value is null or t.estimated_value >= p_minimum_value)
      and (p_maximum_value is null or t.estimated_value <= p_maximum_value)
      and (p_closes_before is null or t.proposal_close_at <= p_closes_before)
      and (p_show_closed or t.proposal_close_at is null or t.proposal_close_at >= pg_catalog.now())
  ), groups as (
    select related_ids,max(rank_value) rank_value from candidates group by related_ids
  ), filtered as (
    select t.id,t.proposal_close_at,t.estimated_value,g.rank_value,g.related_ids
    from groups g join public.tenders t on t.id=g.related_ids[1]
    where (p_list_mode='all' and (exists(select 1 from public.tender_feedback f where f.organization_id=p_organization_id and f.user_id=(select auth.uid()) and f.tender_id=any(g.related_ids) and f.state='favorite') or not exists(select 1 from public.tender_feedback f where f.organization_id=p_organization_id and f.user_id=(select auth.uid()) and f.tender_id=any(g.related_ids) and f.state='discarded'))) or (p_list_mode='favorites' and exists(select 1 from public.tender_feedback f where f.organization_id=p_organization_id and f.user_id=(select auth.uid()) and f.tender_id=any(g.related_ids) and f.state='favorite')) or (p_list_mode='discarded' and exists(select 1 from public.tender_feedback f where f.organization_id=p_organization_id and f.user_id=(select auth.uid()) and f.tender_id=any(g.related_ids) and f.state='discarded') and not exists(select 1 from public.tender_feedback f where f.organization_id=p_organization_id and f.user_id=(select auth.uid()) and f.tender_id=any(g.related_ids) and f.state='favorite'))
  ), counted as (
    select filtered.*,count(*) over() row_count from filtered
  )
  select counted.id,counted.rank_value,counted.row_count,counted.related_ids from counted
  order by
    case when p_sort='relevance' then counted.rank_value end desc,
    case when p_sort='value' then counted.estimated_value end desc nulls last,
    case when p_sort='deadline' or p_sort='relevance' then counted.proposal_close_at end asc nulls last,
    counted.id
  limit least(100,greatest(1,coalesce(p_page_size,50)))
  offset (greatest(1,coalesce(p_page,1))-1)*least(100,greatest(1,coalesce(p_page_size,50)));
$$;
revoke all on function public.search_tenders_grouped(text,text,text,numeric,numeric,timestamptz,text,integer,integer,uuid,text,text,boolean,text,text) from public,anon;
grant execute on function public.search_tenders_grouped(text,text,text,numeric,numeric,timestamptz,text,integer,integer,uuid,text,text,boolean,text,text) to authenticated;

create function public.tender_group_counts(p_segment text,p_organization_id uuid)
returns table(catalog_count bigint,favorite_count bigint)
language sql stable security invoker set search_path=''
as $$
  with groups as materialized (
    select distinct public.related_tender_ids(t.id) ids from public.tenders t
    where (p_segment='it' and t.is_ti) or (p_segment='health' and cardinality(t.health_categories)>0)
  )
  select count(*),count(*) filter(where exists(select 1 from public.tender_feedback f where f.organization_id=p_organization_id and f.user_id=(select auth.uid()) and f.state='favorite' and f.tender_id=any(g.ids))) from groups g;
$$;
revoke all on function public.tender_group_counts(text,uuid) from public,anon;
grant execute on function public.tender_group_counts(text,uuid) to authenticated;
