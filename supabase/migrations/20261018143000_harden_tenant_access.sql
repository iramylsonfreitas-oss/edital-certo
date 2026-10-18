-- Endurece permissões de comentários e limita a exposição do estado da ingestão.

drop policy if exists comments_update_author_or_admin on public.comments;
drop policy if exists comments_delete_author_or_admin on public.comments;

create policy comments_update_member_author_or_admin
on public.comments
for update
to authenticated
using (
  (select private.has_org_role(organization_id, array['admin', 'analyst']::public.organization_role[]))
  and (
    author_user_id = (select auth.uid())
    or (select private.has_org_role(organization_id, array['admin']::public.organization_role[]))
  )
)
with check (
  (select private.has_org_role(organization_id, array['admin', 'analyst']::public.organization_role[]))
  and (
    author_user_id = (select auth.uid())
    or (select private.has_org_role(organization_id, array['admin']::public.organization_role[]))
  )
);

create policy comments_delete_member_author_or_admin
on public.comments
for delete
to authenticated
using (
  (select private.has_org_role(organization_id, array['admin', 'analyst']::public.organization_role[]))
  and (
    author_user_id = (select auth.uid())
    or (select private.has_org_role(organization_id, array['admin']::public.organization_role[]))
  )
);

-- O histórico detalhado pode conter mensagens de erro e checkpoints internos.
-- O dashboard recebe somente métricas operacionais sem os detalhes internos.
drop policy if exists ingestion_runs_read_authenticated on public.ingestion_runs;
revoke select on public.ingestion_runs from authenticated;

create or replace view public.source_status
with (security_barrier = true)
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
