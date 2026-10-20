create or replace function public.set_tender_ti_classification()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare object_match boolean;
begin
  if tg_op='UPDATE' and (new.object is distinct from old.object or new.source_updated_at is distinct from old.source_updated_at) then
    new.items_complete := false;
    new.is_ti_by_items := false;
    new.items_search_text := '';
  end if;
  object_match := public.is_ti_tender(new.object);
  new.is_ti_by_items := new.is_ti_by_items and new.items_complete
    and new.items_source_version is not distinct from new.source_updated_at
    and new.items_object_hash=pg_catalog.md5(new.object);
  new.is_ti := object_match or coalesce(new.is_ti_by_items,false);
  new.ti_match_source := case when object_match then 'object' when new.is_ti then 'items' else 'none' end;
  return new;
end;
$$;
drop trigger classify_tender_ti on public.tenders;
create trigger classify_tender_ti before insert or update of object,source_updated_at,is_ti,is_ti_by_items,items_complete,items_source_version,items_object_hash on public.tenders
for each row execute function public.set_tender_ti_classification();

create or replace function private.sync_search_vector()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  new.search_vector := pg_catalog.to_tsvector('portuguese',coalesce(extensions.unaccent(pg_catalog.concat_ws(' ',new.title,new.object,new.modality_name,new.items_search_text)),''));
  if tg_op='INSERT' or new.object is distinct from old.object or new.title is distinct from old.title then new.ingested_at:=now(); end if;
  return new;
end;
$$;
drop trigger tenders_search_vector_updated on public.tenders;
create trigger tenders_search_vector_updated before insert or update of title,object,modality_name,items_search_text,source_updated_at on public.tenders
for each row execute function private.sync_search_vector();

create trigger queue_pncp_items after insert or update of object,source_updated_at on public.tenders
for each row execute function public.queue_pncp_item_sync();
insert into public.pncp_item_jobs(tender_id) select id from public.tenders where source_key='pncp';

