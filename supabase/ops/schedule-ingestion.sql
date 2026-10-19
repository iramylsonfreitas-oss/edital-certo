-- Execute uma vez no SQL Editor do projeto Supabase após publicar ingest-pncp.
-- Troque apenas <project-ref> pelo identificador do projeto Supabase.
-- O token é criado pela migration e permanece criptografado no Vault.

select vault.create_secret(
  'https://<project-ref>.supabase.co',
  'project_url',
  'URL do projeto que receberá a ingestão do PNCP.'
)
where not exists (
  select 1 from vault.secrets where name = 'project_url'
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'edital-certo-pncp-a-cada-tres-horas';

select cron.schedule(
  'edital-certo-pncp-a-cada-tres-horas',
  '0 */3 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/ingest-pncp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingestion-token', (select decrypted_secret from vault.decrypted_secrets where name = 'ingestion_job_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
