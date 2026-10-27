-- Development only. No sender, network call or provider credential.
begin;
do $$ begin
 if not exists(select 1 from supabase_migrations.schema_migrations
  where version='20261026194430' and name='email_message_operations'
  and md5(array_to_string(statements,E'\n'))='3d43efdd5c3a4e0c914e50278566c073')
 then raise exception 'VALIDATED_DEVELOPMENT_OPERATIONS_REQUIRED'; end if;
end $$;
select cron.schedule('edital-certo-manutencao-mensagens-dev','20 3 * * *',$job$
 with result as materialized (select public.maintain_email_message_history(50) as stats)
 insert into public.ingestion_runs(source_key,status,finished_at,records_seen,metadata)
 select 'email-message-maintenance','succeeded',clock_timestamp(),
  (stats->>'quarantined')::integer+(stats->>'expired_failed')::integer+
  (stats->>'purged_accepted')::integer+(stats->>'purged_canceled')::integer,
  jsonb_build_object('mode','maintenance_only','sends_email',false,'message_budget',50)||stats
 from result;
$job$) as job_id;
commit;
