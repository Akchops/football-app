-- Minimal stand-in for the pieces of Supabase the schema leans on.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;

grant usage on schema public, auth to authenticated;
grant select on auth.users to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
