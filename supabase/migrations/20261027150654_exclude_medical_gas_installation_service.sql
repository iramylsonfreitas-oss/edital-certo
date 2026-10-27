-- Health v1: independent from the existing TI classifier; only the purchase object is evidence.
create or replace function public.classify_health_object(p_object text)
returns text[] language plpgsql stable security invoker set search_path=''
as $health$
declare v text := pg_catalog.regexp_replace(pg_catalog.lower(extensions.unaccent(coalesce(p_object,''))), '\s+', ' ', 'g'); result text[] := '{}';
begin
  if v ~ '(^|[^a-z0-9])(veterinar[a-z]*|animais|animal|caes|gatos|canin[a-z]*|felin[a-z]*)($|[^a-z0-9])|(^|[^a-z0-9])(softwares?|sistema (informatizado|de gestao|web))[^.;]*(medicamentos?|materia(l|is) hospitalar(es)?|equipamentos? medicos?)|(^|[^a-z0-9])seringas?[^.;]*(graxa|lubrificacao)' then return result; end if;
  if v ~ '(^|[^a-z0-9])(manutencao|reforma|construcao|limpeza|terceirizacao|credenciamento|prestacao de servicos|servicos medicos|exames medicos)($|[^a-z0-9])|(^|[^a-z0-9])locacao($|[^a-z0-9])|instalacao de gases medicinais' and not v ~ '(^|[^a-z0-9])(aquisicao|compra|compras)($|[^a-z0-9])' then return result; end if;
  if v ~ '(^|[^a-z0-9])(medicamentos?|farmacos?|vacinas?|insulinas?|soros? (fisiologicos?|glicosados?))($|[^a-z0-9])' then result:=pg_catalog.array_append(result,'medicines'); end if;
  if v ~ '(^|[^a-z0-9])((materia(l|is)|insumos?|correlatos?|consumo|dispositivos?) (de consumo )?(medico[- ]hospitalar(es)?|medicos?|hospitalares?|hospitalar|odontologicos?|de enfermagem)|materiais? de (sutura|enfermagem)|insumos para cirurgias?|materiais respiratorios|seringas?|agulhas hipodermicas|cateter(es)?|canulas?|ataduras?|curativos?|luvas (cirurgicas|de procedimento)|oxigenio medicinal|gases medicinais|opme|orteses|proteses (odontologicas|ortopedicas))($|[^a-z0-9])' then result:=pg_catalog.array_append(result,'supplies'); end if;
  if v ~ '(^|[^a-z0-9])(equipamentos? (e mobiliarios )?(de uso )?(medico[- ]hospitalar(es)?|medicos? hospitalares?|medicos?|hospitalares?|hospitalar|odontologicos?|de fisioterapia)|aparelhos? (medicos?|hospitalares?)|monitores? multiparametr(ic)?os?|ventiladores? pulmonares?|desfibrilador(es)?|eletrocardiografos?|autoclaves?|mamografos?|tomografos?|ultrassom (portatil|fixo|diagnostico)|bombas? de infusao|camas? hospitalares?|cadeiras? de rodas)($|[^a-z0-9])' then result:=pg_catalog.array_append(result,'equipment'); end if;
  return result;
end;
$health$;
revoke all on function public.classify_health_object(text) from public,anon,authenticated;
grant execute on function public.classify_health_object(text) to service_role;
update public.tenders set health_categories=public.classify_health_object(object) where health_categories is distinct from public.classify_health_object(object);
