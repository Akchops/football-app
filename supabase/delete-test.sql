-- Does "Delete everything" really delete everything?
--
-- Run as postgres against a database that has local-auth-stub.sql and
-- schema.sql applied (see README.md). Sets up three families and an academy,
-- has each kind of person delete their data, and then looks in every table -
-- as postgres, past every access rule - for anything left of them. Stops at
-- the first thing that is wrong; ends with ALL DELETE CHECKS PASSED.
--
--   Dana    started her family; her partner Lee was invited into it.
--   Lee     deletes only his own account - the player's records are Dana's family's.
--   Dana    then deletes everything: the player, the records, the family, her account.
--   Rob     runs an academy, so is asked to hand it over first.
--   Kim     another family, linked to Rob's academy; must come through untouched.

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

drop table if exists t_del;
create table t_del (k text primary key, v text);
grant all on t_del to authenticated;

create or replace function public.t_dset(k text, v text) returns void language sql as $$
  insert into t_del values (k, v) on conflict (k) do update set v = excluded.v;
$$;
create or replace function public.t_dget(key text) returns text language sql as $$
  select v from t_del where k = key;
$$;
-- Run as postgres, so every row counts, whoever could normally see it.
create or replace function public.t_dexpect(query text, expected bigint, what text) returns void
language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) q', query) into n;
  if n <> expected then raise exception 'FAIL: % - found %, expected %', what, n, expected; end if;
  raise notice 'PASS: %', what;
end;
$$;
grant execute on function public.t_dset(text, text), public.t_dget(text) to authenticated;

delete from public.academies where created_by::text like '0d000000-%';
delete from auth.users where id::text like '0d000000-%';
insert into auth.users (id, email) values
  ('0d000000-0000-0000-0000-000000000001', 'dana@family.test'),
  ('0d000000-0000-0000-0000-000000000002', 'lee@family.test'),
  ('0d000000-0000-0000-0000-000000000003', 'rob@academy.test'),
  ('0d000000-0000-0000-0000-000000000004', 'kim@other.test');

-- ---------------------------------------------------------------------------
-- Dana's family: a player with one of everything.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '0d000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"0d000000-0000-0000-0000-000000000001","email":"dana@family.test"}';
do $$
declare hid uuid; pid uuid;
begin
  hid := public.create_household('Dana''s family');
  insert into public.players (household_id, data, updated_at)
    values (hid, '{"name":"Max","dateOfBirth":"2014-03-02"}', now()) returning id into pid;
  insert into public.player_settings (player_id, data, updated_at) values (pid, '{}', now());
  insert into public.matches (player_id, id, data, updated_at) values (pid, 'm1', '{"opponent":"Valedeltest"}', now());
  -- A match already "deleted" the usual way: a tombstone, still a row.
  insert into public.matches (player_id, id, data, updated_at, deleted_at)
    values (pid, 'm2', '{"opponent":"Moor"}', now(), now());
  insert into public.training_sessions (player_id, id, data, updated_at) values (pid, 't1', '{"focus":"Crosses"}', now());
  insert into public.teams (player_id, id, data, updated_at) values (pid, 'team1', '{"name":"Riverside U12"}', now());
  insert into public.competitions (player_id, id, data, updated_at) values (pid, 'c1', '{"name":"League"}', now());
  insert into public.results (player_id, id, data, updated_at) values (pid, 'r1', '{"home":"A","away":"B"}', now());
  insert into public.household_invites (household_id, email, invited_by)
    values (hid, 'grandma@family.test', auth.uid());
  perform public.t_dset('hid_dana', hid::text);
  perform public.t_dset('pid_dana', pid::text);
end $$;

-- Kim's family, which invites Dana - an invite that names Dana's email.
set request.jwt.claim.sub = '0d000000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"0d000000-0000-0000-0000-000000000004","email":"kim@other.test"}';
do $$
declare hid uuid; pid uuid;
begin
  hid := public.create_household('Kim''s family');
  insert into public.players (household_id, data, updated_at) values (hid, '{"name":"Jo"}', now()) returning id into pid;
  insert into public.matches (player_id, id, data, updated_at) values (pid, 'k1', '{"opponent":"Hilltop"}', now());
  insert into public.household_invites (household_id, email, invited_by) values (hid, 'Dana@Family.test', auth.uid());
  perform public.t_dset('hid_kim', hid::text);
  perform public.t_dset('pid_kim', pid::text);
end $$;
reset role;

-- Lee joins Dana's family. Rob's academy has both players on its list, in a
-- squad and a team pick; Dana once put Max on another academy's list and
-- took him off again, which leaves his name there marked as left.
insert into public.household_members (household_id, user_id, role)
  values (public.t_dget('hid_dana')::uuid, '0d000000-0000-0000-0000-000000000002', 'adult');
do $$
declare aid uuid; sid uuid; ap_max uuid; ap_jo uuid; ap_old uuid;
begin
  insert into public.academies (name, join_code, created_by)
    values ('Rob''s Academy', 'DELTEST1', '0d000000-0000-0000-0000-000000000003') returning id into aid;
  insert into public.academy_members (academy_id, user_id, role) values (aid, '0d000000-0000-0000-0000-000000000003', 'owner');
  insert into public.academy_squads (academy_id, name) values (aid, 'U12') returning id into sid;
  insert into public.academy_players (academy_id, player_id, display_name, status, consent_by)
    values (aid, public.t_dget('pid_dana')::uuid, 'Max', 'linked', '0d000000-0000-0000-0000-000000000001')
    returning id into ap_max;
  insert into public.academy_players (academy_id, player_id, display_name, status)
    values (aid, public.t_dget('pid_kim')::uuid, 'Jo', 'linked') returning id into ap_jo;
  insert into public.academy_players (academy_id, player_id, display_name, status, consent_by)
    values (aid, null, 'Max', 'left', '0d000000-0000-0000-0000-000000000001') returning id into ap_old;
  insert into public.squad_players (squad_id, academy_player_id) values (sid, ap_max), (sid, ap_jo);
  insert into public.academy_selections (academy_id, squad_id, name, academy_player_ids)
    values (aid, sid, 'Saturday', array[ap_max, ap_jo, ap_old]);
  perform public.t_dset('aid', aid::text);
  perform public.t_dset('ap_jo', ap_jo::text);
end $$;

-- ---------------------------------------------------------------------------
-- Nobody signed out can delete anything.
-- ---------------------------------------------------------------------------
set role anon;
do $$
begin
  begin
    perform public.delete_my_account();
    raise exception 'FAIL: signed out, delete_my_account was allowed';
  exception when insufficient_privilege then
    raise notice 'PASS: someone signed out cannot call it at all';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Lee, invited into Dana's family, deletes his data.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '0d000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"0d000000-0000-0000-0000-000000000002","email":"lee@family.test"}';
select public.delete_my_account();
reset role;

select public.t_dexpect($$select 1 from auth.users where id = '0d000000-0000-0000-0000-000000000002'$$, 0,
  'Lee: his account is gone');
select public.t_dexpect($$select 1 from public.household_members where user_id = '0d000000-0000-0000-0000-000000000002'$$, 0,
  'Lee: he is no longer in the family');
select public.t_dexpect(format('select 1 from public.matches where player_id = %L', public.t_dget('pid_dana')), 2,
  'Lee: the family''s records stay - they were never his alone');
select public.t_dexpect($$select 1 from public.wiped_ids where id = '0d000000-0000-0000-0000-000000000002'$$, 1,
  'Lee: his other phones can find out');

-- ---------------------------------------------------------------------------
-- Rob runs an academy: he is stopped, and nothing of his is touched.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '0d000000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"0d000000-0000-0000-0000-000000000003","email":"rob@academy.test"}';
do $$
begin
  begin
    perform public.delete_my_account();
    raise exception 'FAIL: an academy owner deleted his account and left it with nobody';
  exception when others then
    if sqlerrm not like 'You run Rob''s Academy%' then raise; end if;
    raise notice 'PASS: someone running an academy is asked to hand it over first';
  end;
end $$;
reset role;
select public.t_dexpect($$select 1 from auth.users where id = '0d000000-0000-0000-0000-000000000003'$$, 1,
  'Rob: still there');

-- ---------------------------------------------------------------------------
-- Dana deletes everything.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '0d000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"0d000000-0000-0000-0000-000000000001","email":"dana@family.test"}';
select public.delete_my_account();
reset role;

do $$
declare pid text := public.t_dget('pid_dana'); hid text := public.t_dget('hid_dana');
begin
  perform public.t_dexpect('select 1 from auth.users where id = ''0d000000-0000-0000-0000-000000000001''', 0, 'Dana: her account is gone');
  perform public.t_dexpect('select 1 from public.profiles where user_id = ''0d000000-0000-0000-0000-000000000001''', 0, 'Dana: no username left');
  perform public.t_dexpect(format('select 1 from public.households where id = %L', hid), 0, 'Dana: the family is gone');
  perform public.t_dexpect(format('select 1 from public.household_members where household_id = %L', hid), 0, 'Dana: nobody is left in it');
  perform public.t_dexpect(format('select 1 from public.household_invites where household_id = %L', hid), 0, 'Dana: the invite she sent is gone');
  perform public.t_dexpect('select 1 from public.household_invites where lower(email) = ''dana@family.test''', 0, 'Dana: the invite addressed to her is gone');
  perform public.t_dexpect(format('select 1 from public.players where id = %L', pid), 0, 'Dana: the player is gone');
  perform public.t_dexpect(format('select 1 from public.player_settings where player_id = %L', pid), 0, 'Dana: settings gone');
  perform public.t_dexpect(format('select 1 from public.matches where player_id = %L', pid), 0, 'Dana: every match gone, tombstones too');
  perform public.t_dexpect(format('select 1 from public.training_sessions where player_id = %L', pid), 0, 'Dana: training gone');
  perform public.t_dexpect(format('select 1 from public.teams where player_id = %L', pid), 0, 'Dana: teams gone');
  perform public.t_dexpect(format('select 1 from public.competitions where player_id = %L', pid), 0, 'Dana: competitions gone');
  perform public.t_dexpect(format('select 1 from public.results where player_id = %L', pid), 0, 'Dana: results gone');
  perform public.t_dexpect('select 1 from public.academy_players where display_name = ''Max''', 0,
    'Dana: Max is off the academy''s list, the old "left" entry too');
  perform public.t_dexpect('select 1 from public.squad_players sp join public.academy_players ap on ap.id = sp.academy_player_id where ap.display_name = ''Max''', 0,
    'Dana: and out of the squad');
  perform public.t_dexpect('select 1 from public.academy_selections where cardinality(academy_player_ids) <> 1', 0,
    'Dana: the team pick no longer holds his ids');
  perform public.t_dexpect('select 1 from public.matches where data::text like ''%Valedeltest%''', 0,
    'Dana: no trace of him in any match');
  perform public.t_dexpect(format('select 1 from public.wiped_ids where id in (%L, ''0d000000-0000-0000-0000-000000000001'')', hid), 2,
    'Dana: the family''s other phones can find out');
end $$;

-- ---------------------------------------------------------------------------
-- Everyone else is exactly as they were.
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.t_dexpect(format('select 1 from public.matches where player_id = %L', public.t_dget('pid_kim')), 1, 'Kim: her match is still there');
  perform public.t_dexpect(format('select 1 from public.academy_players where id = %L', public.t_dget('ap_jo')), 1, 'Kim: Jo is still on the academy''s list');
  perform public.t_dexpect('select 1 from public.academy_selections where academy_player_ids = array[''' || public.t_dget('ap_jo') || '''::uuid]', 1,
    'Kim: Jo is still in the team pick');
  perform public.t_dexpect(format('select 1 from public.academies where id = %L', public.t_dget('aid')), 1, 'Rob: his academy is untouched');
end $$;

-- ---------------------------------------------------------------------------
-- Asking whether something was deleted.
-- ---------------------------------------------------------------------------
set role anon;
do $$
begin
  if not public.was_wiped(public.t_dget('hid_dana')::uuid, gen_random_uuid()) then
    raise exception 'FAIL: a phone in Dana''s family is not told';
  end if;
  if not public.was_wiped(gen_random_uuid(), '0d000000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: Lee''s other phone, signed out now, is not told';
  end if;
  if public.was_wiped(public.t_dget('hid_kim')::uuid, '0d000000-0000-0000-0000-000000000004') then
    raise exception 'FAIL: Kim''s family is told it was deleted';
  end if;
  raise notice 'PASS: was_wiped says yes for what was deleted, and only that';
  begin
    perform 1 from public.wiped_ids;
    raise exception 'FAIL: wiped_ids can be listed';
  exception when insufficient_privilege then
    raise notice 'PASS: nobody can list what was deleted';
  end;
end $$;
reset role;

-- Tidy up.
delete from public.academies where created_by::text like '0d000000-%';
delete from auth.users where id::text like '0d000000-%';
delete from public.households where id = public.t_dget('hid_kim')::uuid;
drop function public.t_dset(text, text), public.t_dget(text), public.t_dexpect(text, bigint, text);
drop table t_del;

\o
\echo
\echo ALL DELETE CHECKS PASSED
