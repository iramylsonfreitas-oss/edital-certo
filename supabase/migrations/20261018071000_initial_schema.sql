-- Esquema inicial do Edital Certo. Catálogo público compartilhado; operação comercial multiempresa.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.organization_role as enum ('admin', 'analyst', 'reader');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
create type public.ingestion_status as enum ('running', 'succeeded', 'partial', 'failed');
create type public.alert_frequency as enum ('daily', 'immediate');
create type public.pipeline_status as enum ('triage', 'analysis', 'documentation', 'proposal_sent', 'won', 'lost');
create type public.tender_feedback_state as enum ('favorite', 'discarded');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.privacy_consents (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null check (consent_type in ('terms_of_use', 'privacy_policy')),
  document_version text not null,
  accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, consent_type, document_version)
);

create table public.data_subject_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('export', 'deletion')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'rejected')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  resolution_note text
);

create table public.organizations (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'reader',
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.plans (
  id uuid primary key default extensions.gen_random_uuid(),
  plan_key text not null unique check (plan_key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text not null default '',
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status public.subscription_status not null default 'trialing',
  billing_provider text check (billing_provider in ('asaas', 'stripe')),
  provider_customer_id text,
  provider_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.segments (
  segment_key text primary key check (segment_key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.segments (segment_key, name) values
  ('it', 'Tecnologia da Informação'), ('health', 'Saúde')
on conflict (segment_key) do nothing;

create table public.agencies (
  id uuid primary key default extensions.gen_random_uuid(),
  source_key text not null,
  source_agency_id text not null,
  cnpj text check (cnpj is null or cnpj ~ '^\d{14}$'),
  name text not null,
  sphere text,
  uf char(2) check (uf is null or uf ~ '^[A-Z]{2}$'),
  municipality_code text,
  municipality_name text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_key, source_agency_id)
);

create table public.tenders (
  id uuid primary key default extensions.gen_random_uuid(),
  source_key text not null,
  source_id text not null,
  control_number text,
  agency_id uuid references public.agencies(id) on delete set null,
  title text not null,
  object text not null default '',
  modality_code text,
  modality_name text,
  procurement_type text,
  legal_framework text,
  status text,
  uf char(2) check (uf is null or uf ~ '^[A-Z]{2}$'),
  municipality_code text,
  municipality_name text,
  estimated_value numeric(18,2) check (estimated_value is null or estimated_value >= 0),
  exclusive_me_epp boolean,
  published_at timestamptz,
  proposal_open_at timestamptz,
  proposal_close_at timestamptz,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  official_url text,
  raw_data jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_data) = 'object'),
  search_vector tsvector not null default ''::tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_key, source_id)
);

create table public.tender_items (
  id uuid primary key default extensions.gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  source_item_id text,
  item_number integer not null check (item_number > 0),
  description text not null,
  unit text,
  quantity numeric(18,4) check (quantity is null or quantity >= 0),
  estimated_unit_value numeric(18,4) check (estimated_unit_value is null or estimated_unit_value >= 0),
  estimated_total_value numeric(18,2) check (estimated_total_value is null or estimated_total_value >= 0),
  catmat_code text,
  catser_code text,
  raw_data jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tender_id, item_number),
  unique (tender_id, source_item_id)
);

create table public.tender_files (
  id uuid primary key default extensions.gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  source_file_id text,
  title text not null,
  document_type text,
  external_url text,
  published_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tender_id, source_file_id)
);

create table public.interest_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 2 and 120),
  segment_key text not null references public.segments(segment_key),
  required_keywords text[] not null default '{}',
  optional_keywords text[] not null default '{}',
  excluded_keywords text[] not null default '{}',
  ufs char(2)[] not null default '{}',
  municipality_codes text[] not null default '{}',
  modality_codes text[] not null default '{}',
  agency_terms text[] not null default '{}',
  spheres text[] not null default '{}',
  minimum_value numeric(18,2) check (minimum_value is null or minimum_value >= 0),
  maximum_value numeric(18,2) check (maximum_value is null or maximum_value >= 0),
  cnae_codes text[] not null default '{}',
  exclusive_me_epp boolean,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (maximum_value is null or minimum_value is null or maximum_value >= minimum_value),
  check (cardinality(ufs) = 0 or array_position(ufs, null) is null)
);

create table public.matches (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null,
  profile_id uuid not null,
  tender_id uuid not null references public.tenders(id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  explanation jsonb not null default '[]'::jsonb check (jsonb_typeof(explanation) = 'array'),
  matched_at timestamptz not null default now(),
  unique (organization_id, profile_id, tender_id),
  unique (organization_id, id),
  foreign key (organization_id, profile_id) references public.interest_profiles(organization_id, id) on delete cascade
);

create table public.alerts (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid,
  frequency public.alert_frequency not null default 'daily',
  minimum_score smallint not null default 0 check (minimum_score between 0 and 100),
  email_enabled boolean not null default true,
  telegram_enabled boolean not null default false,
  timezone text not null default 'America/Boa_Vista',
  daily_send_time time not null default '08:00',
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (frequency <> 'immediate' or minimum_score >= 80),
  unique (organization_id, id),
  foreign key (organization_id, profile_id) references public.interest_profiles(organization_id, id) on delete cascade
);

create table public.alert_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alert_id uuid not null references public.alerts(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  channel text not null check (channel in ('email', 'telegram')),
  delivered_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  unique (alert_id, match_id, channel),
  foreign key (organization_id, alert_id) references public.alerts(organization_id, id) on delete cascade,
  foreign key (organization_id, match_id) references public.matches(organization_id, id) on delete cascade
);

create table public.tender_feedback (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tender_id uuid not null references public.tenders(id) on delete cascade,
  state public.tender_feedback_state not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, tender_id),
  foreign key (organization_id, user_id) references public.memberships(organization_id, user_id) on delete cascade
);

create table public.pipeline_cards (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tender_id uuid not null references public.tenders(id) on delete restrict,
  status public.pipeline_status not null default 'triage',
  responsible_user_id uuid references auth.users(id) on delete set null,
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, tender_id),
  unique (organization_id, id),
  foreign key (organization_id, responsible_user_id) references public.memberships(organization_id, user_id) on delete set null (responsible_user_id)
);

create table public.comments (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null,
  pipeline_card_id uuid not null,
  author_user_id uuid not null references auth.users(id),
  body text not null check (length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, pipeline_card_id) references public.pipeline_cards(organization_id, id) on delete cascade
);

create table public.documents (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_card_id uuid,
  uploaded_by uuid not null references auth.users(id),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  expires_at date,
  created_at timestamptz not null default now(),
  foreign key (organization_id, pipeline_card_id) references public.pipeline_cards(organization_id, id) on delete cascade
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.ingestion_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  source_key text not null,
  status public.ingestion_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  pages_fetched integer not null default 0 check (pages_fetched >= 0),
  records_seen integer not null default 0 check (records_seen >= 0),
  records_inserted integer not null default 0 check (records_inserted >= 0),
  records_updated integer not null default 0 check (records_updated >= 0),
  checkpoint jsonb not null default '{}'::jsonb check (jsonb_typeof(checkpoint) = 'object'),
  error_message text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index memberships_user_idx on public.memberships (user_id, organization_id);
create index privacy_consents_user_idx on public.privacy_consents (user_id, accepted_at desc);
create index data_subject_requests_user_idx on public.data_subject_requests (user_id, created_at desc);
create unique index data_subject_one_open_request_idx on public.data_subject_requests (user_id, request_type)
where status in ('pending', 'processing');
create index subscriptions_org_status_idx on public.subscriptions (organization_id, status);
create index agencies_cnpj_idx on public.agencies (cnpj) where cnpj is not null;
create index agencies_location_idx on public.agencies (uf, municipality_code);
create index tenders_published_idx on public.tenders (published_at desc nulls last);
create index tenders_deadline_idx on public.tenders (proposal_close_at asc nulls last);
create index tenders_location_idx on public.tenders (uf, municipality_code);
create index tenders_modality_idx on public.tenders (modality_code, status);
create index tenders_value_idx on public.tenders (estimated_value) where estimated_value is not null;
create index tenders_search_vector_idx on public.tenders using gin (search_vector);
create index tenders_title_trgm_idx on public.tenders using gin (title extensions.gin_trgm_ops);
create index tender_items_tender_idx on public.tender_items (tender_id, item_number);
create index tender_files_tender_idx on public.tender_files (tender_id, published_at desc nulls last);
create index tender_items_catmat_idx on public.tender_items (catmat_code) where catmat_code is not null;
create index tender_items_catser_idx on public.tender_items (catser_code) where catser_code is not null;
create index profiles_org_active_idx on public.interest_profiles (organization_id, is_active);
create index matches_org_score_idx on public.matches (organization_id, score desc, matched_at desc);
create index matches_profile_tender_idx on public.matches (profile_id, tender_id);
create index matches_tender_idx on public.matches (tender_id);
create index alerts_profile_idx on public.alerts (profile_id) where profile_id is not null;
create index alert_deliveries_org_created_idx on public.alert_deliveries (organization_id, created_at desc);
create index tender_feedback_user_state_tender_idx on public.tender_feedback (user_id, state, tender_id);
create index pipeline_org_status_idx on public.pipeline_cards (organization_id, status, updated_at desc);
create index pipeline_responsible_idx on public.pipeline_cards (responsible_user_id, updated_at desc) where responsible_user_id is not null;
create index comments_card_created_idx on public.comments (pipeline_card_id, created_at);
create index comments_author_idx on public.comments (author_user_id, created_at desc);
create index documents_card_idx on public.documents (organization_id, pipeline_card_id) where pipeline_card_id is not null;
create index documents_uploader_idx on public.documents (uploaded_by, created_at desc);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_actor_created_idx on public.audit_logs (actor_user_id, created_at desc);
create index ingestion_runs_source_started_idx on public.ingestion_runs (source_key, started_at desc);

create or replace function public.search_tenders(
  p_query text default null,
  p_uf text default null,
  p_modality_code text default null,
  p_minimum_value numeric default null,
  p_maximum_value numeric default null,
  p_closes_before timestamptz default null,
  p_sort text default 'deadline',
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (tender_id uuid, search_rank real, total_count bigint)
language sql stable security invoker set search_path = ''
as $$
  with filtered as (
    select
      t.id,
      t.proposal_close_at,
      t.estimated_value,
      case
        when nullif(trim(p_query), '') is null then 0::real
        else pg_catalog.ts_rank(
          t.search_vector,
          pg_catalog.websearch_to_tsquery('portuguese', extensions.unaccent(trim(p_query)))
        )
      end as rank_value
    from public.tenders t
    where (nullif(trim(p_query), '') is null or t.search_vector @@ pg_catalog.websearch_to_tsquery('portuguese', extensions.unaccent(trim(p_query))))
      and (p_uf is null or t.uf = upper(trim(p_uf)))
      and (p_modality_code is null or t.modality_code = p_modality_code)
      and (p_minimum_value is null or t.estimated_value >= p_minimum_value)
      and (p_maximum_value is null or t.estimated_value <= p_maximum_value)
      and (p_closes_before is null or t.proposal_close_at <= p_closes_before)
      and (t.proposal_close_at is null or t.proposal_close_at >= pg_catalog.now())
      and not exists (
        select 1 from public.tender_feedback f
        where f.tender_id = t.id and f.user_id = (select auth.uid()) and f.state = 'discarded'
      )
  ), counted as (
    select filtered.*, pg_catalog.count(*) over () as row_count from filtered
  )
  select counted.id, counted.rank_value, counted.row_count
  from counted
  order by
    case when p_sort = 'relevance' then counted.rank_value end desc,
    case when p_sort = 'value' then counted.estimated_value end desc nulls last,
    case when p_sort = 'deadline' or p_sort = 'relevance' then counted.proposal_close_at end asc nulls last,
    counted.id
  limit least(100, greatest(1, coalesce(p_page_size, 50)))
  offset (greatest(1, coalesce(p_page, 1)) - 1) * least(100, greatest(1, coalesce(p_page_size, 50)));
$$;
revoke all on function public.search_tenders(text, text, text, numeric, numeric, timestamptz, text, integer, integer) from public, anon;
grant execute on function public.search_tenders(text, text, text, numeric, numeric, timestamptz, text, integer, integer) to authenticated;

create or replace function private.has_org_role(target_organization uuid, allowed_roles public.organization_role[] default null)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = target_organization
      and m.user_id = (select auth.uid())
      and (allowed_roles is null or m.role = any (allowed_roles))
  );
$$;
revoke all on function private.has_org_role(uuid, public.organization_role[]) from public, anon;
grant usage on schema private to authenticated;
grant usage on schema extensions to authenticated;
grant execute on function private.has_org_role(uuid, public.organization_role[]) to authenticated;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;

create or replace function private.sync_search_vector()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.search_vector := to_tsvector('portuguese', coalesce(extensions.unaccent(concat_ws(' ', new.title, new.object, new.modality_name)), ''));
  new.ingested_at := now();
  return new;
end;
$$;

create or replace function private.create_user_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.users (id, full_name, avatar_url)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'avatar_url', ''))
  on conflict (id) do nothing;
  if new.raw_user_meta_data ->> 'privacy_consent' = 'true'
    and new.raw_user_meta_data ->> 'privacy_policy_version' is not null
    and new.raw_user_meta_data ->> 'privacy_consent_at' is not null then
    insert into public.privacy_consents (user_id, consent_type, document_version, accepted_at)
    values
      (new.id, 'terms_of_use', new.raw_user_meta_data ->> 'privacy_policy_version', now()),
      (new.id, 'privacy_policy', new.raw_user_meta_data ->> 'privacy_policy_version', now())
    on conflict (user_id, consent_type, document_version) do nothing;
  end if;
  return new;
end;
$$;

create or replace function private.add_organization_creator()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.created_by is distinct from (select auth.uid()) then
    raise exception 'created_by must match the authenticated user';
  end if;
  insert into public.memberships (organization_id, user_id, role) values (new.id, new.created_by, 'admin');
  insert into public.subscriptions (organization_id, plan_id, status)
  select new.id, p.id, 'active'
  from public.plans p
  where p.plan_key = 'free' and p.is_active
  limit 1;
  return new;
end;
$$;

create or replace function private.enforce_interest_profile_limits()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  plan_limits jsonb;
  profile_limit integer;
  keyword_limit integer;
  existing_profiles bigint;
  keyword_count integer;
begin
  select p.limits into plan_limits
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.organization_id = new.organization_id
    and s.status in ('active', 'trialing')
    and p.is_active
  order by s.created_at desc
  limit 1;

  if plan_limits is null then
    select p.limits into plan_limits from public.plans p where p.plan_key = 'free' and p.is_active limit 1;
  end if;

  profile_limit := nullif(plan_limits ->> 'profiles', 'null')::integer;
  keyword_limit := nullif(plan_limits ->> 'keywords_per_profile', 'null')::integer;

  if profile_limit is not null then
    select count(*) into existing_profiles
    from public.interest_profiles p
    where p.organization_id = new.organization_id
      and (tg_op = 'INSERT' or p.id <> new.id);

    if existing_profiles >= profile_limit then
      raise exception 'PLAN_PROFILE_LIMIT_REACHED' using errcode = '23514';
    end if;
  end if;

  if keyword_limit is not null then
    keyword_count := cardinality(new.required_keywords) + cardinality(new.optional_keywords) + cardinality(new.excluded_keywords);
    if keyword_count > keyword_limit then
      raise exception 'PLAN_KEYWORD_LIMIT_REACHED' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.enforce_membership_limits()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  user_limit integer;
  member_count bigint;
begin
  select nullif(p.limits ->> 'users', 'null')::integer into user_limit
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.organization_id = new.organization_id
    and s.status in ('active', 'trialing')
    and p.is_active
  order by s.created_at desc
  limit 1;

  if user_limit is null then
    select nullif(p.limits ->> 'users', 'null')::integer into user_limit
    from public.plans p where p.plan_key = 'free' and p.is_active limit 1;
  end if;

  if user_limit is not null then
    select count(*) into member_count from public.memberships m
    where m.organization_id = new.organization_id
      and (tg_op = 'INSERT' or (m.user_id <> old.user_id or m.organization_id <> old.organization_id));
    if member_count >= user_limit then
      raise exception 'PLAN_USER_LIMIT_REACHED' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.enforce_alert_features()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  plan_features jsonb;
begin
  select p.features into plan_features
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.organization_id = new.organization_id
    and s.status in ('active', 'trialing')
    and p.is_active
  order by s.created_at desc
  limit 1;

  if plan_features is null then
    select p.features into plan_features from public.plans p where p.plan_key = 'free' and p.is_active limit 1;
  end if;

  if new.frequency = 'immediate' and coalesce((plan_features ->> 'immediate_alerts')::boolean, false) is false then
    raise exception 'PLAN_IMMEDIATE_ALERTS_NOT_INCLUDED' using errcode = '23514';
  end if;
  if new.telegram_enabled and coalesce((plan_features ->> 'telegram_alerts')::boolean, false) is false then
    raise exception 'PLAN_TELEGRAM_ALERTS_NOT_INCLUDED' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.audit_pipeline_status_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
    values (
      new.organization_id,
      (select auth.uid()),
      'pipeline.status_changed',
      'pipeline_card',
      new.id::text,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_interest_profile_limits() from public, anon, authenticated;
revoke all on function private.enforce_membership_limits() from public, anon, authenticated;
revoke all on function private.enforce_alert_features() from public, anon, authenticated;
revoke all on function private.audit_pipeline_status_change() from public, anon, authenticated;
revoke all on function private.create_user_profile() from public, anon, authenticated;
revoke all on function private.add_organization_creator() from public, anon, authenticated;

create trigger auth_user_profile_created after insert on auth.users
for each row execute function private.create_user_profile();
create trigger organization_creator_membership_created after insert on public.organizations
for each row execute function private.add_organization_creator();
create trigger tenders_search_vector_updated before insert or update of title, object, modality_name on public.tenders
for each row execute function private.sync_search_vector();
create trigger interest_profile_limits_enforced before insert or update of required_keywords, optional_keywords, excluded_keywords, organization_id on public.interest_profiles
for each row execute function private.enforce_interest_profile_limits();
create trigger membership_limits_enforced before insert or update of organization_id, user_id on public.memberships
for each row execute function private.enforce_membership_limits();
create trigger alert_features_enforced before insert or update of frequency, telegram_enabled, organization_id on public.alerts
for each row execute function private.enforce_alert_features();
create trigger pipeline_status_audited after update of status on public.pipeline_cards
for each row execute function private.audit_pipeline_status_change();

do $$
declare table_name text;
begin
  foreach table_name in array array['users','organizations','plans','subscriptions','agencies','tenders','tender_items','interest_profiles','alerts','tender_feedback','pipeline_cards','comments'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', table_name || '_updated_at', table_name);
  end loop;
end;
$$;

alter table public.users enable row level security;
alter table public.privacy_consents enable row level security;
alter table public.data_subject_requests enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.segments enable row level security;
alter table public.agencies enable row level security;
alter table public.tenders enable row level security;
alter table public.tender_items enable row level security;
alter table public.tender_files enable row level security;
alter table public.interest_profiles enable row level security;
alter table public.matches enable row level security;
alter table public.alerts enable row level security;
alter table public.alert_deliveries enable row level security;
alter table public.tender_feedback enable row level security;
alter table public.pipeline_cards enable row level security;
alter table public.comments enable row level security;
alter table public.documents enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ingestion_runs enable row level security;

grant select, update on public.users to authenticated;
grant select on public.privacy_consents to authenticated;
grant select, insert on public.data_subject_requests to authenticated;
grant select, insert, update, delete on public.organizations, public.memberships to authenticated;
grant select on public.plans, public.segments, public.agencies, public.tenders, public.tender_items, public.tender_files, public.subscriptions, public.matches, public.alert_deliveries, public.audit_logs, public.ingestion_runs to authenticated;
grant select, insert, update, delete on public.interest_profiles, public.alerts, public.tender_feedback, public.pipeline_cards, public.comments, public.documents to authenticated;
grant all on all tables in schema public to service_role;

create policy users_read_self on public.users for select to authenticated using (id = (select auth.uid()));
create policy users_update_self on public.users for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy privacy_consents_read_self on public.privacy_consents for select to authenticated using (user_id = (select auth.uid()));
create policy data_subject_requests_read_self on public.data_subject_requests for select to authenticated using (user_id = (select auth.uid()));
create policy data_subject_requests_insert_self on public.data_subject_requests for insert to authenticated with check (user_id = (select auth.uid()) and status = 'pending');
create policy organizations_read_member on public.organizations for select to authenticated using ((select private.has_org_role(id)));
create policy organizations_create_self on public.organizations for insert to authenticated with check (created_by = (select auth.uid()));
create policy organizations_update_admin on public.organizations for update to authenticated using ((select private.has_org_role(id, array['admin']::public.organization_role[]))) with check ((select private.has_org_role(id, array['admin']::public.organization_role[])));
create policy organizations_delete_admin on public.organizations for delete to authenticated using ((select private.has_org_role(id, array['admin']::public.organization_role[])));

create policy memberships_read_org on public.memberships for select to authenticated using (user_id = (select auth.uid()) or (select private.has_org_role(organization_id, array['admin']::public.organization_role[])));
create policy memberships_insert_admin on public.memberships for insert to authenticated with check ((select private.has_org_role(organization_id, array['admin']::public.organization_role[])));
create policy memberships_update_admin on public.memberships for update to authenticated using ((select private.has_org_role(organization_id, array['admin']::public.organization_role[]))) with check ((select private.has_org_role(organization_id, array['admin']::public.organization_role[])));
create policy memberships_delete_admin on public.memberships for delete to authenticated using ((select private.has_org_role(organization_id, array['admin']::public.organization_role[])) and user_id <> (select auth.uid()));

create policy plans_read_active on public.plans for select to authenticated using (is_active);
create policy segments_read_active on public.segments for select to authenticated using (is_active);
create policy subscriptions_read_admin on public.subscriptions for select to authenticated using ((select private.has_org_role(organization_id, array['admin']::public.organization_role[])));
create policy agencies_read_authenticated on public.agencies for select to authenticated using (true);
create policy tenders_read_authenticated on public.tenders for select to authenticated using (true);
create policy tender_items_read_authenticated on public.tender_items for select to authenticated using (true);
create policy tender_files_read_authenticated on public.tender_files for select to authenticated using (true);

create policy profiles_read_member on public.interest_profiles for select to authenticated using ((select private.has_org_role(organization_id)));
create policy profiles_insert_editor on public.interest_profiles for insert to authenticated with check (created_by = (select auth.uid()) and (select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[])));
create policy profiles_update_editor on public.interest_profiles for update to authenticated using ((select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[]))) with check ((select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[])));
create policy profiles_delete_editor on public.interest_profiles for delete to authenticated using ((select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[])));

create policy matches_read_member on public.matches for select to authenticated using ((select private.has_org_role(organization_id)));
create policy alerts_read_member on public.alerts for select to authenticated using ((select private.has_org_role(organization_id)));
create policy alerts_insert_editor on public.alerts for insert to authenticated with check ((select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[])));
create policy alerts_update_editor on public.alerts for update to authenticated using ((select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[]))) with check ((select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[])));
create policy alerts_delete_editor on public.alerts for delete to authenticated using ((select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[])));

create policy alert_deliveries_read_member on public.alert_deliveries for select to authenticated using ((select private.has_org_role(organization_id)));
create policy feedback_read_member on public.tender_feedback for select to authenticated using ((select private.has_org_role(organization_id)));
create policy feedback_insert_self on public.tender_feedback for insert to authenticated with check (user_id = (select auth.uid()) and (select private.has_org_role(organization_id)));
create policy feedback_update_self on public.tender_feedback for update to authenticated using (user_id = (select auth.uid()) and (select private.has_org_role(organization_id))) with check (user_id = (select auth.uid()) and (select private.has_org_role(organization_id)));
create policy feedback_delete_self on public.tender_feedback for delete to authenticated using (user_id = (select auth.uid()) and (select private.has_org_role(organization_id)));

create policy pipeline_read_member on public.pipeline_cards for select to authenticated using ((select private.has_org_role(organization_id)));
create policy pipeline_insert_editor on public.pipeline_cards for insert to authenticated with check (created_by = (select auth.uid()) and (select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[])));
create policy pipeline_update_editor on public.pipeline_cards for update to authenticated using ((select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[]))) with check ((select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[])));
create policy pipeline_delete_admin on public.pipeline_cards for delete to authenticated using ((select private.has_org_role(organization_id, array['admin']::public.organization_role[])));

create policy comments_read_member on public.comments for select to authenticated using ((select private.has_org_role(organization_id)));
create policy comments_insert_editor on public.comments for insert to authenticated with check (author_user_id = (select auth.uid()) and (select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[])));
create policy comments_update_author_or_admin on public.comments for update to authenticated using (author_user_id = (select auth.uid()) or (select private.has_org_role(organization_id, array['admin']::public.organization_role[]))) with check (author_user_id = (select auth.uid()) or (select private.has_org_role(organization_id, array['admin']::public.organization_role[])));
create policy comments_delete_author_or_admin on public.comments for delete to authenticated using (author_user_id = (select auth.uid()) or (select private.has_org_role(organization_id, array['admin']::public.organization_role[])));

create policy documents_read_member on public.documents for select to authenticated using ((select private.has_org_role(organization_id)));
create policy documents_insert_editor on public.documents for insert to authenticated with check (uploaded_by = (select auth.uid()) and (select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[])));
create policy documents_delete_editor on public.documents for delete to authenticated using ((select private.has_org_role(organization_id, array['admin','analyst']::public.organization_role[])));
create policy audit_logs_read_admin on public.audit_logs for select to authenticated using (organization_id is not null and (select private.has_org_role(organization_id, array['admin']::public.organization_role[])));
create policy ingestion_runs_read_authenticated on public.ingestion_runs for select to authenticated using (true);

insert into public.plans (plan_key, name, description, limits, features) values
  ('free', 'Gratuito', 'Plano inicial', '{"profiles":1,"keywords_per_profile":5,"users":1}'::jsonb, '{"daily_alerts":true,"immediate_alerts":false,"pipeline":false,"price_intelligence":false,"ai_summaries":false}'::jsonb),
  ('pro', 'Pro', 'Para equipes comerciais', '{"profiles":null,"keywords_per_profile":null,"users":3}'::jsonb, '{"daily_alerts":true,"immediate_alerts":true,"pipeline":true,"price_intelligence":false,"ai_summaries":false}'::jsonb),
  ('business', 'Business', 'Inteligência para escala', '{"profiles":null,"keywords_per_profile":null,"users":10}'::jsonb, '{"daily_alerts":true,"immediate_alerts":true,"pipeline":true,"price_intelligence":true,"ai_summaries":true}'::jsonb),
  ('consulting', 'Consultoria', 'Gestão de múltiplas organizações', '{"profiles":null,"keywords_per_profile":null,"users":null}'::jsonb, '{"daily_alerts":true,"immediate_alerts":true,"pipeline":true,"price_intelligence":true,"ai_summaries":true,"multi_organization":true}'::jsonb)
on conflict (plan_key) do update set name = excluded.name, description = excluded.description, limits = excluded.limits, features = excluded.features, updated_at = now();

