# Matchday

A football match tracker built around a calendar. Add your fixtures, and once a
match has kicked off the app asks you for the result next time you open it.
Everything you log feeds a stats page.

It runs in the browser and stores everything on the device — no account, no
server, nothing uploaded.

## What it does

**Calendar (main screen)**
- Month grid showing every match, coloured by competition
- A count on any day with more than one match (tournament days, doubleheaders)
- Month summary: how many matches, how many played, how many still to come
- Tap a day to see that day's matches; "Next up" card with a live countdown

**Result prompt**
- A match kicks off at 16:30. Open the app after that and it pops up asking for
  the result.
- Several matches waiting (a tournament day, or a week away from the app) are
  shown as a queue rather than one modal after another
- "Not now" snoozes for a few hours; "Off" marks a match as called off so it
  stops asking
- When you add a match whose kickoff has already passed, it goes straight to the
  result form — handy for backfilling old fixtures
- The delay is configurable in Setup: at kickoff, an hour after, after full time,
  or later that day

**Matches**
- Upcoming / Results / All, filterable by competition, grouped by month
- Anything waiting on a result is pinned at the top of Upcoming

**Stats**
- Record, win rate, points per game, form guide, current streak
- Goals for/against, goal difference, clean sheets, blanks
- Your own game: appearances, minutes, goals, assists, G+A, average rating,
  MOTM, cards
- Last six months as a stacked W/D/L chart
- Breakdowns by competition, home/away, and most-played opponents
- Biggest win, heaviest defeat, shootouts won

**Competitions**
- Leagues, cups, tournaments, friendlies — each with a season and a colour that
  shows on the calendar
- Deleting one keeps its matches, they just become uncategorised

**Your data**
- Export a JSON backup, import it back on another device
- Demo data to try the app out, and a clear-everything button

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm test         # unit tests for the date and stats logic
```

`npm run dev` serves on the local network too, so you can open it on a phone at
`http://<your-computer-ip>:5173` and add it to the home screen — it's set up as
a standalone web app.

## How it's put together

- React + TypeScript + Vite, no backend
- `src/types.ts` — the data model (competitions, matches, results, settings)
- `src/lib/date.ts` — date maths, all in the device's local timezone
- `src/lib/stats.ts` — every aggregate on the stats page, plus the rule that
  decides when a match is waiting on a result
- `src/store/` — a reducer over one `AppData` object, mirrored to `localStorage`
  on every change
- `src/components/` — one file per screen and per sheet

The two logic modules are the parts worth trusting, so they're covered by tests
(`npm test`): date handling around month boundaries and local midnight, and
every stat the app reports.

## Ideas for later

- Notifications so the result prompt reaches you without opening the app
- Season filter on the stats page
- Per-competition league table
- Multiple players/teams in one app
