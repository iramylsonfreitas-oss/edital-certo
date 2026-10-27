-- Resolve aliases only for candidate keys that actually repeat, avoiding per-row lookups for singleton records.
create or replace function public.search_tenders_grouped(
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
  with repeated_keys as materialized (
    select procurement_group_key key from public.tenders where procurement_group_key is not null group by procurement_group_key having count(*)>1
  ), candidates as materialized (
    select
      t.id, case when exists(select 1 from repeated_keys r where r.key=t.procurement_group_key) then public.related_tender_ids(t.id) else array[t.id] end related_ids,
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

create or replace function public.tender_group_counts(p_segment text,p_organization_id uuid)
returns table(catalog_count bigint,favorite_count bigint)
language sql stable security invoker set search_path=''
as $$
  with repeated_keys as materialized (
    select procurement_group_key key from public.tenders where procurement_group_key is not null group by procurement_group_key having count(*)>1
  ), groups as materialized (
    select distinct case when exists(select 1 from repeated_keys r where r.key=t.procurement_group_key) then public.related_tender_ids(t.id) else array[t.id] end ids from public.tenders t
    where (p_segment='it' and t.is_ti) or (p_segment='health' and cardinality(t.health_categories)>0)
  )
  select count(*),count(*) filter(where exists(select 1 from public.tender_feedback f where f.organization_id=p_organization_id and f.user_id=(select auth.uid()) and f.state='favorite' and f.tender_id=any(g.ids))) from groups g;
$$;

create or replace function public.tender_group_members(p_tender_ids uuid[])
returns table(tender_id uuid,related_ids uuid[])
language sql stable security invoker set search_path=''
as $$ with repeated_keys as materialized (
    select procurement_group_key key from public.tenders where procurement_group_key is not null group by procurement_group_key having count(*)>1
  ) select t.id,case when exists(select 1 from repeated_keys r where r.key=t.procurement_group_key) then public.related_tender_ids(t.id) else array[t.id] end from public.tenders t where t.id=any(p_tender_ids) and cardinality(p_tender_ids)<=1000; $$;

drop trigger refresh_procurement_group_key on public.tenders;
create trigger refresh_procurement_group_key before insert or update of source_key,object,raw_data,agency_id,modality_code,municipality_code,estimated_value,proposal_close_at,source_updated_at,items_complete,items_source_version,items_object_hash on public.tenders
for each row execute function private.refresh_procurement_group_key();
