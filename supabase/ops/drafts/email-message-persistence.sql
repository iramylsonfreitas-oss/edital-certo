-- PROPOSAL ONLY. Validate and package with Supabase CLI before migration/deployment.
-- This SQL does not contain a sender, network call, secret or cron.
create table public.email_messages (
 id uuid primary key default extensions.gen_random_uuid(),
 recipient_user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'draft' check(status in ('draft','ready','dispatching','retry','accepted','failed','uncertain','canceled')),
 payload_bytes text,
 payload_hash text,
 attempts integer not null default 0 check(attempts between 0 and 5),
 first_attempt_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 had_unknown_outcome boolean not null default false,
 claim_token uuid,
 lease_until timestamptz,
 provider_message_id text,
 created_at timestamptz not null default now(),
 check((payload_bytes is null)=(payload_hash is null))
);
create unique index email_messages_one_active_recipient on public.email_messages(recipient_user_id)
 where status in ('draft','ready','dispatching','retry');
create index email_messages_due_idx on public.email_messages(next_attempt_at) where status in ('ready','retry','dispatching');
alter table public.email_messages enable row level security;
revoke all on public.email_messages from anon,authenticated;
grant all on public.email_messages to service_role;

create table public.email_message_items (
 message_id uuid not null references public.email_messages(id) on delete cascade,
 queue_id uuid not null unique references public.email_alert_queue(id) on delete cascade,
 queue_version text not null,
 primary key(message_id,queue_id)
);
create index email_message_items_queue_idx on public.email_message_items(queue_id);
alter table public.email_message_items enable row level security;
revoke all on public.email_message_items from anon,authenticated;
grant all on public.email_message_items to service_role;

create table public.email_message_attempts (
 message_id uuid not null references public.email_messages(id) on delete cascade,
 attempt_number integer not null check(attempt_number between 1 and 5),
 claim_token uuid not null unique,
 started_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz,
 outcome text check(outcome in ('accepted','retryable','permanent','unknown','conflict')),
 primary key(message_id,attempt_number)
);
alter table public.email_message_attempts enable row level security;
revoke all on public.email_message_attempts from anon,authenticated;
grant all on public.email_message_attempts to service_role;

create function private.email_message_item_current(p_queue_id uuid,p_version text)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.email_alert_queue q join public.tenders t on t.id=q.tender_id
 where q.id=p_queue_id and q.status='prepared'
 and private.email_alert_is_eligible(q.alert_id)
 and q.config_key=private.email_alert_config_key(q.alert_id,q.profile_id)
 and q.tender_version=pg_catalog.md5(jsonb_build_object('tender',to_jsonb(t),'agency',(select to_jsonb(a) from public.agencies a where a.id=t.agency_id))::text)
 and t.proposal_close_at>now() and t.is_ti and t.raw_data->>'situacaoCompraId'='1'
 and pg_catalog.md5(to_jsonb(q)::text)=p_version);
$$;
revoke all on function private.email_message_item_current(uuid,text) from public,anon,authenticated;
grant execute on function private.email_message_item_current(uuid,text) to service_role;

create function private.guard_frozen_email_message()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.id is distinct from old.id or new.recipient_user_id is distinct from old.recipient_user_id
 or old.payload_bytes is not null and (new.payload_bytes is distinct from old.payload_bytes or new.payload_hash is distinct from old.payload_hash)
 or old.first_attempt_at is not null and new.first_attempt_at is distinct from old.first_attempt_at
 or new.attempts<old.attempts then
  raise exception 'EMAIL_MESSAGE_IMMUTABLE' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.guard_frozen_email_message() from public,anon,authenticated;
create trigger email_message_frozen before update on public.email_messages for each row execute function private.guard_frozen_email_message();

create function public.reserve_email_message(p_queue_ids uuid[])
returns uuid language plpgsql security invoker set search_path='' as $$
declare actor uuid; msg uuid; n integer; q public.email_alert_queue;
begin
 if coalesce(cardinality(p_queue_ids),0) not between 1 and 20
 or (select count(distinct v) from unnest(p_queue_ids) v)<>cardinality(p_queue_ids) then
  raise exception 'EMAIL_MESSAGE_ITEMS_INVALID' using errcode='22023';
 end if;
 n:=0;
 for q in select * from public.email_alert_queue where id=any(p_queue_ids) order by id for update loop
  if q.ready_at>now() or not private.email_message_item_current(q.id,pg_catalog.md5(to_jsonb(q)::text))
   or actor is not null and q.recipient_user_id<>actor then
   raise exception 'EMAIL_MESSAGE_ITEM_NOT_CURRENT' using errcode='23514';
  end if;
  actor:=q.recipient_user_id;
  n:=n+1;
 end loop;
 if n<>cardinality(p_queue_ids) then raise exception 'EMAIL_MESSAGE_ITEM_MISSING' using errcode='23514'; end if;
 insert into public.email_messages(recipient_user_id) values(actor) returning id into msg;
 insert into public.email_message_items(message_id,queue_id,queue_version)
 select msg,candidate.id,pg_catalog.md5(to_jsonb(candidate)::text) from public.email_alert_queue candidate where candidate.id=any(p_queue_ids);
 return msg;
end $$;

-- Input is exactly JSON.stringify([from,to,subject,html,text]), matching delivery.ts.
create function private.email_message_verified_address(p_recipient uuid)
returns text language sql stable security definer set search_path='' as $$
 select email from auth.users where id=p_recipient and email_confirmed_at is not null
 and deleted_at is null and (banned_until is null or banned_until<=now());
$$;
revoke all on function private.email_message_verified_address(uuid) from public,anon,authenticated;
grant execute on function private.email_message_verified_address(uuid) to service_role;

create function public.freeze_email_message(p_message_id uuid,p_payload_bytes text)
returns text language plpgsql security invoker set search_path='' as $$
declare m public.email_messages; content jsonb; recipient text; fingerprint text;
begin
 select * into m from public.email_messages where id=p_message_id for update;
 if not found or m.status<>'draft' then raise exception 'EMAIL_MESSAGE_NOT_DRAFT' using errcode='23514'; end if;
 content:=p_payload_bytes::jsonb;
 if jsonb_typeof(content) is distinct from 'array' or jsonb_array_length(content)<>5
 or exists(select 1 from jsonb_array_elements(content) v where jsonb_typeof(v)<>'string')
 or octet_length(p_payload_bytes)>120000
 or content->>0 !~ '@' or content->>1 !~ '@'
 or ((content->>0) || (content->>1) || (content->>2)) ~ E'[\\r\\n]' then
  raise exception 'EMAIL_MESSAGE_PAYLOAD_INVALID' using errcode='22023';
 end if;
 recipient:=private.email_message_verified_address(m.recipient_user_id);
 if recipient is distinct from content->>1 or not exists(select 1 from public.email_message_items where message_id=m.id)
 or exists(select 1 from public.email_message_items i where i.message_id=m.id and not private.email_message_item_current(i.queue_id,i.queue_version)) then
  raise exception 'EMAIL_MESSAGE_NO_LONGER_ELIGIBLE' using errcode='23514';
 end if;
 fingerprint:=encode(extensions.digest(convert_to(p_payload_bytes,'UTF8'),'sha256'),'hex');
 update public.email_messages set payload_bytes=p_payload_bytes,payload_hash=fingerprint,status='ready' where id=m.id;
 return fingerprint;
end $$;

create function public.claim_email_message(p_message_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.email_messages; token uuid;
begin
 select * into m from public.email_messages where id=p_message_id for update skip locked;
 if not found or m.status not in ('ready','retry','dispatching') then return null; end if;
 if m.status='dispatching' and m.lease_until>clock_timestamp() then return null; end if;
 if m.status='dispatching' then
  update public.email_message_attempts set outcome='unknown',finished_at=clock_timestamp() where message_id=m.id and attempt_number=m.attempts and outcome is null;
  m.had_unknown_outcome:=true;
 end if;
 if exists(select 1 from public.email_message_items i where i.message_id=m.id and not private.email_message_item_current(i.queue_id,i.queue_version))
 or not exists(select 1 from public.email_message_items where message_id=m.id)
 or private.email_message_verified_address(m.recipient_user_id) is distinct from (m.payload_bytes::jsonb->>1) then
  update public.email_messages set status=case when m.had_unknown_outcome then 'uncertain' else 'canceled' end,had_unknown_outcome=m.had_unknown_outcome,claim_token=null,lease_until=null where id=m.id;
  if m.attempts=0 then delete from public.email_message_items where message_id=m.id; end if;
  return null;
 end if;
 if m.attempts>=5 or m.first_attempt_at<=clock_timestamp()-interval '23 hours' then
  update public.email_messages set status=case when m.had_unknown_outcome then 'uncertain' else 'failed' end,had_unknown_outcome=m.had_unknown_outcome,claim_token=null,lease_until=null where id=m.id;
  return null;
 end if;
 if m.next_attempt_at>clock_timestamp() then return null; end if;
 token:=extensions.gen_random_uuid();
 update public.email_messages set status='dispatching',attempts=m.attempts+1,
 first_attempt_at=coalesce(m.first_attempt_at,clock_timestamp()),had_unknown_outcome=m.had_unknown_outcome,
 claim_token=token,lease_until=clock_timestamp()+interval '2 minutes' where id=m.id;
 insert into public.email_message_attempts(message_id,attempt_number,claim_token) values(m.id,m.attempts+1,token);
 return jsonb_build_object('message_id',m.id,'claim_token',token,'payload_bytes',m.payload_bytes,'payload_hash',m.payload_hash,'idempotency_key','edital-certo/'||m.id);
end $$;

create function public.finish_email_message_attempt(p_message_id uuid,p_claim_token uuid,p_outcome text,p_provider_id text default null)
returns text language plpgsql security invoker set search_path='' as $$
declare m public.email_messages; final_status text; uncertain boolean;
begin
 select * into m from public.email_messages where id=p_message_id for update;
 if not found or p_claim_token is null or m.claim_token is distinct from p_claim_token or m.status<>'dispatching' or m.lease_until<=clock_timestamp() then
  raise exception 'EMAIL_MESSAGE_LEASE_LOST' using errcode='40001';
 end if;
 if p_outcome not in ('accepted','retryable','permanent','unknown','conflict') or p_outcome is null
 or p_outcome='accepted' and coalesce(length(trim(p_provider_id)),0)=0 then
  raise exception 'EMAIL_MESSAGE_OUTCOME_INVALID' using errcode='22023';
 end if;
 uncertain:=m.had_unknown_outcome or p_outcome in ('unknown','conflict');
 final_status:=case when p_outcome='accepted' then 'accepted'
 when p_outcome in ('permanent','conflict') or m.attempts>=5 then case when uncertain then 'uncertain' else 'failed' end else 'retry' end;
 update public.email_message_attempts set outcome=p_outcome,finished_at=clock_timestamp() where message_id=m.id and attempt_number=m.attempts and claim_token=p_claim_token;
 update public.email_messages set status=final_status,had_unknown_outcome=uncertain,claim_token=null,lease_until=null,
 provider_message_id=case when final_status='accepted' then p_provider_id else provider_message_id end,
 next_attempt_at=clock_timestamp()+make_interval(secs=>60*power(2,m.attempts-1)::integer) where id=m.id;
 if final_status='accepted' then
  update public.email_alert_queue set status='sent',updated_at=now() where id in(select queue_id from public.email_message_items where message_id=m.id);
 end if;
 return final_status;
end $$;

revoke all on function public.reserve_email_message(uuid[]) from public,anon,authenticated;
revoke all on function public.freeze_email_message(uuid,text) from public,anon,authenticated;
revoke all on function public.claim_email_message(uuid) from public,anon,authenticated;
revoke all on function public.finish_email_message_attempt(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_email_message(uuid[]) to service_role;
grant execute on function public.freeze_email_message(uuid,text) to service_role;
grant execute on function public.claim_email_message(uuid) to service_role;
grant execute on function public.finish_email_message_attempt(uuid,uuid,text,text) to service_role;

-- A draft that never reached a provider can safely release its queue items.
create function public.cancel_unattempted_email_message(p_message_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare m public.email_messages;
begin
 select * into m from public.email_messages where id=p_message_id for update;
 if not found or m.attempts<>0 or m.status not in ('draft','ready') then return false; end if;
 update public.email_messages set status='canceled',claim_token=null,lease_until=null where id=m.id;
 delete from public.email_message_items where message_id=m.id;
 return true;
end $$;
revoke all on function public.cancel_unattempted_email_message(uuid) from public,anon,authenticated;
grant execute on function public.cancel_unattempted_email_message(uuid) to service_role;

-- Read immediately before the simulated transport; never hold a transaction over network IO.
create function public.validate_email_message_claim(p_message_id uuid,p_claim_token uuid)
returns boolean language sql volatile security invoker set search_path='' as $$
 select exists(select 1 from public.email_messages m
 where m.id=p_message_id and m.claim_token=p_claim_token and m.status='dispatching'
 and m.lease_until>clock_timestamp() and m.first_attempt_at>clock_timestamp()-interval '23 hours'
 and m.payload_hash=encode(extensions.digest(convert_to(m.payload_bytes,'UTF8'),'sha256'),'hex')
 and private.email_message_verified_address(m.recipient_user_id)=(m.payload_bytes::jsonb->>1)
 and exists(select 1 from public.email_message_items where message_id=m.id)
 and not exists(select 1 from public.email_message_items i where i.message_id=m.id
  and not private.email_message_item_current(i.queue_id,i.queue_version)));
$$;
revoke all on function public.validate_email_message_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.validate_email_message_claim(uuid,uuid) to service_role;
