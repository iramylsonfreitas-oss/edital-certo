-- Synthetic accounts only; every change is rolled back.
begin;
insert into auth.users(id,email,last_sign_in_at) values
('b39b216f-7dcc-465d-9ac3-849f714a0001','activity-manager@example.invalid',null),
('b39b216f-7dcc-465d-9ac3-849f714a0002','activity-evaluator@example.invalid','2026-10-27T12:00:00Z'),
('b39b216f-7dcc-465d-9ac3-849f714a0003','activity-outsider@example.invalid',null);
insert into private.evaluation_access(user_id,manager_id,label) values
('b39b216f-7dcc-465d-9ac3-849f714a0002','b39b216f-7dcc-465d-9ac3-849f714a0001','Synthetic activity');
set local role authenticated;
select set_config('request.jwt.claim.sub','b39b216f-7dcc-465d-9ac3-849f714a0002',true);
do $$ begin
  if not public.record_evaluator_access() then raise exception 'Active evaluator denied'; end if;
  if exists(select 1 from public.managed_evaluator_activity()) then raise exception 'Evaluator can read management activity'; end if;
end $$;
reset role;
do $$ declare first_seen timestamptz; after_seen timestamptz; begin
  select last_access_at into first_seen from private.evaluation_access where user_id='b39b216f-7dcc-465d-9ac3-849f714a0002';
  if first_seen is null or first_seen < now()-interval '1 minute' then raise exception 'Activity not recorded'; end if;
  perform public.record_evaluator_access();
  select last_access_at into after_seen from private.evaluation_access where user_id='b39b216f-7dcc-465d-9ac3-849f714a0002';
  if after_seen is distinct from first_seen then raise exception 'Repeated access not throttled'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','b39b216f-7dcc-465d-9ac3-849f714a0001',true);
do $$ begin
  if (select count(*) from public.managed_evaluator_activity() where last_access_at is not null and last_sign_in_at='2026-10-27T12:00:00Z')<>1 then raise exception 'Manager activity missing'; end if;
  perform public.set_evaluator_access('b39b216f-7dcc-465d-9ac3-849f714a0002',false);
end $$;
select set_config('request.jwt.claim.sub','b39b216f-7dcc-465d-9ac3-849f714a0002',true);
do $$ begin if public.record_evaluator_access() then raise exception 'Blocked evaluator accepted'; end if; end $$;
select set_config('request.jwt.claim.sub','b39b216f-7dcc-465d-9ac3-849f714a0003',true);
do $$ begin
  if exists(select 1 from public.managed_evaluator_activity()) then raise exception 'Activity leaked to unrelated account'; end if;
  perform public.record_evaluator_access();
  begin
    update private.evaluation_access set last_access_at=now();
    raise exception 'Caller can forge activity';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from private.evaluation_access where user_id='b39b216f-7dcc-465d-9ac3-849f714a0003')<>0 then raise exception 'Normal user became evaluator'; end if;
  if has_function_privilege('anon','public.record_evaluator_access()','execute') or has_function_privilege('anon','public.managed_evaluator_activity()','execute') then raise exception 'Anonymous activity access'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin if public.record_evaluator_access() then raise exception 'Null identity accepted'; end if; end $$;
rollback;
select true as evaluation_activity_passed;
