-- Local disposable database only; all fixtures are rolled back.
begin;
insert into public.ingestion_runs(source_key,status,started_at,records_seen,error_message,checkpoint,metadata)
values('pncp','running',now()+interval '1 day',111,'PRIVATE_ERROR_MARKER','{"private":"checkpoint"}','{"private":"metadata"}');
insert into public.ingestion_runs(source_key,status,started_at,records_seen)
values('pncp','failed',now(),222);
update public.ingestion_runs set status='succeeded',finished_at=now()+interval '1 day 1 minute'
where source_key='pncp' and started_at=now()+interval '1 day';
set local role authenticated;
do $test$
declare found_status text; found_count integer;
begin
  select status::text,records_seen into found_status,found_count from public.source_status where source_key='pncp';
  if found_status is distinct from 'succeeded' or found_count is distinct from 111 then
    raise exception 'Latest safe status is not readable or older run overwrote it';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='source_collection_status'
    and column_name not in ('source_key','status','started_at','finished_at','pages_fetched','records_seen','records_inserted','records_updated')) then
    raise exception 'Unexpected field in safe status projection';
  end if;
  begin
    perform 1 from public.ingestion_runs limit 1;
    raise exception 'Detailed collection history became readable';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.source_collection_status set records_seen=999;
    raise exception 'Authenticated user can modify safe status';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
set local role anon;
do $test$
begin
  begin
    perform 1 from public.source_status limit 1;
    raise exception 'Anonymous user can read authenticated status';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;
rollback;
select true as source_status_access_tests_passed;
