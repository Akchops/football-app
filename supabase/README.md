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
| `academy-test.sql` | The same for academies: plays an owner, manager, two coaches, the office admin, two players, a parent, a stranger and a Matchday admin, and has each try what they should and shouldn't. |
| `local-auth-stub.sql` | Stands in for the Supabase-provided `auth` schema so the files above can run against a plain local Postgres. Never run this against the real project. |
| `local-api.mjs` | A local stand-in for a whole project, for testing sync in a browser. See the end of this file. Never point it at anything real. |

## Setting up the real project (about 15 minutes, free, no card)

1. Go to **supabase.com**, sign in with GitHub, and create a **New project**:
   name it `matchday`, pick the region nearest you (London for the UK), and
   choose any database password (save it somewhere; the app never needs it).
2. **SQL Editor** → New query → paste all of `schema.sql` → **Run**.
3. **Email sending — needed before anyone else can get a code.** Supabase's
   built-in email only delivers to the people on your Supabase account's own
   team, and at most 2 emails an hour; anyone else gets *Email address not
   authorized*. Sending through your own Gmail fixes both, for free:
   1. Your Google Account → **Security** → turn on **2-Step Verification** if
      it is not on already.
   2. Open **myaccount.google.com/apppasswords**, create one called
      `Matchday`, and copy the 16-letter password it shows.
   3. Supabase → **Authentication → Emails → SMTP Settings** → enable custom
      SMTP and fill in: sender email = your Gmail address, sender name =
      `Matchday`, host = `smtp.gmail.com`, port = `465`, username = your Gmail
      address, password = the 16-letter app password. Save.

   Supabase then allows 30 emails an hour, which is plenty. (If Google will
   not offer an app password — some supervised or work accounts cannot — a
   free Brevo account does the same job: host `smtp-relay.brevo.com`, port
   `587`, and the login and SMTP key from Brevo's SMTP settings page.)
4. **Authentication → Emails → Templates**. Two of them send sign-in emails:
   **Confirm sign up** goes to someone signing in for the very first time, and
   **Magic link** to everyone after that. In both, replace the message with

   ```
   Your Matchday code is {{ .Token }}
   ```

   and make the subject `Your Matchday code`. The `{{ .Token }}` is what makes
   the email carry a code rather than a link.
5. **Authentication → URL Configuration → Site URL**:
   `https://<your-github-username>.github.io/football-app/`
6. **Project Settings → API** (or *API Keys*): copy the **Project URL** and the
   **anon** / **publishable** key — never the *service_role* / *secret* one.
7. GitHub → the repository → **Settings → Secrets and variables → Actions →
   Variables** tab → add two repository variables:
   - `VITE_SUPABASE_URL` — the Project URL
   - `VITE_SUPABASE_ANON_KEY` — the anon / publishable key

   These are build variables, like `AI_PROXY_URL`. The anon key is designed to
   be public: it identifies the project and grants nothing by itself. What
   protects the data is the access rules in `schema.sql`.
8. GitHub → **Actions → Check accounts setup → Run workflow**. It reports each
   thing that is right or wrong, with the fix. Then re-run **Deploy to GitHub
   Pages** (or push anything) so the app is rebuilt with sign-in switched on.

The one thing no check here can prove is that the emails arrive: the first
sign-in is that test. If a code does not come, look in spam, then check steps 3
and 4 — a link instead of a code means a template still has the old text.

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
psql -h localhost -p 5433 -U postgres -f supabase/academy-test.sql
```

The family checks end with `ALL RLS CHECKS PASSED` or stop at the first thing
that is wrong. They check, among other things, that one family cannot read
another's matches by listing them, by asking for them by id, or by searching
their contents; that writing into another family's records is refused rather
than quietly accepted; that an invite can only be claimed by the person it was
addressed to; that somebody who leaves a household immediately stops seeing
its data; and that someone not signed in cannot touch any table.

The academy checks end with `ALL ACADEMY CHECKS PASSED`. Among them: a
player's records stay hidden until their family says yes, and again the moment
they leave; a coach sees only the squads they coach; the office admin role
looks after staff and the academy's details but sees no player's stats, and
cannot promote itself or touch a manager; nobody at an academy can write a
player's records; usernames are unique ignoring case; an old join code stops
working once a new one is made; an owner cannot verify their own academy; and
with approval required, an unverified academy cannot take on any player.

The two files can be run in either order, and again, on the same database.

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

# 3. The sync and academy tests against it, through the real supabase-js client:
LOCAL_SUPABASE_URL=http://localhost:54321 LOCAL_SUPABASE_ANON_KEY=<printed key> \
  npx vitest run src/lib/remote.integration.test.ts src/lib/academy.integration.test.ts

# 4. Or the app itself, signed in against it (add VITE_ACADEMY=true for the academy area):
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
