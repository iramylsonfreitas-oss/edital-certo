-- Health v1: independent from the existing TI classifier; only the purchase object is evidence.
create function public.classify_health_object(p_object text)
returns text[] language plpgsql stable security invoker set search_path=''
as $health$
declare v text := pg_catalog.regexp_replace(pg_catalog.lower(extensions.unaccent(coalesce(p_object,''))), '\s+', ' ', 'g'); result text[] := '{}';
begin
  if v ~ '(^|[^a-z0-9])(veterinar[a-z]*|animais|animal|caes|gatos|canin[a-z]*|felin[a-z]*)($|[^a-z0-9])' then return result; end if;
  if v ~ '(^|[^a-z0-9])(manutencao|reforma|construcao|limpeza|terceirizacao|credenciamento|prestacao de servicos|servicos medicos|exames medicos)($|[^a-z0-9])|(^|[^a-z0-9])locacao($|[^a-z0-9])' and not v ~ '(^|[^a-z0-9])(aquisicao|compra|compras)($|[^a-z0-9])' then return result; end if;
  if v ~ '(^|[^a-z0-9])(medicamentos?|farmacos?|vacinas?|insulinas?|soros? (fisiologicos?|glicosados?))($|[^a-z0-9])' then result:=pg_catalog.array_append(result,'medicines'); end if;
  if v ~ '(^|[^a-z0-9])((materia(l|is)|insumos?|correlatos?|consumo|dispositivos?) (de consumo )?(medico[- ]hospitalar(es)?|medicos?|hospitalares?|hospitalar|odontologicos?|de enfermagem)|materiais? de (sutura|enfermagem)|insumos para cirurgias?|materiais respiratorios|seringas?|agulhas hipodermicas|cateter(es)?|canulas?|ataduras?|curativos?|luvas (cirurgicas|de procedimento)|oxigenio medicinal|gases medicinais|opme|orteses|proteses (odontologicas|ortopedicas))($|[^a-z0-9])' then result:=pg_catalog.array_append(result,'supplies'); end if;
  if v ~ '(^|[^a-z0-9])(equipamentos? (e mobiliarios )?(de uso )?(medico[- ]hospitalar(es)?|medicos? hospitalares?|medicos?|hospitalares?|hospitalar|odontologicos?|de fisioterapia)|aparelhos? (medicos?|hospitalares?)|monitores? multiparametr(ic)?os?|ventiladores? pulmonares?|desfibrilador(es)?|eletrocardiografos?|autoclaves?|mamografos?|tomografos?|ultrassom (portatil|fixo|diagnostico)|bombas? de infusao|camas? hospitalares?|cadeiras? de rodas)($|[^a-z0-9])' then result:=pg_catalog.array_append(result,'equipment'); end if;
  return result;
end;
$health$;
revoke all on function public.classify_health_object(text) from public,anon,authenticated;
grant execute on function public.classify_health_object(text) to service_role;
alter table public.tenders add column health_categories text[] not null default '{}';
create function public.set_tender_health_classification()
returns trigger language plpgsql security invoker set search_path=''
as $$ begin new.health_categories:=public.classify_health_object(new.object); return new; end; $$;
revoke all on function public.set_tender_health_classification() from public,anon,authenticated;
grant execute on function public.set_tender_health_classification() to service_role;
create trigger classify_tender_health before insert or update of object,health_categories on public.tenders
for each row execute function public.set_tender_health_classification();
update public.tenders set health_categories=public.classify_health_object(object);
create index tenders_health_deadline_idx on public.tenders(proposal_close_at,id) where cardinality(health_categories)>0;
create index tenders_health_categories_idx on public.tenders using gin(health_categories) where cardinality(health_categories)>0;
create function public.search_tenders_by_segment(
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

revoke all on function public.search_tenders_by_segment(text, text, text, numeric, numeric, timestamptz, text, integer, integer, uuid, text, text, boolean, text, text) from public, anon;
grant execute on function public.search_tenders_by_segment(text, text, text, numeric, numeric, timestamptz, text, integer, integer, uuid, text, text, boolean, text, text) to authenticated;
