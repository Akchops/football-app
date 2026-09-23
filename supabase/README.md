# Matchday backend

The database behind accounts and household sharing. Until this is set up the app
works exactly as it always has — everything stays on the one phone. Nothing here
is required to run or build Matchday.

## Files

| File | What it is |
|---|---|
| `schema.sql` | Every table, index, access rule and function. Re-runnable: safe to apply again after an edit. |
| `rls-test.sql` | Proves two families cannot see each other's data. Run it after any change to the access rules. |
| `local-auth-stub.sql` | Stands in for the Supabase-provided `auth` schema so the two files above can run against a plain local Postgres. Never run this against the real project. |

## Setting up the real project

1. Create a free project at supabase.com. Any region near you.
2. Open the SQL editor, paste in all of `schema.sql`, run it.
3. Authentication → Providers → enable **Google**. It is free.
   (Sign in with Apple needs a paid Apple Developer account, about $99/year, so
   it is not wired up yet. Nothing here blocks adding it later.)
4. Authentication → URL Configuration → add the app's address as a redirect URL,
   including the trailing path:
   `https://<your-github-username>.github.io/football-app/`
   Add `http://localhost:5173/football-app/` too if you want sign-in to work
   while developing.
5. Settings → API. Copy the **Project URL** and the **anon public** key.
6. In GitHub → repo Settings → Secrets and variables → Actions → Variables, add:
   - `VITE_SUPABASE_URL` — the project URL
   - `VITE_SUPABASE_ANON_KEY` — the anon public key

   These are build variables, the same way `AI_PROXY_URL` already works. The anon
   key is designed to be public: it identifies the project, it does not grant
   access. What actually protects the data is the access rules in `schema.sql`,
   which is why they are worth reading and worth testing.

## A free project pauses

Supabase pauses a free project after roughly a week with no traffic. During the
season nobody will notice. Over the summer it would pause, and someone would
have to press resume in the dashboard. `.github/workflows/keep-warm.yml` pings it
weekly so that does not happen.

## Checking the access rules yourself

This needs a local Postgres (`postgresql-16` or newer) and touches nothing
remote:

```sh
# Start a throwaway server on port 5433
initdb -D /tmp/mdpg -U postgres --auth=trust
pg_ctl -D /tmp/mdpg -o "-p 5433" -l /tmp/mdpg/log start

psql -h localhost -p 5433 -U postgres -f supabase/local-auth-stub.sql
psql -h localhost -p 5433 -U postgres -f supabase/schema.sql
psql -h localhost -p 5433 -U postgres -c "grant all on all tables in schema public to authenticated;"
psql -h localhost -p 5433 -U postgres -f supabase/rls-test.sql
```

The last command ends with `ALL RLS CHECKS PASSED` or stops at the first thing
that is wrong. It checks, among other things, that one family cannot read
another's matches by listing them, by asking for them by id, or by searching
their contents; that writing into another family's records is refused rather
than quietly accepted; that an invite can only be claimed by the person it was
addressed to; and that somebody who leaves a household immediately stops seeing
its data.

## Two rules the schema keeps to

**The server never sets `updated_at`.** The app decides it, because it is the
value compared when two phones disagree about the same record. A convenient
`updated_at = now()` trigger would restamp every row as it arrived, make every
push look like the newest edit, and quietly corrupt the merge. There is no such
trigger, deliberately.

**A delete is an update.** Rows are not removed; `deleted_at` is set instead, so
the delete reaches the other phones rather than being undone by the next one to
push its copy.
