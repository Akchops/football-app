# Brag Plan: Matchday (narrated cut)

## What is this app?
Matchday is a football match tracker that asks where you play first, then logs and rates (out of 100) the stats that matter for that position. A keeper is finally scored on saves and clean sheets instead of goals.

## The angle
**"Keepers don't score."** It's the same premise as the first cut (`brag-output/`), now with a female narrator who reads the on-screen lines and walks through more of the app. The video follows one match through the real app: the result prompt, the position switch, logging saves, the breakdown of every point, the next fixture pasted from the coach, and the year Wrapped.

## Hook (first 2-3 seconds)
A giant scoreboard **0** under GOALS slams in. "MOST APPS COUNT GOALS." Then, in green, "KEEPERS DON'T SCORE." The 0 turns red and shakes. The narrator says both lines as they land.

## Key moments (the middle)
- **Position-aware rating.** The "How did it go?" prompt pops up on the calendar, and a tap on Enter result opens the form. Tapping **Forward** makes the same 0–0 rate **54 Steady**, and tapping **Keeper** makes it **72 Very good**. Each tap lands on the narrator's word.
- **Every save counts.** It's 2–0, then six taps on Saves climb the rating 80 → 83 → 85 → 88 → 90 → 93 → **95 Outstanding**.
- **Every point explained (new).** The saved match opens, and "How this score was worked out" expands: **Clean sheet +18 · 6 saves +15 · Won the match +12**. This is real output: 50 + 18 + 15 + 12 = 95.
- **Paste the coach's message.** A coach's chat message lights up its details and flies into Add match. The real parser fills in "✓ Filled in: Sat 14 Nov · kick-off 10:30 AM · Oakfield Rangers · away · Riverside Park pitch 3 · meet 9:45 AM".
- **Wrapped.** Three story slides fan in: 45 saves, best game 95/100 (the match just logged) and player type "Penalty Hero".

## Outro / punchline
The logo lands on a pitch centre spot. MATCHDAY. "Built around your position." "Runs in your phone's browser · Works with no signal".

## User flow worth showing
Result prompt → enter result (position, score, saves) → rating and its breakdown → next fixture pasted in → the year Wrapped. These are all real screens captured from the running app's built-in demo data (a fictional keeper, "Alex").

## Tone
- Preset: `default`
- Creative direction: a matchday broadcast with a friendly narrator.
- Interpretation: the voice is the clock. Every line on screen lands on the word that says it, the motion stays brisk, and the copy is the app's own.

## Format: landscape, 1920x1080, 30fps
## Duration: 25.0s
This is the top of the window, because more detail was asked for.

## Visual identity (from the project)
- Background: `#000000` (dark theme default)
- Accent: `#30d27c` (dark-theme `--accent`), and the logo gradient `#48E597 → #30D27C`
- Text: `#f2f2f7`, muted `#98989f` (lifted to `#a1a1a8` for video)
- Display font: Barlow Condensed 800, the app's `--font-display`
- Body font: Inter (the app's rendered UI face)
- Strongest visual element: the real result form, with its live "Match rating out of 100, updates as you type" card.

## Share copy (draft)
Most football apps count goals, which is bad news if you're a keeper. Matchday rates the position you actually play, explains every point, and fills fixtures in from the coach's message.

## Audio direction
- Role: a warm bed under a narrator.
- Voice: Kokoro `af_heart` (female, American English) at 1.1× speed. It is generated per line, so each line anchors its scene.
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` from media 0. It's quieter for the first 16s and fuller from 16s, which matches the build into paste, Wrapped and the outro.
- Music treatment: ducked to about 0.14 under the voice, rising after the last line, with a short fade at the end.
- Music cue guidance: from the bundled preset `assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`, at 120.19 BPM. The beat grid runs every 0.5s from 3.02s. Strong cues fall at 16.02, 17.02, 18.02, 20.02 and 21.01. The logo landing at 21.05 locks to the 21.01 cue. Save taps run on the 0.25s grid. The voice still decides the big moments.
- Audio-reactive treatment: subtle. The music's bass breathes in the green glow behind the phone and logo. There are no visualiser graphics.
- SFX posture: sparse and motion-matched: soft clicks on visible taps, warm soft impacts for landings, soft drops for breakdown rows, a card slide for the message flying in, and one bell for the logo.
- Restraint rule: nothing may mask the voice, there are no synthesised tones, and repeated taps rotate between takes.

## Storyboard

### Scene 1: Hook (0.00–3.35s)
A giant **0** (GOALS) slams in at 0.0. "MOST APPS / COUNT GOALS." lands at 0.15 with the voice. "KEEPERS / DON'T SCORE." lands at 1.94 on "Keepers", and the 0 turns red and shakes.
Sequential/interaction: two lines land with the narration.
Audio: a soft heavy impact on the slam, and the voice from 0.15.
Transition: clean, staggered (text out, then the phone in) → Scene 2

### Scene 2: Reveal and position (3.35–9.65s)
The phone rises showing the calendar with the real **"How did it go?"** prompt. On the left, the Matchday logo and wordmark, then "RATED FOR THE POSITION YOU ACTUALLY PLAY." A tap on **Enter result** (4.55) slides up the form, which opens on Keeper. "Same 0–0: forward 54, keeper 72." appears on "Same nil-nil". A tap on **Forward** (6.79, "forward") lifts the rating card: **54 Steady**. A tap on **Keeper** (8.30, "Keeper") turns it to **72 Very good**.
Sequential/interaction: three simulated taps.
Audio: a click on each tap.
Transition: the text swaps while the phone stays → Scene 3

### Scene 3: Every save counts (9.65–12.78s)
"EVERY SAVE COUNTS." / "Match rating out of 100, updates as you type." The phone pushes in slightly. Two taps make it 2–0, then six taps on Saves on the 0.25s grid climb to **95 Outstanding**, which glows. A tap on Save result dismisses the sheet.
Sequential/interaction: eight taps and the rating ticking up. The hold on 95 is about 0.6s lifted, plus its time in the phone.
Audio: rotating soft clicks, and a soft bong on 95.
Transition: the sheet dismisses → Scene 4

### Scene 4: Every point, explained (12.78–15.60s)
The calendar shows day 6 with the logged match (W 2-0, 95). A tap on the match slides up its detail (2-0, 95/100 Outstanding). A tap on "How this score was worked out" expands it. The breakdown lifts out and its rows reveal one by one: **Clean sheet +18, 6 saves +15, Won the match +12**. "EVERY POINT, EXPLAINED." / "Never a black box."
Sequential/interaction: two taps, then three rows. All three stay on screen together for over 1s.
Audio: clicks, and soft drops on the rows.
Transition: the sheet dismisses → Scene 5

### Scene 5: Paste the coach's message (15.60–18.95s)
A tap on "+ Match" slides up Add match with the paste box. A coach's chat bubble pops in on the left, and its details light up one by one, then the bubble flies into the phone. The form fills, and the "✓ Filled in…" note lifts out. "PASTE THE COACH'S MESSAGE." / "The fixture fills itself in."
Sequential/interaction: highlights in sequence (texture, not reading text), then the fly-in.
Audio: a click, then a card slide on the fly-in and a soft drop on the fill.
Transition: the phone drops away → Scene 6

### Scene 6: Wrapped (18.95–20.95s)
"YOUR YEAR ON THE PITCH," and then "WRAPPED." lands on the spoken "Wrapped". Three Wrapped slides land in a fan: 45 saves, 95/100 best game, and Penalty Hero.
Audio: warm thuds as the phones land.
Transition: the centre circle shrinks round the logo → Scene 7

### Scene 7: Outro (20.95–25.00s)
The logo lands on the centre spot at 21.05 (on "Matchday."). The circle and halfway line draw in, then MATCHDAY. "Built around your position." and "Runs in your phone's browser · Works with no signal" hold to the end (3s+).
Audio: a bell on the logo, the music rising after the last line, then a fade.

**Music mood for this video:** upbeat.
**Audio summary:** a quieter bed under a brisk narrator, filling out from 16s, with taps you can hear and one bell on the logo.

## Voiceover script
Kokoro `af_heart` at 1.1×, one file per line (`composition/assets/vo/`). Measured durations are in brackets.

1. (0.15) "Most football apps count goals. Keepers don't score." [2.84s]
2. (3.35) "Matchday rates the position you actually play. Same nil-nil: forward, fifty-four. Keeper, seventy-two." [6.23s]
3. (9.73) "Every save counts, and your rating updates as you type." [2.97s]
4. (12.85) "Every point is explained. Never a black box." [2.67s]
5. (15.67) "Paste the coach's message, and the fixture fills itself in." [3.20s]
6. (19.02) "And your year on the pitch? Wrapped." [1.75s]
7. (21.05) "Matchday. Built around your position, and it works with no signal." [3.52s]

## Grounding
- 54 / 72 / 80→95, the +18/+15/+12 breakdown, the "Filled in" note and the Wrapped numbers are all the app's real output for these inputs.
- "Match rating out of 100, updates as you type" is the app's own label. "Never a black box" comes from the README ("the number is never a black box").
- "Works with no signal" and "runs in the browser" also come from the README.
- The chat bubble is the only rebuilt element. It is styled generically, with no WhatsApp branding.
