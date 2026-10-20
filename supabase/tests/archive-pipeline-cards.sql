-- Development only. Synthetic users/data and all changes are rolled back.
begin;
do $$
declare actor uuid:=extensions.gen_random_uuid(); outsider uuid:=extensions.gen_random_uuid(); org uuid; other_org uuid; tender uuid;
begin
  insert into auth.users(id) values(actor),(outsider);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  insert into public.organizations(name,slug,created_by) values('Archive test','archive-'||actor::text,actor) returning id into org;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  insert into public.organizations(name,slug,created_by) values('Other test','archive-'||outsider::text,outsider) returning id into other_org;
  insert into public.tenders(source_key,source_id,title,object) values('archive-test',actor::text,'Teste','Teste de arquivamento') returning id into tender;
  perform set_config('test.archive.actor',actor::text,true);
  perform set_config('test.archive.outsider',outsider::text,true);
  perform set_config('test.archive.org',org::text,true);
  perform set_config('test.archive.tender',tender::text,true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  if has_function_privilege('anon','public.follow_tender(uuid,uuid)','execute') then raise exception 'ANON_EXECUTE_LEAK'; end if;
end $$;
set local role authenticated;
do $$
declare card uuid; repeated uuid; org uuid:=current_setting('test.archive.org')::uuid; tender uuid:=current_setting('test.archive.tender')::uuid;
begin
  card:=public.follow_tender(org,tender);
  repeated:=public.follow_tender(org,tender);
  if card is distinct from repeated or (select count(*) from public.pipeline_cards where organization_id=org and tender_id=tender)<>1 then raise exception 'DUPLICATE_FOLLOW'; end if;
  update public.pipeline_cards set status='analysis',responsible_name='Responsável teste',notes='Preservar análise',checklist='[{"text":"Documento conferido","done":true}]'::jsonb where id=card;
  insert into public.comments(organization_id,pipeline_card_id,author_user_id,body) values(org,card,auth.uid(),'Comentário preservado');
  update public.pipeline_cards set archived_at=now() where id=card;
  if exists(select 1 from public.pipeline_cards where id=card and archived_at is null) then raise exception 'ARCHIVED_STILL_ACTIVE'; end if;
  repeated:=public.follow_tender(org,tender);
  if repeated<>card or not exists(select 1 from public.pipeline_cards where id=card and archived_at is null and status='analysis' and notes='Preservar análise' and responsible_name='Responsável teste' and checklist->0->>'done'='true' and created_by=auth.uid()) then raise exception 'RESTORE_LOST_DATA'; end if;
  if (select count(*) from public.comments where pipeline_card_id=card)<>1 then raise exception 'COMMENT_LOST'; end if;
  if (select count(*) from public.audit_logs where target_id=card::text and action in ('pipeline.archived','pipeline.restored'))<>2 then raise exception 'ARCHIVE_AUDIT_MISSING'; end if;
  perform set_config('test.archive.card',card::text,true);
end $$;
reset role;
update public.memberships set role='reader' where organization_id=current_setting('test.archive.org')::uuid and user_id=current_setting('test.archive.actor')::uuid;
set local role authenticated;
do $$
declare n integer;
begin
  update public.pipeline_cards set archived_at=now() where id=current_setting('test.archive.card')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'READER_CHANGED_CARD'; end if;
  begin
    perform public.follow_tender(current_setting('test.archive.org')::uuid,current_setting('test.archive.tender')::uuid);
    raise exception 'READER_FOLLOW_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.memberships set role='analyst' where organization_id=current_setting('test.archive.org')::uuid and user_id=current_setting('test.archive.actor')::uuid;
set local role authenticated;
do $$
declare n integer;
begin
  update public.pipeline_cards set archived_at=now() where id=current_setting('test.archive.card')::uuid;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'ANALYST_ARCHIVE_DENIED'; end if;
  perform public.follow_tender(current_setting('test.archive.org')::uuid,current_setting('test.archive.tender')::uuid);
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.archive.outsider'),true);
set local role authenticated;
do $$
declare n integer;
begin
  if exists(select 1 from public.pipeline_cards where id=current_setting('test.archive.card')::uuid) then raise exception 'CROSS_ORG_READ'; end if;
  update public.pipeline_cards set archived_at=now() where id=current_setting('test.archive.card')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'CROSS_ORG_WRITE'; end if;
  begin
    perform public.follow_tender(current_setting('test.archive.org')::uuid,current_setting('test.archive.tender')::uuid);
    raise exception 'CROSS_ORG_FOLLOW';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'archive lifecycle, preservation, idempotency, audit and RLS passed' as result;
rollback;
