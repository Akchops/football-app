# Matchday: brag plan

## What it is
Matchday is a football match tracker for young players that asks where you play first, then logs and rates the stats that matter for that position. It runs on the phone, from the browser, and works with no signal.

- **Who it's for:** players (and their parents) on club and academy teams. It's especially for keepers and defenders, who other apps ignore.
- **What sets it apart:** the match rating out of 100 is position-aware. The same 0–0 rates **54 for a forward** and **72 for a keeper** (clean sheet). Saves, clean sheets and penalties saved count, and goals don't.
- **Most impressive or funniest true claim:** the README says "goals *for* is hidden for keepers — it isn't their job." The demo keeper's Wrapped calls them a "Penalty Hero. Shootouts were your stage."
- **Visual hook:** a giant scoreboard **0** under "GOALS".
- **Real UI to show:** the result form (position switch, save steppers, live rating), paste-a-message → filled fixture, and Wrapped slides. All are captured from the running app with its built-in demo data (a fictional keeper, "Alex", at the fictional Wanderers FC). No real people or data appear.
- **Tone:** `default`, which is punchy, playful and clean, with a matchday-broadcast feel.
- **Share caption:** "Most football apps count goals. Matchday rates keepers on saves."

## Angle
**"Keepers don't score."** Lead with the absurd truth: by the standards of a typical football app, a keeper who had a great game did nothing. Then show Matchday's real result form rating the same 0–0 differently by position, and let the numbers climb.

## Visual identity (from the code)
- Black background (`--bg: #000` dark theme, the app's default).
- Pitch green `#30d27c`, and the logo gradient `#48E597 → #30D27C`.
- Text `#f2f2f7`, muted `#98989f`.
- Display: **Barlow Condensed** 800 (the app's `--font-display`). Body: Inter.
- The real Matchday logo: a faceted ball with one panel lit green.
- Motif: faint pitch markings (halfway line, centre circle). The outro puts the logo on the centre spot.
- The demo club's colour is set to the app's own green (`#34d399`, one of `TEAM_COLORS`) so the in-app accent matches the brand.

## Music
120 BPM in C major. The beat grid is counted from frame 0, with bars starting at 1.0s (0–1s is a pickup). The progression is F – G – Am – C (IV–V–vi–I). The drop lands on F at 3.0s and the outro resolves on C at 17.0s. Every cut lands on a beat, and the drop and outro land on bar lines.

## Storyboard (20.0s, 1920×1080, 30fps)

| # | Time | Beat | On screen | Sound |
|---|---|---|---|---|
| 1 Hook | 0.0–3.0 | pickup + bar A | A giant **0** slams in, labelled GOALS. Then "MOST APPS COUNT GOALS." and, in green, "KEEPERS DON'T SCORE." The 0 gives a little "denied" shake. | Ref's whistle and a sub boom on frame 0. A filtered C chord, then a riser into the drop. |
| 2 Reveal | 3.0–7.0 | bars B–C | A phone rises in, showing the real result form for a 0–0 with **Forward** selected. On the left is the Matchday logo, the wordmark and "Rated for the position you actually play." The rating card lifts off the screen ("54 Steady"). A tap on **Keeper** at 5.0 turns it into **72 Very good**, and the caption reads "Same 0–0: forward 54, keeper 72." | The drop at 3.0. A tap tick and a rising two-note chime at 5.0. |
| 3 Highlight | 7.0–10.5 | bars D–E | "EVERY SAVE COUNTS." under the app's own line "Match rating out of 100, updates as you type." Two taps make it 2–0, then six taps on Saves climb the rating 80 → 83 → 85 → 88 → 90 → 93 → **95 Outstanding**. A tap on Save result at 10.0 dismisses the sheet. | Each save is the next note of an ascending pentatonic run, on 8ths. A sparkle lands on 95. |
| 4 Highlight | 10.5–14.0 | bars E–F | "PASTE THE COACH'S MESSAGE." / "The fixture fills itself in." The coach's message appears in a chat bubble, and its key details light up one by one (Sat 14th, Oakfield Rangers, (A), KO 10:30, meet 9:45, Riverside Park pitch 3). The bubble flies into the phone, and the real form fills in with "✓ Filled in: Sat 14 Nov · kick-off 10:30 AM · Oakfield Rangers · away…", which lifts off the screen. | Soft ticks on the highlights, a whoosh, and a chord on the paste. |
| 5 Highlight | 14.0–17.0 | bars G–H | "YOUR YEAR ON THE PITCH, WRAPPED." Three phones land in a fan on beats: **45 saves**, **Best game 95/100** (the match just logged) and **Player type: Penalty Hero**. | A thump per phone, and a fill into the outro. |
| 6 Outro | 17.0–20.0 | bar I | Centre-circle lines draw in around the logo on the centre spot. "MATCHDAY" / "Built around your position." / "Runs in your phone's browser · works with no signal". | A resolving C chord, the groove for one more bar, a final hit at 19.0, then the tail. |

Durations: 3.0 + 4.0 + 3.5 + 3.5 + 3.0 + 3.0 = **20.0s**.

## Copy check (all from the product)
- Position-aware rating, 54 vs 72, and 80→95 are the app's real outputs for these inputs.
- "Match rating out of 100, updates as you type" is the app's own label.
- The coach's message is parsed by the app's real parser (the "Filled in" note is real output).
- Wrapped numbers are computed by the app from the demo season plus the match logged in scene 3.
- "Works with no signal" and "runs in the browser" come from the README.
- The chat bubble is the one rebuilt element, because WhatsApp itself isn't part of the app. It's styled generically with no WhatsApp branding.
