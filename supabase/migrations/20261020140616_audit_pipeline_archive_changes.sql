drop trigger pipeline_status_audited on public.pipeline_cards;
create trigger pipeline_status_audited after update of status,archived_at on public.pipeline_cards
for each row execute function private.audit_pipeline_status_change();
