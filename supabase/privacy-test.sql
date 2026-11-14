-- Deleting an account, children (under 18), and what an academy can learn before a
-- family says yes.
--
-- Run as postgres against a database that has local-auth-stub.sql and
-- schema.sql applied (see README.md), in any order with the other two test
-- files. Stops at the first thing that is wrong; ends with
-- ALL PRIVACY CHECKS PASSED.

\set ON_ERROR_STOP on
\set QUIET on

drop table if exists t_priv;
create table t_priv (k text primary key, v text);
grant all on t_priv to authenticated;

create or replace function public.p_set(k text, v text) returns void language sql as $$
  insert into t_priv values (k, v) on conflict (k) do update set v = excluded.v;
$$;
create or replace function public.p_get(key text) returns text language sql as $$
  select v from t_priv where k = key;
$$;
create or replace function public.p_refused(stmt text, reason text, what text) returns void
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
create or replace function public.p_expect(query text, expected bigint, what text) returns void
language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) q', query) into n;
  if n <> expected then raise exception 'FAIL: % - saw %, expected %', what, n, expected; end if;
  raise notice 'PASS: %', what;
end;
$$;
grant execute on function public.p_set(text, text), public.p_get(text), public.p_refused(text, text, text),
  public.p_expect(text, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The people. 0e...01-03 one family (a parent, the parent's partner, and a
-- teenage sibling who can sign in); 04 a stranger with an academy of their
-- own; 05 a real academy's owner; 06 a family on its own; 07 a coach.
-- ---------------------------------------------------------------------------
delete from public.academies where created_by::text like '0e000000-%';
delete from public.households where name like 'P-%';
delete from auth.users where id::text like '0e000000-%';
insert into auth.users (id, email) values
  ('0e000000-0000-0000-0000-000000000001', 'parent@maya.test'),
  ('0e000000-0000-0000-0000-000000000002', 'partner@maya.test'),
  ('0e000000-0000-0000-0000-000000000003', 'sibling@maya.test'),
  ('0e000000-0000-0000-0000-000000000004', 'stranger@nowhere.test'),
  ('0e000000-0000-0000-0000-000000000005', 'owner@realfc.test'),
  ('0e000000-0000-0000-0000-000000000006', 'solo@family.test'),
  ('0e000000-0000-0000-0000-000000000007', 'coach@realfc.test');
update public.app_settings set require_verification = false;

set role authenticated;

-- Maya is 10. Her parent starts the family; the partner and a teenage sibling join it.
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000001';
do $$
declare hid uuid; pid uuid;
begin
  perform public.declare_age('adult');
  hid := public.create_household('P-Maya');
  insert into public.players (household_id, data, updated_at)
    values (hid, '{"name":"Maya Patel","position":"GK","ageGroup":"U11","dateOfBirth":"2016-03-02"}', now())
    returning id into pid;
  insert into public.matches (player_id, id, data, updated_at) values (pid, 'm1', '{"opponent":"Vale"}', now());
  perform public.claim_username('maya_gk');
  perform public.p_set('hid_maya', hid::text);
  perform public.p_set('pid_maya', pid::text);
end $$;
reset role;
insert into public.household_members (household_id, user_id, role) values
  (public.p_get('hid_maya')::uuid, '0e000000-0000-0000-0000-000000000002', 'adult'),
  (public.p_get('hid_maya')::uuid, '0e000000-0000-0000-0000-000000000003', 'player');
set role authenticated;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000003';
select public.p_refused($$select public.declare_age('teen')$$, 'under 18 needs a parent',
  'a 13 to 17-year-old cannot record an account of their own - under the DPDP Act they are a child');

-- ===========================================================================
-- What an academy learns before anyone says yes.
-- ===========================================================================
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000004';
do $$ begin
  perform public.p_set('fake', public.create_academy('Totally Real FC')::text);
  perform public.p_set('fake_link', public.invite_player(public.p_get('fake')::uuid, 'Maya_GK')::text);
end $$;
select public.p_expect(format($$select * from public.academy_players where academy_id = %L
  and display_name = 'maya_gk' and position = '' and age_group = ''$$, public.p_get('fake')), 1,
  'an academy that invites by username sees the username it typed - not the child''s name, position or age group');
select public.p_expect($$select * from public.academy_players where display_name ilike '%maya patel%'$$, 0,
  'the child''s real name is nowhere an academy can read before the family says yes');

set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000001';
select public.answer_player_invite(public.p_get('fake_link')::uuid, false, false);
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000004';
select public.p_expect(format($$select * from public.academy_players where academy_id = %L
  and status = 'declined' and player_id is null and display_name = 'maya_gk'$$, public.p_get('fake')), 1,
  'after the family says no, the academy still has only the username it typed');

-- ===========================================================================
-- Under 18: only an adult can share with an academy.
-- ===========================================================================
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000005';
do $$ begin
  perform public.declare_age('adult');
  perform public.p_set('real', public.create_academy('Real FC')::text);
  perform public.p_set('real_code', (select join_code from public.academies where id = public.p_get('real')::uuid));
  perform public.p_set('real_link', public.invite_player(public.p_get('real')::uuid, 'maya_gk')::text);
end $$;
select public.p_refused($$select public.declare_age('child')$$, 'parent or guardian',
  'nobody can record themselves as a child - they do not get an account');

set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000003';
select public.p_refused(format($$select public.answer_player_invite(%L, true, true)$$, public.p_get('real_link')),
  'parent or guardian needs to say yes', 'a teenage sibling cannot share a child with an academy');
select public.p_refused(format($$select public.join_by_code(%L, true)$$, public.p_get('real_code')),
  'parent or guardian needs to say yes', 'nor ask to join one with its code');

set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000002';
select public.p_refused(format($$select public.answer_player_invite(%L, true, true)$$, public.p_get('real_link')),
  'parent or guardian needs to say yes', 'an adult who never answered the age question cannot either');

set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000001';
do $$ begin
  perform public.answer_player_invite(public.p_get('real_link')::uuid, true, true);
  raise notice 'PASS: the parent says yes for their child';
end $$;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000005';
select public.p_expect(format($$select * from public.academy_players where id = %L and display_name = 'Maya Patel'
  and position = 'GK' and age_group = 'U11' and consent_by = '0e000000-0000-0000-0000-000000000001'$$, public.p_get('real_link')), 1,
  'once the parent says yes, the academy gets her name, and the yes is recorded as the parent''s');

-- A player with no date of birth counts as a child.
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000006';
do $$
declare hid uuid; pid uuid;
begin
  hid := public.create_household('P-Solo');
  insert into public.players (household_id, data, updated_at)
    values (hid, '{"name":"Solo","position":"CB","ageGroup":"U15"}', now()) returning id into pid;
  insert into public.matches (player_id, id, data, updated_at) values (pid, 's1', '{"opponent":"Moor"}', now());
  perform public.p_set('hid_solo', hid::text);
  perform public.p_set('pid_solo', pid::text);
end $$;
select public.p_refused(format($$select public.join_by_code(%L, true)$$, public.p_get('real_code')),
  'parent or guardian needs to say yes', 'a player with no date of birth is treated as a child');
do $$ begin
  update public.players set data = data || '{"dateOfBirth":"2011-01-15"}' where id = public.p_get('pid_solo')::uuid;
end $$;
select public.p_refused(format($$select public.join_by_code(%L, true)$$, public.p_get('real_code')),
  'parent or guardian needs to say yes', 'a 15-year-old cannot ask to join for themselves - a child under the DPDP Act');
do $$ begin
  update public.players set data = data || '{"dateOfBirth":"2006-01-15"}' where id = public.p_get('pid_solo')::uuid;
  perform public.p_set('solo_req', public.join_by_code(public.p_get('real_code'), true)::text);
  raise notice 'PASS: a player of 18 or over can ask to join for themselves';
end $$;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000005';
select public.answer_join_request(public.p_get('solo_req')::uuid, true);

-- ===========================================================================
-- Invites name their real sender, and only an owner makes an owner.
-- ===========================================================================
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000003';
select public.p_refused(format($$insert into public.household_invites (household_id, email, invited_by)
  values (%L, 'x@x.test', '0e000000-0000-0000-0000-000000000005')$$, public.p_get('hid_maya')),
  'row-level security', 'an invite cannot claim to come from somebody else (it would show the invitee their email)');
select public.p_refused(format($$insert into public.household_invites (household_id, email, invited_by, role)
  values (%L, 'x@x.test', auth.uid(), 'owner')$$, public.p_get('hid_maya')),
  'row-level security', 'a family member who is not the owner cannot invite someone in as an owner');
do $$ begin
  insert into public.household_invites (household_id, email, invited_by)
    values (public.p_get('hid_maya')::uuid, 'grandparent@maya.test', auth.uid());
  raise notice 'PASS: a family member still invites someone as themselves';
end $$;
-- The solo player has an invite waiting in Maya's family, to their address.
insert into public.household_invites (household_id, email, invited_by)
  values (public.p_get('hid_maya')::uuid, 'solo@family.test', auth.uid());

-- ===========================================================================
-- Deleting an account.
-- ===========================================================================
set role anon;
select public.p_refused($$select public.delete_my_account()$$, 'permission denied',
  'someone not signed in cannot call it');
set role authenticated;

-- A family of one: everything goes, and the academy loses sight as if they had left.
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000006';
do $$ begin
  perform public.claim_username('solo_cb');
  perform public.delete_my_account();
  raise notice 'PASS: a player on their own deletes their account';
end $$;
reset role;
select public.p_expect(format($$select * from public.households where id = %L$$, public.p_get('hid_solo')), 0, 'their family is gone');
select public.p_expect(format($$select * from public.players where id = %L$$, public.p_get('pid_solo')), 0, 'their player is gone');
select public.p_expect(format($$select * from public.matches where player_id = %L$$, public.p_get('pid_solo')), 0, 'their matches are gone');
select public.p_expect($$select * from public.profiles where username = 'solo_cb'$$, 0, 'their username is gone');
select public.p_expect($$select * from public.account_ages where user_id = '0e000000-0000-0000-0000-000000000006'$$, 0,
  'their age answer is gone');
select public.p_expect($$select * from auth.users where id = '0e000000-0000-0000-0000-000000000006'$$, 0,
  'the account and its email address are gone');
select public.p_expect($$select * from public.household_invites where email = 'solo@family.test'$$, 0,
  'an invite to their address waiting in another family is gone');
select public.p_expect(format($$select * from public.academy_players where id = %L and status = 'left' and player_id is null$$,
  public.p_get('solo_req')), 1, 'the academy keeps only the name on its list, marked as left');
set role authenticated;

-- A family with others in it: the teenage sibling leaves, the family keeps everything.
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000003';
select public.delete_my_account(true);
reset role;
select public.p_expect(format($$select * from public.matches where player_id = %L$$, public.p_get('pid_maya')), 1,
  'someone who is not the owner deleting their account leaves the family''s records alone, even asking for everything');
select public.p_expect($$select * from auth.users where id = '0e000000-0000-0000-0000-000000000003'$$, 0, 'their account is gone');
set role authenticated;

-- The owner deletes just their own account: the partner keeps Maya's records and becomes the owner.
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000001';
select public.delete_my_account(false);
reset role;
select public.p_expect(format($$select * from public.matches where player_id = %L$$, public.p_get('pid_maya')), 1,
  'the owner leaving on their own keeps the records for the rest of the family');
select public.p_expect(format($$select * from public.household_members where household_id = %L
  and user_id = '0e000000-0000-0000-0000-000000000002' and role = 'owner'$$, public.p_get('hid_maya')), 1,
  'the longest-standing member becomes the owner');
set role authenticated;

-- An academy owner with staff has to hand it over first; nothing is deleted.
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000007';
select public.declare_age('adult');
reset role;
insert into public.academy_members (academy_id, user_id, role)
  values (public.p_get('real')::uuid, '0e000000-0000-0000-0000-000000000007', 'coach');
set role authenticated;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000005';
select public.p_refused($$select public.delete_my_account()$$, 'hand real fc over',
  'an academy owner with staff hands it over before deleting their account');
reset role;
select public.p_expect($$select * from auth.users where id = '0e000000-0000-0000-0000-000000000005'$$, 1,
  'and a refused delete deletes nothing at all');
-- With nobody else on the staff, the academy goes with them.
delete from public.academy_members where user_id = '0e000000-0000-0000-0000-000000000007';
set role authenticated;
select public.delete_my_account();
reset role;
select public.p_expect(format($$select * from public.academies where id = %L$$, public.p_get('real')), 0,
  'an academy its owner ran alone is deleted with their account');
set role authenticated;

-- The partner, now owner, deletes everything: Maya's records go for good.
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000002';
select public.delete_my_account(true);
reset role;
select public.p_expect(format($$select * from public.players where id = %L$$, public.p_get('pid_maya')), 0,
  'the owner asking for everything deletes the player for the whole family');
select public.p_expect(format($$select * from public.matches where player_id = %L$$, public.p_get('pid_maya')), 0,
  'and every match with them');

-- ===========================================================================
-- Verification documents do not outlive the check, whichever way it goes.
-- ===========================================================================
insert into public.app_admins (user_id) values ('0e000000-0000-0000-0000-000000000007') on conflict do nothing;
set role authenticated;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000004';
insert into public.academy_documents (academy_id, kind, file_name, mime, data, uploaded_by)
  values (public.p_get('fake')::uuid, 'registration', 'reg.pdf', 'application/pdf', 'data:application/pdf;base64,AAAA', auth.uid());
select public.submit_for_review(public.p_get('fake')::uuid);
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000007';
select public.review_academy(public.p_get('fake')::uuid, false, 'Not a registered club');
reset role;
select public.p_expect(format($$select * from public.academy_documents where academy_id = %L$$, public.p_get('fake')), 0,
  'documents are deleted when an academy is turned down, too');

-- ===========================================================================
delete from public.academies where created_by::text like '0e000000-%';
delete from public.households where name like 'P-%';
delete from auth.users where id::text like '0e000000-%';
drop function public.p_expect(text, bigint, text), public.p_refused(text, text, text), public.p_get(text), public.p_set(text, text);
drop table t_priv;
\echo ''
\echo 'ALL PRIVACY CHECKS PASSED'
