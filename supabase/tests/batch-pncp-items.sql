-- Development-only integration scenarios. All fixture writes are rolled back.
begin;
do $test$
declare target uuid; token uuid:=extensions.gen_random_uuid(); replacement uuid; result jsonb; payload jsonb; flag boolean; matches integer; first_job uuid; second_job uuid;
begin
  if not public.is_ti_item('Aquisição de notebooks') or public.is_ti_item('Cartucho calibre 12') or public.is_ti_item('Computador de bordo para ônibus') or public.is_ti_item('Tablet de chocolate') then raise exception 'ITEM_CLASSIFIER_FAILED'; end if;
  if public.is_ti_item('Peça Mecânica/Elétrica - Veículo Automotivo Fornecimento de peças de reposição através de sistema informatizado com software disponibilizado em tempo real pela internet') or not public.is_ti_item('Licenciamento de software para gestão da frota de veículos') then raise exception 'AUXILIARY_SOFTWARE_CONFUSED_WITH_IT_SUPPLY'; end if;
  if public.is_ti_item('ELETROCARDIÓGRAFO portátil com comunicação com computador') or not public.is_ti_item('NO-BREAK para computador e impressora') then raise exception 'MEDICAL_DEVICE_CONFUSED_WITH_IT_ITEM'; end if;
  if has_table_privilege('authenticated','public.pncp_item_jobs','select') or has_function_privilege('anon','public.claim_pncp_item_job()','execute') then raise exception 'WORKER_PERMISSION_LEAK'; end if;
  select tender_id into first_job from public.claim_pncp_item_job();
  select tender_id into second_job from public.claim_pncp_item_job();
  if first_job is not null and first_job=second_job then raise exception 'DUPLICATE_LEASE'; end if;

  insert into public.tenders(source_key,source_id,title,object,proposal_close_at,source_updated_at)
    values('pncp',extensions.gen_random_uuid()::text,'Compra de materiais permanentes','Compra de materiais permanentes',now()+interval '1 day',now()) returning id into target;
  update public.pncp_item_jobs set status='running',claim_token=token,lease_until=now()+interval '150 seconds' where tender_id=target;
  insert into public.tender_items(tender_id,item_number,description) values(target,999,'Versão anterior completa');
  select jsonb_agg(jsonb_build_object('item_number',n,'description',case when n=1 then 'Notebook corporativo' else 'Material permanente' end,'quantity',1,'budget_is_secret',false)) into payload from generate_series(1,50) n;
  result:=public.save_pncp_item_page(target,token,1,payload,true);
  if result->>'status'<>'partial' or (select count(*) from public.tender_items where tender_id=target)<>1 or (select count(*) from public.pncp_item_staging where tender_id=target)<>50 then raise exception 'PARTIAL_REPLACED_COMPLETE_SNAPSHOT'; end if;

  token:=extensions.gen_random_uuid();
  update public.pncp_item_jobs set status='running',claim_token=token,lease_until=now()+interval '150 seconds' where tender_id=target;
  perform public.fail_pncp_item_job(target,token,'PNCP HTTP 429.',true);
  if (select retry_at from public.pncp_item_jobs where tender_id=target)<now()+interval '59 minutes' then raise exception 'RATE_LIMIT_BACKOFF_FAILED'; end if;
  begin
    perform public.save_pncp_item_page(target,token,2,'[]'::jsonb,false);
    raise exception 'STALE_LEASE_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'ITEM_JOB_STALE_LEASE' then raise; end if; end;

  token:=extensions.gen_random_uuid();
  update public.pncp_item_jobs set status='running',claim_token=token,lease_until=now()+interval '150 seconds' where tender_id=target;
  result:=public.save_pncp_item_page(target,token,2,'[]'::jsonb,false);
  select is_ti and ti_match_source='items' and items_complete into flag from public.tenders where id=target;
  if flag is distinct from true or (select count(*) from public.tender_items where tender_id=target)<>50 then raise exception 'ITEM_PROMOTION_FAILED'; end if;
  select count(*) into matches from public.tenders where id=target and search_vector@@websearch_to_tsquery('portuguese','notebook');
  if matches<>1 then raise exception 'ITEM_FULL_TEXT_SEARCH_FAILED'; end if;

  -- Empty confirmed refresh removes old evidence; a failed refresh would not reach this step.
  token:=extensions.gen_random_uuid();
  update public.pncp_item_jobs set status='running',next_page=1,claim_token=token,lease_until=now()+interval '150 seconds' where tender_id=target;
  perform public.save_pncp_item_page(target,token,1,'[]'::jsonb,false);
  if (select is_ti from public.tenders where id=target) or exists(select 1 from public.tender_items where tender_id=target) then raise exception 'EMPTY_REFRESH_KEPT_OLD_EVIDENCE'; end if;

  -- Even an incorrect worker payload cannot persist a secret estimate.
  token:=extensions.gen_random_uuid();
  update public.pncp_item_jobs set status='running',next_page=1,claim_token=token,lease_until=now()+interval '150 seconds' where tender_id=target;
  perform public.save_pncp_item_page(target,token,1,'[{"item_number":1,"description":"Computador","budget_is_secret":true,"unit_value":999,"total_value":999}]'::jsonb,false);
  if exists(select 1 from public.tender_items where tender_id=target and (estimated_unit_value is not null or estimated_total_value is not null)) then raise exception 'SECRET_ESTIMATE_PERSISTED'; end if;

  token:=extensions.gen_random_uuid();
  update public.pncp_item_jobs set status='running',claim_token=token,lease_until=now()+interval '150 seconds' where tender_id=target;
  update public.tenders set object='Contratação revisada sem objeto definido',source_updated_at=now()+interval '1 minute' where id=target;
  if (select items_complete or is_ti or items_search_text<>'' from public.tenders where id=target) then raise exception 'SOURCE_CHANGE_KEPT_STALE_CLASSIFICATION'; end if;
  if (select status<>'pending' or claim_token is not null or next_page<>1 from public.pncp_item_jobs where tender_id=target) then raise exception 'SOURCE_CHANGE_DID_NOT_RESET_JOB'; end if;
  begin
    perform public.save_pncp_item_page(target,token,1,'[]'::jsonb,false);
    raise exception 'OLD_SOURCE_VERSION_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'ITEM_JOB_STALE_LEASE' then raise; end if; end;
end;
$test$;
rollback;
select 'batch scenarios passed; fixture writes rolled back' as result;
