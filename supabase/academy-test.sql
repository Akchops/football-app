-- Do the academy rules keep everyone where they belong?
--
-- Run as postgres against a database that has local-auth-stub.sql and
-- schema.sql applied (see README.md). It plays ten people - an academy's
-- owner, manager, two coaches and office admin; two players and a parent; a
-- stranger; and one of Matchday's own admins - and has each of them try what
-- they should and what they shouldn't. Stops at the first thing that is wrong;
-- ends with ALL ACADEMY CHECKS PASSED.

\set ON_ERROR_STOP on
\set QUIET on

-- ---------------------------------------------------------------------------
-- Test helpers, removed at the end.
-- ---------------------------------------------------------------------------
drop table if exists t_acad;
create table t_acad (k text primary key, v text);
grant all on t_acad to authenticated;

create or replace function public.t_set(k text, v text) returns void language sql as $$
  insert into t_acad values (k, v) on conflict (k) do update set v = excluded.v;
$$;
create or replace function public.t_get(key text) returns text language sql as $$
  select v from t_acad where k = key;
$$;
-- Runs a statement that must fail, and checks it fails for the right reason.
create or replace function public.t_refused(stmt text, reason text, what text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if position(lower(reason) in lower(sqlerrm)) = 0 then
      raise exception 'FAIL: % - refused, but with "%"', what, sqlerrm;
    end if;
    raise notice 'PASS: %', what;
    return;
  end;
  raise exception 'FAIL: % - it was allowed', what;
end;
$$;
-- How many rows a query lets the current person see.
create or replace function public.t_count(query text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) q', query) into n;
  return n;
end;
$$;
create or replace function public.t_expect(query text, expected bigint, what text) returns void
language plpgsql as $$
declare n bigint := public.t_count(query);
begin
  if n <> expected then raise exception 'FAIL: % - saw %, expected %', what, n, expected; end if;
  raise notice 'PASS: %', what;
end;
$$;
grant execute on function public.t_set(text, text), public.t_get(text), public.t_refused(text, text, text),
  public.t_count(text), public.t_expect(text, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The people.
-- ---------------------------------------------------------------------------
delete from public.academies where created_by::text like '0a000000-%';
delete from auth.users where id::text like '0a000000-%';
insert into auth.users (id, email) values
  ('0a000000-0000-0000-0000-000000000001', 'owner@riverside.test'),
  ('0a000000-0000-0000-0000-000000000002', 'manager@riverside.test'),
  ('0a000000-0000-0000-0000-000000000003', 'coach.one@riverside.test'),
  ('0a000000-0000-0000-0000-000000000004', 'coach.two@riverside.test'),
  ('0a000000-0000-0000-0000-000000000005', 'office@riverside.test'),
  ('0a000000-0000-0000-0000-000000000006', 'arjun@family.test'),
  ('0a000000-0000-0000-0000-000000000007', 'parent@family.test'),
  ('0a000000-0000-0000-0000-000000000008', 'sam@other.test'),
  ('0a000000-0000-0000-0000-000000000009', 'stranger@nowhere.test'),
  ('0a000000-0000-0000-0000-00000000000a', 'admin@matchday.test');
insert into public.app_admins (user_id) values ('0a000000-0000-0000-0000-00000000000a') on conflict do nothing;
update public.app_settings set require_verification = false;

set role authenticated;

-- Arjun's family: a household with his player and two matches; his parent in it too.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000006';
do $$
declare hid uuid; pid uuid;
begin
  hid := public.create_household('Arjun''s family');
  insert into public.players (household_id, data, updated_at)
    values (hid, '{"name":"Arjun","position":"GK","ageGroup":"U16"}', now()) returning id into pid;
  insert into public.matches (player_id, id, data, updated_at) values
    (pid, 'm_a1', '{"opponent":"Vale","status":"played"}', now()),
    (pid, 'm_a2', '{"opponent":"Moor","status":"played"}', now());
  perform public.t_set('hid_arjun', hid::text);
  perform public.t_set('pid_arjun', pid::text);
end $$;
reset role;
insert into public.household_members (household_id, user_id, role)
  values (public.t_get('hid_arjun')::uuid, '0a000000-0000-0000-0000-000000000007', 'adult');
set role authenticated;

-- Sam, another family, with one match.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000008';
do $$
declare hid uuid; pid uuid;
begin
  hid := public.create_household('Sam''s family');
  insert into public.players (household_id, data, updated_at)
    values (hid, '{"name":"Sam","position":"CB","ageGroup":"U14"}', now()) returning id into pid;
  insert into public.matches (player_id, id, data, updated_at) values (pid, 'm_s1', '{"opponent":"Hilltop"}', now());
  perform public.t_set('pid_sam', pid::text);
end $$;

-- ===========================================================================
-- Usernames.
-- ===========================================================================
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000006';
do $$ begin
  if public.claim_username('Arjun_GK') <> 'arjun_gk' then raise exception 'FAIL: username not lowercased'; end if;
  raise notice 'PASS: a username is kept in lowercase';
end $$;

set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000008';
select public.t_refused($$select public.claim_username('ARJUN_GK')$$, 'taken', 'a username taken in other capitals is refused');
select public.t_refused($$select public.claim_username('admin')$$, 'reserved', 'a reserved username is refused');
select public.t_refused($$select public.claim_username('no spaces!')$$, 'letters', 'a username of the wrong shape is refused');
do $$ begin
  if public.username_available('arjun_gk') or not public.username_available('sam_cb') then
    raise exception 'FAIL: availability check wrong';
  end if;
  perform public.claim_username('sam_cb');
  raise notice 'PASS: the availability check matches what can be claimed';
end $$;
select public.t_expect($$select * from public.profiles$$, 1, 'someone sees only their own profile row');

set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000001'; select public.claim_username('riverside_owner');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000002'; select public.claim_username('mgr_m');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000003'; select public.claim_username('coach_one');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000004'; select public.claim_username('coach_two');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000005'; select public.claim_username('office_ad');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000009'; select public.claim_username('stranger_s');

select public.t_refused($$select public.user_by_username('arjun_gk')$$, 'permission denied',
  'nobody can turn a username into an account id directly');

-- ===========================================================================
-- An academy, its staff and their roles.
-- ===========================================================================
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000001';
do $$
declare aid uuid;
begin
  aid := public.create_academy('Riverside Academy', 'Leeds', 'UK', 'info@riverside.test', '{U14,U16}');
  perform public.t_set('aid', aid::text);
  perform public.t_set('code', (select join_code from public.academies where id = aid));
  if public.academy_role(aid) <> 'owner' then raise exception 'FAIL: creator is not the owner'; end if;
  if (select verification from public.academies where id = aid) <> 'unverified' then raise exception 'FAIL: starts verified'; end if;
  raise notice 'PASS: whoever creates an academy owns it, unverified';
  perform public.invite_staff(aid, 'mgr_m', 'manager');
  perform public.invite_staff(aid, 'coach_one', 'coach');
  perform public.invite_staff(aid, 'coach_two', 'coach');
  perform public.invite_staff(aid, 'office_ad', 'admin');
end $$;
select public.t_refused(format($$select public.invite_staff(%L, 'nobody_here', 'coach')$$, public.t_get('aid')),
  'no one has that username', 'inviting a username that does not exist says so');

set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000009';
select public.t_expect(format($$select * from public.academies where id = %L$$, public.t_get('aid')), 0,
  'a stranger cannot see the academy');
select public.t_refused(format($$select public.invite_staff(%L, 'stranger_s', 'manager')$$, public.t_get('aid')),
  'only the owner or a manager', 'a stranger cannot invite staff');
select public.t_refused(format($$insert into public.academy_members values (%L, auth.uid(), 'owner')$$, public.t_get('aid')),
  'permission denied', 'a stranger cannot write themselves onto the staff');

-- Each of the staff accepts.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000002';
do $$ begin
  if (select academy_name from public.my_staff_invites()) <> 'Riverside Academy' then raise exception 'FAIL: invite not shown'; end if;
  perform public.answer_staff_invite((select id from public.my_staff_invites()), true);
  raise notice 'PASS: an invited manager sees the academy by name and joins';
end $$;
select public.t_refused(format($$select public.invite_staff(%L, 'stranger_s', 'manager')$$, public.t_get('aid')),
  'only the owner can invite a manager', 'a manager cannot make another manager');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000003';
select public.answer_staff_invite((select id from public.my_staff_invites()), true);
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000004';
select public.answer_staff_invite((select id from public.my_staff_invites()), true);
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000005';
select public.answer_staff_invite((select id from public.my_staff_invites()), true);
select public.t_expect(format($$select * from public.academy_staff(%L)$$, public.t_get('aid')), 5,
  'staff see the whole staff list');

-- Squads: owners and managers make them and say who coaches them.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000005';
select public.t_refused(format($$insert into public.academy_squads (academy_id, name) values (%L, 'Office XI')$$, public.t_get('aid')),
  'row-level security', 'the admin role cannot make squads');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000003';
select public.t_refused(format($$insert into public.academy_squads (academy_id, name) values (%L, 'My lot')$$, public.t_get('aid')),
  'row-level security', 'a coach cannot make squads');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000002';
do $$
declare elite uuid; dev uuid;
begin
  insert into public.academy_squads (academy_id, name, age_group) values (public.t_get('aid')::uuid, 'U16 Elite', 'U16') returning id into elite;
  insert into public.academy_squads (academy_id, name, age_group) values (public.t_get('aid')::uuid, 'U14 Development', 'U14') returning id into dev;
  insert into public.squad_coaches values (elite, '0a000000-0000-0000-0000-000000000003'), (dev, '0a000000-0000-0000-0000-000000000004');
  perform public.t_set('elite', elite::text);
  perform public.t_set('dev', dev::text);
  raise notice 'PASS: a manager makes squads and gives each a coach';
end $$;
select public.t_refused(format($$insert into public.squad_coaches values (%L, '0a000000-0000-0000-0000-000000000009')$$, public.t_get('elite')),
  'row-level security', 'someone off the staff cannot be made a squad''s coach');

-- ===========================================================================
-- Players joining - by invite, and by code.
-- ===========================================================================
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000003';
do $$ begin
  perform public.t_set('link_arjun', public.invite_player(public.t_get('aid')::uuid, 'arjun_gk')::text);
  raise notice 'PASS: a coach invites a player by username';
end $$;
select public.t_refused(format($$select public.invite_player(%L, 'arjun_gk')$$, public.t_get('aid')),
  'already invited', 'the same player cannot be invited twice');
select public.t_refused(format($$insert into public.academy_players (academy_id, display_name, status) values (%L, 'Sneaky', 'linked')$$, public.t_get('aid')),
  'row-level security', 'staff cannot write a player straight in as linked');
select public.t_refused(format($$update public.academy_players set status = 'linked' where id = %L$$, public.t_get('link_arjun')),
  'permission denied', 'staff cannot mark an invite as accepted themselves');

set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000001';
select public.t_expect(format($$select * from public.matches where player_id = %L$$, public.t_get('pid_arjun')), 0,
  'an invited player''s matches stay hidden until the family says yes');

-- His parent answers for him.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000007';
do $$ begin
  if (select academy_name from public.my_player_invites()) <> 'Riverside Academy'
     or (select invited_by from public.my_player_invites()) <> 'coach_one' then
    raise exception 'FAIL: the invite does not say who is asking';
  end if;
  raise notice 'PASS: the family sees which academy is asking, and who';
end $$;
select public.t_refused(format($$select public.answer_player_invite(%L, true, false)$$, public.t_get('link_arjun')),
  'agree to share', 'saying yes needs consent ticked');
do $$ begin
  perform public.answer_player_invite(public.t_get('link_arjun')::uuid, true, true);
  if (select consent_by from public.academy_players where id = public.t_get('link_arjun')::uuid) <> '0a000000-0000-0000-0000-000000000007' then
    raise exception 'FAIL: consent not recorded against the parent';
  end if;
  raise notice 'PASS: a parent says yes for their child, and it is recorded as theirs';
end $$;

-- Sam asks to join with the code; a coach accepts.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000008';
select public.t_refused($$select public.join_by_code('ZZZZZZ', true)$$, 'no academy has that code', 'a wrong code is refused');
select public.t_refused(format($$select public.join_by_code(%L, false)$$, public.t_get('code')), 'agree to share',
  'asking to join needs consent ticked');
do $$ begin
  perform public.t_set('link_sam', public.join_by_code(lower(public.t_get('code')), true)::text);
  raise notice 'PASS: a player asks to join with the code, in any case';
end $$;
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000004';
select public.answer_join_request(public.t_get('link_sam')::uuid, true);

-- Squads, and a name with no app.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000002';
do $$
declare kid uuid;
begin
  insert into public.squad_players values (public.t_get('elite')::uuid, public.t_get('link_arjun')::uuid),
                                          (public.t_get('dev')::uuid, public.t_get('link_sam')::uuid);
  insert into public.academy_players (academy_id, display_name, status) values (public.t_get('aid')::uuid, 'No App Nathan', 'roster')
    returning id into kid;
  insert into public.squad_players values (public.t_get('elite')::uuid, kid);
  raise notice 'PASS: a manager puts players in squads and adds a name without the app';
end $$;

-- ===========================================================================
-- Who can see whose matches.
-- ===========================================================================
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000001';
select public.t_expect(format($$select * from public.matches where player_id in (%L, %L)$$, public.t_get('pid_arjun'), public.t_get('pid_sam')), 3,
  'the owner sees every linked player''s matches');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000002';
select public.t_expect(format($$select * from public.matches where player_id in (%L, %L)$$, public.t_get('pid_arjun'), public.t_get('pid_sam')), 3,
  'a manager sees every linked player''s matches');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000003';
select public.t_expect(format($$select * from public.matches where player_id = %L$$, public.t_get('pid_arjun')), 2,
  'a coach sees the players in their squad');
select public.t_expect(format($$select * from public.matches where player_id = %L$$, public.t_get('pid_sam')), 0,
  'a coach does not see players in someone else''s squad');
select public.t_expect(format($$select * from public.players where id = %L$$, public.t_get('pid_arjun')), 1,
  'a coach sees their player''s profile');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000005';
select public.t_expect(format($$select * from public.matches where player_id in (%L, %L)$$, public.t_get('pid_arjun'), public.t_get('pid_sam')), 0,
  'the admin role sees no player''s matches');
select public.t_expect(format($$select * from public.academy_players where academy_id = %L$$, public.t_get('aid')), 3,
  'the admin role still sees who is on the books');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000009';
select public.t_expect(format($$select * from public.matches where player_id in (%L, %L)$$, public.t_get('pid_arjun'), public.t_get('pid_sam')), 0,
  'a stranger sees no one''s matches');
select public.t_expect($$select * from public.academy_players$$, 0, 'a stranger sees no roster');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000006';
select public.t_expect(format($$select * from public.matches where player_id = %L$$, public.t_get('pid_sam')), 0,
  'a player does not see a squad mate''s matches');

-- Reading is all the academy can do.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000001';
select public.t_refused(format($$insert into public.matches (player_id, id, data, updated_at) values (%L, 'm_x', '{}', now())$$, public.t_get('pid_arjun')),
  'row-level security', 'the owner cannot add a match to a player''s records');
do $$
declare n int;
begin
  update public.matches set data = '{"opponent":"Changed"}' where player_id = public.t_get('pid_arjun')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: the owner changed % of a player''s matches', n; end if;
  delete from public.matches where player_id = public.t_get('pid_arjun')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: the owner deleted % of a player''s matches', n; end if;
  raise notice 'PASS: the owner cannot change or delete a player''s matches';
end $$;

-- What a family sees of the academy: their squads and squad mates' names.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000006';
do $$
declare r record;
begin
  select * into r from public.my_academies();
  if r.academy_name <> 'Riverside Academy' or r.squad_name <> 'U16 Elite' or r.mates <> array['No App Nathan'] then
    raise exception 'FAIL: my_academies gave %', r;
  end if;
  if (select count(*) from public.my_academies()) <> 1 then raise exception 'FAIL: sees squads they are not in'; end if;
  raise notice 'PASS: a player sees their squad and squad mates'' names, and only that';
end $$;

-- ===========================================================================
-- The academy's own competitions and tables.
-- ===========================================================================
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000003';
do $$
declare cid uuid;
begin
  insert into public.academy_competitions (academy_id, name, team_name) values (public.t_get('aid')::uuid, 'Yorkshire U16 League', 'Riverside')
    returning id into cid;
  insert into public.academy_results (competition_id, home, away, home_goals, away_goals) values (cid, 'Riverside', 'Vale', 2, 1),
    (cid, 'Moor', 'Hilltop', 0, 0);
  insert into public.academy_selections (academy_id, name, academy_player_ids) values (public.t_get('aid')::uuid, 'Dubai Cup',
    array[public.t_get('link_arjun')::uuid]);
  perform public.t_set('cid', cid::text);
  raise notice 'PASS: a coach enters a competition, its results and a team selection';
end $$;
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000005';
select public.t_refused(format($$insert into public.academy_results (competition_id, home, away) values (%L, 'A', 'B')$$, public.t_get('cid')),
  'row-level security', 'the admin role cannot enter results');
select public.t_expect($$select * from public.academy_selections$$, 0, 'the admin role does not see team selections');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000006';
select public.t_expect(format($$select * from public.academy_results where competition_id = %L$$, public.t_get('cid')), 2,
  'a linked player sees the academy''s tables');
select public.t_expect($$select * from public.academy_selections$$, 0, 'a player does not see team selections');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000009';
select public.t_expect($$select * from public.academy_results$$, 0, 'a stranger sees no tables');

-- ===========================================================================
-- Verification.
-- ===========================================================================
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000001';
select public.t_refused(format($$update public.academies set verification = 'verified' where id = %L$$, public.t_get('aid')),
  'permission denied', 'an owner cannot mark their own academy verified');
select public.t_refused(format($$select public.submit_for_review(%L)$$, public.t_get('aid')), 'upload at least one',
  'asking for review needs a certificate');
insert into public.academy_documents (academy_id, kind, file_name, mime, data, uploaded_by)
  values (public.t_get('aid')::uuid, 'registration', 'registration.pdf', 'application/pdf', 'data:application/pdf;base64,AAAA', auth.uid());
select public.submit_for_review(public.t_get('aid')::uuid);
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000002';
select public.t_expect($$select * from public.academy_documents$$, 0, 'certificates are not shown to the manager');
select public.t_refused(format($$select public.review_academy(%L, true)$$, public.t_get('aid')), 'only matchday',
  'staff cannot approve their own academy');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-00000000000a';
select public.t_expect($$select * from public.academy_documents$$, 1, 'Matchday''s admin sees the certificates');
do $$ begin
  if (select verification from public.academies_for_review() where id = public.t_get('aid')::uuid) <> 'pending' then
    raise exception 'FAIL: not waiting for review';
  end if;
  perform public.review_academy(public.t_get('aid')::uuid, true, 'Checked the FA registration');
  if (select verification from public.academies where id = public.t_get('aid')::uuid) <> 'verified' then
    raise exception 'FAIL: not verified';
  end if;
  raise notice 'PASS: Matchday''s admin reviews and verifies it';
end $$;

-- With approval required, an unverified academy cannot take players.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000001';
do $$
declare n int;
begin
  update public.app_settings set require_verification = true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: an academy owner changed the app''s settings'; end if;
  raise notice 'PASS: only Matchday''s admins change the approval switch';
end $$;
set request.jwt.claim.sub = '0a000000-0000-0000-0000-00000000000a';
update public.app_settings set require_verification = true;
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000009';
do $$ begin
  perform public.t_set('fake', public.create_academy('Totally Real FC')::text);
  perform public.t_set('fake_code', (select join_code from public.academies where id = public.t_get('fake')::uuid));
end $$;
select public.t_refused(format($$select public.invite_player(%L, 'sam_cb')$$, public.t_get('fake')), 'needs to be verified',
  'with approval required, an unverified academy cannot invite players');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000008';
select public.t_refused(format($$select public.join_by_code(%L, true)$$, public.t_get('fake_code')), 'not verified',
  'with approval required, nobody can join an unverified academy');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-00000000000a';
update public.app_settings set require_verification = false;

-- ===========================================================================
-- Roles, ownership and leaving.
-- ===========================================================================
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000002';
select public.t_refused(format($$select public.remove_staff(%L, '0a000000-0000-0000-0000-000000000001')$$, public.t_get('aid')),
  'hands over ownership', 'a manager cannot remove the owner');
select public.t_refused(format($$select public.set_staff_role(%L, '0a000000-0000-0000-0000-000000000001', 'coach')$$, public.t_get('aid')),
  'hand over ownership', 'nobody can demote the owner by changing their role');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000003';
select public.t_refused(format($$select public.set_staff_role(%L, '0a000000-0000-0000-0000-000000000004', 'manager')$$, public.t_get('aid')),
  'cannot change that role', 'a coach cannot change roles');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000001';
select public.t_refused(format($$select public.remove_staff(%L, auth.uid())$$, public.t_get('aid')),
  'hands over ownership', 'the owner cannot simply leave');
do $$ begin
  perform public.transfer_ownership(public.t_get('aid')::uuid, '0a000000-0000-0000-0000-000000000002');
  if public.academy_role(public.t_get('aid')::uuid) <> 'manager' then raise exception 'FAIL: old owner not a manager'; end if;
  raise notice 'PASS: the owner hands over and stays on as a manager';
end $$;

-- Removing a coach takes their squads off them.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000002';
select public.remove_staff(public.t_get('aid')::uuid, '0a000000-0000-0000-0000-000000000004');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000004';
select public.t_expect(format($$select * from public.matches where player_id = %L$$, public.t_get('pid_sam')), 0,
  'a removed coach sees nothing of their old squad');

-- Arjun's family takes him out of the academy.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000006';
select public.leave_academy(public.t_get('link_arjun')::uuid);
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000003';
select public.t_expect(format($$select * from public.matches where player_id = %L$$, public.t_get('pid_arjun')), 0,
  'once a player leaves, their coach sees none of their matches');
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000001';
select public.t_expect(format($$select * from public.matches where player_id = %L$$, public.t_get('pid_arjun')), 0,
  'once a player leaves, nobody at the academy sees their matches');
select public.t_expect(format($$select * from public.academy_players where id = %L and status = 'left' and player_id is null$$,
  public.t_get('link_arjun')), 1, 'the academy keeps the name, marked as left');

-- ===========================================================================
reset role;
drop function public.t_expect(text, bigint, text), public.t_count(text), public.t_refused(text, text, text),
  public.t_get(text), public.t_set(text, text);
drop table t_acad;
\echo ''
\echo 'ALL ACADEMY CHECKS PASSED'
