-- Execute with an administrative database connection after the migration.
-- All fixture state is rolled back, including any replacement of an existing workspace.
begin;
do $$
declare
  fixture jsonb := '{"schemaVersion":1,"profiles":[],"campaigns":[{"id":"sql-fixture","founderId":"sql-founder","title":"Approved product","url":"https://example.com","audience":"Designers","objective":"Test onboarding","assumption":"","tasks":[{"id":"task","title":"Signup","instructions":"Try signup","question":"What happened?"}],"tasksApproved":true,"payment":"unpaid","priceCents":14900,"currency":"usd","round":1,"changes":""}],"assignments":[],"submissions":[],"reports":[],"payouts":[]}';
  current_revision bigint;
  reserved record;
  saved jsonb;
  proposed jsonb;
begin
  select revision into current_revision from public.playground_workspace where id = 'global';
  if not public.playground_compare_and_swap(current_revision, fixture) then raise exception 'Fixture CAS failed'; end if;
  select * into reserved from public.playground_reserve_checkout('sql-fixture','sql-founder',0);
  if reserved.generation <> 1 then raise exception 'First generation missing'; end if;
  select data,revision into saved,current_revision from public.playground_workspace where id = 'global';
  if saved#>>'{campaigns,0,checkoutExpiresAt}' is null then raise exception 'Mission was not locked'; end if;
  proposed := jsonb_set(saved,'{campaigns,0,tasksApproved}','false');
  begin
    perform public.playground_compare_and_swap(current_revision, proposed);
    raise exception 'Locked mission incorrectly changed';
  exception when others then
    if sqlerrm <> 'Checkout mission is locked' then raise; end if;
  end;
  perform public.playground_attach_checkout_session('sql-fixture',1,'cs_sql_fixture');
  perform public.playground_release_checkout('sql-fixture',1);
  select data,revision into saved,current_revision from public.playground_workspace where id = 'global';
  if saved#>>'{campaigns,0,checkoutExpiresAt}' is not null then raise exception 'Cancellation did not unlock'; end if;
  if not (select (mission_snapshot->>'tasksApproved')::boolean from public.playground_checkout_missions where campaign_id='sql-fixture' and generation=1) then raise exception 'Approved snapshot changed'; end if;
  proposed := jsonb_set(saved,'{campaigns,0,tasksApproved}','false');
  perform public.playground_compare_and_swap(current_revision,proposed);
  begin
    perform public.playground_reserve_checkout('sql-fixture','sql-founder',1);
    raise exception 'Unapproved current mission incorrectly reserved';
  exception when others then
    if sqlerrm <> 'Approve the current unpaid mission before checkout' then raise; end if;
  end;
  select revision into current_revision from public.playground_workspace where id = 'global';
  perform public.playground_compare_and_swap(current_revision,saved);
  select * into reserved from public.playground_reserve_checkout('sql-fixture','sql-founder',1);
  if reserved.generation <> 2 then raise exception 'Next generation missing'; end if;
  begin
    perform public.playground_reserve_checkout('sql-fixture','sql-founder',1);
    raise exception 'Stale generation incorrectly reserved';
  exception when others then
    if sqlerrm <> 'Checkout reservation changed' then raise; end if;
  end;
end;
$$;
set local role anon;
do $$ begin
  begin
    perform 1 from public.playground_workspace;
    raise exception 'Anonymous workspace read incorrectly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.playground_compare_and_swap(0,'{}');
    raise exception 'Anonymous mutation incorrectly allowed';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;
rollback;
