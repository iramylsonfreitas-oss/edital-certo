-- Faz a view de status respeitar as permissões e a RLS do usuário.
drop view if exists public.source_status;

revoke select on public.ingestion_runs from authenticated;
grant select (
  source_key,
  status,
  started_at,
  finished_at,
  pages_fetched,
  records_seen,
  records_inserted,
  records_updated
) on public.ingestion_runs to authenticated;

drop policy if exists ingestion_runs_read_authenticated on public.ingestion_runs;
create policy ingestion_runs_read_metrics
on public.ingestion_runs
for select
to authenticated
using (true);

create view public.source_status
with (security_invoker = true, security_barrier = true)
as
select
  source_key,
  status,
  started_at,
  finished_at,
  pages_fetched,
  records_seen,
  records_inserted,
  records_updated
from public.ingestion_runs
where source_key = 'pncp';

grant select on public.source_status to authenticated;
