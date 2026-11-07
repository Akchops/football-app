# Brag Plan: Matchday, player + academy overview

## What is this app?
Matchday is a football app with two sides. For a player (or their parent), it's a match tracker that rates every game for the position they actually play. For a club or academy, it holds squads, staff, league tables and players' stats for picking teams. The two connect only when the family says yes.

## The angle
**"Who's this for?"** This is the question the app itself asks on a new phone ("Me or my child" / "An academy"). The video answers it twice: first the player, then the academy, and finally the moment the two are linked by the family's consent. The detail (paste-a-message, score breakdowns) is saved for the individual launch videos.

## Hook (first 2-3 seconds)
"WHO'S THIS FOR?" lands in giant type under the Matchday mark. Then the app's two real choice cards drop in, "Me or my child" and "An academy". A tap on the player card carries it into the next scene.

## Key moments (the middle)
- **The player:** the calendar, then a logged match lifting out its rating: **95 Outstanding**. "Every match, rated for your position. Works on this phone with no account."
- **The academy:** the real academy home for a verified Kingsbridge Football Academy (15 players, 3 squads, 4 staff, join code). A tap on Players opens the squads and the join request.
- **The link:** the family's phone and the academy's phone side by side. The real consent line ("I'm 13 or over, or I'm Alex's parent or guardian") toggles on, Accept is tapped, a green line joins the two phones, and Alex Carter's row lights up as Linked.
- **Picking teams:** the stats leaderboard (Match score, top three lifted), the team pick "Saturday v Oakfield · 11 picked", and the Northern Junior League table with Kingsbridge U14 top.

## Outro / punchline
The logo on a pitch centre spot. MATCHDAY. "For the player. For the academy."

## User flow worth showing
New phone, "Who's this for?" → player: a rated match → academy: home → players → family consent → linked → stats → team pick → table.

## Tone
- Preset: `default`
- Creative direction: the same matchday-broadcast look and narrator as the previous cut, as an overview that sets up separate launches later.
- Interpretation: a calm, friendly voice and brisk motion. Each half gets one clear claim, and there are no feature lists.

## Format: landscape, 1920x1080, 30fps
## Duration: 24.5s

## Visual identity (from the project)
- Background `#000000`, accent `#30d27c` (logo `#48E597 → #30D27C`), text `#f2f2f7`, muted `#a1a1a8`
- Display: Barlow Condensed 800 (the app's `--font-display`). Body: Inter.
- Strongest visual elements: the app's own "Who's this for?" cards, and the academy home card with its ✓ Verified badge.

## Source material and data
- **Player screens:** the built-in demo season (fictional keeper "Alex"), reused from the earlier runs.
- **Academy screens:** the real academy UI, rendered by the app on a dev server with academies switched on. A demo account and a demo academy (`work/mock-academy.js`) are swapped in for the Supabase backend, which this environment doesn't have. All names, clubs and usernames are fictional. The stats leaderboard is computed by the app from each demo player's own matches. The table is worked out by the app from the demo results.

## Share copy (draft)
Matchday starts with one question: who's this for? For a player, every match is rated for the position they actually play. For an academy, it's squads, staff and league tables, with teams picked from players' own numbers.

## Audio direction
- Role: a warm bed under a narrator.
- Voice: Kokoro `af_heart` (female) at 1.1×, one file per line, each loudness-matched to −16 LUFS.
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` from media 0, ducked to about 0.15 under the voice, rising after the last line, then a fade.
- Music cue guidance: bundled preset at 120.19 BPM. The voice decides the big moments, and taps land on the narrator's words.
- Audio-reactive treatment: subtle. The green glow breathes with the music's bass.
- SFX posture: sparse. Soft drops when cards land, clicks on taps, a switch for the consent toggle, a soft bong when Alex is linked, and a bell on the logo.

## Storyboard

| # | Scene | Time | On screen | Narration |
|---|---|---|---|---|
| 1 | Hook | 0.00–3.60 | The Matchday mark, then "WHO'S THIS FOR?", then the two real choice cards. A tap on "Me or my child" carries that card to the next scene. | "Matchday asks one question first. Who's this for?" |
| 2 | Player | 3.60–7.75 | Kicker card, then "EVERY MATCH, RATED FOR YOUR POSITION." and "Works on this phone with no account." The phone shows the calendar, then the result sheet slides up and 95 Outstanding lifts out. | "For a player: every match, rated for the position they actually play." |
| 3 | Academy | 7.75–11.65 | "An academy" kicker card, then "SQUADS, STAFF AND PLAYERS." and "Verified by Matchday. Shared with your coaches." The academy home lifts out its verified hero card, then a tap on Players opens squads and the join request. | "For an academy: squads, staff and players, all in one place." |
| 4 | Link | 11.65–14.95 | "FAMILIES SAY YES FIRST." Family phone and academy phone side by side, labelled. The consent row lifts and toggles on, Accept is tapped, a green line joins the phones, and Alex Carter · Linked lights up. | "Families see exactly what's shared, and say yes first." |
| 5 | Picks | 14.95–20.20 | "PICK TEAMS FROM REAL NUMBERS." and "From each player's own Matchday." Stats tab: the leaderboard's top three lift out, then the team pick sheet, then the league table with Kingsbridge U14 top. | "Then coaches pick teams from the players' own numbers, and the tables work themselves out." |
| 6 | Outro | 20.20–24.50 | The logo on the centre spot, then MATCHDAY, "For the player. For the academy." and "Runs in your phone's browser · Works with no signal". | "Matchday. For the player, and the academy." |

Durations: 3.6 + 4.15 + 3.9 + 3.3 + 5.25 + 4.3 = **24.5s**.

## Voiceover script
Kokoro `af_heart` at 1.1× speed, one file per line (`composition/assets/vo/`).
1. (0.30) "Matchday asks one question first. Who's this for?" [3.01s]
2. (3.65) "For a player: every match, rated for the position they actually play." [3.73s]
3. (7.80) "For an academy: squads, staff and players, all in one place." [3.58s]
4. (11.75) "Families see exactly what's shared, and say yes first." [2.84s]
5. (15.05) "Then coaches pick teams from the players' own numbers, and the tables work themselves out." [4.74s]
6. (20.55) "Matchday. For the player, and the academy." [2.15s]

## Grounding
- "Who's this for?", "Me or my child", "An academy" and the card blurbs are the app's own copy (`WhoIsThisFor.tsx`).
- "Works on this phone with no account" also comes from that screen.
- Verified academies carry a tick, and the family sees what the academy will see and ticks consent first (README and `AcademySection.tsx`).
- The academy stats are "From each linked player's own Matchday" (`StatsScreen.tsx`).
- "The table works itself out" comes from the README.
- The 95 rating is the app's real output for the logged demo match.
