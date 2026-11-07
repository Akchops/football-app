# Hyperframes Composition Brief: Matchday, player + academy overview

## Objective
A 24.5-second narrated overview launch video that introduces both halves of Matchday, the player app and the academy side, ahead of separate launch videos for each.

## Output
- Composition directory: `brag-output-2026-11-07-195135/composition/`
- Rendered video: `brag-output-2026-11-07-195135/brag.mp4`
- Format: landscape, 1920x1080, 30fps
- Duration: 24.5s

## Source Material
- Project root: the repo root (`football-app`)
- Primary files read: `README.md`, `src/components/WhoIsThisFor.tsx`, `src/components/academy/*` (`AcademyShell`, `AcademyHome`, `PlayersScreen`, `StatsScreen`, `TablesScreen`, `TeamPicks`, `AcademySection`), `src/lib/academy.ts`, `src/store/AcademyProvider.tsx`, `src/store/sample.ts`
- Real screens in `assets/img/`:
  - Player: `home-clean`, `r-step8` (+ `card-r-step8.png`)
  - "Who's this for?" cards: `who-player.png`, `who-academy.png`
  - Family: `family-invite`, `family-consent` (+ `consent-off/on.png`)
  - Academy: `ac-home` (+ `ac-hero.png`), `ac-players`, `ac-everyone`, `ac-leaders` (+ `ac-top3.png`), `ac-pick-open`, `ac-table` (+ `ac-table-crop.png`)
- Academy data: a fictional demo academy injected in place of the backend (`work/mock-academy.js`, `work/lib-academy.cjs`). The screens themselves are the app's own.
- Copy that must appear verbatim: "Who's this for?", "Every match, rated for your position.", "Works on this phone with no account.", "Squads, staff and players.", "Verified by Matchday. Shared with your coaches.", "Families say yes first.", "Pick teams from real numbers.", "From each player's own Matchday.", "For the player. For the academy."

## Creative Direction
- Tone preset: default (the same broadcast look and narrator as the earlier narrated cut)
- Angle: the app's own question, "Who's this for?", answered twice and then joined by the family's consent.
- Hook: "WHO'S THIS FOR?" and the two real choice cards.
- Outro: "For the player. For the academy."
- Avoid: feature lists, the paste-message and breakdown detail (kept for the individual launches), and generic SaaS language.

## Visual Identity
- Background `#000000`, text `#f2f2f7`, muted `#a1a1a8`, accent `#30d27c`
- Display: Barlow Condensed 800 (shipped). Body: Inter (shipped as its own family).
- The same phone frame, lifted cards, glow and centre-circle motif as the earlier runs.

## Storyboard
Use `brag-plan.md` as the contract: hook 0–3.6, player 3.6–7.75, academy 7.75–11.65, link 11.65–14.95, picks 14.95–20.2, outro 20.2–24.5.

## Audio
- Voice: `assets/vo/vo1..vo6.wav` at the plan's start times, on one voice track.
- Music: `assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (CC BY 4.0), with a base level of about 0.38. A volume lane ducks it to about a third under the voice, it rises after the last line, and a 0.4s fade ends it.
- Audio-reactive: the glow follows bass energy from `work/audio-data.json`.
- SFX: `assets/sfx/` (clicks, drops, a switch, a card slide, a bong, the bell), each timed to a visible action.

## Hyperframes Instructions
Follow the contract: one sub-composition per scene plus a background scene, `fromTo` tweens on paused timelines registered on `window.__timelines`, vendored GSAP, local fonts, and no network. `npx hyperframes check` is the gate before a local render.
