-- Preserve authorship and trace comment changes without copying private text to audit logs.
alter table public.comments add column author_name text not null default 'Integrante da equipe'
 check(length(author_name) between 1 and 120);

create function private.prepare_pipeline_comment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.created_at:=clock_timestamp();
  new.updated_at:=new.created_at;
  select coalesce(nullif(left(trim(full_name),120),''),'Integrante da equipe') into new.author_name
  from public.users where id=new.author_user_id;
  new.author_name:=coalesce(new.author_name,'Integrante da equipe');
 elsif row(new.id,new.organization_id,new.pipeline_card_id,new.author_user_id,new.created_at,new.author_name)
  is distinct from row(old.id,old.organization_id,old.pipeline_card_id,old.author_user_id,old.created_at,old.author_name) then
  raise exception 'COMMENT_IDENTITY_IMMUTABLE' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.prepare_pipeline_comment() from public,anon,authenticated;
create trigger comments_prepare before insert or update on public.comments
 for each row execute function private.prepare_pipeline_comment();

create function private.audit_pipeline_comment()
returns trigger language plpgsql security definer set search_path='' as $$
declare item public.comments; event_name text;
begin
 if tg_op='UPDATE' and new.body is not distinct from old.body then return new; end if;
 if tg_op='DELETE' then item:=old; else item:=new; end if;
 -- Organization removal cascades after its row disappears; do not recreate a dangling audit FK.
 if tg_op='DELETE' and not exists(select 1 from public.organizations where id=item.organization_id) then return old; end if;
 event_name:=case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'edited' else 'deleted' end;
 insert into public.audit_logs(organization_id,actor_user_id,action,target_type,target_id,metadata)
 values(item.organization_id,auth.uid(),'pipeline.comment_'||event_name,'comment',item.id::text,
  jsonb_build_object('pipeline_card_id',item.pipeline_card_id));
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.audit_pipeline_comment() from public,anon,authenticated;
create trigger comments_audit after insert or update or delete on public.comments
 for each row execute function private.audit_pipeline_comment();
