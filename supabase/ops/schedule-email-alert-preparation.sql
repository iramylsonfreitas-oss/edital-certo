-- Preparation only; deploy the matching Edge Function before applying this script.
-- Uses the existing scheduler token without exposing it or configuring an email sender.
select cron.unschedule(jobid) from cron.job where jobname='edital-certo-preparar-alertas';
select cron.schedule('edital-certo-preparar-alertas','8,23,38,53 * * * *',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/prepare-email-alerts',
    headers := jsonb_build_object('Content-Type','application/json','x-ingestion-token',(select decrypted_secret from vault.decrypted_secrets where name='ingestion_job_token')),
    body := '{}'::jsonb, timeout_milliseconds := 90000
  );
$job$);
