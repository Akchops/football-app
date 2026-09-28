# Matchday backend

The database behind signing in and sharing with family. Until this is set up the
app works exactly as it always has — everything stays on the one phone, and the
sign-in parts of the app stay hidden. Nothing here is required to run or build
Matchday.

## How it works, briefly

- **Signing in** is by a 6-digit code sent by email. Codes rather than links
  because a link opens in Safari, not in the app added to an iPhone home screen,
  so the app itself would never become signed in. If Google is switched on in
  the project, a Google button appears too (best in a browser tab, for the same
  reason).
- **A household** is the people who share one player's matches. The first
  person to sign in on a set-up phone gets one, and that phone's matches,
  training, teams, competitions and profile are uploaded to it. They invite
  others by email; someone invited joins by signing in with that email — on a
  new phone, from "Joining your family?" on the very first screen.
- **Syncing** happens on opening the app, on coming back to it, every minute
  while it is open, and a few seconds after any change. Offline changes wait on
  the phone and go when there is signal. Match photos and clips never leave the
  phone they are on.

## Files

| File | What it is |
|---|---|
| `schema.sql` | Every table, index, access rule and function. Re-runnable: safe to apply again after an edit. |
| `check-setup.mjs` | Checks a real project is ready, using only its public URL and key. Run by the *Check accounts setup* workflow. |
| `rls-test.sql` | Proves two families cannot see each other's data, and someone signed out sees nothing. Run it after any change to the access rules. |
| `local-auth-stub.sql` | Stands in for the Supabase-provided `auth` schema so the files above can run against a plain local Postgres. Never run this against the real project. |
| `local-api.mjs` | A local stand-in for a whole project, for testing sync in a browser. See the end of this file. Never point it at anything real. |

## Setting up the real project (about 10 minutes, free, no card)

1. Go to **supabase.com**, sign in with GitHub, and create a **New project**:
   name it `matchday`, pick the region nearest you (London for the UK), and
   choose any database password (save it somewhere; the app never needs it).
2. **SQL Editor** → New query → paste all of `schema.sql` → **Run**.
3. **Authentication → Emails → Magic Link** template (called *Magic Link* or
   *Sign in* depending on the dashboard version): make the message body

   ```
   Your Matchday code is {{ .Token }}
   ```

   The `{{ .Token }}` is what makes the email carry a code rather than a link.
4. **Authentication → URL Configuration → Site URL**:
   `https://<your-github-username>.github.io/football-app/`
5. **Project Settings → API** (or *API Keys*): copy the **Project URL** and the
   **anon** / **publishable** key — never the *service_role* / *secret* one.
6. GitHub → the repository → **Settings → Secrets and variables → Actions →
   Variables** tab → add two repository variables:
   - `VITE_SUPABASE_URL` — the Project URL
   - `VITE_SUPABASE_ANON_KEY` — the anon / publishable key

   These are build variables, like `AI_PROXY_URL`. The anon key is designed to
   be public: it identifies the project and grants nothing by itself. What
   protects the data is the access rules in `schema.sql`.
7. GitHub → **Actions → Check accounts setup → Run workflow**. It reports each
   thing that is right or wrong, with the fix. Then re-run **Deploy to GitHub
   Pages** (or push anything) so the app is rebuilt with sign-in switched on.

The one thing no check here can prove is that Supabase actually delivers the
email: the first sign-in is that test. Supabase's built-in email sends only a
few messages an hour — plenty for a family, but if a code does not arrive after
several tries, wait an hour. (A custom SMTP provider in Authentication → Emails
lifts that limit.)

### Optional: Google sign-in

Authentication → Sign In / Providers → **Google**: follow Supabase's steps to
create a Google OAuth client (free) and paste in its ID and secret. The app
notices by itself and shows a *Continue with Google* button. Sign in with Apple
needs a paid Apple Developer account (about $99/year), so it is not wired up.

## A free project pauses

Supabase pauses a free project after about a week with no traffic, which would
stop sign-in and syncing until someone presses *Restore* in the dashboard.
During the season the family's own syncing keeps it awake; for the summer,
`.github/workflows/keep-warm.yml` sends it one tiny request every three days.
(GitHub turns scheduled workflows off in a repository with no commits for 60
days; it emails first, and one click turns it back on.)

## Checking the access rules yourself

This needs a local Postgres (`postgresql-16` or newer) and touches nothing
remote:

```sh
# Start a throwaway server on port 5433
initdb -D /tmp/mdpg -U postgres --auth=trust
pg_ctl -D /tmp/mdpg -o "-p 5433" -l /tmp/mdpg/log start

psql -h localhost -p 5433 -U postgres -f supabase/local-auth-stub.sql
psql -h localhost -p 5433 -U postgres -f supabase/schema.sql
psql -h localhost -p 5433 -U postgres -f supabase/rls-test.sql
```

The last command ends with `ALL RLS CHECKS PASSED` or stops at the first thing
that is wrong. It checks, among other things, that one family cannot read
another's matches by listing them, by asking for them by id, or by searching
their contents; that writing into another family's records is refused rather
than quietly accepted; that an invite can only be claimed by the person it was
addressed to; that somebody who leaves a household immediately stops seeing
its data; and that someone not signed in cannot touch any table.

## Testing sync end to end, locally

The same database, served by [PostgREST](https://postgrest.org) (the API layer
Supabase itself runs), with `local-api.mjs` in front standing in for Supabase's
sign-in. There is no email: the code is always `123456`.

```sh
# 1. The database, as above, then PostgREST (a single binary from its releases page):
cat > /tmp/postgrest.conf <<'CONF'
db-uri = "postgres://authenticator:local-only@localhost:5433/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "local-only-jwt-secret-that-is-long-enough-1234"
server-port = 3001
CONF
postgrest /tmp/postgrest.conf &

# 2. The stand-in; it prints the anon key to use.
JWT_SECRET=local-only-jwt-secret-that-is-long-enough-1234 POSTGREST_URL=http://localhost:3001 \
  PGHOST=localhost PGPORT=5433 PGDATABASE=postgres PGUSER=postgres node supabase/local-api.mjs &

# 3. The sync tests against it, through the real supabase-js client:
LOCAL_SUPABASE_URL=http://localhost:54321 LOCAL_SUPABASE_ANON_KEY=<printed key> \
  npx vitest run src/lib/remote.integration.test.ts

# 4. Or the app itself, signed in against it:
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=<printed key> npm run dev
```

## Rules the schema keeps to

**The server never sets `updated_at`.** The app decides it, because it is the
value compared when two phones disagree about the same record. A convenient
`updated_at = now()` trigger would restamp every row as it arrived, make every
push look like the newest edit, and quietly corrupt the merge. There is no such
trigger, deliberately.

**The server does set `synced_at`**: when a row last reached it, by the
server's clock. Phones ask for everything since the last `synced_at` they saw.
Asking by `updated_at` instead would skip changes from a phone whose clock is
behind.

**A delete is an update.** Rows are not removed; `deleted_at` is set instead, so
the delete reaches the other phones rather than being undone by the next one to
push its copy.

**`schema_version()` goes up with any change the app depends on**, together
with `SCHEMA_VERSION` in `check-setup.mjs`, so the check can tell an
out-of-date project from a current one.
