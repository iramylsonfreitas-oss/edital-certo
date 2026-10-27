-- Transactional synthetic fixtures only. No emails or production workflow changes.
begin;
insert into auth.users(id,email) values
('d9dba763-dc5f-40d5-9bca-010b9f7a1001','group-owner@example.invalid'),
('d9dba763-dc5f-40d5-9bca-010b9f7a1002','group-outsider@example.invalid');
select set_config('request.jwt.claim.sub','d9dba763-dc5f-40d5-9bca-010b9f7a1001',true);
insert into public.organizations(id,name,slug,created_by) values('d9dba763-dc5f-40d5-9bca-010b9f7a1011','Grouping owner','grouping-owner-fixture','d9dba763-dc5f-40d5-9bca-010b9f7a1001');
select set_config('request.jwt.claim.sub','d9dba763-dc5f-40d5-9bca-010b9f7a1002',true);
insert into public.organizations(id,name,slug,created_by) values('d9dba763-dc5f-40d5-9bca-010b9f7a1012','Grouping outsider','grouping-outsider-fixture','d9dba763-dc5f-40d5-9bca-010b9f7a1002');
insert into public.agencies(id,source_key,source_agency_id,name,cnpj) values('d9dba763-dc5f-40d5-9bca-010b9f7a1020','grouping-test','grouping-test','Synthetic grouping agency','98765432000100');
insert into public.tenders(id,source_key,source_id,agency_id,title,object,modality_code,municipality_code,estimated_value,proposal_close_at,items_complete,items_object_hash,official_url,raw_data) values('d9dba763-dc5f-40d5-9bca-010b9f7a1031','pncp','grouping-fixture-1','d9dba763-dc5f-40d5-9bca-010b9f7a1020','[Portal de Compras Públicas] - Aquisição syntheticgroup de computadores e mesas para as unidades municipais','[Portal de Compras Públicas] - Aquisição syntheticgroup de computadores e mesas para as unidades municipais','6','4306130',2600,'2090-10-29T11:00:00Z',true,md5('[Portal de Compras Públicas] - Aquisição syntheticgroup de computadores e mesas para as unidades municipais'),'https://example.com/public-tender','{"numeroCompra": "37", "anoCompra": 2026, "unidadeOrgao": {"codigoUnidade": "01"}, "srp": false, "amparoLegal": {"codigo": 1}, "situacaoCompraId": 1}');
insert into public.tender_items(tender_id,source_item_id,item_number,description,unit,quantity,estimated_unit_value,estimated_total_value) values('d9dba763-dc5f-40d5-9bca-010b9f7a1031','1',1,'Computador desktop modelo ABC 16GB','Unidade',5,500,2500);
insert into public.tender_items(tender_id,source_item_id,item_number,description,unit,quantity,estimated_unit_value,estimated_total_value) values('d9dba763-dc5f-40d5-9bca-010b9f7a1031','2',2,'Mesa de escritório com gavetas','Unidade',1,100,100);
insert into public.tenders(id,source_key,source_id,agency_id,title,object,modality_code,municipality_code,estimated_value,proposal_close_at,items_complete,items_object_hash,official_url,raw_data) values('d9dba763-dc5f-40d5-9bca-010b9f7a1032','pncp','grouping-fixture-2','d9dba763-dc5f-40d5-9bca-010b9f7a1020','Aquisição syntheticgroup de computadores e mesas para as unidades municipais','Aquisição syntheticgroup de computadores e mesas para as unidades municipais','6','4306130',2600,'2090-10-29T11:00:00Z',true,md5('Aquisição syntheticgroup de computadores e mesas para as unidades municipais'),null,'{"numeroCompra": "37", "anoCompra": 2026, "unidadeOrgao": {"codigoUnidade": "1"}, "srp": false, "amparoLegal": {"codigo": 1}, "situacaoCompraId": 1}');
insert into public.tender_items(tender_id,source_item_id,item_number,description,unit,quantity,estimated_unit_value,estimated_total_value) values('d9dba763-dc5f-40d5-9bca-010b9f7a1032','1',1,'Computador desktop','UN',5,500,2500);
insert into public.tender_items(tender_id,source_item_id,item_number,description,unit,quantity,estimated_unit_value,estimated_total_value) values('d9dba763-dc5f-40d5-9bca-010b9f7a1032','2',2,'Mesa de escritório','UN',1,100,100);
insert into public.tenders(id,source_key,source_id,agency_id,title,object,modality_code,municipality_code,estimated_value,proposal_close_at,items_complete,items_object_hash,official_url,raw_data) values('d9dba763-dc5f-40d5-9bca-010b9f7a1033','pncp','grouping-fixture-3','d9dba763-dc5f-40d5-9bca-010b9f7a1020','Aquisição syntheticgroup de computadores e mesas para as unidades municipais','Aquisição syntheticgroup de computadores e mesas para as unidades municipais','6','4306130',2600,'2090-10-29T11:00:00Z',true,md5('Aquisição syntheticgroup de computadores e mesas para as unidades municipais'),null,'{"numeroCompra": "38", "anoCompra": 2026, "unidadeOrgao": {"codigoUnidade": "1"}, "srp": false, "amparoLegal": {"codigo": 1}, "situacaoCompraId": 1}');
insert into public.tender_items(tender_id,source_item_id,item_number,description,unit,quantity,estimated_unit_value,estimated_total_value) values('d9dba763-dc5f-40d5-9bca-010b9f7a1033','1',1,'Computador desktop','UN',5,500,2500);
insert into public.tender_items(tender_id,source_item_id,item_number,description,unit,quantity,estimated_unit_value,estimated_total_value) values('d9dba763-dc5f-40d5-9bca-010b9f7a1033','2',2,'Mesa de escritório','UN',1,100,100);
insert into public.tenders(id,source_key,source_id,agency_id,title,object,modality_code,municipality_code,estimated_value,proposal_close_at,items_complete,items_object_hash,official_url,raw_data) values('d9dba763-dc5f-40d5-9bca-010b9f7a1034','pncp','grouping-fixture-4','d9dba763-dc5f-40d5-9bca-010b9f7a1020','Aquisição syntheticgroup de computadores e mesas para as unidades municipais','Aquisição syntheticgroup de computadores e mesas para as unidades municipais','6','4306130',2600,'2090-10-29T11:00:00Z',true,md5('Aquisição syntheticgroup de computadores e mesas para as unidades municipais'),null,'{"numeroCompra": "39", "anoCompra": 2026, "unidadeOrgao": {"codigoUnidade": "1"}, "srp": false, "amparoLegal": {"codigo": 1}, "situacaoCompraId": 1}');
insert into public.tender_items(tender_id,source_item_id,item_number,description,unit,quantity,estimated_unit_value,estimated_total_value) values('d9dba763-dc5f-40d5-9bca-010b9f7a1034','1',1,'Computador desktop','UN',5,500,2500);
insert into public.tender_items(tender_id,source_item_id,item_number,description,unit,quantity,estimated_unit_value,estimated_total_value) values('d9dba763-dc5f-40d5-9bca-010b9f7a1034','2',2,'Mesa de escritório','UN',1,100,100);
update public.tenders set raw_data=raw_data where source_id like 'grouping-fixture-%';
insert into public.tender_feedback(organization_id,user_id,tender_id,state) values
('d9dba763-dc5f-40d5-9bca-010b9f7a1011','d9dba763-dc5f-40d5-9bca-010b9f7a1001','d9dba763-dc5f-40d5-9bca-010b9f7a1032','favorite'),
('d9dba763-dc5f-40d5-9bca-010b9f7a1012','d9dba763-dc5f-40d5-9bca-010b9f7a1002','d9dba763-dc5f-40d5-9bca-010b9f7a1032','favorite');
insert into public.pipeline_cards(organization_id,tender_id,created_by,status,notes) values
('d9dba763-dc5f-40d5-9bca-010b9f7a1011','d9dba763-dc5f-40d5-9bca-010b9f7a1032','d9dba763-dc5f-40d5-9bca-010b9f7a1001','documentation','KEEP_GROUPING_NOTES');
set local role authenticated;
select set_config('request.jwt.claim.sub','d9dba763-dc5f-40d5-9bca-010b9f7a1001',true);
do $test$
declare ids uuid[]; card uuid; n bigint;
begin
  ids:=public.related_tender_ids('d9dba763-dc5f-40d5-9bca-010b9f7a1031');
  if cardinality(ids)<>2 or ids[1]<>'d9dba763-dc5f-40d5-9bca-010b9f7a1031'::uuid then raise exception 'Equivalent publications were not grouped with richer primary'; end if;
  if cardinality(public.related_tender_ids('d9dba763-dc5f-40d5-9bca-010b9f7a1033'))<>1 then raise exception 'Different purchase number was grouped'; end if;
  select count(*) into n from public.search_tenders_grouped(p_query=>'syntheticgroup',p_organization_id=>'d9dba763-dc5f-40d5-9bca-010b9f7a1011');
  if n<>3 then raise exception 'Grouping before pagination produced wrong row count: %',n; end if;
  select total_count into n from public.search_tenders_grouped(p_query=>'syntheticgroup',p_organization_id=>'d9dba763-dc5f-40d5-9bca-010b9f7a1011',p_list_mode=>'favorites',p_page_size=>1);
  if n<>1 then raise exception 'Favorite on old secondary publication was lost'; end if;
  perform public.follow_tender('d9dba763-dc5f-40d5-9bca-010b9f7a1011','d9dba763-dc5f-40d5-9bca-010b9f7a1031');
  if (select count(*) from public.pipeline_cards where organization_id='d9dba763-dc5f-40d5-9bca-010b9f7a1011')<>1 or not exists(select 1 from public.pipeline_cards where notes='KEEP_GROUPING_NOTES' and status='documentation') then raise exception 'Existing pipeline card was duplicated or changed'; end if;
  perform public.set_tender_group_feedback('d9dba763-dc5f-40d5-9bca-010b9f7a1011','d9dba763-dc5f-40d5-9bca-010b9f7a1031',null);
  if exists(select 1 from public.tender_feedback where tender_id=any(ids)) then raise exception 'Removing favorite did not clear the old alias'; end if;
  perform public.set_tender_group_feedback('d9dba763-dc5f-40d5-9bca-010b9f7a1011','d9dba763-dc5f-40d5-9bca-010b9f7a1032','discarded');
  if exists(select 1 from public.search_tenders_grouped(p_query=>'syntheticgroup',p_organization_id=>'d9dba763-dc5f-40d5-9bca-010b9f7a1011') where tender_id=any(ids)) then raise exception 'Discarded group still visible'; end if;
  select total_count into n from public.search_tenders_grouped(p_query=>'syntheticgroup',p_organization_id=>'d9dba763-dc5f-40d5-9bca-010b9f7a1011',p_list_mode=>'discarded');
  if n<>1 then raise exception 'Discarded publications not counted once'; end if;
  perform public.set_tender_group_feedback('d9dba763-dc5f-40d5-9bca-010b9f7a1011','d9dba763-dc5f-40d5-9bca-010b9f7a1031','favorite');
  select favorite_count into n from public.tender_group_counts('it','d9dba763-dc5f-40d5-9bca-010b9f7a1011');
  if n<>1 then raise exception 'Favorite metric counted sources instead of opportunities'; end if;
  begin
    perform public.set_tender_group_feedback('d9dba763-dc5f-40d5-9bca-010b9f7a1012','d9dba763-dc5f-40d5-9bca-010b9f7a1031','discarded');
    raise exception 'Cross-organization feedback write allowed';
  exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
-- Metadata changes split the result conservatively, then restore after a fresh verified snapshot.
update public.tenders set raw_data=jsonb_set(raw_data,'{unidadeOrgao,codigoUnidade}','"2"') where id='d9dba763-dc5f-40d5-9bca-010b9f7a1032';
do $test$ begin if cardinality(public.related_tender_ids('d9dba763-dc5f-40d5-9bca-010b9f7a1031'))<>1 then raise exception 'Different purchasing unit was grouped'; end if; end; $test$;
update public.tenders set raw_data=jsonb_set(raw_data,'{unidadeOrgao,codigoUnidade}','"1"') where id='d9dba763-dc5f-40d5-9bca-010b9f7a1032';
-- A third source with conflicting item descriptions makes the whole candidate set ambiguous.
update public.tenders set raw_data=jsonb_set(raw_data,'{numeroCompra}','"37"') where id='d9dba763-dc5f-40d5-9bca-010b9f7a1034';
update public.tender_items set description='Projetor multimídia incompatível' where tender_id='d9dba763-dc5f-40d5-9bca-010b9f7a1034' and item_number=1;
update public.tenders set raw_data=raw_data where id='d9dba763-dc5f-40d5-9bca-010b9f7a1034';
do $test$
begin
  if cardinality(public.related_tender_ids('d9dba763-dc5f-40d5-9bca-010b9f7a1031'))<>1 then raise exception 'Conflicting items were silently grouped'; end if;
end;
$test$;
update public.tenders set raw_data=jsonb_set(raw_data,'{numeroCompra}','"39"') where id='d9dba763-dc5f-40d5-9bca-010b9f7a1034';
update public.tender_items set quantity=6 where tender_id='d9dba763-dc5f-40d5-9bca-010b9f7a1031' and item_number=1;
do $test$
begin
  if cardinality(public.related_tender_ids('d9dba763-dc5f-40d5-9bca-010b9f7a1031'))<>1 then raise exception 'Item changes failed to invalidate grouping'; end if;
end;
$test$;
set local role authenticated;
select set_config('request.jwt.claim.sub','d9dba763-dc5f-40d5-9bca-010b9f7a1002',true);
do $test$
begin
 if not exists(select 1 from public.tender_feedback where tender_id='d9dba763-dc5f-40d5-9bca-010b9f7a1032' and state='favorite') then raise exception 'Other account favorite was changed'; end if;
 if exists(select 1 from public.pipeline_cards where notes='KEEP_GROUPING_NOTES') then raise exception 'Private pipeline leaked'; end if;
end;
$test$;
reset role;
insert into private.evaluation_access(user_id,manager_id,label,enabled) values('d9dba763-dc5f-40d5-9bca-010b9f7a1001','d9dba763-dc5f-40d5-9bca-010b9f7a1002','Blocked grouping fixture',false);
set local role authenticated;
select set_config('request.jwt.claim.sub','d9dba763-dc5f-40d5-9bca-010b9f7a1001',true);
do $test$
begin
 if cardinality(public.related_tender_ids('d9dba763-dc5f-40d5-9bca-010b9f7a1031'))<>0 then raise exception 'Blocked evaluator read grouping'; end if;
 if exists(select 1 from public.search_tenders_grouped(p_query=>'syntheticgroup')) then raise exception 'Blocked evaluator read grouped catalog'; end if;
 begin perform public.set_tender_group_feedback('d9dba763-dc5f-40d5-9bca-010b9f7a1011','d9dba763-dc5f-40d5-9bca-010b9f7a1031','favorite'); raise exception 'Blocked evaluator wrote grouped feedback'; exception when insufficient_privilege then null; end;
end;
$test$;
set local role anon;
do $test$
begin
 begin perform public.related_tender_ids('d9dba763-dc5f-40d5-9bca-010b9f7a1031'); raise exception 'Anonymous grouped metadata access'; exception when insufficient_privilege then null; end;
end;
$test$;
rollback;
select true as publication_grouping_tests_passed;
