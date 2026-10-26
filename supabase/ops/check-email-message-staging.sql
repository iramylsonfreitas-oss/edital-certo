-- Administrative, read-only operational summary. No addresses, payloads or tokens.
select jobid,jobname,schedule,active
from cron.job where jobname in ('edital-certo-preparar-mensagens-dev','edital-certo-manutencao-mensagens-dev');

-- Cron success means the HTTP request was queued, not that the function succeeded.
select d.runid,d.status,d.start_time,d.end_time
from cron.job_run_details d join cron.job j on j.jobid=d.jobid
where j.jobname='edital-certo-preparar-mensagens-dev'
order by d.start_time desc limit 10;

-- This ledger is written by the function after it validates the scheduler token.
select started_at,finished_at,status,records_seen,
 metadata->>'mode' as mode,metadata->>'sends_email' as sends_email,
 metadata->>'staged' as staged,metadata->>'exhausted' as exhausted
from public.ingestion_runs where source_key in ('email-message-staging','email-message-maintenance')
order by started_at desc limit 10;

select status,count(*) as messages from public.email_messages group by status;
select count(*) as attempts from public.email_message_attempts;

-- Manual investigation identifiers only; never return recipient or frozen content.
select id,'edital-certo/'||id as idempotency_key,attempts,first_attempt_at,
 had_unknown_outcome,provider_message_id
from public.email_messages where status='uncertain'
order by first_attempt_at nulls first,id limit 100;
