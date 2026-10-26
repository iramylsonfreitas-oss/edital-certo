-- Administrative, read-only operational summary. No addresses, payloads or tokens.
select jobid,jobname,schedule,active
from cron.job where jobname='edital-certo-preparar-mensagens-dev';

-- Cron success means the HTTP request was queued, not that the function succeeded.
select d.runid,d.status,d.start_time,d.end_time
from cron.job_run_details d join cron.job j on j.jobid=d.jobid
where j.jobname='edital-certo-preparar-mensagens-dev'
order by d.start_time desc limit 10;

-- This ledger is written by the function after it validates the scheduler token.
select started_at,finished_at,status,records_seen,
 metadata->>'mode' as mode,metadata->>'sends_email' as sends_email,
 metadata->>'staged' as staged,metadata->>'exhausted' as exhausted
from public.ingestion_runs where source_key='email-message-staging'
order by started_at desc limit 10;

select status,count(*) as messages from public.email_messages group by status;
select count(*) as attempts from public.email_message_attempts;
