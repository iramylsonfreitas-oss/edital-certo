create table public.email_delivery_blocks (
 recipient_user_id uuid primary key references auth.users(id) on delete cascade,
 reason text not null check(reason in ('unsubscribe','bounced','complained','suppressed')),
 created_at timestamptz not null default now()
);
alter table public.email_delivery_blocks enable row level security;
revoke all on public.email_delivery_blocks from anon,authenticated;
grant all on public.email_delivery_blocks to service_role;
grant select on public.email_delivery_blocks to authenticated;
create policy email_blocks_read_self on public.email_delivery_blocks for select to authenticated
 using(recipient_user_id=(select auth.uid()));

create table public.email_unsubscribe_tokens (
 message_id uuid primary key,
 recipient_user_id uuid not null references auth.users(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now()
);
create index email_unsubscribe_recipient_idx on public.email_unsubscribe_tokens(recipient_user_id);
alter table public.email_unsubscribe_tokens enable row level security;
revoke all on public.email_unsubscribe_tokens from public,anon,authenticated;
grant all on public.email_unsubscribe_tokens to service_role;

alter table public.email_messages add column delivery_state text
 check(delivery_state in ('sent','delivered','bounced','complained','failed','suppressed'));
create unique index email_messages_provider_unique on public.email_messages(provider_message_id) where provider_message_id is not null;
create table public.email_provider_events (
 event_id text primary key check(length(event_id) between 1 and 200),
 provider_id uuid not null,kind text not null check(kind in ('sent','delivered','bounced','complained','failed','suppressed')),
 occurred_at timestamptz not null,body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
 message_id uuid references public.email_messages(id) on delete set null,
 received_at timestamptz not null default now(),processed_at timestamptz
);
create index email_provider_events_message_idx on public.email_provider_events(message_id);
alter table public.email_provider_events enable row level security;
revoke all on public.email_provider_events from public,anon,authenticated;
grant all on public.email_provider_events to service_role;

create function public.create_email_unsubscribe_token(p_message_id uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare m public.email_messages; token text;
begin
 select * into m from public.email_messages where id=p_message_id for update;
 if not found or m.status<>'draft' or m.attempts<>0 or m.payload_bytes is not null
 then raise exception 'UNSUBSCRIBE_DRAFT_REQUIRED' using errcode='23514'; end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.email_unsubscribe_tokens(message_id,recipient_user_id,token_hash)
 values(m.id,m.recipient_user_id,encode(extensions.digest(token,'sha256'),'hex'));
 return token;
end $$;

create function public.unsubscribe_email_token(p_token text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare actor uuid;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
 select recipient_user_id into actor from public.email_unsubscribe_tokens
 where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
 if not found then return false; end if;
 insert into public.email_delivery_blocks(recipient_user_id,reason) values(actor,'unsubscribe')
 on conflict(recipient_user_id) do nothing;
 update public.alerts set is_enabled=false,email_enabled=false where recipient_user_id=actor;
 return true;
end $$;

-- Explicit self-service removal is limited to a voluntary unsubscribe. Never clears complaints/bounces.
create function public.resume_email_after_unsubscribe(p_confirm boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); cleared integer;
begin
 if actor is null or p_confirm is distinct from true then raise exception 'EXPLICIT_ACCOUNT_CONSENT_REQUIRED' using errcode='42501'; end if;
 delete from public.email_delivery_blocks where recipient_user_id=actor and reason='unsubscribe';
 get diagnostics cleared=row_count;
 if cleared>0 then
  update public.alerts set email_enabled=true where recipient_user_id=actor and not is_enabled;
 end if;
 return not exists(select 1 from public.email_delivery_blocks where recipient_user_id=actor);
end $$;
revoke all on function public.resume_email_after_unsubscribe(boolean) from public,anon;
grant execute on function public.resume_email_after_unsubscribe(boolean) to authenticated;

create function public.select_email_delivery_candidate(p_from text,p_recipients text[])
returns uuid language sql volatile security invoker set search_path='' as $$
 select m.id from public.email_messages m
 where m.status in ('ready','retry','dispatching') and m.next_attempt_at<=now()
 and (m.status<>'dispatching' or m.lease_until<=clock_timestamp())
 and m.payload_bytes::jsonb->>0=p_from
 and lower(m.payload_bytes::jsonb->>1)=any(select lower(v) from unnest(p_recipients) v)
 and cardinality(p_recipients) between 1 and 10
 and exists(select 1 from public.email_unsubscribe_tokens t where t.message_id=m.id and t.recipient_user_id=m.recipient_user_id)
 and not exists(select 1 from public.email_delivery_blocks b where b.recipient_user_id=m.recipient_user_id)
 order by m.next_attempt_at,m.id limit 1;
$$;

create function public.validate_email_delivery_claim(p_message_id uuid,p_claim_token uuid,p_from text,p_token text)
returns boolean language sql volatile security invoker set search_path='' as $$
 select public.validate_email_message_claim(p_message_id,p_claim_token)
 and exists(select 1 from public.email_messages m join public.email_unsubscribe_tokens t on t.message_id=m.id and t.recipient_user_id=m.recipient_user_id
 where m.id=p_message_id and m.payload_bytes::jsonb->>0=p_from
 and t.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
 and not exists(select 1 from public.email_delivery_blocks b where b.recipient_user_id=m.recipient_user_id));
$$;

-- Only call after verifying the raw provider signature. No recipient/body is persisted here.
create function public.record_email_provider_event(p_event_id text,p_provider_id uuid,p_message_id uuid,
 p_kind text,p_occurred_at timestamptz,p_body_hash text,p_from_hash text,p_to_hash text)
returns text language plpgsql security invoker set search_path='' as $$
declare existing public.email_provider_events; m public.email_messages; incoming_rank integer; current_rank integer;
begin
 if p_kind not in ('sent','delivered','bounced','complained','failed','suppressed') or p_kind is null
 or p_event_id is null or length(p_event_id) not between 1 and 200 or p_occurred_at is null
 or p_occurred_at>clock_timestamp()+interval '5 minutes' or p_body_hash is null or p_body_hash !~ '^[a-f0-9]{64}$'
 then raise exception 'PROVIDER_EVENT_INVALID' using errcode='22023'; end if;
 insert into public.email_provider_events(event_id,provider_id,kind,occurred_at,body_hash)
 values(p_event_id,p_provider_id,p_kind,p_occurred_at,p_body_hash) on conflict(event_id) do nothing;
 select * into existing from public.email_provider_events where event_id=p_event_id for update;
 if existing.body_hash<>p_body_hash or existing.provider_id<>p_provider_id or existing.kind<>p_kind
 then raise exception 'PROVIDER_EVENT_IDENTITY_CONFLICT' using errcode='23514'; end if;
 if existing.processed_at is not null then return 'duplicate'; end if;
 select * into m from public.email_messages
 where attempts>0 and payload_bytes is not null and (p_message_id is null or id=p_message_id)
 and (provider_message_id=p_provider_id::text or (id=p_message_id and provider_message_id is null))
 and encode(extensions.digest(lower(payload_bytes::jsonb->>0),'sha256'),'hex')=p_from_hash
 and encode(extensions.digest(lower(payload_bytes::jsonb->>1),'sha256'),'hex')=p_to_hash
 and p_occurred_at>=first_attempt_at-interval '5 minutes' for update;
 if not found then return 'pending'; end if;
 incoming_rank:=array_position(array['sent','delivered','failed','suppressed','bounced','complained'],p_kind);
 current_rank:=coalesce(array_position(array['sent','delivered','failed','suppressed','bounced','complained'],m.delivery_state),0);
 update public.email_messages set status='accepted',provider_message_id=p_provider_id::text,
  delivery_state=case when incoming_rank>current_rank then p_kind else delivery_state end,
  claim_token=null,lease_until=null where id=m.id;
 update public.email_message_attempts set outcome='accepted',finished_at=clock_timestamp()
  where message_id=m.id and outcome is null;
 update public.email_alert_queue set status='sent',updated_at=now()
  where id in(select queue_id from public.email_message_items where message_id=m.id);
 if p_kind in ('bounced','complained','suppressed') and
  encode(extensions.digest(lower(private.email_message_verified_address(m.recipient_user_id)),'sha256'),'hex')=p_to_hash then
  insert into public.email_delivery_blocks(recipient_user_id,reason) values(m.recipient_user_id,p_kind)
   on conflict(recipient_user_id) do update set reason=case
    when email_delivery_blocks.reason='complained' then 'complained'
    when excluded.reason='complained' then 'complained'
    when email_delivery_blocks.reason='bounced' then 'bounced' else excluded.reason end;
  update public.alerts set is_enabled=false,email_enabled=false where recipient_user_id=m.recipient_user_id;
 end if;
 update public.email_provider_events set message_id=m.id,processed_at=clock_timestamp() where event_id=p_event_id;
 return 'processed';
end $$;

revoke all on function public.create_email_unsubscribe_token(uuid),public.unsubscribe_email_token(text),
 public.select_email_delivery_candidate(text,text[]),public.validate_email_delivery_claim(uuid,uuid,text,text),
 public.record_email_provider_event(text,uuid,uuid,text,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function public.create_email_unsubscribe_token(uuid),public.unsubscribe_email_token(text),
 public.select_email_delivery_candidate(text,text[]),public.validate_email_delivery_claim(uuid,uuid,text,text),
 public.record_email_provider_event(text,uuid,uuid,text,timestamptz,text,text,text) to service_role;

create or replace function private.email_alert_is_eligible(p_alert_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.alerts a join auth.users u on u.id=a.recipient_user_id
    join public.memberships m on m.organization_id=a.organization_id and m.user_id=u.id
    where a.id=p_alert_id and a.is_enabled and a.email_enabled and a.email_consent_at is not null
      and not exists(select 1 from public.email_delivery_blocks b where b.recipient_user_id=u.id)
      and u.email_confirmed_at is not null and coalesce(u.email,'')<>''
      and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and coalesce((
        select (p.features->>case when a.frequency='immediate' then 'immediate_alerts' else 'daily_alerts' end)::boolean
        from public.subscriptions s join public.plans p on p.id=s.plan_id
        where s.organization_id=a.organization_id and s.status in ('active','trialing') and p.is_active
          and (s.current_period_end is null or s.current_period_end>now())
        order by s.created_at desc limit 1
      ),(
        select (p.features->>case when a.frequency='immediate' then 'immediate_alerts' else 'daily_alerts' end)::boolean
        from public.plans p where p.plan_key='free' and p.is_active limit 1
      ),false)
  );
$$;

create function public.reserve_next_email_delivery_digest(p_recipients text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid; ids uuid[]; msg uuid; recipient text; result jsonb;
begin
 if p_recipients is null or cardinality(p_recipients) not between 1 and 10 then raise exception 'DELIVERY_ALLOWLIST_REQUIRED'; end if;
 select q.recipient_user_id into actor from public.email_alert_queue q
 where lower(private.email_message_verified_address(q.recipient_user_id))=any(select lower(v) from unnest(p_recipients) v) and q.status='prepared' and q.ready_at<=now()
 and not exists(select 1 from public.email_message_items i where i.queue_id=q.id)
 and not exists(select 1 from public.email_messages m where m.recipient_user_id=q.recipient_user_id
  and m.status in ('draft','ready','dispatching','retry'))
 and private.email_message_item_current(q.id,pg_catalog.md5(to_jsonb(q)::text))
 order by q.ready_at,q.id limit 1 for update of q skip locked;
 if not found then return null; end if;
 recipient:=private.email_message_verified_address(actor);
 if recipient is null then return null; end if;
 select array_agg(candidate.id order by candidate.id) into ids from (
  select q.id from public.email_alert_queue q
  where q.recipient_user_id=actor and q.status='prepared' and q.ready_at<=now()
  and not exists(select 1 from public.email_message_items i where i.queue_id=q.id)
  and private.email_message_item_current(q.id,pg_catalog.md5(to_jsonb(q)::text))
  order by q.id limit 20 for update of q skip locked
 ) candidate;
 if cardinality(ids) is null then return null; end if;
 begin
  msg:=public.reserve_email_message(ids);
 exception when unique_violation then return null;
 end;
 select jsonb_build_object('message_id',msg,'to',recipient,'items',jsonb_agg(jsonb_build_object(
  'queueId',q.id,'opportunity',jsonb_build_object(
   'id',t.id,'title',t.title,'agency',a.name,'uf',t.uf,'estimatedValue',t.estimated_value,
   'deadline',t.proposal_close_at,'score',q.score,'explanation',q.explanation)) order by q.id))
 into result
 from public.email_alert_queue q join public.tenders t on t.id=q.tender_id
 left join public.agencies a on a.id=t.agency_id where q.id=any(ids);
 return result;
end $$;
revoke all on function public.reserve_next_email_delivery_digest(text[]) from public,anon,authenticated;
grant execute on function public.reserve_next_email_delivery_digest(text[]) to service_role;
