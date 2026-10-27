begin;
do $test$
begin
  if exists(select 1 from (values
('Aquisição de Cartucho de Vacina Meningocócica ACWY (Atenuada)',false),
('Aquisição de cartuchos para aplicação de graxa em máquinas',false),
('Levantamento topográfico e geração de nuvem de pontos',false),
('Serviço de fornecimento de combustível e lubrificantes, com sistema informatizado e cartões eletrônicos',false),
('Gestão da frota de veículos com serviços de manutenção, peças e operação de sistema informatizado',false),
('Reforma da sala da diretoria de tecnologia da informação',false),
('Aquisição de medicamentos e insumos farmacêuticos',false),
('Aquisição de gêneros alimentícios para a rede escolar',false),
('Recapagem de pneus para veículos',false),
('Aquisição de cartuchos de tinta para impressoras',true),
('Fornecimento de toner para impressoras laser',true),
('Licenciamento de software para gestão da frota de veículos',true),
('Desenvolvimento de software para processamento de nuvem de pontos',true),
('Aquisição de medicamentos e notebooks para o hospital municipal',true),
('Aquisição de computadores desktop para unidade básica de saúde',true),
('Reforma de sala com instalação de cabeamento estruturado e rede de dados',true),
('Aquisição de mobiliário, eletrodomésticos e equipamentos de informática',true),
('Locação de sistema web de gestão pública municipal em nuvem',true)
,
('Serviços de atualização tecnológica da solução de virtualização de fitas cartucho para plataforma mainframe',true),
('Prestação de serviço de uso de software para gerenciamento e controle do abastecimento dos combustíveis para a frota municipal',true),
('Serviços de rastreamento e telemetria veicular, incluindo sistema informatizado para gerenciamento da frota de veículos',true)
  ) reviewed(object,expected) where public.is_ti_tender(object) is distinct from expected) then
    raise exception 'Reviewed TI object regression';
  end if;
  if public.is_ti_item('Rotulador largura fita: 12, funcionamento: usb, conectado a um computador, impressão térmica') then raise exception 'Incidental computer still classified as computer purchase'; end if;
  if not public.is_ti_item('Computador Desktop-Avançado para hospital com memória RAM 16 GB') then raise exception 'Real computer lost'; end if;
end;
$test$;
insert into public.tenders(id,source_key,source_id,title,object,estimated_value,items_complete,items_object_hash)
values ('1359b321-f30e-449e-91ea-895df23c10a5','review-test','mixed','Mobiliário e computadores','Aquisição de mobiliário e computadores',0,true,md5('Aquisição de mobiliário e computadores'));
insert into public.tender_items(tender_id,source_item_id,item_number,description,estimated_total_value) values
('1359b321-f30e-449e-91ea-895df23c10a5','1',1,'Computador desktop',500),
('1359b321-f30e-449e-91ea-895df23c10a5','2',2,'Mesa de escritório',1500);
do $test$
begin
  if exists(select 1 from public.tenders where id='1359b321-f30e-449e-91ea-895df23c10a5' and estimated_value is not null) then raise exception 'Unknown zero persisted'; end if;
end;
$test$;
set local role authenticated;
select set_config('request.jwt.claim.sub','4455f93a-ceaf-42aa-b70b-272814ff4d09',true);
do $test$
declare s record;
begin
  select * into s from public.tender_it_item_summary(array['1359b321-f30e-449e-91ea-895df23c10a5'::uuid]);
  if s.item_count is distinct from 2::bigint or s.ti_item_count is distinct from 1::bigint or s.ti_estimated_value is distinct from 500::numeric or s.item_estimated_value is distinct from 2000::numeric or not s.complete_values or not s.items_complete then raise exception 'Mixed procurement TI values incorrect'; end if;
end;
$test$;
reset role;
update public.tender_items set estimated_total_value=null where tender_id='1359b321-f30e-449e-91ea-895df23c10a5' and item_number=2;
set local role authenticated;
do $test$
begin
  if exists(select 1 from public.tender_it_item_summary(array['1359b321-f30e-449e-91ea-895df23c10a5'::uuid]) where complete_values) then raise exception 'Missing item value presented as complete'; end if;
end;
$test$;
set local role anon;
do $test$
begin
  begin
    perform * from public.tender_it_item_summary(array['1359b321-f30e-449e-91ea-895df23c10a5'::uuid]);
    raise exception 'Anonymous summary access';
  exception when insufficient_privilege then null; end;
end;
$test$;
rollback;
select true as catalog_review_tests_passed;
