-- TI rules ported from scripts/coletar-pncp.mjs. Objects only: agency names are not evidence.
-- Cache classification at write time; searches use an indexed boolean rather than repeated regex scans.
create or replace function public.is_ti_tender(p_object text)
returns boolean language plpgsql stable security invoker set search_path = ''
as $ti$
declare v_text text := pg_catalog.lower(extensions.unaccent(coalesce(p_object, '')));
begin
  if v_text ~ '((^|[^a-z0-9])cirurg[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])transporte\s+vertical[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])elevador[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])radiolog[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])raio-x[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])raio\s+x[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])raios-x[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])raios\s+x[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])termodesinfectora[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])alimentacao\s+e\s+hospedagem[a-z0-9]*($|[^a-z0-9]))' then return false; end if;
  if v_text ~ '((^|[^a-z0-9])storage\s+server($|[^a-z0-9]))|((^|[^a-z0-9])disco\s+rigido($|[^a-z0-9]))|((^|[^a-z0-9])discos\s+rigidos($|[^a-z0-9]))|((^|[^a-z0-9])monitor\s+de\s+video($|[^a-z0-9]))|((^|[^a-z0-9])monitores\s+de\s+video($|[^a-z0-9]))|((^|[^a-z0-9])informatica($|[^a-z0-9]))|((^|[^a-z0-9])informatica\s+e\s+comunicacao($|[^a-z0-9]))|((^|[^a-z0-9])softwares?($|[^a-z0-9]))|((^|[^a-z0-9])notebooks?($|[^a-z0-9]))|((^|[^a-z0-9])computador(?:es)?($|[^a-z0-9]))|((^|[^a-z0-9])desktop($|[^a-z0-9]))|((^|[^a-z0-9])ti($|[^a-z0-9]))|((^|[^a-z0-9])tecnologia\s+da\s+informacao($|[^a-z0-9]))|((^|[^a-z0-9])tecnologia\s+da\s+informacao\s+e\s+comunicacao($|[^a-z0-9]))|((^|[^a-z0-9])nuvems?($|[^a-z0-9]))|((^|[^a-z0-9])data\s+center($|[^a-z0-9]))|((^|[^a-z0-9])datacenter($|[^a-z0-9]))|((^|[^a-z0-9])vmware($|[^a-z0-9]))|((^|[^a-z0-9])secure\s+web\s+gateway($|[^a-z0-9]))|((^|[^a-z0-9])proxy($|[^a-z0-9]))|((^|[^a-z0-9])antimalware($|[^a-z0-9]))|((^|[^a-z0-9])equipamento\s+de\s+informatica($|[^a-z0-9]))|((^|[^a-z0-9])equipamentos\s+de\s+informatica($|[^a-z0-9]))|((^|[^a-z0-9])switch(?:es)?($|[^a-z0-9]))|((^|[^a-z0-9])firewalls?($|[^a-z0-9]))|((^|[^a-z0-9])nobreaks?($|[^a-z0-9]))|((^|[^a-z0-9])toners?($|[^a-z0-9]))|((^|[^a-z0-9])cartuchos?($|[^a-z0-9]))|((^|[^a-z0-9])radiocomunicacao\s+digital($|[^a-z0-9]))|((^|[^a-z0-9])impressora\s+3d($|[^a-z0-9]))|((^|[^a-z0-9])impressoras\s+3d($|[^a-z0-9]))|((^|[^a-z0-9])manutencao\s+de\s+impressora($|[^a-z0-9]))|((^|[^a-z0-9])manutencao\s+de\s+impressoras($|[^a-z0-9]))|((^|[^a-z0-9])outsourcing\s+de\s+impressao($|[^a-z0-9]))|((^|[^a-z0-9])suporte\s+tecnico\s+de\s+informatica($|[^a-z0-9]))|((^|[^a-z0-9])suporte\s+tecnico\s+de\s+ti($|[^a-z0-9]))|((^|[^a-z0-9])desenvolvimento\s+de\s+software($|[^a-z0-9]))|((^|[^a-z0-9])licenciamento\s+de\s+software($|[^a-z0-9]))|((^|[^a-z0-9])rede\s+de\s+computadores($|[^a-z0-9]))|((^|[^a-z0-9])rede\s+de\s+dados($|[^a-z0-9]))|((^|[^a-z0-9])banco\s+de\s+dados($|[^a-z0-9]))|((^|[^a-z0-9])centro\s+de\s+dados($|[^a-z0-9]))|((^|[^a-z0-9])protecao\s+de\s+dados($|[^a-z0-9]))|((^|[^a-z0-9])ciencia\s+de\s+dados($|[^a-z0-9]))|((^|[^a-z0-9])licenca\s+de\s+software($|[^a-z0-9]))|((^|[^a-z0-9])licencas\s+de\s+software($|[^a-z0-9]))|((^|[^a-z0-9])licencas\s+de\s+softwares($|[^a-z0-9]))|((^|[^a-z0-9])licenca\s+de\s+uso\s+de\s+software($|[^a-z0-9]))|((^|[^a-z0-9])licencas\s+de\s+uso\s+de\s+software($|[^a-z0-9]))|((^|[^a-z0-9])telefonia\s+ip($|[^a-z0-9]))|((^|[^a-z0-9])telefonia\s+voip($|[^a-z0-9]))|((^|[^a-z0-9])tronco\s+sip($|[^a-z0-9]))|((^|[^a-z0-9])central\s+telefonica($|[^a-z0-9]))|((^|[^a-z0-9])central\s+telefonica($|[^a-z0-9]))|((^|[^a-z0-9])link\s+de\s+internet($|[^a-z0-9]))|((^|[^a-z0-9])tablets?($|[^a-z0-9]))|((^|[^a-z0-9])sistema\s+academico($|[^a-z0-9]))|((^|[^a-z0-9])sistema\s+web($|[^a-z0-9]))|((^|[^a-z0-9])sistema\s+de\s+informacao($|[^a-z0-9]))|((^|[^a-z0-9])sistema\s+informatizado($|[^a-z0-9]))|((^|[^a-z0-9])infraestrutura\s+de\s+rede($|[^a-z0-9]))|((^|[^a-z0-9])rede\s+ip($|[^a-z0-9]))|((^|[^a-z0-9])rede\s+logica($|[^a-z0-9]))|((^|[^a-z0-9])cabeamento\s+estruturado($|[^a-z0-9]))|((^|[^a-z0-9])locacao\s+de\s+impressoras($|[^a-z0-9]))|((^|[^a-z0-9])locacao\s+e\s+suporte\s+de\s+impressoras($|[^a-z0-9]))|((^|[^a-z0-9])sistema\s+de\s+alimentacao\s+ininterrupta($|[^a-z0-9]))|((^|[^a-z0-9])alimentacao\s+ininterrupta($|[^a-z0-9]))|((^|[^a-z0-9])ups($|[^a-z0-9]))'
    or v_text ~ '((^|[^a-z0-9])servidor\s+de\s+rede[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])servidores\s+de\s+rede[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])servidor\s+fisico[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])servidores\s+fisicos[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])servidor\s+de\s+dados[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])servidores\s+de\s+dados[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])servidor\s+de\s+rack[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])servidores\s+de\s+rack[a-z0-9]*($|[^a-z0-9]))'
    or (v_text ~ '(^|[^a-z0-9])impressoras?($|[^a-z0-9])' and v_text ~ '(^|[^a-z0-9])manutencao($|[^a-z0-9])')
    or (v_text ~ '((^|[^a-z0-9])sistema\s+de\s+gestao($|[^a-z0-9]))' and v_text ~ '(^|[^a-z0-9])(web|nuvem|software|informatizado)($|[^a-z0-9])')
  then return true; end if;
  if v_text ~ '((^|[^a-z0-9])viagem[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])viagens[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])paciente[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])veiculo[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])veiculo[a-z0-9]*($|[^a-z0-9]))'
    or (v_text ~ '((^|[^a-z0-9])alimentacao[a-z0-9]*($|[^a-z0-9]))' and not v_text ~ '((^|[^a-z0-9])alimentacao\s+ininterrupta($|[^a-z0-9]))')
    or (v_text ~ '((^|[^a-z0-9])obra[a-z0-9]*($|[^a-z0-9]))' and not v_text ~ '((^|[^a-z0-9])mao\s+de\s+obra($|[^a-z0-9]))')
  then return false; end if;
  return (v_text ~ '((^|[^a-z0-9])notebooks?($|[^a-z0-9]))|((^|[^a-z0-9])computador(?:es)?($|[^a-z0-9]))|((^|[^a-z0-9])desktop($|[^a-z0-9]))|((^|[^a-z0-9])servidor(?:es)?($|[^a-z0-9]))|((^|[^a-z0-9])softwares?($|[^a-z0-9]))|((^|[^a-z0-9])tecnologia\s+da\s+informacao($|[^a-z0-9]))|((^|[^a-z0-9])tecnologia\s+da\s+informacao($|[^a-z0-9]))|((^|[^a-z0-9])tecnologia\s+da\s+informacao\s+e\s+comunicacao($|[^a-z0-9]))|((^|[^a-z0-9])tecnologia\s+da\s+informacao\s+e\s+comunicacao($|[^a-z0-9]))|((^|[^a-z0-9])solucao\s+de\s+tecnologia\s+da\s+informacao($|[^a-z0-9]))|((^|[^a-z0-9])solucao\s+de\s+tecnologia\s+da\s+informacao($|[^a-z0-9]))|((^|[^a-z0-9])informatica($|[^a-z0-9]))|((^|[^a-z0-9])informatica\s+e\s+comunicacao($|[^a-z0-9]))|((^|[^a-z0-9])equipamento\s+de\s+informatica($|[^a-z0-9]))|((^|[^a-z0-9])equipamento\s+de\s+informatica($|[^a-z0-9]))|((^|[^a-z0-9])equipamentos\s+de\s+informatica($|[^a-z0-9]))|((^|[^a-z0-9])equipamentos\s+de\s+informatica($|[^a-z0-9]))|((^|[^a-z0-9])infraestrutura\s+de\s+rede($|[^a-z0-9]))|((^|[^a-z0-9])rede\s+de\s+computadores($|[^a-z0-9]))|((^|[^a-z0-9])rede\s+de\s+dados($|[^a-z0-9]))|((^|[^a-z0-9])rede\s+corporativa($|[^a-z0-9]))|((^|[^a-z0-9])rede\s+wi-fi($|[^a-z0-9]))|((^|[^a-z0-9])rede\s+wifi($|[^a-z0-9]))|((^|[^a-z0-9])redes?($|[^a-z0-9]))|((^|[^a-z0-9])sistemas?($|[^a-z0-9]))|((^|[^a-z0-9])switch(?:es)?($|[^a-z0-9]))|((^|[^a-z0-9])firewalls?($|[^a-z0-9]))|((^|[^a-z0-9])nobreaks?($|[^a-z0-9]))|((^|[^a-z0-9])impressoras?($|[^a-z0-9]))|((^|[^a-z0-9])toners?($|[^a-z0-9]))|((^|[^a-z0-9])cartuchos?($|[^a-z0-9]))|((^|[^a-z0-9])vmware($|[^a-z0-9]))|((^|[^a-z0-9])secure\s+web\s+gateway($|[^a-z0-9]))|((^|[^a-z0-9])proxy($|[^a-z0-9]))|((^|[^a-z0-9])antimalware($|[^a-z0-9]))|((^|[^a-z0-9])radiocomunicacao\s+digital($|[^a-z0-9]))|((^|[^a-z0-9])impressora\s+3d($|[^a-z0-9]))|((^|[^a-z0-9])impressoras\s+3d($|[^a-z0-9]))|((^|[^a-z0-9])outsourcing\s+de\s+impressao($|[^a-z0-9]))|((^|[^a-z0-9])suporte\s+tecnico\s+de\s+informatica($|[^a-z0-9]))|((^|[^a-z0-9])suporte\s+tecnico\s+de\s+informatica($|[^a-z0-9]))|((^|[^a-z0-9])suporte\s+tecnico\s+de\s+ti($|[^a-z0-9]))|((^|[^a-z0-9])desenvolvimento\s+de\s+software($|[^a-z0-9]))|((^|[^a-z0-9])desenvolvimento\s+de\s+sistema($|[^a-z0-9]))|((^|[^a-z0-9])sistema\s+informatizado($|[^a-z0-9]))|((^|[^a-z0-9])sistema\s+de\s+informacao($|[^a-z0-9]))|((^|[^a-z0-9])sistema\s+de\s+informacao($|[^a-z0-9]))|((^|[^a-z0-9])sistema\s+web($|[^a-z0-9]))|((^|[^a-z0-9])sistema\s+academico($|[^a-z0-9]))|((^|[^a-z0-9])sistema\s+academico($|[^a-z0-9]))|((^|[^a-z0-9])licenciamento\s+de\s+software($|[^a-z0-9]))|((^|[^a-z0-9])hospedagem($|[^a-z0-9]))|((^|[^a-z0-9])nuvems?($|[^a-z0-9]))|((^|[^a-z0-9])data\s+center($|[^a-z0-9]))|((^|[^a-z0-9])link\s+de\s+internet($|[^a-z0-9]))|((^|[^a-z0-9])monitor(?:es)?($|[^a-z0-9]))|((^|[^a-z0-9])monitor\s+de\s+video($|[^a-z0-9]))|((^|[^a-z0-9])monitor\s+de\s+video($|[^a-z0-9]))|((^|[^a-z0-9])tablets?($|[^a-z0-9]))')
    and not (v_text ~ '((^|[^a-z0-9])sistemas?($|[^a-z0-9]))|((^|[^a-z0-9])redes?($|[^a-z0-9]))|((^|[^a-z0-9])hospedagem($|[^a-z0-9]))|((^|[^a-z0-9])monitor(?:es)?($|[^a-z0-9]))|((^|[^a-z0-9])impressoras?($|[^a-z0-9]))|((^|[^a-z0-9])servidor(?:es)?($|[^a-z0-9]))')
    and not (v_text ~ '((^|[^a-z0-9])servidor\s+publico[a-z0-9]*($|[^a-z0-9]))|((^|[^a-z0-9])servidores\s+publicos[a-z0-9]*($|[^a-z0-9]))');
end;
$ti$;
revoke all on function public.is_ti_tender(text) from public, anon, authenticated;
grant execute on function public.is_ti_tender(text) to service_role;

alter table public.tenders add column is_ti boolean not null default false;
create or replace function public.set_tender_ti_classification()
returns trigger language plpgsql security invoker set search_path = ''
as $trigger$
begin
  new.is_ti := public.is_ti_tender(new.object);
  return new;
end;
$trigger$;
revoke all on function public.set_tender_ti_classification() from public, anon, authenticated;
grant execute on function public.set_tender_ti_classification() to service_role;
create trigger classify_tender_ti before insert or update of object, is_ti on public.tenders
for each row execute function public.set_tender_ti_classification();
update public.tenders set is_ti = public.is_ti_tender(object);
create index tenders_ti_deadline_idx on public.tenders (proposal_close_at, id) where is_ti;
comment on column public.tenders.is_ti is 'TI classifier v1, matching prototype object rules; all original PNCP records are retained.';

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
  p_list_mode text default 'all',
  p_sphere text default null,
  p_show_closed boolean default false
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
    where (p_list_mode <> 'all' or t.is_ti)
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

revoke all on function public.search_tenders_for_list(text, text, text, numeric, numeric, timestamptz, text, integer, integer, uuid, text, text, boolean) from public, anon;
grant execute on function public.search_tenders_for_list(text, text, text, numeric, numeric, timestamptz, text, integer, integer, uuid, text, text, boolean) to authenticated;
