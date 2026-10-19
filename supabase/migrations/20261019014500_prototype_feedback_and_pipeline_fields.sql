alter table public.pipeline_cards
  add column if not exists responsible_name text not null default '',
  add column if not exists checklist jsonb not null default '[]'::jsonb;

alter table public.pipeline_cards
  drop constraint if exists pipeline_cards_checklist_is_array;

alter table public.pipeline_cards
  add constraint pipeline_cards_checklist_is_array
  check (jsonb_typeof(checklist) = 'array');

create or replace function public.search_tenders_for_list(
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
  p_list_mode text default 'all'
)
returns table (tender_id uuid, search_rank real, total_count bigint)
language sql stable security invoker set search_path = ''
as $$
  with filtered as (
    select
      t.id,
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
    where (nullif(trim(p_query), '') is null or t.search_vector @@ pg_catalog.websearch_to_tsquery('portuguese', extensions.unaccent(trim(p_query))))
      and (p_uf is null or t.uf = upper(trim(p_uf)))
      and (p_modality_code is null or t.modality_code = p_modality_code)
      and (p_minimum_value is null or t.estimated_value >= p_minimum_value)
      and (p_maximum_value is null or t.estimated_value <= p_maximum_value)
      and (p_closes_before is null or t.proposal_close_at <= p_closes_before)
      and (t.proposal_close_at is null or t.proposal_close_at >= pg_catalog.now())
      and (
        (p_list_mode = 'all' and not exists (
          select 1 from public.tender_feedback f
          where f.organization_id = p_organization_id
            and f.user_id = (select auth.uid())
            and f.tender_id = t.id
            and f.state = 'discarded'
        ))
        or (p_list_mode = 'favorites' and exists (
          select 1 from public.tender_feedback f
          where f.organization_id = p_organization_id
            and f.user_id = (select auth.uid())
            and f.tender_id = t.id
            and f.state = 'favorite'
        ))
        or (p_list_mode = 'discarded' and exists (
          select 1 from public.tender_feedback f
          where f.organization_id = p_organization_id
            and f.user_id = (select auth.uid())
            and f.tender_id = t.id
            and f.state = 'discarded'
        ))
      )
      and p_list_mode in ('all', 'favorites', 'discarded')
  ), counted as (
    select filtered.*, pg_catalog.count(*) over () as row_count from filtered
  )
  select counted.id, counted.rank_value, counted.row_count
  from counted
  order by
    case when p_sort = 'relevance' then counted.rank_value end desc,
    case when p_sort = 'value' then counted.estimated_value end desc nulls last,
    case when p_sort = 'deadline' or p_sort = 'relevance' then counted.proposal_close_at end asc nulls last,
    counted.id
  limit least(100, greatest(1, coalesce(p_page_size, 50)))
  offset (greatest(1, coalesce(p_page, 1)) - 1) * least(100, greatest(1, coalesce(p_page_size, 50)));
$$;

revoke all on function public.search_tenders_for_list(text, text, text, numeric, numeric, timestamptz, text, integer, integer, uuid, text) from public, anon;
grant execute on function public.search_tenders_for_list(text, text, text, numeric, numeric, timestamptz, text, integer, integer, uuid, text) to authenticated;
