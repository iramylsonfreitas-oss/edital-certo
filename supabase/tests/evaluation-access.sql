-- Synthetic fixtures, fully rolled back; no emails or credentials.
begin;
insert into auth.users(id,email) values
('e9a5ad63-c82b-4cae-a283-72f7b5d33e01','evaluation-manager@example.invalid'),
('e9a5ad63-c82b-4cae-a283-72f7b5d33e02','evaluation-tester@example.invalid'),
('e9a5ad63-c82b-4cae-a283-72f7b5d33e03','evaluation-outsider@example.invalid');
insert into private.evaluation_access(user_id,manager_id,label) values
('e9a5ad63-c82b-4cae-a283-72f7b5d33e02','e9a5ad63-c82b-4cae-a283-72f7b5d33e01','Synthetic evaluation');
select set_config('request.jwt.claim.sub','e9a5ad63-c82b-4cae-a283-72f7b5d33e02',true);
insert into public.organizations(id,name,slug,created_by) values
('e9a5ad63-c82b-4cae-a283-72f7b5d33e04','Synthetic evaluation','evaluation-access-sql-fixture','e9a5ad63-c82b-4cae-a283-72f7b5d33e02');
insert into public.tenders(id,source_key,source_id,title,object,proposal_close_at,raw_data) values
('e9a5ad63-c82b-4cae-a283-72f7b5d33e05','evaluation-sql','evaluation-sql-fixture','Notebook sintético','Aquisição de notebook',now()+interval '5 days','{"situacaoCompraId":1}');
insert into public.pipeline_cards(organization_id,tender_id,created_by,notes) values
('e9a5ad63-c82b-4cae-a283-72f7b5d33e04','e9a5ad63-c82b-4cae-a283-72f7b5d33e05','e9a5ad63-c82b-4cae-a283-72f7b5d33e02','Synthetic evaluation notes');

set local role authenticated;
do $test$
begin
  if not public.current_account_access() then raise exception 'Active evaluator denied'; end if;
  if not exists(select 1 from public.pipeline_cards where notes='Synthetic evaluation notes') then raise exception 'Own evaluation data missing'; end if;
  if exists(select 1 from public.managed_evaluators()) then raise exception 'Evaluator can list management data'; end if;
  begin
    perform public.set_evaluator_access('e9a5ad63-c82b-4cae-a283-72f7b5d33e02',false);
    raise exception 'Evaluator can manage itself';
  exception when insufficient_privilege then null; end;
  begin
    perform * from private.evaluation_access;
    raise exception 'Private access registry exposed';
  exception when insufficient_privilege then null; end;
end;
$test$;

select set_config('request.jwt.claim.sub','e9a5ad63-c82b-4cae-a283-72f7b5d33e03',true);
do $test$
begin
  if exists(select 1 from public.managed_evaluators()) then raise exception 'Outsider can list evaluators'; end if;
  if exists(select 1 from public.pipeline_cards where notes='Synthetic evaluation notes') then raise exception 'Evaluation tenant data leaked'; end if;
  begin
    perform public.set_evaluator_access('e9a5ad63-c82b-4cae-a283-72f7b5d33e02',false);
    raise exception 'Outsider can block evaluator';
  exception when insufficient_privilege then null; end;
end;
$test$;

select set_config('request.jwt.claim.sub','e9a5ad63-c82b-4cae-a283-72f7b5d33e01',true);
do $test$
begin
  if (select count(*) from public.managed_evaluators()) <> 1 then raise exception 'Manager cannot list own evaluator'; end if;
  perform public.set_evaluator_access('e9a5ad63-c82b-4cae-a283-72f7b5d33e02',false);
  if not public.current_account_access() then raise exception 'Manager blocked by evaluator toggle'; end if;
end;
$test$;

-- This identity represents an already-issued JWT: toggling does not refresh it.
select set_config('request.jwt.claim.sub','e9a5ad63-c82b-4cae-a283-72f7b5d33e02',true);
do $test$
begin
  if public.current_account_access() then raise exception 'Blocked account still authorized'; end if;
  if exists(select 1 from public.tenders) or exists(select 1 from public.pipeline_cards) or exists(select 1 from public.organizations) then
    raise exception 'Blocked account can still read data';
  end if;
  if exists(select 1 from public.search_tenders_by_segment(p_segment=>'it',p_page_size=>1)) then raise exception 'Blocked account can query catalog RPC'; end if;
  if exists(select 1 from public.tender_it_item_summary(array['e9a5ad63-c82b-4cae-a283-72f7b5d33e05'::uuid])) then raise exception 'Blocked account can query item value summary'; end if;
  begin
    perform public.set_evaluator_access('e9a5ad63-c82b-4cae-a283-72f7b5d33e02',true);
    raise exception 'Blocked account can reactivate itself';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.tender_feedback(organization_id,user_id,tender_id,state) values
    ('e9a5ad63-c82b-4cae-a283-72f7b5d33e04','e9a5ad63-c82b-4cae-a283-72f7b5d33e02','e9a5ad63-c82b-4cae-a283-72f7b5d33e05','favorite');
    raise exception 'Blocked account can write';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.organizations(name,slug,created_by) values('Bypass','evaluation-bypass','e9a5ad63-c82b-4cae-a283-72f7b5d33e02');
    raise exception 'Blocked account can create a replacement organization';
  exception when insufficient_privilege then null; end;
end;
$test$;

select set_config('request.jwt.claim.sub','e9a5ad63-c82b-4cae-a283-72f7b5d33e01',true);
select public.set_evaluator_access('e9a5ad63-c82b-4cae-a283-72f7b5d33e02',true);
select set_config('request.jwt.claim.sub','e9a5ad63-c82b-4cae-a283-72f7b5d33e02',true);
do $test$
begin
  if not public.current_account_access() or not exists(select 1 from public.pipeline_cards where notes='Synthetic evaluation notes') then
    raise exception 'Reactivation lost access or saved data';
  end if;
end;
$test$;
set local role anon;
do $test$
begin
  begin
    perform public.managed_evaluators();
    raise exception 'Anonymous management access';
  exception when insufficient_privilege then null; end;
end;
$test$;
rollback;
