-- Minimal stand-in for the pieces of Supabase the schema leans on.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);

-- These match Supabase's own definitions: PostgREST sets request.jwt.claims
-- (the whole token as JSON); older setups set request.jwt.claim.sub.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- The roles Supabase's API layer switches between: anon before sign-in,
-- authenticated after, and authenticator, which PostgREST logs in as.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password 'local-only';
  end if;
end $$;
grant anon, authenticated to authenticator;

grant usage on schema public, auth to anon, authenticated;
-- No grant on auth.users: as in Supabase, signed-in users cannot read it.
-- Supabase's defaults hand everything new in public to anon as well as to
-- authenticated. Copied here so the tests prove schema.sql takes anon's away.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
