-- Keep archived work recoverable, under the existing organization/editor RLS.
alter table public.pipeline_cards add column archived_at timestamptz;
create index pipeline_active_org_updated_idx on public.pipeline_cards(organization_id,updated_at desc) where archived_at is null;

create function public.follow_tender(p_organization_id uuid,p_tender_id uuid)
returns uuid language sql security invoker set search_path=''
as $$
  insert into public.pipeline_cards(organization_id,tender_id,created_by)
  values(p_organization_id,p_tender_id,(select auth.uid()))
  on conflict(organization_id,tender_id) do update set archived_at=null
  returning id;
$$;
revoke all on function public.follow_tender(uuid,uuid) from public,anon;
grant execute on function public.follow_tender(uuid,uuid) to authenticated;

-- Extend the existing private audit trigger; no new write privileges for clients.
create or replace function private.audit_pipeline_status_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.status is distinct from new.status then
    insert into public.audit_logs(organization_id,actor_user_id,action,target_type,target_id,metadata)
    values(new.organization_id,(select auth.uid()),'pipeline.status_changed','pipeline_card',new.id::text,
      jsonb_build_object('from',old.status,'to',new.status));
  end if;
  if old.archived_at is distinct from new.archived_at then
    insert into public.audit_logs(organization_id,actor_user_id,action,target_type,target_id,metadata)
    values(new.organization_id,(select auth.uid()),case when new.archived_at is null then 'pipeline.restored' else 'pipeline.archived' end,
      'pipeline_card',new.id::text,jsonb_build_object('from',old.archived_at,'to',new.archived_at));
  end if;
  return new;
end;
$$;
revoke all on function private.audit_pipeline_status_change() from public,anon,authenticated;
