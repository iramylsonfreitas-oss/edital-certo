-- Bounded internal maintenance only. Never sends, retries or releases uncertain items.
create function public.maintain_email_message_history(p_limit integer default 50)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.email_messages; deadline timestamptz:=clock_timestamp();
 quarantined integer:=0; expired_failed integer:=0; purged_accepted integer:=0; purged_canceled integer:=0;
begin
 if p_limit is null or p_limit<1 or p_limit>100 then
  raise exception 'EMAIL_MAINTENANCE_LIMIT_INVALID' using errcode='22023';
 end if;
 for m in select * from public.email_messages
 where status in ('dispatching','retry')
 and (status<>'dispatching' or lease_until is null or lease_until<=deadline)
 and (attempts>=5 or first_attempt_at<=deadline-interval '23 hours')
 order by first_attempt_at,id limit p_limit for update skip locked loop
  if m.status='dispatching' or m.had_unknown_outcome
   or exists(select 1 from public.email_message_attempts where message_id=m.id and outcome in ('unknown','conflict')) then
   update public.email_message_attempts set outcome='unknown',finished_at=deadline
    where message_id=m.id and outcome is null;
   update public.email_messages set status='uncertain',had_unknown_outcome=true,claim_token=null,lease_until=null where id=m.id;
   quarantined:=quarantined+1;
  else
   update public.email_messages set status='failed',claim_token=null,lease_until=null where id=m.id;
   expired_failed:=expired_failed+1;
  end if;
 end loop;
 -- Keep sent queue rows as deduplication tombstones after deleting accepted history.
 for m in select * from public.email_messages
 where status='accepted' and attempts>0
 and created_at<deadline-interval '90 days' and first_attempt_at<deadline-interval '90 days'
 and exists(select 1 from public.email_message_attempts a where a.message_id=email_messages.id and a.outcome='accepted' and a.finished_at is not null)
 and not exists(select 1 from public.email_message_attempts a where a.message_id=email_messages.id
  and (a.finished_at is null or a.finished_at>=deadline-interval '90 days'))
 and exists(select 1 from public.email_message_items i where i.message_id=email_messages.id)
 and not exists(select 1 from public.email_message_items i join public.email_alert_queue q on q.id=i.queue_id
  where i.message_id=email_messages.id and q.status<>'sent')
 order by created_at,id limit (p_limit-quarantined-expired_failed) for update skip locked loop
  perform 1 from public.email_message_items i join public.email_alert_queue q on q.id=i.queue_id
   where i.message_id=m.id for update of q;
  if exists(select 1 from public.email_message_items i join public.email_alert_queue q on q.id=i.queue_id
   where i.message_id=m.id and q.status<>'sent') then continue; end if;
  delete from public.email_messages where id=m.id;
  purged_accepted:=purged_accepted+1;
 end loop;
 -- Only abandoned canceled history without any attempt or retained queue ownership.
 for m in select * from public.email_messages
 where status='canceled' and attempts=0 and created_at<deadline-interval '30 days'
 and not exists(select 1 from public.email_message_attempts a where a.message_id=email_messages.id)
 and not exists(select 1 from public.email_message_items i where i.message_id=email_messages.id)
 order by created_at,id limit (p_limit-quarantined-expired_failed-purged_accepted) for update skip locked loop
  delete from public.email_messages where id=m.id;
  purged_canceled:=purged_canceled+1;
 end loop;
 return jsonb_build_object('quarantined',quarantined,'expired_failed',expired_failed,
  'purged_accepted',purged_accepted,'purged_canceled',purged_canceled);
end $$;
revoke all on function public.maintain_email_message_history(integer) from public,anon,authenticated;
grant execute on function public.maintain_email_message_history(integer) to service_role;
