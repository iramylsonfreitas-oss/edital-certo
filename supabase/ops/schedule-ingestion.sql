-- Execute no SQL Editor do projeto Supabase depois de habilitar Cron e pg_net.
-- Cadastre no Vault os segredos project_url, publishable_key e ingestion_job_token.
-- Este script não contém valores de projeto ou credenciais.

select cron.unschedule(jobid)
from cron.job
where jobname = 'edital-certo-pncp-hourly';

select cron.schedule(
  'edital-certo-pncp-hourly',
  '0 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/ingest-pncp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'x-ingestion-token', (select decrypted_secret from vault.decrypted_secrets where name = 'ingestion_job_token')
      ),
      body := '{}'::jsonb
    );
  $job$
);
