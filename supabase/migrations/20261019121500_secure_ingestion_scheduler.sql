-- Agenda PNCP com um token aleatório armazenado somente no Supabase Vault.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'ingestion_job_token'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ingestion_job_token',
      'Token privado usado pelo agendador da ingestão do PNCP.'
    );
  end if;
end;
$$;

create or replace function public.validate_ingestion_job_token(p_candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_candidate <> '' and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'ingestion_job_token'
        and decrypted_secret = p_candidate
    ),
    false
  );
$$;

revoke all on function public.validate_ingestion_job_token(text) from public, anon, authenticated;
grant execute on function public.validate_ingestion_job_token(text) to service_role;
