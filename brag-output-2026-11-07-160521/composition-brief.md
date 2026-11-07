# Hyperframes Composition Brief: Matchday (narrated)

## Objective
Create a 25-second narrated launch-style brag video for Matchday. It follows one match through the real app.

## Output
- Composition directory: `brag-output-2026-11-07-160521/composition/`
- Rendered video: `brag-output-2026-11-07-160521/brag.mp4`
- Format: landscape, 1920x1080, 30fps
- Duration: 25.0s

## Source Material
- Project root: the repo root (`football-app`)
- Primary files read: `README.md`, `src/styles.css` (tokens), `src/components/Logo.tsx`, `ResultSheet.tsx`, `MatchDetailSheet.tsx`, `MatchFormSheet.tsx`, `WrappedStory.tsx`, `src/store/sample.ts`
- Product name: Matchday
- Strongest claim: it rates the position you actually play, so a keeper's 0–0 is a clean sheet.
- Key UI moments are real screenshots of the running app (demo data, en-GB, dark theme, team colour `#34d399`) in `assets/img/`:
  - `home-prompt` → `r-keeper` → `r-forward` → `r-keeper`, then `r-step1..8`
  - `day6` → `detail` → `detail-open` (+ `breakdown.png` crop)
  - `add-paste-open` → `add-filled` (+ `note-filled.png`)
  - `w-3`, `w-4`, `w-7` (Wrapped)
- Copy that must appear verbatim:
  - "Most apps count goals." / "Keepers don't score."
  - "Rated for the position you actually play." / "Same 0–0: forward 54, keeper 72."
  - "Every save counts." / "Match rating out of 100, updates as you type."
  - "Every point, explained." / "Never a black box."
  - "Paste the coach's message." / "The fixture fills itself in."
  - "Your year on the pitch, Wrapped."
  - "Matchday" / "Built around your position." / "Runs in your phone's browser · Works with no signal"

## Creative Direction
- Tone preset: default
- Creative direction: a matchday broadcast with a friendly narrator
- Interpretation: the voice is the clock. Lines land on the words that say them. Motion is brisk, and arrivals use long-tailed ease-outs. Exits are shorter than entrances.
- Angle: "Keepers don't score." The app scores the position you play.
- Hook: a giant 0 under GOALS, with "Most apps count goals. Keepers don't score."
- Outro: the logo on a centre spot. "Built around your position."
- Avoid: generic SaaS language, abstract filler, redesigning the app's UI.

## Visual Identity
- Background: `#000000`
- Text: `#f2f2f7`, muted `#a1a1a8`
- Accent: `#30d27c` (logo `#48E597 → #30D27C`), and the loss red `#ff6b61` for the "denied" 0
- Display font: Barlow Condensed 800 (shipped in `assets/fonts`)
- Body font: Inter 500/600/800 (shipped in `assets/fonts` as its own family)
- Visual references: the faceted-ball logo, a phone frame around the real screens, rating cards lifted off the screen, a faint pitch centre circle.

## Storyboard
Use `brag-plan.md` as the contract.
1. Hook: 0–3.35
2. Reveal and position: 3.35–9.65
3. Every save counts: 9.65–12.78
4. Every point, explained: 12.78–15.60
5. Paste the coach's message: 15.60–18.95
6. Wrapped: 18.95–20.95
7. Outro: 20.95–25.00

## Audio
- Audio role: a warm bed under a narrator
- Audio arc: the bed is quieter under dense narration, fuller from 16s, and rises after the last line before a short fade.
- Voice: `assets/vo/vo1..vo7.wav` (Kokoro `af_heart`, 1.1×). Each sits on its own track at the start time in the plan.
- Music: `assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (CC BY 4.0, Sascha Ende)
- Music treatment: base 0.35, ducked by a volume lane to about 0.14 while the voice runs, back up after 24.6, fade out at the end.
- Music cue guidance: bundled preset at 120.19 BPM, with beats every 0.5s from 3.02. Lock the logo landing to the 21.01 strong cue. Save taps go on the 0.25s grid.
- Audio-reactive treatment: subtle. The glow breathes with bass energy extracted from the music.
- Audio-coupled moments: simulated taps, the rating climbing, breakdown rows, the bubble fly-in, the phones fanning in, the logo landing.
- SFX: chosen files are in `assets/sfx/` (low-HF clicks, soft impacts, drops, a card slide, the bell). Rotate takes on repeats.

## Hyperframes Instructions
Follow the `hyperframes` contract: scene sub-compositions in `compositions/`, `fromTo` tweens on paused timelines registered on `window.__timelines`, no network (GSAP is vendored in `assets/vendor/`), and local fonts with `@font-face`. Run `npx hyperframes check` as the gate, then render locally.
