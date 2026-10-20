-- Run as postgres/service role. Fails transaction if classifier or cached search scope regresses.
do $test$
declare failures integer;
begin
  with cases(object, expected) as (values
  ('Registro de preços para aquisição de Discos Rígidos – HDs para serem utilizados no Storage Server, destinado ao armazenamento de dados dos sistemas corporativos e no Sistema de Monitoramento e Vigilância.', true),
  ('Aquisição de monitor de vídeo de 24 polegadas', true),
  ('Aquisição de monitores de vídeo para estações de trabalho', true),
  ('Aquisição de monitor cardíaco hospitalar', false),
  ('Aquisição de sistema de alimentação ininterrupta (UPS/Nobreak) destinados à infraestrutura computacional', true),
  ('Locação de sistema web integrado de gestão pública municipal, em nuvem, para servidores públicos', true),
  ('Fornecimento de sistema acadêmico para Institutos de Ensino Superior', true),
  ('Serviços de telecomunicações para implantação de uma Rede IP Multisserviços', true),
  ('Locação e suporte de impressoras monocromáticas e coloridas', true),
  ('Aquisição de telas cirúrgicas para unidades de saúde', false),
  ('Serviços de alimentação e hospedagem para pacientes e acompanhantes', false),
  ('Fornecimento e instalação de transporte vertical', false),
  ('Organização de viagem de ida e volta', false),
  ('Bobina térmica para impressora termodesinfectora', false),
  ('Aquisição de telas cirúrgicas para o Hospital do Servidor General Edson Ramalho', false),
  ('Instalação de transporte vertical no Núcleo de Tecnologia da Informação', false),
  ('Contratação de empresa para obra de reforma, conforme dados do projeto básico', false),
  ('Aquisição de gêneros alimentícios conforme dados do termo de referência', false),
  ('Locação de veículos com motorista, incluindo telefonia móvel', false),
  ('Emissão de licença ambiental para aterro sanitário', false),
  ('Aquisição de nobreaks para o setor de informática do hospital', true),
  ('Aquisição de servidor de rede e switches para o data center', true),
  ('Licenças de software de antivírus com suporte por 3 anos', true),
  ('Reforma no Hospital do Servidor com fornecimento de dados cadastrais', false),
  ('Levantamento e tratamento de dados cadastrais', false),
  ('Compra de licença ambiental para funcionamento do estabelecimento', false),
  ('Prestação de serviço de telefonia móvel com plano de voz e dados', false),
  ('Implantação de sistema de gestão de pessoas', false),
  ('Solução de prontuário em software, nuvem e imagens radiológicas para hospital', false),
  (null, false),
  ('', false),
  ('Aquisição de NOTEBOOKS e computadores', true),
  ('Compra de monitor cardíaco hospitalar', false)
  )
  select count(*) into failures from cases where public.is_ti_tender(object) is distinct from expected;
  if failures <> 0 then raise exception 'TI classification: % failed cases', failures; end if;
  if exists(select 1 from public.tenders where is_ti is distinct from (public.is_ti_tender(object) or coalesce(is_ti_by_items,false))) then
    raise exception 'TI cache differs from classifier';
  end if;
  if exists(select 1 from public.search_tenders_for_list(p_show_closed => true, p_page_size => 100) r join public.tenders t on t.id=r.tender_id where not t.is_ti) then
    raise exception 'Default opportunity search leaked a non-TI tender';
  end if;
end;
$test$;
-- Exercise the trigger and restore the source row with transaction rollback.
begin;
do $test$
declare target uuid; classified boolean;
begin
  select id into target from public.tenders order by id limit 1;
  if target is not null then
    update public.tenders set object = 'Aquisição de notebooks', is_ti = false where id = target
    returning is_ti into classified;
    if classified is distinct from true then raise exception 'Trigger failed to classify TI'; end if;
    update public.tenders set object = 'Aquisição de gêneros alimentícios', is_ti = true where id = target
    returning is_ti into classified;
    if classified is distinct from false then raise exception 'Trigger failed to reject non-TI'; end if;
  end if;
end;
$test$;
rollback;
select 33 as classifier_cases_passed;
