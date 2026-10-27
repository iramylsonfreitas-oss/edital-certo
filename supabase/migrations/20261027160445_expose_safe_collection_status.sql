-- The history contains private checkpoints/errors. Publish only the latest safe PNCP metrics.
create table public.source_collection_status (
  source_key text primary key check (source_key='pncp'),
  status public.ingestion_status not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  pages_fetched integer not null,
  records_seen integer not null,
  records_inserted integer not null,
  records_updated integer not null
);
alter table public.source_collection_status enable row level security;
revoke all on public.source_collection_status from public,anon,authenticated;
grant select on public.source_collection_status to authenticated;
grant all on public.source_collection_status to service_role;
create policy source_collection_status_read on public.source_collection_status
for select to authenticated using (source_key='pncp');

create function private.publish_collection_status()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  if new.source_key<>'pncp' then return new; end if;
  insert into public.source_collection_status as current_status
    (source_key,status,started_at,finished_at,pages_fetched,records_seen,records_inserted,records_updated)
  values(new.source_key,new.status,new.started_at,new.finished_at,new.pages_fetched,new.records_seen,new.records_inserted,new.records_updated)
  on conflict(source_key) do update set
    status=excluded.status,started_at=excluded.started_at,finished_at=excluded.finished_at,
    pages_fetched=excluded.pages_fetched,records_seen=excluded.records_seen,
    records_inserted=excluded.records_inserted,records_updated=excluded.records_updated
  where excluded.started_at>=current_status.started_at;
  return new;
end;
$$;
revoke all on function private.publish_collection_status() from public,anon,authenticated;
grant execute on function private.publish_collection_status() to service_role;
create trigger publish_collection_status after insert or update of source_key,status,started_at,finished_at,pages_fetched,records_seen,records_inserted,records_updated
on public.ingestion_runs for each row execute function private.publish_collection_status();

insert into public.source_collection_status
select distinct on (source_key) source_key,status,started_at,finished_at,pages_fetched,records_seen,records_inserted,records_updated
from public.ingestion_runs where source_key='pncp' order by source_key,started_at desc;

create or replace view public.source_status with(security_barrier=true,security_invoker=true) as
select source_key,status,started_at,finished_at,pages_fetched,records_seen,records_inserted,records_updated
from public.source_collection_status;
revoke all on public.source_status from public,anon;
grant select on public.source_status to authenticated;
