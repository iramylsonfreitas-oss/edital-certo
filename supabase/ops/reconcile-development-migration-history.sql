-- Development only: reconcile tracking identifiers after independent schema verification.
-- No schema DDL, migration replay, statement replacement or user-data changes.
-- Original SQL statements remain attached to each original history row.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $repair$
declare item record; actual_version text; actual_hash text; n integer;
begin
 if to_regclass('public.email_messages') is null then raise exception 'DEVELOPMENT_SCHEMA_REQUIRED'; end if;
 if exists(select 1 from pg_constraint where confrelid='supabase_migrations.schema_migrations'::regclass)
 then raise exception 'HISTORY_REFERENCES_REQUIRE_REVIEW'; end if;
 if (select md5(prosrc) from pg_proc where oid='public.is_ti_tender(text)'::regprocedure)<>'5c865f89afc6a74cfbc845950c6d9352'
 or (select md5(prosrc) from pg_proc where oid='public.is_ti_item(text)'::regprocedure)<>'d5d56cdf8d1dfd9f40d3805f6702afff'
 or (select md5(prosrc) from pg_proc where oid='public.claim_pncp_item_job()'::regprocedure)<>'c112a429e6d26b1a38c03439e86d5fcb'
 then raise exception 'INSTALLED_FUNCTION_DRIFT'; end if;
 if not coalesce((select reloptions @> array['security_invoker=true','security_barrier=true'] from pg_class where oid='public.source_status'::regclass),false)
 then raise exception 'SOURCE_VIEW_SECURITY_DRIFT'; end if;
 for item in select * from (values
    ('initial_schema','20261018221212','20261018071000','6ae81a47d79645687c8e187004d0fc79'),
    ('harden_tenant_access','20261018221321','20261018143000','3fd875560a7515e3f0be9862e79f5333'),
    ('secure_source_status_view','20261018234200','20261018234200','9a2c9fadd7a1bb05b3fd9837c3bf2452'),
    ('prototype_feedback_and_pipeline_fields','20261019014041','20261019014500','d5d0f0732039d16becd581d6909cad7f'),
    ('complete_prototype_search_filters','20261019102842','20261019023000','e24d5fbd17e265d57a75046cf4936207'),
    ('secure_ingestion_scheduler','20261019120921','20261019121500','fd57e16b07badfe3464c3eb42b02983c'),
    ('classify_ti_catalog','20261020113735','20261020113516','b8d6d0380b02e4ae55c6664a1da20944'),
    ('batch_pncp_items','20261020123031','20261020122421','6df59272ea7f4606416fee71bdb0f9ab'),
    ('activate_batch_pncp_items','20261020123130','20261020123015','81412fb4eae4bdc773cabc875456e6ed'),
    ('archive_pipeline_cards','20261020140502','20261020140334','39cec10223e1e96118319d8c75ac979d'),
    ('audit_pipeline_archive_changes','20261020140642','20261020140616','ad561a276ab4e81c6ea52a3721d85b77'),
    ('personal_email_alert_preferences','20261020181651','20261020180434','92537d67b0532c0700a4cde0499e0a4d'),
    ('prepare_email_alert_queue','20261020183856','20261020182944','65d26f7af154b35b61f527981769f726'),
    ('email_message_persistence','20261020204133','20261020203247','ad8e2bf99b281bf0b17e1733f4a09e76')
 ) as m(name,old_version,new_version,expected_hash) loop
  select count(*) into n from supabase_migrations.schema_migrations where name=item.name;
  if n<>1 then raise exception 'HISTORY_NAME_NOT_UNIQUE: %',item.name; end if;
  select version,md5(array_to_string(statements,E'\n')) into actual_version,actual_hash
  from supabase_migrations.schema_migrations where name=item.name for update;
  if actual_version not in (item.old_version,item.new_version) or actual_hash is distinct from item.expected_hash
  then raise exception 'HISTORY_FINGERPRINT_MISMATCH: %',item.name; end if;
  if actual_version<>item.new_version then
   if exists(select 1 from supabase_migrations.schema_migrations where version=item.new_version)
   then raise exception 'HISTORY_VERSION_COLLISION: %',item.name; end if;
   update supabase_migrations.schema_migrations set version=item.new_version where version=actual_version and name=item.name;
  end if;
 end loop;
 -- This view setting already exists, verified above. Record it without replaying ALTER VIEW.
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261019134000') then
  if exists(select 1 from supabase_migrations.schema_migrations where name='set_source_status_security_invoker')
  then raise exception 'VIEW_HISTORY_VERSION_COLLISION'; end if;
  insert into supabase_migrations.schema_migrations(version,name,statements)
  values('20261019134000','set_source_status_security_invoker',array['-- Garante que a view aplique as permissões e políticas RLS de quem consulta.
alter view public.source_status set (security_invoker = true);
']);
 elsif not exists(select 1 from supabase_migrations.schema_migrations
  where version='20261019134000' and name='set_source_status_security_invoker'
  and md5(array_to_string(statements,E'\n'))='b6d3f7e75f126438380dc6ffdd799ff4') then
  raise exception 'VIEW_HISTORY_FINGERPRINT_MISMATCH';
 end if;
 if (select count(*) from supabase_migrations.schema_migrations)<>15
 then raise exception 'UNEXPECTED_HISTORY_COUNT'; end if;
end $repair$;
select version,name from supabase_migrations.schema_migrations order by version;
commit;
