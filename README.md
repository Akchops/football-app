# Matchday

A football match tracker built around a calendar, and built around **your
position**. Most tracking apps assume you're a midfielder or a striker — goals,
assists, shots. This one asks where you play first, then tracks and scores the
things that actually matter for that position. A keeper gets saves, clean
sheets, goals conceded and save percentage. A defender gets tackles,
interceptions, clearances and blocks.

It runs in the browser and stores everything on the device — no account, no
server, nothing uploaded.

## What it does

**Setup (first run)**
- Name, date of birth (age worked out for you), and the age group you play in —
  suggested from your date of birth using the 31 August cutoff
- Position: goalkeeper, defender, midfielder or forward. This decides which
  stats the whole app tracks
- Every team you play for — add as many as you like. Each gets its own colour,
  and you can play a different position at each one
- It's a local profile, not a login: there's no password and no account,
  because there's no server. Everything can be changed later in Setup

**Calendar (main screen)**
- Month grid showing every match, with a count on any day holding more than one
  (tournament days, doubleheaders)
- Coloured dots per match — one dot per match, coloured by competition or by
  team. Three matches in three different tournaments show three different
  colours; so do matches for three different teams. Tap "Colours: …" to switch
  which one the calendar uses
- Month summary: how many matches, how many played, how many still to come
- Quick actions to add a match or a whole tournament, and a "Next up" card with
  a live countdown

**Tournaments**
- "+ Tournament" on the home screen creates the tournament *and* all of its
  fixtures in one go — the usual case of several matches on one day
- Optionally spans more than one day, and applies one venue to every match
- Leave an opponent blank for rounds you don't know yet; it shows as TBC

**Result prompt**
- A match kicks off at 16:30. Open the app after that and it pops up asking for
  the result
- Several matches waiting (a tournament day, or a week away from the app) are
  shown as one queue rather than one modal after another
- "Not now" snoozes for a few hours; "Off" marks a match as called off
- Adding a match whose kickoff has already passed goes straight to the result
  form, for backfilling
- The delay is configurable: at kickoff, an hour after, after full time, or
  later that day

**Entering a result**
- Score, penalties if it went to a shootout, and whether you played
- Then the stats for your position — saves, conceded and penalties saved for a
  keeper; tackles, interceptions and clearances for a defender; chances created
  for a midfielder; shots and conversion for a forward
- Your match score out of 100 updates live as you type
- You can switch position for a single match (a keeper filling in outfield) and
  the form follows

**Media tab**
- Every photo and clip in one place, grouped by match, newest match first
- Adding a file asks which match it's from — recent matches you've actually
  played are offered first, since that's nearly always the answer
- "Not sure yet" keeps it unfiled at the top of the tab until you pick a match
- Any clip can be moved to a different match later, or opened straight to its
  match
- Filter by video or photos

**Each match**
- Tap any match for that individual performance: score out of 100, a verdict,
  your stat line, and an expandable breakdown of exactly how the score was
  reached (`+18 clean sheet`, `+12.5 5 saves`, `−4 1 conceded`)
- Attach videos and photos of the match — clips of saves, goals, big moments.
  The same files appear in the Media tab. Files are stored in IndexedDB on the
  device, with thumbnails generated automatically, and are never uploaded

**Stats**
- Team record, win rate, points per game, form guide, streak
- Goals against, goal difference, clean sheets (goals *for* is hidden for
  keepers — it isn't their job)
- **Your game**: average match score, plus your last five performances out of
  100 as a trend, then the six stats that matter for your position
- Minutes, discipline, self-rating
- Six-month W/D/L chart, and breakdowns by team, competition, home/away and
  most-played opponents

**Your data**
- Export a JSON backup, import it back on another device (older backups are
  migrated automatically)
- Videos and photos are not in the backup file — they stay on the device
- Demo data (a keeper across two clubs) to try the app, and a clear-everything
  button

## The match score

Each performance is rated out of 100 from the stats that matter in the position
played, so the same stat line scores differently for a keeper and a striker.

- Starts at 50
- Position work: saves, penalty saves and clean sheets for a keeper; tackles,
  interceptions, clearances and blocks for a defender; chances created for a
  midfielder; goals, shots and conversion for a forward. Capped so one enormous
  stat line can't run away with it
- Team result: win +12, draw +4, defeat −4 — it counts, but a good display in a
  defeat still rates well
- Discipline: yellow −3, red −12. Man of the match +5
- A short cameo swings the score less than a full 90
- If you gave yourself a rating out of 10, it's blended in at 30%

The breakdown is always visible on the match, so the number is never a black box.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm test         # unit tests for the date, stats, scoring and migration logic
```

`npm run dev` serves on the local network too, so you can open it on a phone at
`http://<your-computer-ip>:5173/football-app/` and add it to the home screen.
The app is served from the `/football-app/` sub-path to match GitHub Pages; set
`VITE_BASE=/` to serve it from a domain root instead.

## Installing it on a phone

Matchday is a progressive web app, so it installs to the home screen and runs
like any other app — its own icon, full screen with no browser chrome, and it
works with **no signal at all**, which is the normal state at a pitch. Every
asset is precached by a service worker on first visit.

- **Android:** open the link in Chrome and tap the "Install app" prompt the app
  shows, or Chrome's own "Add to Home screen".
- **iPhone:** open the link in Safari, tap Share, then Add to Home Screen. The
  app shows these steps for you.

When a new version is deployed, the app offers a Reload rather than refreshing
underneath you mid-result.

It is not an App Store or Play Store download. A store listing would need a
native wrapper plus developer accounts (Apple $99/year and a Mac; Google $25
one-off) — everything else about the app would stay the same.

## Hosting it

`.github/workflows/deploy.yml` builds the app, runs the tests, and publishes it
to GitHub Pages on every push to the working branch (or on demand from the
Actions tab). It needs Pages enabled once, by hand:

1. **Settings → Pages → Source: GitHub Actions**
2. GitHub Pages needs the repository to be public, or a GitHub Pro plan for a
   private one.

Once that's set, the site is served from
`https://<user>.github.io/football-app/`. The build uses relative asset paths,
so it works from that subpath without extra configuration.

Because everything is stored in the browser, each phone that opens the link
keeps its own separate data — there's no shared server and nothing syncs
between devices. Use Export/Import in Setup to move data across.

## How it's put together

- React + TypeScript + Vite, no backend
- `src/types.ts` — the data model, and the metric registry that says which stats
  belong to which position
- `src/lib/date.ts` — date maths in the device's local timezone, plus age and
  age-group logic
- `src/lib/metrics.ts` — turns raw metrics into the stat cards for a position
- `src/lib/score.ts` — the match score out of 100 and its breakdown
- `src/lib/stats.ts` — every aggregate on the stats page, plus the rule that
  decides when a match is waiting on a result
- `src/store/` — a reducer over one `AppData` object mirrored to `localStorage`,
  a v1→v2 migration, and the IndexedDB media store
- `src/components/` — one file per screen and per sheet

The logic modules are the parts worth trusting, so they're covered by tests
(`npm test`, 65 of them): date handling around month boundaries and local
midnight, every stat the app reports, the scoring engine's position awareness,
and the migration from the old data format.

## Licence

Matchday is proprietary. Copyright (c) 2026 Akchops, all rights reserved — see
[LICENSE](LICENSE). The repository is public so the app can be hosted and run,
but that is not permission to copy it: no licence to reuse, modify or
redistribute the code is granted.

Third-party components are used under their own licences, listed in
[NOTICE](NOTICE).

## Ideas for later

- **AI analysis of match clips.** The videos are stored and ready; the analysis
  itself needs a server to do the processing, so that's the next thing to build
  rather than something that can run on the phone.
- Notifications so the result prompt reaches you without opening the app
- Season filter on the stats page
- Per-competition league table
- Goalkeeper extras: distribution accuracy, sweeper-keeper actions by zone
