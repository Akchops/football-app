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
- A profile photo, which appears above the calendar, on the stats page and on
  shared match cards. Stored on the device, shrunk to a few kilobytes
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
- **Share a match card**: generates an image of the performance — photo, score,
  match rating out of 100 and the position stats — through the phone's share
  sheet, or as a download
- **Add to phone calendar**: exports the fixture as a calendar entry with an
  alarm at your chosen lead time, so the phone's own reminders do the nudging
- Attach videos and photos of the match — clips of saves, goals, big moments.
  The same files appear in the Media tab. Files are stored in IndexedDB on the
  device, with thumbnails generated automatically, and are never uploaded

**Coach (AI)**
- **Drills on demand**: say what you want to work on — "improve my diving",
  "better footwork across the goal" — and get a session back: warm-up, three to
  five drills with setup, reps and one coaching cue each, kit needed, and how to
  progress it. Suggestions are position-specific.
- **Clip analysis**: pick a saved clip (or one from the phone), say which player
  you are, and get a rating out of 100, what you did well, and what to work on
  with a drill for each. Frames are sampled from the clip in the browser and
  read by Claude — it reports its own confidence and says plainly what it
  couldn't judge from stills.
- **No key needed.** When the app is published with an AI proxy configured
  (`worker/`), the Coach tab works the moment someone opens it — the proxy holds
  one shared key. There is a per-person daily limit so one player can't drain
  it; past that the app offers the option of a personal key.
- Anyone can still add **their own free key** in Setup to remove the limit.
  Google Gemini (free tier) or Anthropic Claude (pay-as-you-go), stored on the
  device in its own entry, never included in a backup export. The Coach tab is
  the only part of the app that needs signal.
- On Gemini a short clip is sent as **video**, so movement, timing and footwork
  are all visible. On Claude — which reads images, not video — the clip is
  sampled into stills first, and the coach is told to judge accordingly. Clips
  over 15MB fall back to stills on both.
- Setup's "Check key" asks the provider which models the key can actually
  reach and lets you pick one, rather than hardcoding a model id that may be
  renamed or retired.
- Clips are capped at two minutes. Full-match automatic stat extraction is not
  offered — see below.
- Note on privacy: Google may use free-tier Gemini data to improve their
  models. Worth knowing before uploading match video of a child.

**Training**
- Log sessions as well as matches: team training, keeper sessions, gym,
  individual work, recovery — with length, intensity and what you worked on
- Sessions show on the calendar under the day, marked differently to matches
- Training hours and session counts feed the stats page

**Media tab**
- Team record, win rate, points per game, form guide, streak
- Goals against, goal difference, clean sheets (goals *for* is hidden for
  keepers — it isn't their job)
- **Your game**: average match score, plus your last five performances out of
  100 as a trend, then the six stats that matter for your position
- Minutes, discipline, self-rating
- **Personal bests**: most saves in a match, longest clean sheet run, longest
  unbeaten run, best match score — each showing where it happened
- **Milestones**: appearances, wins, clean sheets, saves, goals, assists and
  man-of-the-match awards, with progress to the next tier and a star for each
  one already banked
- **Missions and stars**: weekly and monthly targets — train twice, play a
  match, five saves, two clean sheets, eight hours of training — each worth
  stars. Stars from missions and milestones add up to a rank, from Rookie
  through to Club Legend, with the running total shown on the home screen.
  Missions are position-aware and worked out from what's already logged, so
  nothing has to be claimed or ticked off by hand
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

## The AI proxy

A key cannot be shipped inside the app — anyone can read it out of the
JavaScript. So sharing one key across all players needs a small server.

`worker/` is a Cloudflare Worker that does exactly that, and nothing more: it
owns the system prompts and response schemas, so it can't be repurposed as a
free AI endpoint, only the app's origin may call it, and each IP gets a capped
number of requests a day.

```bash
cd worker && npm install && npm run setup
```

That deploys it and prints a URL. Set that URL as the `AI_PROXY_URL` repository
variable (Settings → Secrets and variables → Actions → Variables) and re-run the
deploy. Full detail, including what it costs, is in `worker/README.md`.

Without it the app still works — it just asks each player for their own key.

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

## Layout on a phone

The app is sized with `100dvh`, not `100%`. With `viewport-fit=cover`, `100%`
resolves to the *safe* area rather than the screen, which on a notched iPhone
renders the app from y=0 (under the notch) while stopping short of the bottom —
a dead band under the tab bar and a close button you can't reach.

Safe-area insets are read once into `--safe-top` / `--safe-bottom` and used
everywhere, which also means a test can override them to simulate a notched
phone and assert the layout still fits. `scripts` aside, that check lives in the
browser-driven tests: tab bar flush to the bottom edge, tap targets clear of the
home indicator, and sheets capped at `100dvh - --safe-top` so their close button
is always below the notch.

Setup lives behind the gear in the top right rather than in the dock, keeping
the tab bar to five items.

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

- **Automatic stats from a full match.** Deliberately not attempted. Claude
  reads images, not video, so a clip becomes sampled frames; a 90-minute match
  would be thousands of frames, far past any context window and expensive, and
  picking one player out of wide amateur footage frame by frame is a tracking
  problem that dedicated systems still get wrong. Short-clip coaching is
  genuinely useful and is what the Coach tab does; counting every save
  automatically is not something this app can do honestly.
- Cloud backup and sync, so the data survives a lost phone
- Push notifications (needs a server; calendar alarms cover reminders today)
- Season filter on the stats page
- Per-competition league table
- Goalkeeper extras: distribution accuracy, sweeper-keeper actions by zone
