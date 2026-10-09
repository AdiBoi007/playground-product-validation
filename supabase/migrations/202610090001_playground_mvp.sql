-- Shared durable MVP state. Only the server service role may read or mutate it.
create table if not exists public.playground_workspace (
  id text primary key check (id = 'global'),
  revision bigint not null default 0,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.playground_workspace enable row level security;
revoke all on public.playground_workspace from anon, authenticated;
grant select, insert, update on public.playground_workspace to service_role;
insert into public.playground_workspace (id, data)
values ('global', '{"schemaVersion":1,"profiles":[],"campaigns":[],"assignments":[],"submissions":[],"reports":[],"payouts":[]}'::jsonb)
on conflict (id) do nothing;

-- Serializes checkout reservations. Stripe's idempotency key includes the generation.
create table if not exists public.playground_checkouts (
  campaign_id text primary key,
  generation integer not null default 1,
  session_id text,
  expires_at timestamptz not null default (now() + interval '60 minutes')
);
alter table public.playground_checkouts enable row level security;
revoke all on public.playground_checkouts from anon, authenticated;
grant select, insert, update on public.playground_checkouts to service_role;
create table if not exists public.playground_checkout_missions (
  campaign_id text not null,
  generation integer not null,
  founder_id text not null,
  mission_snapshot jsonb not null,
  session_id text,
  expires_at timestamptz not null,
  primary key(campaign_id, generation)
);
alter table public.playground_checkout_missions enable row level security;
revoke all on public.playground_checkout_missions from anon, authenticated;
grant select, insert, update on public.playground_checkout_missions to service_role;

create or replace function public.playground_compare_and_swap(expected_revision bigint, next_data jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  workspace public.playground_workspace%rowtype;
  prior_campaign jsonb;
  next_campaign jsonb;
  field_name text;
begin
  select w.* into workspace from public.playground_workspace w where id = 'global' for update;
  if workspace.revision <> expected_revision then return false; end if;
  if next_data->>'schemaVersion' <> '1' then raise exception 'Unsupported workspace schema'; end if;
  for prior_campaign in select value from jsonb_array_elements(workspace.data->'campaigns') loop
    if prior_campaign->>'payment' = 'unpaid' and coalesce((prior_campaign->>'checkoutExpiresAt')::timestamptz, '-infinity'::timestamptz) > now() then
      select value into next_campaign from jsonb_array_elements(next_data->'campaigns') where value->>'id' = prior_campaign->>'id';
      if next_campaign is null then raise exception 'Checkout mission is locked'; end if;
      -- Trusted payment activation may restore its immutable approved snapshot.
      if next_campaign->>'payment' <> 'paid' then
        foreach field_name in array array['title','url','audience','objective','assumption','tasks','tasksApproved','checkoutExpiresAt'] loop
          if prior_campaign->field_name is distinct from next_campaign->field_name then raise exception 'Checkout mission is locked'; end if;
        end loop;
      end if;
    end if;
  end loop;
  update public.playground_workspace set data = next_data, revision = revision + 1, updated_at = now() where id = 'global';
  return true;
end;
$$;
revoke execute on function public.playground_compare_and_swap(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.playground_compare_and_swap(bigint, jsonb) to service_role;

-- The server inspects the prior Stripe session before requesting a new generation.
create or replace function public.playground_reserve_checkout(requested_campaign text, requested_founder text, expected_generation integer)
returns table(generation integer, session_id text, expires_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare
  reservation public.playground_checkouts%rowtype;
  workspace_data jsonb;
  campaign jsonb;
begin
  select w.data into workspace_data from public.playground_workspace w where id = 'global' for update;
  select value into campaign from jsonb_array_elements(workspace_data->'campaigns') where value->>'id' = requested_campaign;
  if campaign is null or campaign->>'founderId' <> requested_founder then raise exception 'Campaign owner changed'; end if;
  if campaign->>'payment' <> 'unpaid' or campaign->>'tasksApproved' <> 'true' then raise exception 'Approve the current unpaid mission before checkout'; end if;
  select c.* into reservation from public.playground_checkouts c where c.campaign_id = requested_campaign for update;
  if reservation.campaign_id is null then
    if expected_generation <> 0 then raise exception 'Checkout reservation changed'; end if;
    insert into public.playground_checkouts (campaign_id) values (requested_campaign) returning * into reservation;
  elsif reservation.generation <> expected_generation then
    raise exception 'Checkout reservation changed';
  elsif reservation.expires_at <= now() then
    update public.playground_checkouts c
    set generation = c.generation + 1, session_id = null, expires_at = now() + interval '60 minutes'
    where c.campaign_id = requested_campaign
    returning c.* into reservation;
  end if;
  insert into public.playground_checkout_missions (campaign_id, generation, founder_id, mission_snapshot, expires_at)
  values (requested_campaign, reservation.generation, requested_founder, campaign, reservation.expires_at) on conflict do nothing;
  update public.playground_workspace
  set data = jsonb_set(workspace_data, '{campaigns}', (select jsonb_agg(case when value->>'id' = requested_campaign then jsonb_set(value, '{checkoutExpiresAt}', to_jsonb(reservation.expires_at)) else value end) from jsonb_array_elements(workspace_data->'campaigns'))),
      revision = revision + 1, updated_at = now()
  where id = 'global';
  return query select reservation.generation, reservation.session_id, reservation.expires_at;
end;
$$;
revoke execute on function public.playground_reserve_checkout(text, text, integer) from public, anon, authenticated;
grant execute on function public.playground_reserve_checkout(text, text, integer) to service_role;

create or replace function public.playground_attach_checkout_session(requested_campaign text, requested_generation integer, requested_session text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.playground_checkout_missions set session_id = requested_session
  where campaign_id = requested_campaign and generation = requested_generation and (session_id is null or session_id = requested_session);
  if not found then raise exception 'Checkout session changed'; end if;
  update public.playground_checkouts set session_id = requested_session where campaign_id = requested_campaign and generation = requested_generation;
  return true;
end;
$$;
revoke execute on function public.playground_attach_checkout_session(text, integer, text) from public, anon, authenticated;
grant execute on function public.playground_attach_checkout_session(text, integer, text) to service_role;

-- Call only after Stripe has confirmed the session expired (or could never be created).
create or replace function public.playground_release_checkout(requested_campaign text, requested_generation integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  workspace_data jsonb;
begin
  select w.data into workspace_data from public.playground_workspace w where id = 'global' for update;
  update public.playground_checkouts set expires_at = now()
  where campaign_id = requested_campaign and generation = requested_generation;
  if not found then return false; end if;
  update public.playground_workspace
  set data = jsonb_set(workspace_data, '{campaigns}', (select jsonb_agg(case when value->>'id' = requested_campaign then value - 'checkoutExpiresAt' else value end) from jsonb_array_elements(workspace_data->'campaigns'))),
      revision = revision + 1, updated_at = now()
  where id = 'global';
  return true;
end;
$$;
revoke execute on function public.playground_release_checkout(text, integer) from public, anon, authenticated;
grant execute on function public.playground_release_checkout(text, integer) to service_role;

create table if not exists public.playground_ai_usage (
  user_id uuid not null,
  operation text not null,
  minute timestamptz not null,
  requests integer not null,
  primary key(user_id, operation, minute)
);
alter table public.playground_ai_usage enable row level security;
revoke all on public.playground_ai_usage from anon, authenticated;
grant select, insert, update, delete on public.playground_ai_usage to service_role;
create or replace function public.playground_consume_ai_budget(requested_user uuid, requested_operation text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  request_count integer;
  max_requests integer;
begin
  if requested_operation not in ('mission', 'synthesis') then raise exception 'Invalid AI operation'; end if;
  max_requests := case when requested_operation = 'mission' then 5 else 3 end;
  insert into public.playground_ai_usage (user_id, operation, minute, requests)
  values (requested_user, requested_operation, date_trunc('minute', now()), 1)
  on conflict (user_id, operation, minute) do update
  set requests = playground_ai_usage.requests + 1
  returning requests into request_count;
  delete from public.playground_ai_usage where minute < now() - interval '1 day';
  return request_count <= max_requests;
end;
$$;
revoke execute on function public.playground_consume_ai_budget(uuid, text) from public, anon, authenticated;
grant execute on function public.playground_consume_ai_budget(uuid, text) to service_role;

-- Screenshots stay private; uploads and signed downloads go through role-checked server routes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 3145728, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- Restrictive guard also protects this bucket in projects with existing broad storage policies.
drop policy if exists playground_evidence_server_only on storage.objects;
create policy playground_evidence_server_only on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id <> 'evidence') with check (bucket_id <> 'evidence');
