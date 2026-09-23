-- Does row-level security actually keep two families apart?
-- Run as postgres; each block switches to the `authenticated` role, which is
-- what a signed-in app user really is, so the policies apply.

\set ON_ERROR_STOP on
\set QUIET on

-- Scratch space to carry ids between the two users' sessions.
drop table if exists t_ids;
create table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated;

delete from auth.users;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'parent.a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'parent.b@example.com');

-- ===========================================================================
-- Family A signs in and sets itself up.
-- ===========================================================================
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claims = '{"email":"parent.a@example.com"}';

do $$
declare hid uuid; pid uuid;
begin
  hid := public.create_household('Family A');
  insert into public.players (household_id, data, updated_at)
    values (hid, '{"name":"Keeper A"}', now()) returning id into pid;
  insert into t_ids values ('hid_a', hid), ('pid_a', pid);

  insert into public.matches (player_id, id, data, updated_at) values
    (pid, 'match_a1', '{"date":"2026-09-27","opponent":"Rovers","status":"scheduled"}', now()),
    (pid, 'match_a2', '{"date":"2026-10-04","opponent":"City","status":"scheduled"}', now());
  raise notice 'set up Family A';
end $$;

-- ===========================================================================
-- Family B signs in and sets itself up.
-- ===========================================================================
reset role;
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
set request.jwt.claims = '{"email":"parent.b@example.com"}';

do $$
declare hid uuid; pid uuid;
begin
  hid := public.create_household('Family B');
  insert into public.players (household_id, data, updated_at)
    values (hid, '{"name":"Keeper B"}', now()) returning id into pid;
  insert into t_ids values ('hid_b', hid), ('pid_b', pid);

  insert into public.matches (player_id, id, data, updated_at) values
    (pid, 'match_b1', '{"date":"2026-09-28","opponent":"Secret Opponent","status":"scheduled"}', now());
  raise notice 'set up Family B';
end $$;

-- B should see exactly its own one match, and nothing of A's.
do $$
declare n int;
begin
  select count(*) into n from public.matches;
  if n <> 1 then raise exception 'FAIL: B sees % matches, expected 1', n; end if;
  raise notice 'PASS: B sees only its own match';

  select count(*) into n from public.players;
  if n <> 1 then raise exception 'FAIL: B sees % players, expected 1', n; end if;
  raise notice 'PASS: B sees only its own player';

  select count(*) into n from public.households;
  if n <> 1 then raise exception 'FAIL: B sees % households, expected 1', n; end if;
  raise notice 'PASS: B sees only its own household';
end $$;

-- ===========================================================================
-- Back to A: it must not be able to read or write anything of B's.
-- ===========================================================================
reset role;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claims = '{"email":"parent.a@example.com"}';

do $$
declare n int; b_pid uuid;
begin
  select v into b_pid from t_ids where k = 'pid_b';

  select count(*) into n from public.matches;
  if n <> 2 then raise exception 'FAIL: A sees % matches, expected 2', n; end if;
  raise notice 'PASS: A sees only its own 2 matches';

  -- Asking for B's rows by id directly, not just listing.
  select count(*) into n from public.matches where player_id = b_pid;
  if n <> 0 then raise exception 'FAIL: A read % of B''s matches by id', n; end if;
  raise notice 'PASS: A gets nothing when asking for B''s matches by id';

  select count(*) into n from public.matches where data ->> 'opponent' = 'Secret Opponent';
  if n <> 0 then raise exception 'FAIL: A found B''s match by searching'; end if;
  raise notice 'PASS: A cannot find B''s match by searching content';

  select count(*) into n from public.players where id = b_pid;
  if n <> 0 then raise exception 'FAIL: A read B''s player row'; end if;
  raise notice 'PASS: A cannot read B''s player';
end $$;

-- Writing into B's player must be refused, not silently accepted.
do $$
declare b_pid uuid;
begin
  select v into b_pid from t_ids where k = 'pid_b';
  begin
    insert into public.matches (player_id, id, data, updated_at)
      values (b_pid, 'match_evil', '{"date":"2026-01-01","opponent":"Injected"}', now());
    raise exception 'FAIL: A inserted a match into B''s player';
  exception when insufficient_privilege then
    raise notice 'PASS: A blocked from writing into B''s player';
  end;
end $$;

-- Updating B's rows must be a no-op rather than an error, which is how RLS
-- hides rows: the update simply matches nothing.
do $$
declare n int; b_pid uuid;
begin
  select v into b_pid from t_ids where k = 'pid_b';
  update public.matches set data = '{"opponent":"Hacked"}' where player_id = b_pid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A updated % of B''s matches', n; end if;
  raise notice 'PASS: A updating B''s matches changes nothing';

  delete from public.matches where player_id = b_pid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted % of B''s matches', n; end if;
  raise notice 'PASS: A deleting B''s matches changes nothing';
end $$;

-- ===========================================================================
-- Sharing: A invites B's parent into A's household.
-- ===========================================================================
do $$
declare hid_a uuid;
begin
  select v into hid_a from t_ids where k = 'hid_a';
  insert into public.household_invites (household_id, email, invited_by)
    values (hid_a, 'parent.b@example.com', auth.uid());
  raise notice 'A invited parent.b';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
set request.jwt.claims = '{"email":"parent.b@example.com"}';

do $$
declare n int; inv uuid; hid uuid;
begin
  -- B can see an invite addressed to their own email, and only that one.
  select count(*) into n from public.household_invites;
  if n <> 1 then raise exception 'FAIL: B sees % invites, expected 1', n; end if;
  raise notice 'PASS: B can see the invite addressed to them';

  select id into inv from public.household_invites limit 1;
  hid := public.accept_invite(inv);

  select count(*) into n from public.matches;
  if n <> 3 then raise exception 'FAIL: after joining, B sees % matches, expected 3', n; end if;
  raise notice 'PASS: after joining, B sees both households'' matches (3)';

  -- And can now actually add something to the shared player.
  insert into public.matches (player_id, id, data, updated_at)
    values ((select v from t_ids where k = 'pid_a'), 'match_from_b',
            '{"date":"2026-11-01","opponent":"Added by mum"}', now());
  raise notice 'PASS: B can add a match to the shared player';
end $$;

-- An invite meant for somebody else must not be claimable.
do $$
declare hid_b uuid; inv uuid;
begin
  select v into hid_b from t_ids where k = 'hid_b';
  insert into public.household_invites (household_id, email, invited_by)
    values (hid_b, 'someone.else@example.com', auth.uid()) returning id into inv;
  begin
    perform public.accept_invite(inv);
    raise exception 'FAIL: B claimed an invite addressed to someone else';
  exception when raise_exception then
    if position('FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: an invite for another email cannot be claimed';
  end;
end $$;

-- A non-owner must not be able to remove the owner.
do $$
declare n int; hid_a uuid;
begin
  select v into hid_a from t_ids where k = 'hid_a';
  delete from public.household_members
    where household_id = hid_a and user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a non-owner removed the owner'; end if;
  raise notice 'PASS: a non-owner cannot remove the owner';

  -- But can leave of their own accord.
  delete from public.household_members
    where household_id = hid_a and user_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: B could not leave the household'; end if;
  raise notice 'PASS: anyone can leave a household';

  select count(*) into n from public.matches;
  if n <> 1 then raise exception 'FAIL: after leaving, B still sees % matches', n; end if;
  raise notice 'PASS: after leaving, B is back to only its own match';
end $$;

reset role;
\echo ''
\echo 'ALL RLS CHECKS PASSED'
