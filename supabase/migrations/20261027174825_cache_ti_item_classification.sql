-- Cache public item evidence when the source is imported, not on every page visit.
alter table public.tender_items add column is_ti boolean not null default false;
create function private.classify_ti_item_row() returns trigger
language plpgsql security invoker set search_path=''
as $$ begin new.is_ti:=public.is_ti_item(new.description); return new; end; $$;
revoke all on function private.classify_ti_item_row() from public,anon,authenticated;
grant execute on function private.classify_ti_item_row() to service_role;
create trigger classify_ti_item_row before insert or update of description,is_ti on public.tender_items
for each row execute function private.classify_ti_item_row();
update public.tender_items set is_ti=public.is_ti_item(description);

create or replace function public.tender_it_item_summary(p_tender_ids uuid[])
returns table(tender_id uuid,item_count bigint,ti_item_count bigint,ti_estimated_value numeric,item_estimated_value numeric,complete_values boolean,items_complete boolean)
language sql stable security invoker set search_path=''
as $$
  select t.id, count(*),count(*) filter(where i.is_ti),
    sum(i.estimated_total_value) filter(where i.is_ti and i.estimated_total_value>0),
    sum(i.estimated_total_value) filter(where i.estimated_total_value>0),
    bool_and(coalesce(i.estimated_total_value>0,false)),t.items_complete
  from public.tenders t join public.tender_items i on i.tender_id=t.id
  where t.id=any(p_tender_ids) and cardinality(p_tender_ids)<=100
  group by t.id,t.items_complete;
$$;
