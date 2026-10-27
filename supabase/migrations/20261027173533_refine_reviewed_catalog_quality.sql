-- TI rules ported from scripts/coletar-pncp.mjs. Objects only: agency names are not evidence.
-- Cache classification at write time; searches use an indexed boolean rather than repeated regex scans.
create or replace function public.is_ti_tender(p_object text)
returns boolean language plpgsql stable security invoker set search_path = ''
as $ti$
declare v_text text := pg_catalog.lower(extensions.unaccent(coalesce(p_object, '')));
begin
  -- Conservative contextual refinements from the first external evaluation.
  if v_text ~ '(fornecimento|abastecimento).{0,160}(combustive|lubrificante)|(gestao|gerenciamento).{0,60}frota.{0,180}(manutencao|pecas|veiculos)|frota.{0,100}(fornecimento|abastecimento)' and not v_text ~ '(licenciamento|licenca|desenvolvimento|cessao|locacao).{0,60}(software|sistema)' then return false; end if;
  if v_text ~ '(reforma|pintura|reparo).{0,90}(predio|predial|sala|piso)' and not v_text ~ 'notebook|microcomputador|computador|software|cabeamento estruturado|infraestrutura de rede|rede de dados|data[[:space:]]*center|datacenter|nobreak' then return false; end if;
  if v_text ~ '(^|[^a-z0-9])cartuchos?($|[^a-z0-9])' and not v_text ~ '(^|[^a-z0-9])(tinta|toners?|impress[a-z0-9]*|jato)($|[^a-z0-9])' and not v_text ~ 'notebook|microcomputador|computador|software|cabeamento estruturado|infraestrutura de rede|rede de dados|data[[:space:]]*center|datacenter|nobreak' then return false; end if;
  if v_text ~ 'nuvem[[:space:]]+de[[:space:]]+pontos' and not v_text ~ 'notebook|microcomputador|computador|software|cabeamento estruturado|infraestrutura de rede|rede de dados|data[[:space:]]*center|datacenter|nobreak' then return false; end if;
  if not v_text ~ '(^|[^a-z0-9])(tinta|toners?|impress[a-z0-9]*|jato)($|[^a-z0-9])' then v_text := pg_catalog.regexp_replace(v_text, '(^|[^a-z0-9])cartuchos?($|[^a-z0-9])', ' ', 'g'); end if;
  v_text := pg_catalog.regexp_replace(v_text, 'nuvem[[:space:]]+de[[:space:]]+pontos', ' ', 'g');
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

create or replace function public.is_ti_item(p_description text) returns boolean
language sql stable security invoker set search_path=''
as $$
  select not (v ~ '^[^a-z0-9]*(rotulador|etiquetador|balanca|bomba|analisador|equipamento.{0,15}(medico|hospitalar))')
    and not (v ~ '(^|[^a-z0-9])(cirurg[a-z0-9]*|radiolog[a-z0-9]*|eletrocardiograf[a-z0-9]*|eletroencefalograf[a-z0-9]*|munic[a-z0-9]*|calibre|chocolate|computador de bordo)($|[^a-z0-9])')
    and not (v ~ '^(pecas? (mecanica|eletrica)|peca[[:space:]]*/[[:space:]]*acessorio[[:space:]]*-[[:space:]]*motor gerador)')
    and v ~ '(^|[^a-z0-9])(notebooks?|microcomputador(es)?|computador(es)?|desktops?|workstations?|informatica|softwares?|antivirus|antimalware|firewalls?|switch(es)?|roteador(es)?|nobreaks?|no-breaks?|tablets?|toners?|projetor(es)? multimedia|servidor(es)? de (rede|dados|rack)|servidor(es)? fisico(s)?|storage server|discos? rigidos?|memoria ram|monitor(es)? de video|rede (ip|logica|de dados|de computadores)|cabeamento estruturado|impressora(s)? (laser|jato|termica)|outsourcing de impressao)($|[^a-z0-9])'
  from (select pg_catalog.lower(extensions.unaccent(coalesce(p_description,''))) v) normalized;
$$;

grant execute on function public.is_ti_item(text) to authenticated;

-- Reclassify only changed matches; retain every procurement and private workflow record.
with revised as (
  select t.id, public.is_ti_tender(t.object) object_match,
    t.is_ti_by_items and t.items_complete and coalesce((select bool_or(public.is_ti_item(i.description)) from public.tender_items i where i.tender_id=t.id),false) item_match
  from public.tenders t where t.is_ti or t.is_ti_by_items
)
update public.tenders t set is_ti_by_items=r.item_match
from revised r where t.id=r.id and (t.is_ti_by_items is distinct from r.item_match or t.is_ti is distinct from (r.object_match or r.item_match));

create function private.normalize_tender_value() returns trigger
language plpgsql security invoker set search_path=''
as $$ begin if new.estimated_value <= 0 then new.estimated_value := null; end if; return new; end; $$;
revoke all on function private.normalize_tender_value() from public,anon,authenticated;
grant execute on function private.normalize_tender_value() to service_role;
create trigger normalize_tender_value before insert or update of estimated_value on public.tenders
for each row execute function private.normalize_tender_value();
update public.tenders set estimated_value=null where estimated_value<=0;

-- Public procurement values only. Invoker preserves RLS, including live evaluation blocking.
create function public.tender_it_item_summary(p_tender_ids uuid[])
returns table(tender_id uuid,item_count bigint,ti_item_count bigint,ti_estimated_value numeric,item_estimated_value numeric,complete_values boolean,items_complete boolean)
language sql stable security invoker set search_path=''
as $$
  select t.id, count(*),count(*) filter(where public.is_ti_item(i.description)),
    sum(i.estimated_total_value) filter(where public.is_ti_item(i.description) and i.estimated_total_value>0),
    sum(i.estimated_total_value) filter(where i.estimated_total_value>0),
    bool_and(coalesce(i.estimated_total_value>0,false)),t.items_complete
  from public.tenders t join public.tender_items i on i.tender_id=t.id
  where t.id=any(p_tender_ids) and cardinality(p_tender_ids)<=100
  group by t.id,t.items_complete;
$$;
revoke all on function public.tender_it_item_summary(uuid[]) from public,anon;
grant execute on function public.tender_it_item_summary(uuid[]) to authenticated,service_role;
