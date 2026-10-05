-- Matchday: households, players and their records.
--
-- Run this against a new Supabase project (SQL editor, or `supabase db push`).
-- It is checked in rather than clicked into a dashboard so the access rules are
-- reviewable and can be recreated from scratch.
--
-- Two rules this file follows throughout, both of which matter more than they
-- look:
--
-- 1. The server never sets updated_at. The app decides it, because it is the
--    value the merge compares when two phones disagree. A helpful
--    "updated_at = now()" trigger would restamp every row on arrival, make
--    every push look like the newest edit, and quietly corrupt the merge. There
--    is deliberately no such trigger anywhere below.
--
-- 2. A delete is an update. Rows are never removed by the app; deleted_at is
--    set instead, so the delete reaches the other phones. Only the household
--    removing itself deletes anything for real.
--
-- 3. The one time the server does own is synced_at: when a row last reached
--    it, by the server's clock. Phones ask for "everything since the last
--    synced_at I saw". Asking by updated_at instead would quietly skip changes
--    made on a phone whose clock is behind - they would look older than a pull
--    that had already happened.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Households: the group of people who share one player's data.
-- ---------------------------------------------------------------------------

create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'My household',
  created_at  timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- 'owner' can invite and remove people; 'adult' is a parent or guardian who
  -- can see and edit everything; 'player' is the player themselves.
  role         text not null default 'adult' check (role in ('owner', 'adult', 'player')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx
  on public.household_members (user_id);

-- Pending invites, held by email so they can be claimed at first sign-in.
create table if not exists public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email        text not null,
  role         text not null default 'adult' check (role in ('owner', 'adult', 'player')),
  invited_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (household_id, email)
);

create index if not exists household_invites_email_idx
  on public.household_invites (lower(email));

-- ---------------------------------------------------------------------------
-- Players. One row per person being tracked.
--
-- A separate table rather than a column on the household, because a household
-- with two kids in it is an obvious next ask, and because this is the row an
-- academy links to later. Getting it wrong now would mean a migration then.
-- ---------------------------------------------------------------------------

create table if not exists public.players (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- The app's Profile, as the app sees it.
  data         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists players_household_idx
  on public.players (household_id);

create table if not exists public.player_settings (
  player_id  uuid primary key references public.players(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null
);

-- ---------------------------------------------------------------------------
-- The record lists: matches, training, teams, competitions.
--
-- Each row keeps the record as the app sees it in `data`, with only the columns
-- the server itself needs promoted out: identity, tenancy, and the two
-- timestamps sync relies on. That keeps the app's types and this file from
-- drifting apart field by field, which is the usual way a sync layer starts
-- silently dropping whatever was added last.
--
-- Anything the server needs to query is a generated column, derived from `data`
-- rather than written twice - so it cannot disagree with the record it came
-- from. The academy stage adds the rest of the league-table columns the same
-- way.
--
-- Dates stay as the ISO text the app already writes. A generated column has to
-- be immutable and casting text to date is not - it reads the server's
-- DateStyle - and 'YYYY-MM-DD' sorts identically as text anyway, without
-- failing the whole insert over one blank date.
--
-- The primary key is (player_id, id) rather than id alone. The app's ids are
-- random, but they are generated on phones, so a global key would let one
-- household's id collide with another's - a confusing hard failure at best.
-- ---------------------------------------------------------------------------

create table if not exists public.matches (
  player_id  uuid not null references public.players(id) on delete cascade,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  match_date text generated always as (data ->> 'date') stored,
  opponent   text generated always as (data ->> 'opponent') stored,
  status     text generated always as (data ->> 'status') stored,
  primary key (player_id, id)
);

create table if not exists public.training_sessions (
  player_id     uuid not null references public.players(id) on delete cascade,
  id            text not null,
  data          jsonb not null,
  updated_at    timestamptz not null,
  deleted_at    timestamptz,
  session_date  text generated always as (data ->> 'date') stored,
  primary key (player_id, id)
);

create table if not exists public.teams (
  player_id  uuid not null references public.players(id) on delete cascade,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (player_id, id)
);

create table if not exists public.competitions (
  player_id  uuid not null references public.players(id) on delete cascade,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (player_id, id)
);

-- Other teams' games in a competition, kept so its table can be worked out.
create table if not exists public.results (
  player_id      uuid not null references public.players(id) on delete cascade,
  id             text not null,
  data           jsonb not null,
  updated_at     timestamptz not null,
  deleted_at     timestamptz,
  competition_id text generated always as (data ->> 'competitionId') stored,
  primary key (player_id, id)
);

-- When each row last reached the server, by the server's clock (rule 3). Added
-- as its own step so a database made from an earlier version of this file
-- gains it too.
alter table public.matches           add column if not exists synced_at timestamptz not null default clock_timestamp();
alter table public.training_sessions add column if not exists synced_at timestamptz not null default clock_timestamp();
alter table public.teams             add column if not exists synced_at timestamptz not null default clock_timestamp();
alter table public.competitions      add column if not exists synced_at timestamptz not null default clock_timestamp();
alter table public.results           add column if not exists synced_at timestamptz not null default clock_timestamp();

-- Stamped on every insert and update, whatever the phone sent - a phone cannot
-- set it, so it cannot get it wrong.
create or replace function public.stamp_synced_at()
returns trigger
language plpgsql
as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists stamp_synced_at on public.matches;
create trigger stamp_synced_at before insert or update on public.matches
  for each row execute function public.stamp_synced_at();
drop trigger if exists stamp_synced_at on public.training_sessions;
create trigger stamp_synced_at before insert or update on public.training_sessions
  for each row execute function public.stamp_synced_at();
drop trigger if exists stamp_synced_at on public.teams;
create trigger stamp_synced_at before insert or update on public.teams
  for each row execute function public.stamp_synced_at();
drop trigger if exists stamp_synced_at on public.competitions;
create trigger stamp_synced_at before insert or update on public.competitions
  for each row execute function public.stamp_synced_at();
drop trigger if exists stamp_synced_at on public.results;
create trigger stamp_synced_at before insert or update on public.results
  for each row execute function public.stamp_synced_at();

-- "Everything for this player since synced_at X" is the query every sync runs.
drop index if exists public.matches_since_idx;
drop index if exists public.training_since_idx;
drop index if exists public.teams_since_idx;
drop index if exists public.competitions_since_idx;
create index if not exists matches_synced_idx on public.matches (player_id, synced_at);
create index if not exists training_synced_idx on public.training_sessions (player_id, synced_at);
create index if not exists teams_synced_idx on public.teams (player_id, synced_at);
create index if not exists competitions_synced_idx on public.competitions (player_id, synced_at);
create index if not exists results_synced_idx on public.results (player_id, synced_at);
create index if not exists matches_date_idx on public.matches (player_id, match_date);

-- ---------------------------------------------------------------------------
-- Who can see what.
--
-- Both helpers are `security definer`, which runs them as the function's owner
-- and so skips row-level security inside. That is not a shortcut: a policy on
-- household_members that queried household_members would recurse, and Postgres
-- would reject the query rather than the data. Both are `stable` so a single
-- statement evaluates them once.
--
-- They are also the only thing standing between one family's data and another's,
-- so they are deliberately small enough to read in full.
-- ---------------------------------------------------------------------------

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = hid
      and user_id = auth.uid()
  );
$$;

create or replace function public.owns_player(pid uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.players p
    where p.id = pid
      and public.is_household_member(p.household_id)
  );
$$;

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.players           enable row level security;
alter table public.player_settings   enable row level security;
alter table public.matches           enable row level security;
alter table public.training_sessions enable row level security;
alter table public.teams             enable row level security;
alter table public.competitions      enable row level security;
alter table public.results           enable row level security;

drop policy if exists households_read on public.households;
create policy households_read on public.households
  for select using (public.is_household_member(id));

drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update using (public.is_household_member(id))
  with check (public.is_household_member(id));

-- Households are created through create_household() below, which also adds the
-- creator as a member. Inserting one directly would strand it with no members
-- and no way to reach it.

drop policy if exists members_read on public.household_members;
create policy members_read on public.household_members
  for select using (public.is_household_member(household_id));

drop policy if exists members_remove on public.household_members;
create policy members_remove on public.household_members
  for delete using (
    -- Anyone can leave; only an owner can remove somebody else.
    user_id = auth.uid()
    or exists (
      select 1 from public.household_members m
      where m.household_id = household_members.household_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

drop policy if exists invites_read on public.household_invites;
create policy invites_read on public.household_invites
  for select using (
    public.is_household_member(household_id)
    or lower(email) = lower(auth.jwt() ->> 'email')
  );

drop policy if exists invites_write on public.household_invites;
create policy invites_write on public.household_invites
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Players and everything hanging off them: readable and writable by the
-- household, invisible to everyone else. Written once here rather than checked
-- again in app code, so a bug in the app cannot widen it.

drop policy if exists players_all on public.players;
create policy players_all on public.players
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists player_settings_all on public.player_settings;
create policy player_settings_all on public.player_settings
  for all using (public.owns_player(player_id))
  with check (public.owns_player(player_id));

drop policy if exists matches_all on public.matches;
create policy matches_all on public.matches
  for all using (public.owns_player(player_id))
  with check (public.owns_player(player_id));

drop policy if exists training_all on public.training_sessions;
create policy training_all on public.training_sessions
  for all using (public.owns_player(player_id))
  with check (public.owns_player(player_id));

drop policy if exists teams_all on public.teams;
create policy teams_all on public.teams
  for all using (public.owns_player(player_id))
  with check (public.owns_player(player_id));

drop policy if exists competitions_all on public.competitions;
create policy competitions_all on public.competitions
  for all using (public.owns_player(player_id))
  with check (public.owns_player(player_id));

drop policy if exists results_all on public.results;
create policy results_all on public.results
  for all using (public.owns_player(player_id))
  with check (public.owns_player(player_id));

-- ---------------------------------------------------------------------------
-- The two things the app cannot do in one statement under RLS.
-- ---------------------------------------------------------------------------

-- Creating a household and joining it have to happen together, or the row is
-- created and then immediately invisible to its own creator.
create or replace function public.create_household(name text default 'My household')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  insert into public.households (name) values (coalesce(name, 'My household'))
  returning id into hid;

  insert into public.household_members (household_id, user_id, role)
  values (hid, auth.uid(), 'owner');

  return hid;
end;
$$;

-- Accepting an invite means writing a membership row for yourself, which no
-- sane policy on household_members would allow directly. The invite is the
-- proof, so the check lives here: the caller's own verified email must match.
create or replace function public.accept_invite(invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv public.household_invites;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  select * into inv from public.household_invites where id = invite_id;
  if inv is null then
    raise exception 'invite not found';
  end if;

  if lower(inv.email) <> lower(auth.jwt() ->> 'email') then
    raise exception 'this invite is for somebody else';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, auth.uid(), inv.role)
  on conflict (household_id, user_id) do nothing;

  delete from public.household_invites where id = inv.id;

  return inv.household_id;
end;
$$;

-- Who is in a household, by email, for the list in Setup. Emails live in
-- auth.users, which nobody can read directly - so this hands out only the
-- members of a household the caller is in, and nothing else.
create or replace function public.household_people(hid uuid)
returns table (user_id uuid, email text, role text, is_me boolean)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select m.user_id, u.email::text, m.role, m.user_id = auth.uid()
  from public.household_members m
  join auth.users u on u.id = m.user_id
  where m.household_id = hid
    and public.is_household_member(hid)
  order by m.created_at;
$$;

-- Invites addressed to the caller, with the household's name and who sent
-- them - which normal access rules would hide, since the caller is not a
-- member yet. Knowing who is asking is the point of an invite.
create or replace function public.my_invites()
returns table (id uuid, household_id uuid, household_name text, invited_by_email text)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select i.id, i.household_id, h.name, u.email::text
  from public.household_invites i
  join public.households h on h.id = i.household_id
  left join auth.users u on u.id = i.invited_by
  where lower(i.email) = lower(auth.jwt() ->> 'email')
  order by i.created_at desc;
$$;

-- From anon by name as well as from public: Supabase's defaults grant new
-- functions to anon directly, which revoking from public does not undo.
revoke all on function public.my_invites() from public, anon;
grant execute on function public.my_invites() to authenticated;

revoke all on function public.create_household(text) from public, anon;
revoke all on function public.accept_invite(uuid) from public, anon;
revoke all on function public.household_people(uuid) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.household_people(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Who may use the tables at all. Row-level security above decides which rows;
-- this decides whether the API lets a role near the tables in the first place.
-- Written out rather than left to the project's defaults, which differ between
-- projects and have changed before. Someone not signed in gets nothing.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.households, public.household_members, public.household_invites,
  public.players, public.player_settings,
  public.matches, public.training_sessions, public.teams, public.competitions, public.results
  to authenticated;

revoke all on
  public.households, public.household_members, public.household_invites,
  public.players, public.player_settings,
  public.matches, public.training_sessions, public.teams, public.competitions, public.results
  from anon;

-- ===========================================================================
-- ACADEMIES
--
-- An academy is a club's own space: its staff, its squads, the players linked
-- to it, its competitions, and the team selections it makes. The rules below
-- are the whole of what keeps one academy, one family and one child's data
-- apart, so they are written once, here, and tested in academy-test.sql.
--
--   - Usernames are unique, ignoring case, and are how people are found.
--   - Staff have one role each: owner, manager, coach or admin. Admin is the
--     office or IT role: people and settings, never a player's stats.
--   - A player's records become readable by an academy only once the player's
--     family has said yes, and stop being readable the moment they leave.
--     A coach reads only the players in squads they coach.
--   - Nothing here lets anyone but the family write a player's records.
--   - Verification is set only by the app's own admins.
--
-- Every change that has a rule attached - joining, inviting, roles, leaving -
-- goes through a function rather than a direct write, so the rule cannot be
-- stepped around from the app.
-- ===========================================================================

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  -- Stored lowercase, so "Arjun_GK" and "arjun_gk" cannot both exist.
  username   text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.academies (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(btrim(name)) between 2 and 80),
  town              text not null default '' check (length(town) <= 80),
  country           text not null default '' check (length(country) <= 60),
  contact_email     text not null default '' check (length(contact_email) <= 120),
  age_groups        text[] not null default '{}',
  -- A small picture as a data URL, shrunk on the phone before it is sent.
  logo              text not null default '' check (length(logo) <= 200000),
  -- What a player types to ask to join.
  join_code         text not null unique,
  verification      text not null default 'unverified'
                      check (verification in ('unverified', 'pending', 'verified', 'rejected')),
  verification_note text not null default '',
  verified_at       timestamptz,
  -- Who made it, for the record. The owner is whoever academy_members says.
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create table if not exists public.academy_members (
  academy_id uuid not null references public.academies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'manager', 'coach', 'admin')),
  created_at timestamptz not null default now(),
  primary key (academy_id, user_id)
);
-- One owner per academy, always.
create unique index if not exists academy_one_owner on public.academy_members (academy_id) where role = 'owner';
create index if not exists academy_members_user_idx on public.academy_members (user_id);

create table if not exists public.academy_staff_invites (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('manager', 'coach', 'admin')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (academy_id, user_id)
);

-- Deleting an account must never be blocked by an academy it made or an
-- invite it sent. Repeated here for projects that ran an earlier draft of
-- this file, where both references refused the delete.
alter table public.academies alter column created_by drop not null;
alter table public.academies drop constraint if exists academies_created_by_fkey;
alter table public.academies add constraint academies_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
alter table public.academy_staff_invites drop constraint if exists academy_staff_invites_invited_by_fkey;
alter table public.academy_staff_invites add constraint academy_staff_invites_invited_by_fkey
  foreign key (invited_by) references auth.users(id) on delete cascade;

create table if not exists public.academy_squads (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  age_group  text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.squad_coaches (
  squad_id uuid not null references public.academy_squads(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  primary key (squad_id, user_id)
);

-- Everyone on an academy's books: a Matchday player linked to it, a player
-- invited or asking to join, or just a name for someone without the app.
create table if not exists public.academy_players (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id) on delete cascade,
  player_id    uuid references public.players(id) on delete set null,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  position     text not null default '',
  age_group    text not null default '',
  status       text not null check (status in ('roster', 'invited', 'requested', 'linked', 'declined', 'left')),
  invited_by   uuid references auth.users(id) on delete set null,
  -- Who said yes on the player's side - the player, or a parent - and when.
  consent_by   uuid references auth.users(id) on delete set null,
  consent_at   timestamptz,
  created_at   timestamptz not null default now()
);
-- A player can be invited to, asking to join, or linked to an academy once.
create unique index if not exists academy_players_one_link
  on public.academy_players (academy_id, player_id)
  where player_id is not null and status in ('invited', 'requested', 'linked');
create index if not exists academy_players_player_idx on public.academy_players (player_id);

create table if not exists public.squad_players (
  squad_id          uuid not null references public.academy_squads(id) on delete cascade,
  academy_player_id uuid not null references public.academy_players(id) on delete cascade,
  primary key (squad_id, academy_player_id)
);

create table if not exists public.academy_competitions (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  squad_id    uuid references public.academy_squads(id) on delete set null,
  name        text not null check (length(btrim(name)) between 1 and 80),
  type        text not null default 'league' check (type in ('league', 'cup', 'tournament', 'friendly', 'other')),
  season      text not null default '',
  -- What the academy's side is called in this competition's table.
  team_name   text not null default '',
  points_win  integer not null default 3 check (points_win between 0 and 10),
  points_draw integer not null default 1 check (points_draw between 0 and 10),
  created_at  timestamptz not null default now()
);

create table if not exists public.academy_results (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.academy_competitions(id) on delete cascade,
  home           text not null check (length(btrim(home)) between 1 and 80),
  away           text not null check (length(btrim(away)) between 1 and 80),
  home_goals     integer check (home_goals between 0 and 99),
  away_goals     integer check (away_goals between 0 and 99),
  date           text not null default '',
  stage          text check (stage in ('group', 'round', 'last16', 'quarter', 'semi', 'third', 'final')),
  stage_detail   text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((home_goals is null) = (away_goals is null))
);

create table if not exists public.academy_selections (
  id                 uuid primary key default gen_random_uuid(),
  academy_id         uuid not null references public.academies(id) on delete cascade,
  squad_id           uuid references public.academy_squads(id) on delete set null,
  name               text not null check (length(btrim(name)) between 1 and 80),
  academy_player_ids uuid[] not null default '{}',
  notes              text not null default '',
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Certificates for verification, as data URLs: photos are shrunk on the phone
-- first, and a PDF is limited to about 2 MB. Kept in the database so the same
-- access rules and the same tests cover them.
create table if not exists public.academy_documents (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  kind        text not null check (kind in ('registration', 'coaching', 'safeguarding', 'other')),
  file_name   text not null check (length(file_name) <= 200),
  mime        text not null check (mime in ('image/jpeg', 'image/png', 'application/pdf')),
  data        text not null check (length(data) <= 3000000),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- The app's own admins: whoever runs Matchday, who review academies. Added by
-- hand in the SQL editor - nothing in the app can add one.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.app_settings (
  id                   boolean primary key default true check (id),
  -- When on, an academy must be verified before it can take on any player.
  require_verification boolean not null default false
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Who someone is to an academy.
-- ---------------------------------------------------------------------------

create or replace function public.is_app_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- The caller's role in an academy, or null.
create or replace function public.academy_role(aid uuid)
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select role from public.academy_members where academy_id = aid and user_id = auth.uid();
$$;

create or replace function public.is_academy_staff(aid uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.academy_role(aid) is not null;
$$;

-- Owners and managers run things: squads, players, staff, competitions.
create or replace function public.runs_academy(aid uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(public.academy_role(aid) in ('owner', 'manager'), false);
$$;

-- Everyone who works with players - not the admin role.
create or replace function public.coaches_at(aid uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(public.academy_role(aid) in ('owner', 'manager', 'coach'), false);
$$;

-- Whether the caller coaches this squad, and still coaches at its academy.
create or replace function public.coaches_squad(sid uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.squad_coaches sc
    join public.academy_squads s on s.id = sc.squad_id
    where sc.squad_id = sid and sc.user_id = auth.uid() and public.coaches_at(s.academy_id)
  );
$$;

-- The office side: the academy's details and its staff. Owners, managers, and
-- the admin role - who never see a player's stats.
create or replace function public.manages_staff(aid uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(public.academy_role(aid) in ('owner', 'manager', 'admin'), false);
$$;

-- The one rule that opens a player's records to an academy: linked, with the
-- family's yes, and read by an owner or manager, or by a coach of one of the
-- squads the player is in.
create or replace function public.can_view_player(pid uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.academy_players ap
    join public.academy_members am on am.academy_id = ap.academy_id and am.user_id = auth.uid()
    where ap.player_id = pid
      and ap.status = 'linked'
      and (
        am.role in ('owner', 'manager')
        or (am.role = 'coach' and exists (
          select 1
          from public.squad_players sp
          join public.squad_coaches sc on sc.squad_id = sp.squad_id
          where sp.academy_player_id = ap.id and sc.user_id = auth.uid()
        ))
      )
  );
$$;

-- A family whose player is linked to the academy: they see its tables.
create or replace function public.is_linked_to_academy(aid uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.academy_players ap
    where ap.academy_id = aid and ap.status = 'linked' and public.owns_player(ap.player_id)
  );
$$;

-- The player behind someone's account: the one in the household they joined last.
create or replace function public.player_of(uid uuid)
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.id
  from public.household_members m
  join public.players p on p.household_id = m.household_id
  where m.user_id = uid
  order by m.created_at desc, p.created_at asc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Access rules for the academy tables.
-- ---------------------------------------------------------------------------

alter table public.profiles              enable row level security;
alter table public.academies             enable row level security;
alter table public.academy_members       enable row level security;
alter table public.academy_staff_invites enable row level security;
alter table public.academy_squads        enable row level security;
alter table public.squad_coaches         enable row level security;
alter table public.academy_players       enable row level security;
alter table public.squad_players         enable row level security;
alter table public.academy_competitions  enable row level security;
alter table public.academy_results       enable row level security;
alter table public.academy_selections    enable row level security;
alter table public.academy_documents     enable row level security;
alter table public.app_admins            enable row level security;
alter table public.app_settings          enable row level security;

drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles
  for select using (user_id = auth.uid());

drop policy if exists academies_read on public.academies;
create policy academies_read on public.academies
  for select using (public.is_academy_staff(id) or public.is_linked_to_academy(id) or public.is_app_admin());
drop policy if exists academies_edit on public.academies;
create policy academies_edit on public.academies
  for update using (public.manages_staff(id)) with check (public.manages_staff(id));
drop policy if exists academies_delete on public.academies;
create policy academies_delete on public.academies
  for delete using (public.academy_role(id) = 'owner');

drop policy if exists members_read on public.academy_members;
create policy members_read on public.academy_members
  for select using (public.is_academy_staff(academy_id));

drop policy if exists staff_invites_read on public.academy_staff_invites;
create policy staff_invites_read on public.academy_staff_invites
  for select using (public.is_academy_staff(academy_id) or user_id = auth.uid());
drop policy if exists staff_invites_cancel on public.academy_staff_invites;
create policy staff_invites_cancel on public.academy_staff_invites
  for delete using (public.manages_staff(academy_id) or user_id = auth.uid());

drop policy if exists squads_read on public.academy_squads;
create policy squads_read on public.academy_squads
  for select using (public.is_academy_staff(academy_id));
drop policy if exists squads_write on public.academy_squads;
create policy squads_write on public.academy_squads
  for all using (public.runs_academy(academy_id)) with check (public.runs_academy(academy_id));

drop policy if exists squad_coaches_read on public.squad_coaches;
create policy squad_coaches_read on public.squad_coaches
  for select using (exists (
    select 1 from public.academy_squads s where s.id = squad_id and public.is_academy_staff(s.academy_id)
  ));
drop policy if exists squad_coaches_write on public.squad_coaches;
create policy squad_coaches_write on public.squad_coaches
  for all using (exists (
    select 1 from public.academy_squads s where s.id = squad_id and public.runs_academy(s.academy_id)
  )) with check (exists (
    select 1 from public.academy_squads s
    where s.id = squad_id and public.runs_academy(s.academy_id) and exists (
      select 1 from public.academy_members m where m.academy_id = s.academy_id and m.user_id = squad_coaches.user_id
    )
  ));

-- The roster: staff see it; a family sees its own player's rows.
drop policy if exists academy_players_read on public.academy_players;
create policy academy_players_read on public.academy_players
  for select using (public.is_academy_staff(academy_id) or (player_id is not null and public.owns_player(player_id)));
-- Staff who work with players add names to the roster; linking is never a
-- direct write - it goes through the functions below.
drop policy if exists academy_players_add on public.academy_players;
create policy academy_players_add on public.academy_players
  for insert with check (public.coaches_at(academy_id) and status = 'roster' and player_id is null and consent_by is null);
drop policy if exists academy_players_edit on public.academy_players;
create policy academy_players_edit on public.academy_players
  for update using (public.coaches_at(academy_id)) with check (public.coaches_at(academy_id));
drop policy if exists academy_players_remove on public.academy_players;
create policy academy_players_remove on public.academy_players
  for delete using (public.runs_academy(academy_id));

drop policy if exists squad_players_read on public.squad_players;
create policy squad_players_read on public.squad_players
  for select using (exists (
    select 1 from public.academy_squads s where s.id = squad_id and public.is_academy_staff(s.academy_id)
  ));
drop policy if exists squad_players_write on public.squad_players;
create policy squad_players_write on public.squad_players
  for all using (exists (
    select 1 from public.academy_squads s where s.id = squad_id and public.runs_academy(s.academy_id)
  )) with check (exists (
    select 1
    from public.academy_squads s
    join public.academy_players ap on ap.id = academy_player_id and ap.academy_id = s.academy_id
    where s.id = squad_id and public.runs_academy(s.academy_id)
  ));
-- A coach brings new players into the squads they coach: a name with no app,
-- or someone invited or asking to join. Not a player already linked, whose
-- stats being in the squad would open to them - moving those is for the
-- owner and managers.
drop policy if exists squad_players_coach_add on public.squad_players;
create policy squad_players_coach_add on public.squad_players
  for insert with check (public.coaches_squad(squad_id) and exists (
    select 1
    from public.academy_squads s
    join public.academy_players ap on ap.id = academy_player_id and ap.academy_id = s.academy_id
    where s.id = squad_id and ap.status in ('roster', 'invited', 'requested')
  ));
drop policy if exists squad_players_coach_remove on public.squad_players;
create policy squad_players_coach_remove on public.squad_players
  for delete using (public.coaches_squad(squad_id));

drop policy if exists competitions_read on public.academy_competitions;
create policy competitions_read on public.academy_competitions
  for select using (public.is_academy_staff(academy_id) or public.is_linked_to_academy(academy_id));
drop policy if exists competitions_write on public.academy_competitions;
create policy competitions_write on public.academy_competitions
  for all using (public.coaches_at(academy_id)) with check (public.coaches_at(academy_id));

drop policy if exists results_read on public.academy_results;
create policy results_read on public.academy_results
  for select using (exists (
    select 1 from public.academy_competitions c
    where c.id = competition_id and (public.is_academy_staff(c.academy_id) or public.is_linked_to_academy(c.academy_id))
  ));
drop policy if exists results_write on public.academy_results;
create policy results_write on public.academy_results
  for all using (exists (
    select 1 from public.academy_competitions c where c.id = competition_id and public.coaches_at(c.academy_id)
  )) with check (exists (
    select 1 from public.academy_competitions c where c.id = competition_id and public.coaches_at(c.academy_id)
  ));

drop policy if exists selections_all on public.academy_selections;
create policy selections_all on public.academy_selections
  for all using (public.coaches_at(academy_id)) with check (public.coaches_at(academy_id));

-- Certificates: the owner who sent them, and the app's admins who check them.
drop policy if exists documents_read on public.academy_documents;
create policy documents_read on public.academy_documents
  for select using (public.academy_role(academy_id) = 'owner' or public.is_app_admin());
drop policy if exists documents_add on public.academy_documents;
create policy documents_add on public.academy_documents
  for insert with check (public.academy_role(academy_id) = 'owner' and uploaded_by = auth.uid());
drop policy if exists documents_remove on public.academy_documents;
create policy documents_remove on public.academy_documents
  for delete using (public.academy_role(academy_id) = 'owner');

drop policy if exists app_admins_self on public.app_admins;
create policy app_admins_self on public.app_admins
  for select using (user_id = auth.uid());

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select using (true);
drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings
  for update using (public.is_app_admin()) with check (public.is_app_admin());

-- A linked player's records, readable - never writable - by the academy.
-- These sit beside the family's own rules; Postgres allows a row if any
-- policy for that command does, and none of these covers a write.
drop policy if exists players_academy_read on public.players;
create policy players_academy_read on public.players for select using (public.can_view_player(id));
drop policy if exists player_settings_academy_read on public.player_settings;
create policy player_settings_academy_read on public.player_settings for select using (public.can_view_player(player_id));
drop policy if exists matches_academy_read on public.matches;
create policy matches_academy_read on public.matches for select using (public.can_view_player(player_id));
drop policy if exists training_academy_read on public.training_sessions;
create policy training_academy_read on public.training_sessions for select using (public.can_view_player(player_id));
drop policy if exists teams_academy_read on public.teams;
create policy teams_academy_read on public.teams for select using (public.can_view_player(player_id));
drop policy if exists competitions_academy_read on public.competitions;
create policy competitions_academy_read on public.competitions for select using (public.can_view_player(player_id));
drop policy if exists results_academy_read on public.results;
create policy results_academy_read on public.results for select using (public.can_view_player(player_id));

-- ---------------------------------------------------------------------------
-- Usernames.
-- ---------------------------------------------------------------------------

create or replace function public.username_problem(name text)
returns text
language sql
immutable
as $$
  select case
    when lower(btrim(coalesce(name, ''))) !~ '^[a-z0-9_]{3,20}$'
      then '3 to 20 letters, numbers or _'
    when lower(btrim(name)) in ('admin', 'administrator', 'matchday', 'support', 'help', 'root', 'system',
                                 'academy', 'staff', 'owner', 'coach', 'manager', 'moderator', 'null', 'undefined')
      then 'That one is reserved'
    else null
  end;
$$;

create or replace function public.username_available(name text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.username_problem(name) is null
     and not exists (
       select 1 from public.profiles
       where username = lower(btrim(name)) and user_id is distinct from auth.uid()
     );
$$;

-- Takes a username, or changes the caller's. Errors say what is wrong.
create or replace function public.claim_username(name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  wanted text := lower(btrim(coalesce(name, '')));
  problem text := public.username_problem(name);
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if problem is not null then raise exception '%', problem; end if;
  begin
    insert into public.profiles (user_id, username) values (auth.uid(), wanted)
    on conflict (user_id) do update set username = excluded.username;
  exception when unique_violation then
    raise exception 'That username is taken';
  end;
  return wanted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Academies, staff and roles.
-- ---------------------------------------------------------------------------

-- A join code no academy has: six characters from an alphabet without 0/O or
-- 1/I, so it can be read out loud at a training session.
create or replace function public.fresh_join_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  code text;
begin
  loop
    code := (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from public.academies where join_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.create_academy(
  name text, town text default '', country text default '', contact_email text default '',
  age_groups text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  aid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if length(btrim(coalesce(name, ''))) < 2 then raise exception 'Give the academy a name'; end if;

  insert into public.academies (name, town, country, contact_email, age_groups, join_code, created_by)
  values (btrim(name), coalesce(btrim(town), ''), coalesce(btrim(country), ''), coalesce(btrim(contact_email), ''),
          coalesce(age_groups, '{}'), public.fresh_join_code(), auth.uid())
  returning id into aid;

  insert into public.academy_members (academy_id, user_id, role) values (aid, auth.uid(), 'owner');
  return aid;
end;
$$;

-- A new code, if the old one got passed around further than it should have.
-- Requests already made with the old one still stand.
create or replace function public.new_join_code(aid uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  code text;
begin
  if not public.runs_academy(aid) then raise exception 'Only the owner or a manager can change the join code'; end if;
  code := public.fresh_join_code();
  update public.academies set join_code = code where id = aid;
  return code;
end;
$$;

create or replace function public.user_by_username(name text)
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select user_id from public.profiles where username = lower(btrim(coalesce(name, '')));
$$;

-- Owners invite managers; the owner, managers and the admin role invite
-- coaches and admins.
create or replace function public.invite_staff(aid uuid, username text, role text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me text := public.academy_role(aid);
  target uuid := public.user_by_username(username);
  iid uuid;
begin
  if not public.manages_staff(aid) then raise exception 'Only the owner, a manager or an admin can invite staff'; end if;
  if role is null or role not in ('manager', 'coach', 'admin') then raise exception 'Pick a role for them'; end if;
  if role = 'manager' and me <> 'owner' then raise exception 'Only the owner can invite a manager'; end if;
  if target is null then raise exception 'No one has that username'; end if;
  if exists (select 1 from public.academy_members where academy_id = aid and user_id = target) then
    raise exception 'They are already staff here';
  end if;
  insert into public.academy_staff_invites (academy_id, user_id, role, invited_by)
  values (aid, target, role, auth.uid())
  on conflict (academy_id, user_id) do update set role = excluded.role, invited_by = excluded.invited_by
  returning id into iid;
  return iid;
end;
$$;

-- Staff invites waiting for the caller, with the academy's name, town and badge.
-- Dropped first because its columns grew; re-running the file must still work.
drop function if exists public.my_staff_invites();
create function public.my_staff_invites()
returns table (id uuid, academy_id uuid, academy_name text, town text, verification text, role text, invited_by text)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select i.id, a.id, a.name, a.town, a.verification, i.role, coalesce(p.username, '')
  from public.academy_staff_invites i
  join public.academies a on a.id = i.academy_id
  left join public.profiles p on p.user_id = i.invited_by
  where i.user_id = auth.uid()
  order by i.created_at desc;
$$;

-- Invites the academy has sent and nobody has answered yet, by username.
create or replace function public.pending_staff(aid uuid)
returns table (id uuid, username text, role text, invited_by text)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select i.id, coalesce(p.username, ''), i.role, coalesce(b.username, '')
  from public.academy_staff_invites i
  left join public.profiles p on p.user_id = i.user_id
  left join public.profiles b on b.user_id = i.invited_by
  where i.academy_id = aid and public.is_academy_staff(aid)
  order by i.created_at;
$$;

create or replace function public.answer_staff_invite(invite_id uuid, accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv public.academy_staff_invites;
begin
  select * into inv from public.academy_staff_invites where id = invite_id and user_id = auth.uid();
  if inv is null then raise exception 'That invite has gone - it may have been cancelled'; end if;
  if accept then
    insert into public.academy_members (academy_id, user_id, role) values (inv.academy_id, auth.uid(), inv.role)
    on conflict (academy_id, user_id) do nothing;
  end if;
  delete from public.academy_staff_invites where id = inv.id;
  return inv.academy_id;
end;
$$;

-- The academy's staff by username, for its Staff screen.
create or replace function public.academy_staff(aid uuid)
returns table (user_id uuid, username text, role text, is_me boolean)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select m.user_id, coalesce(p.username, ''), m.role, m.user_id = auth.uid()
  from public.academy_members m
  left join public.profiles p on p.user_id = m.user_id
  where m.academy_id = aid and public.is_academy_staff(aid)
  order by case m.role when 'owner' then 0 when 'manager' then 1 when 'coach' then 2 else 3 end, p.username;
$$;

-- The owner changes anyone's role but their own; managers and the admin role
-- move people between coach and admin. Nobody changes their own.
create or replace function public.set_staff_role(aid uuid, member uuid, role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me text := public.academy_role(aid);
  theirs text;
begin
  select m.role into theirs from public.academy_members m where m.academy_id = aid and m.user_id = member;
  if theirs is null then raise exception 'They are not on the staff here'; end if;
  if role is null or role not in ('manager', 'coach', 'admin') then raise exception 'Pick a role for them'; end if;
  if theirs = 'owner' then raise exception 'Hand over ownership instead'; end if;
  if member = auth.uid() then raise exception 'Ask the owner to change your own role'; end if;
  if me = 'owner' or (me in ('manager', 'admin') and theirs in ('coach', 'admin') and role in ('coach', 'admin')) then
    update public.academy_members m set role = set_staff_role.role where m.academy_id = aid and m.user_id = member;
  else
    raise exception 'You cannot change that role';
  end if;
end;
$$;

-- Removing staff, or leaving. The owner hands over before going.
create or replace function public.remove_staff(aid uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me text := public.academy_role(aid);
  theirs text;
begin
  select m.role into theirs from public.academy_members m where m.academy_id = aid and m.user_id = member;
  if theirs is null then raise exception 'They are not on the staff here'; end if;
  if theirs = 'owner' then raise exception 'The owner hands over ownership before leaving'; end if;
  if not (member = auth.uid() or me = 'owner' or (me in ('manager', 'admin') and theirs in ('coach', 'admin'))) then
    raise exception 'You cannot remove them';
  end if;
  delete from public.squad_coaches sc
  using public.academy_squads s
  where sc.squad_id = s.id and s.academy_id = aid and sc.user_id = member;
  delete from public.academy_members m where m.academy_id = aid and m.user_id = member;
end;
$$;

create or replace function public.transfer_ownership(aid uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.academy_role(aid) is distinct from 'owner' then raise exception 'Only the owner can hand over'; end if;
  if not exists (select 1 from public.academy_members m where m.academy_id = aid and m.user_id = member and m.user_id <> auth.uid()) then
    raise exception 'Hand over to someone already on the staff';
  end if;
  update public.academy_members m set role = 'manager' where m.academy_id = aid and m.user_id = auth.uid();
  update public.academy_members m set role = 'owner' where m.academy_id = aid and m.user_id = member;
end;
$$;

-- ---------------------------------------------------------------------------
-- Players joining and leaving.
-- ---------------------------------------------------------------------------

create or replace function public.can_take_players(aid uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select not (select require_verification from public.app_settings)
      or exists (select 1 from public.academies where id = aid and verification = 'verified');
$$;

-- The academy invites a player by username. Their family says yes or no.
-- Pass a roster row to link a name already on the books, and a squad to put
-- them straight into one. Dropped first because it gained the squad.
drop function if exists public.invite_player(uuid, text, uuid);
create or replace function public.invite_player(aid uuid, username text, roster_id uuid default null, squad uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid := public.user_by_username(username);
  pid uuid;
  pname text;
  apid uuid;
begin
  if not public.coaches_at(aid) then raise exception 'Only coaching staff can add players'; end if;
  if squad is not null then
    if not exists (select 1 from public.academy_squads s where s.id = squad and s.academy_id = aid) then
      raise exception 'That squad is not at this academy';
    end if;
    if not (public.runs_academy(aid) or public.coaches_squad(squad)) then
      raise exception 'You can only add players to squads you coach';
    end if;
  end if;
  if not public.can_take_players(aid) then raise exception 'This academy needs to be verified before it can add players'; end if;
  if target is null then raise exception 'No one has that username'; end if;
  pid := public.player_of(target);
  if pid is null then
    raise exception 'They need to sign in to Matchday on their phone once first, so there is a player to link';
  end if;
  if exists (select 1 from public.academy_players where academy_id = aid and player_id = pid and status in ('invited', 'requested', 'linked')) then
    raise exception 'They are already invited or linked';
  end if;
  select coalesce(nullif(btrim(p.data ->> 'name'), ''), lower(btrim(username))) into pname from public.players p where p.id = pid;

  if roster_id is not null then
    update public.academy_players
       set player_id = pid, status = 'invited', invited_by = auth.uid(), consent_by = null, consent_at = null
     where id = roster_id and academy_id = aid and status in ('roster', 'declined', 'left')
    returning id into apid;
    if apid is null then raise exception 'That roster entry cannot be linked'; end if;
  else
    insert into public.academy_players (academy_id, player_id, display_name, position, age_group, status, invited_by)
    select aid, pid, pname, coalesce(p.data ->> 'position', ''), coalesce(p.data ->> 'ageGroup', ''), 'invited', auth.uid()
    from public.players p where p.id = pid
    returning id into apid;
  end if;
  if squad is not null then
    insert into public.squad_players (squad_id, academy_player_id) values (squad, apid) on conflict do nothing;
  end if;
  return apid;
end;
$$;

-- Asking to join with the academy's code: the family says yes by asking; the
-- academy then accepts.
create or replace function public.join_by_code(code text, consent boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  aid uuid;
  pid uuid := public.player_of(auth.uid());
  apid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not coalesce(consent, false) then raise exception 'Agree to share your matches and stats with the academy first'; end if;
  select id into aid from public.academies where join_code = upper(btrim(coalesce(code, '')));
  if aid is null then raise exception 'No academy has that code'; end if;
  if pid is null then raise exception 'Sign in on your own phone first, so there is a player to link'; end if;
  if not public.can_take_players(aid) then raise exception 'This academy is not verified yet, so it cannot take players'; end if;
  select id into apid from public.academy_players
   where academy_id = aid and player_id = pid and status in ('invited', 'requested', 'linked');
  if apid is not null then return apid; end if;

  insert into public.academy_players (academy_id, player_id, display_name, position, age_group, status, consent_by, consent_at)
  select aid, pid, coalesce(nullif(btrim(p.data ->> 'name'), ''), 'Player'), coalesce(p.data ->> 'position', ''),
         coalesce(p.data ->> 'ageGroup', ''), 'requested', auth.uid(), now()
  from public.players p where p.id = pid
  returning id into apid;
  return apid;
end;
$$;

-- Invites waiting for the caller's family, with who is asking.
create or replace function public.my_player_invites()
returns table (id uuid, academy_id uuid, academy_name text, verification text, town text, invited_by text)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select ap.id, a.id, a.name, a.verification, a.town, coalesce(p.username, '')
  from public.academy_players ap
  join public.academies a on a.id = ap.academy_id
  left join public.profiles p on p.user_id = ap.invited_by
  where ap.status = 'invited' and public.owns_player(ap.player_id)
  order by ap.created_at desc;
$$;

-- The family's answer. Saying yes needs their consent, recorded with who gave it.
create or replace function public.answer_player_invite(invite_id uuid, accept boolean, consent boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec public.academy_players;
begin
  select * into rec from public.academy_players where id = invite_id and status = 'invited';
  if not found or not public.owns_player(rec.player_id) then raise exception 'That invite has gone - the academy may have cancelled it'; end if;
  if accept and not coalesce(consent, false) then raise exception 'Agree to share your matches and stats with the academy first'; end if;
  if accept and not public.can_take_players(rec.academy_id) then
    raise exception 'This academy is not verified yet, so it cannot take players';
  end if;
  update public.academy_players
     set status = case when accept then 'linked' else 'declined' end,
         consent_by = case when accept then auth.uid() else null end,
         consent_at = case when accept then now() else null end,
         player_id = case when accept then player_id else null end
   where id = rec.id;
  if not accept then delete from public.squad_players where academy_player_id = rec.id; end if;
end;
$$;

-- The academy's answer to someone asking to join, and which squad they go
-- into. Dropped first because it gained the squad.
drop function if exists public.answer_join_request(uuid, boolean);
create or replace function public.answer_join_request(request_id uuid, accept boolean, squad uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec public.academy_players;
begin
  select * into rec from public.academy_players where id = request_id and status = 'requested';
  if not found or not public.coaches_at(rec.academy_id) then raise exception 'That request has gone - they may have cancelled it'; end if;
  if accept and squad is not null then
    if not exists (select 1 from public.academy_squads s where s.id = squad and s.academy_id = rec.academy_id) then
      raise exception 'That squad is not at this academy';
    end if;
    if not (public.runs_academy(rec.academy_id) or public.coaches_squad(squad)) then
      raise exception 'You can only add players to squads you coach';
    end if;
  end if;
  if accept and not public.can_take_players(rec.academy_id) then
    raise exception 'This academy needs to be verified before it can add players';
  end if;
  update public.academy_players
     set status = case when accept then 'linked' else 'declined' end,
         player_id = case when accept then player_id else null end
   where id = rec.id;
  if accept and squad is not null then
    insert into public.squad_players (squad_id, academy_player_id) values (squad, rec.id) on conflict do nothing;
  end if;
  if not accept then delete from public.squad_players where academy_player_id = rec.id; end if;
end;
$$;

-- The family leaves, or takes back a request to join. Leaving, the academy
-- keeps the name on its books, marked as left, out of every squad - and loses
-- sight of the player's records at once. A request taken back just goes.
create or replace function public.leave_academy(link_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec public.academy_players;
begin
  select * into rec from public.academy_players where id = link_id;
  if not found or rec.player_id is null or not public.owns_player(rec.player_id) then
    raise exception 'That has already gone';
  end if;
  delete from public.squad_players where academy_player_id = rec.id;
  if rec.status = 'requested' then
    delete from public.academy_players where id = rec.id;
  else
    update public.academy_players
       set status = case when rec.status = 'invited' then 'declined' else 'left' end, player_id = null
     where id = rec.id;
  end if;
end;
$$;

-- Requests to join that the caller's family has sent and no academy has answered.
create or replace function public.my_join_requests()
returns table (id uuid, academy_id uuid, academy_name text, town text, verification text)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select ap.id, a.id, a.name, a.town, a.verification
  from public.academy_players ap
  join public.academies a on a.id = ap.academy_id
  where ap.status = 'requested' and public.owns_player(ap.player_id)
  order by ap.created_at desc;
$$;

-- What a family sees of its academies: the academy, the player's squads and
-- squad mates' names - no one else's stats.
create or replace function public.my_academies()
returns table (link_id uuid, academy_id uuid, academy_name text, verification text, town text, logo text,
               squad_id uuid, squad_name text, mates text[])
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select ap.id, a.id, a.name, a.verification, a.town, a.logo, s.id, s.name,
         array(
           select other.display_name
           from public.squad_players sp2
           join public.academy_players other on other.id = sp2.academy_player_id
           where sp2.squad_id = s.id and other.id <> ap.id and other.status in ('linked', 'roster')
           order by other.display_name
         )
  from public.academy_players ap
  join public.academies a on a.id = ap.academy_id
  left join public.squad_players sp on sp.academy_player_id = ap.id
  left join public.academy_squads s on s.id = sp.squad_id
  where ap.status = 'linked' and public.owns_player(ap.player_id)
  order by a.name, s.name;
$$;

-- ---------------------------------------------------------------------------
-- Verification.
-- ---------------------------------------------------------------------------

create or replace function public.submit_for_review(aid uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.academy_role(aid) is distinct from 'owner' then raise exception 'Only the owner can ask for verification'; end if;
  if not exists (select 1 from public.academy_documents where academy_id = aid) then
    raise exception 'Upload at least one certificate first';
  end if;
  update public.academies set verification = 'pending', verification_note = ''
   where id = aid and verification <> 'verified';
end;
$$;

create or replace function public.review_academy(aid uuid, approve boolean, note text default '')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_app_admin() then raise exception 'Only Matchday''s admins review academies'; end if;
  update public.academies
     set verification = case when approve then 'verified' else 'rejected' end,
         verification_note = coalesce(note, ''),
         verified_at = case when approve then now() else null end
   where id = aid;
end;
$$;

-- The badge vouches for who the academy said it was. Changing that - its
-- name, its town or country, its logo - sends it back for another look, so
-- a verified academy cannot rename itself into someone else and keep the
-- tick. Its contact email and age groups can change freely.
create or replace function public.recheck_identity()
returns trigger
language plpgsql
as $$
begin
  if old.verification = 'verified' and (
       new.name is distinct from old.name or new.town is distinct from old.town
       or new.country is distinct from old.country or new.logo is distinct from old.logo
     ) then
    new.verification := 'pending';
    new.verification_note := 'Its name, place or logo changed - Matchday checks it again';
    new.verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists academies_recheck_identity on public.academies;
create trigger academies_recheck_identity
  before update on public.academies
  for each row execute function public.recheck_identity();

-- For the admin screen: academies waiting, and every other one, newest first.
create or replace function public.academies_for_review()
returns table (id uuid, name text, town text, country text, contact_email text, verification text,
               verification_note text, owner text, documents integer, created_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select a.id, a.name, a.town, a.country, a.contact_email, a.verification, a.verification_note,
         coalesce((select p.username from public.academy_members m join public.profiles p on p.user_id = m.user_id
                   where m.academy_id = a.id and m.role = 'owner'), ''),
         (select count(*)::integer from public.academy_documents d where d.academy_id = a.id),
         a.created_at
  from public.academies a
  where public.is_app_admin()
  order by (a.verification = 'pending') desc, a.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Who may reach the academy tables at all, as for the family tables above.
-- Most changes go through the functions; direct writes are granted only where
-- a rule above covers them, and only to the columns that rule is about.
-- ---------------------------------------------------------------------------

revoke all on
  public.profiles, public.academies, public.academy_members, public.academy_staff_invites,
  public.academy_squads, public.squad_coaches, public.academy_players, public.squad_players,
  public.academy_competitions, public.academy_results, public.academy_selections,
  public.academy_documents, public.app_admins, public.app_settings
  from anon, authenticated;

grant select on
  public.profiles, public.academies, public.academy_members, public.academy_staff_invites,
  public.academy_squads, public.squad_coaches, public.academy_players, public.squad_players,
  public.academy_competitions, public.academy_results, public.academy_selections,
  public.academy_documents, public.app_admins, public.app_settings
  to authenticated;

-- An academy's own details; never its verification, code or creator.
grant update (name, town, country, contact_email, age_groups, logo) on public.academies to authenticated;
grant delete on public.academies to authenticated;
grant delete on public.academy_staff_invites to authenticated;
grant insert, update, delete on public.academy_squads, public.squad_coaches, public.squad_players to authenticated;
grant insert (academy_id, display_name, position, age_group, status) on public.academy_players to authenticated;
grant update (display_name, position, age_group) on public.academy_players to authenticated;
grant delete on public.academy_players to authenticated;
grant insert, update, delete on public.academy_competitions, public.academy_results, public.academy_selections to authenticated;
grant insert (academy_id, kind, file_name, mime, data, uploaded_by), delete on public.academy_documents to authenticated;
grant update (require_verification) on public.app_settings to authenticated;

-- Used only inside the functions above, which run as their owner. Nobody
-- calls them directly: one turns a username into an account id.
revoke all on function
  public.player_of(uuid), public.user_by_username(text), public.can_take_players(uuid), public.username_problem(text),
  public.fresh_join_code()
  from public, anon, authenticated;

-- The helper checks run inside the rules; the actions are called by the app.
revoke all on function
  public.is_app_admin(), public.academy_role(uuid), public.is_academy_staff(uuid), public.runs_academy(uuid),
  public.coaches_at(uuid), public.coaches_squad(uuid), public.manages_staff(uuid), public.can_view_player(uuid), public.is_linked_to_academy(uuid),
  public.player_of(uuid), public.user_by_username(text), public.can_take_players(uuid),
  public.username_available(text), public.claim_username(text),
  public.create_academy(text, text, text, text, text[]), public.new_join_code(uuid), public.invite_staff(uuid, text, text),
  public.my_staff_invites(), public.pending_staff(uuid), public.answer_staff_invite(uuid, boolean), public.academy_staff(uuid),
  public.set_staff_role(uuid, uuid, text), public.remove_staff(uuid, uuid), public.transfer_ownership(uuid, uuid),
  public.invite_player(uuid, text, uuid, uuid), public.join_by_code(text, boolean), public.my_player_invites(),
  public.answer_player_invite(uuid, boolean, boolean), public.answer_join_request(uuid, boolean, uuid),
  public.leave_academy(uuid), public.my_join_requests(), public.my_academies(), public.submit_for_review(uuid),
  public.review_academy(uuid, boolean, text), public.academies_for_review()
  from public, anon;

grant execute on function
  public.is_app_admin(), public.academy_role(uuid), public.is_academy_staff(uuid), public.runs_academy(uuid),
  public.coaches_at(uuid), public.coaches_squad(uuid), public.manages_staff(uuid), public.can_view_player(uuid), public.is_linked_to_academy(uuid),
  public.username_available(text), public.claim_username(text),
  public.create_academy(text, text, text, text, text[]), public.new_join_code(uuid), public.invite_staff(uuid, text, text),
  public.my_staff_invites(), public.pending_staff(uuid), public.answer_staff_invite(uuid, boolean), public.academy_staff(uuid),
  public.set_staff_role(uuid, uuid, text), public.remove_staff(uuid, uuid), public.transfer_ownership(uuid, uuid),
  public.invite_player(uuid, text, uuid, uuid), public.join_by_code(text, boolean), public.my_player_invites(),
  public.answer_player_invite(uuid, boolean, boolean), public.answer_join_request(uuid, boolean, uuid),
  public.leave_academy(uuid), public.my_join_requests(), public.my_academies(), public.submit_for_review(uuid),
  public.review_academy(uuid, boolean, text), public.academies_for_review()
  to authenticated;

-- Which version of this file a project has, so a check can tell whether the
-- latest one was run. Bump it with any change the app depends on.
--   1  households, players and their records
--   2  other teams' results, for competition tables
--   3  academies, first draft
--   4  academies: squads, linking, tables, team picks and verification
create or replace function public.schema_version()
returns integer
language sql
immutable
as $$ select 4 $$;

revoke all on function public.schema_version() from public;
grant execute on function public.schema_version() to anon, authenticated;
