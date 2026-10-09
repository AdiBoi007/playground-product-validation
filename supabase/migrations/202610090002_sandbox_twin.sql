-- Private founder sandboxes. All access goes through verified server ownership.
create table if not exists public.playground_sandboxes (
  id text primary key,
  founder_id uuid not null references auth.users(id) on delete cascade,
  document jsonb not null,
  updated_at timestamptz not null,
  check (document->>'id' = id and document->>'founderId' = founder_id::text),
  check (octet_length(document::text) <= 12000000)
);
create index if not exists playground_sandboxes_owner on public.playground_sandboxes(founder_id, updated_at desc);
alter table public.playground_sandboxes enable row level security;
revoke all on public.playground_sandboxes from anon, authenticated;
grant select, insert, update, delete on public.playground_sandboxes to service_role;

create or replace function public.playground_save_sandbox(requested_id text, requested_founder uuid, expected_updated text, next_document jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare prior public.playground_sandboxes%rowtype;
begin
  -- Serializes both first insertion and revision updates for this ID.
  perform pg_advisory_xact_lock(hashtextextended(requested_id, 0));
  select * into prior from public.playground_sandboxes where id = requested_id for update;
  if found then
    if prior.founder_id <> requested_founder or prior.document->>'updatedAt' is distinct from expected_updated then return false; end if;
    update public.playground_sandboxes set document = next_document, updated_at = (next_document->>'updatedAt')::timestamptz where id = requested_id;
  else
    if expected_updated is not null then return false; end if;
    insert into public.playground_sandboxes(id, founder_id, document, updated_at)
      values(requested_id, requested_founder, next_document, (next_document->>'updatedAt')::timestamptz);
  end if;
  return true;
end;
$$;
revoke execute on function public.playground_save_sandbox(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.playground_save_sandbox(text, uuid, text, jsonb) to service_role;

-- Worker-owned private evidence. No direct client listing, reading or writing.
insert into storage.buckets(id, name, public, file_size_limit)
  values('twin-artifacts', 'twin-artifacts', false, 30000000)
on conflict(id) do update set public = false, file_size_limit = 30000000;

-- Precreate the worker job table with service-only privileges before direct PG startup.
create table if not exists public.playground_twin_jobs (
  id text primary key,
  workspace_id text not null,
  status text not null,
  updated_at timestamptz not null,
  document jsonb not null
);
create index if not exists playground_twin_jobs_workspace on public.playground_twin_jobs(workspace_id, updated_at desc);
alter table public.playground_twin_jobs enable row level security;
revoke all on public.playground_twin_jobs from anon, authenticated;
grant select, insert, update, delete on public.playground_twin_jobs to service_role;

-- Conservative request reservations survive serverless restarts and concurrent calls.
create table if not exists public.playground_ai_reservations (
  day date not null,
  actor text not null,
  requests integer not null default 0,
  primary key(day, actor)
);
alter table public.playground_ai_reservations enable row level security;
revoke all on public.playground_ai_reservations from anon, authenticated;
grant select, insert, update on public.playground_ai_reservations to service_role;
create or replace function public.playground_reserve_ai_request(requested_actor uuid, user_limit integer, global_limit integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare today date := (now() at time zone 'UTC')::date; total integer; personal integer;
begin
  if user_limit < 1 or global_limit < 1 then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('playground-ai-' || today::text, 0));
  select coalesce(sum(requests), 0) into total from public.playground_ai_reservations where day = today;
  select requests into personal from public.playground_ai_reservations where day = today and actor = requested_actor::text;
  if total >= global_limit or coalesce(personal, 0) >= user_limit then return false; end if;
  insert into public.playground_ai_reservations(day, actor, requests) values(today, requested_actor::text, 1)
    on conflict(day, actor) do update set requests = playground_ai_reservations.requests + 1;
  return true;
end;
$$;
revoke execute on function public.playground_reserve_ai_request(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.playground_reserve_ai_request(uuid, integer, integer) to service_role;
