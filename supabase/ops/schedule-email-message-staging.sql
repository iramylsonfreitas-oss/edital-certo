-- Development only. Requires the validated stage-email-messages function v2.
-- Fixed destination; uses the existing token internally, never embeds its value.
-- Reapplying updates the named job instead of creating duplicates.
begin;
do $guard$
begin
 if not exists(select 1 from supabase_migrations.schema_migrations
  where version='20261020203247' and name='email_message_persistence'
  and md5(array_to_string(statements,E'\n'))='ad8e2bf99b281bf0b17e1733f4a09e76')
 then raise exception 'VALIDATED_DEVELOPMENT_HISTORY_REQUIRED'; end if;
 if to_regclass('public.email_messages') is null then raise exception 'PERSISTENCE_REQUIRED'; end if;
 if (select count(*) from vault.decrypted_secrets where name='ingestion_job_token' and length(decrypted_secret)>0)<>1
 then raise exception 'EXISTING_SCHEDULER_TOKEN_REQUIRED'; end if;
end $guard$;
select cron.schedule('edital-certo-preparar-mensagens-dev','10,25,40,55 * * * *',$job$
 select net.http_post(
  url := 'https://afbuozouupuguvkkuvib.supabase.co/functions/v1/stage-email-messages',
  headers := jsonb_build_object('Content-Type','application/json','x-ingestion-token',
   (select decrypted_secret from vault.decrypted_secrets where name='ingestion_job_token')),
  body := '{}'::jsonb, timeout_milliseconds := 90000
 );
$job$) as job_id;
commit;
