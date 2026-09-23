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

-- Pulling only what changed since the last sync is the common query, on every
-- table, so each gets the same index.
create index if not exists matches_since_idx on public.matches (player_id, updated_at);
create index if not exists training_since_idx on public.training_sessions (player_id, updated_at);
create index if not exists teams_since_idx on public.teams (player_id, updated_at);
create index if not exists competitions_since_idx on public.competitions (player_id, updated_at);
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

revoke all on function public.create_household(text) from public;
revoke all on function public.accept_invite(uuid) from public;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
