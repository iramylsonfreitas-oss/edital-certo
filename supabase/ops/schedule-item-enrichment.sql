-- Apply after both item migrations and the Edge Function deploy in the intended project.
select cron.unschedule(jobid) from cron.job where jobname='edital-certo-pncp-itens';
select cron.schedule('edital-certo-pncp-itens','5,20,35,50 * * * *',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/enrich-pncp-items',
    headers := jsonb_build_object('Content-Type','application/json','x-ingestion-token',(select decrypted_secret from vault.decrypted_secrets where name='ingestion_job_token')),
    body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$job$);
