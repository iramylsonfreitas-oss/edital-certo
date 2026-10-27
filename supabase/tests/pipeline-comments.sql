-- Synthetic development/local fixtures. Run the whole file; nothing is retained.
begin;
set local statement_timeout='30s';
do $$
declare admin_id uuid:=extensions.gen_random_uuid(); analyst uuid:=extensions.gen_random_uuid(); reader_id uuid:=extensions.gen_random_uuid();
 outsider uuid:=extensions.gen_random_uuid(); org uuid; other_org uuid; tender uuid; card uuid; other_card uuid;
begin
 insert into auth.users(id) values(admin_id),(analyst),(reader_id),(outsider);
 update public.users set full_name='Analista de teste' where id=analyst;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.organizations(name,slug,created_by) values('Comments test','comments-'||admin_id,admin_id) returning id into org;
 update public.subscriptions set plan_id=(select id from public.plans where plan_key='pro') where organization_id=org;
 insert into public.memberships(organization_id,user_id,role) values(org,analyst,'analyst'),(org,reader_id,'reader');
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 insert into public.organizations(name,slug,created_by) values('Other comments test','comments-'||outsider,outsider) returning id into other_org;
 insert into public.tenders(source_key,source_id,title,object) values('comments-test',admin_id::text,'Comments fixture','Comments fixture') returning id into tender;
 insert into public.pipeline_cards(organization_id,tender_id,created_by) values(org,tender,admin_id) returning id into card;
 insert into public.pipeline_cards(organization_id,tender_id,created_by) values(other_org,tender,outsider) returning id into other_card;
 perform set_config('test.comments.admin',admin_id::text,true); perform set_config('test.comments.analyst',analyst::text,true);
 perform set_config('test.comments.reader',reader_id::text,true); perform set_config('test.comments.outsider',outsider::text,true);
 perform set_config('test.comments.org',org::text,true); perform set_config('test.comments.other_org',other_org::text,true);
 perform set_config('test.comments.card',card::text,true); perform set_config('test.comments.other_card',other_card::text,true);
 perform set_config('request.jwt.claim.sub',analyst::text,true);
end $$;
set local role authenticated;
do $$
declare comment_id uuid; n integer;
begin
 insert into public.comments(organization_id,pipeline_card_id,author_user_id,body,author_name,created_at)
 values(current_setting('test.comments.org')::uuid,current_setting('test.comments.card')::uuid,auth.uid(),'Private test comment','Forged label','2000-01-01') returning id into comment_id;
 perform set_config('test.comments.id',comment_id::text,true);
 if (select author_name from public.comments where id=comment_id)<>'Analista de teste' then raise exception 'AUTHOR_NAME_FORGED'; end if;
 if (select created_at from public.comments where id=comment_id)<now()-interval '1 minute' then raise exception 'CREATION_TIME_FORGED'; end if;
 update public.comments set body='Private edited comment' where id=comment_id;
 get diagnostics n=row_count; if n<>1 then raise exception 'AUTHOR_EDIT_DENIED'; end if;
 begin update public.comments set author_user_id=current_setting('test.comments.admin')::uuid where id=comment_id;
  raise exception 'AUTHOR_CHANGED'; exception when check_violation then null; end;
 begin update public.comments set author_name='Forged' where id=comment_id;
  raise exception 'LABEL_CHANGED'; exception when check_violation then null; end;
 begin update public.comments set created_at='2000-01-01' where id=comment_id;
  raise exception 'TIME_CHANGED'; exception when check_violation then null; end;
 begin update public.comments set id=extensions.gen_random_uuid() where id=comment_id;
  raise exception 'IDENTITY_CHANGED'; exception when check_violation then null; end;
 begin insert into public.comments(organization_id,pipeline_card_id,author_user_id,body)
  values(current_setting('test.comments.org')::uuid,current_setting('test.comments.card')::uuid,current_setting('test.comments.admin')::uuid,'Forged author');
  raise exception 'AUTHOR_IMPERSONATION'; exception when insufficient_privilege then null; end;
 begin insert into public.comments(organization_id,pipeline_card_id,author_user_id,body)
  values(current_setting('test.comments.org')::uuid,current_setting('test.comments.other_card')::uuid,auth.uid(),'Cross card');
  raise exception 'CARD_ORG_MISMATCH'; exception when foreign_key_violation then null; end;
 begin insert into public.comments(organization_id,pipeline_card_id,author_user_id,body)
  values(current_setting('test.comments.org')::uuid,current_setting('test.comments.card')::uuid,auth.uid(),' ');
  raise exception 'EMPTY_ALLOWED'; exception when check_violation then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.comments.reader'),true);
set local role authenticated;
do $$ declare n integer; begin
 if not exists(select 1 from public.comments where id=current_setting('test.comments.id')::uuid) then raise exception 'READER_CANNOT_READ'; end if;
 begin insert into public.comments(organization_id,pipeline_card_id,author_user_id,body)
  values(current_setting('test.comments.org')::uuid,current_setting('test.comments.card')::uuid,auth.uid(),'Reader write');
  raise exception 'READER_WROTE'; exception when insufficient_privilege then null; end;
 delete from public.comments where id=current_setting('test.comments.id')::uuid;
 get diagnostics n=row_count; if n<>0 then raise exception 'READER_DELETED'; end if;
 update public.comments set body='Reader overwrite' where id=current_setting('test.comments.id')::uuid;
 get diagnostics n=row_count; if n<>0 then raise exception 'READER_EDITED'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.comments.outsider'),true);
set local role authenticated;
do $$ declare n integer; begin
 if exists(select 1 from public.comments where id=current_setting('test.comments.id')::uuid) then raise exception 'CROSS_ORG_READ'; end if;
 delete from public.comments where id=current_setting('test.comments.id')::uuid;
 get diagnostics n=row_count; if n<>0 then raise exception 'CROSS_ORG_DELETE'; end if;
 begin insert into public.comments(organization_id,pipeline_card_id,author_user_id,body)
  values(current_setting('test.comments.org')::uuid,current_setting('test.comments.card')::uuid,auth.uid(),'Outsider write');
  raise exception 'CROSS_ORG_INSERT'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Removing membership also removes an author's former write/read permissions.
delete from public.memberships where organization_id=current_setting('test.comments.org')::uuid and user_id=current_setting('test.comments.analyst')::uuid;
select set_config('request.jwt.claim.sub',current_setting('test.comments.analyst'),true);
set local role authenticated;
do $$ declare n integer; begin
 if exists(select 1 from public.comments where id=current_setting('test.comments.id')::uuid) then raise exception 'FORMER_MEMBER_READ'; end if;
 delete from public.comments where id=current_setting('test.comments.id')::uuid;
 get diagnostics n=row_count; if n<>0 then raise exception 'FORMER_AUTHOR_DELETE'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.comments.admin'),true);
set local role authenticated;
do $$ declare n integer; begin
 update public.comments set body='Moderated content' where id=current_setting('test.comments.id')::uuid;
 get diagnostics n=row_count; if n<>1 then raise exception 'ADMIN_EDIT_DENIED'; end if;
 delete from public.comments where id=current_setting('test.comments.id')::uuid;
 get diagnostics n=row_count; if n<>1 then raise exception 'ADMIN_DELETE_DENIED'; end if;
 if (select count(*) from public.audit_logs where target_id=current_setting('test.comments.id'))<>4 then raise exception 'AUDIT_MISSING'; end if;
 if exists(select 1 from public.audit_logs where target_id=current_setting('test.comments.id')
  and metadata<>jsonb_build_object('pipeline_card_id',current_setting('test.comments.card')::uuid)) then raise exception 'AUDIT_BODY_LEAK'; end if;
 if has_function_privilege('authenticated','private.prepare_pipeline_comment()','EXECUTE')
 or has_function_privilege('anon','private.audit_pipeline_comment()','EXECUTE') then raise exception 'TRIGGER_EXECUTE_EXPOSED'; end if;
end $$;
reset role;
select 'pipeline comments passed: author snapshot, immutable identity, validation, reader denial, cross-organization isolation, removed member denial, admin moderation, audit without bodies; rolling back' as result;
rollback;
