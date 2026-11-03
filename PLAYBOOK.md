# Matchday playbook
Updated 3 November 2026, commit 29ac6e6.

## In one breath
Matchday is a free phone app that tracks a young footballer's matches and stats by position, built goalkeeper-first, with family sharing and a side for academies. Nobody pays: Boss's parents use it for Boss's brother, and one friend uses it. It makes no money today; one day academies and families might both pay, families only for extras, but no prices are set.

## Where it stands
- Stage: idea, as a business. The app itself is built and live.
- Users: one family and one friend. Revenue: nothing. Paying customers: none.
- Leads: one academy, in talks.
- Time: Boss gives it more than 10 hours a week.
- Live: the player app and family sharing with sign-in.
- Built but unused: the academy side. No academy has joined yet.
- Half-done: the privacy notice and terms are drafts. No app-store listing.

## Customers and the offer
- Who uses it: young players and their parents. Who buys: nobody yet. One day: academies, and families for extras only.
- What they get: a fixtures calendar, a match score out of 100 for their position, a free AI coach, and one season shared across the family's phones.
- Cost to them: nothing.
- How we find each other: through Boss. Family, a friend, and one academy in talks.
- Why they say yes (guess): it rates keepers on saves, not goals, and works with no signal at the pitch.
- Why they say no (guess): it's not in the app stores, and the AI sometimes fails.

## How the work runs
No sales pipeline yet. A user's path:
1. Hears about it from Boss.
2. Opens the link and adds it to the home screen.
3. Logs matches. The app does the maths.
4. Signs in with an emailed code and invites family, if they want.
5. An academy links a player only after the family ticks consent. Matchday's admin checks academies' documents by hand.
6. Getting paid: doesn't exist yet.

Automated: every push to the live branch tests and publishes the app on GitHub Pages. A Cloudflare Worker runs the AI coach, fixture reading and reminders. Supabase holds accounts and sync.

Boss does: finding users, fixing what breaks, picking AI models when Google changes them, verifying academies (guess), and the legal drafts.

## Money
- Prices: none yet. One day academies and families may both pay. Families only ever pay for extras.
- Spent: nothing. Came in: nothing. Owed: nothing.
- Running costs: none. Every service is on a free tier with no card.
- Coming costs for the app-store goal: Apple is $99 a year and needs a Mac. Google is $25 once.
- Risk: a card on the Google account would make the AI coach bill Boss.

## Goals
This month: a reliable AI coach and fixture import comes first. Then more players, a polished app, and one academy trying it.

Next three months: Matchday in the App Store and Play Store.

How Boss will know it's working: 25 or more players use it, and it can be downloaded from both stores.

## Rules I've already set
Hard lines:
- Never show ads.
- Never sell or share players' data.
- School always wins.

Already decided, don't re-argue:
- Free for now. Charging is "maybe one day".
- The core app stays free for players. Families would only pay for extras.
- Without sign-in, nothing leaves the phone. Photos and clips are never synced.
- An academy sees a player only after the family says yes, and never edits their records.
- Only Matchday's admin gives the verified tick.
- No automatic stats from a full match. It can't be done honestly.
- Gemini's free tier by default, not pay-as-you-go Claude.
- Nothing read from a photo or message is added until the user checks it.
- The code is proprietary, all rights reserved, in Aarav Chopra's name.
- Measure before fixing AI bugs. Guessed fixes made them drag on.
- The privacy draft promises no tracking. Change it before adding analytics.

## How to decide
What wins, in order. School first is Boss's call; the order after it is a guess.
1. School. Always.
2. Children's privacy and safety. When in doubt, share less.
3. Reliable beats new. Boss put reliable AI first this month.
4. Free beats paid. Spend only when a goal needs it, like store fees.
5. Money last, for now. There's no business model to protect yet.

Defaults:
- If someone asks for a discount, then say it's free.
- If someone asks the price, then say it's free for now. Don't promise free forever.
- If an idea would charge players, then only as an extra. The core stays free.
- If a user or academy goes quiet, then send one friendly check-in, then let it go (guess).
- If someone wants something we don't offer, then check the hard lines first. Full-match auto stats are a no too. Anything else goes on the ideas list (guess).
- If an academy wants to join, then say yes, but get the privacy notice and terms checked first.
- If the AI coach or import breaks, then run the Check AI proxy workflow, put the models that pass in the worker settings, and redeploy.
- If a job is taking too long, then ship the smallest piece that works and park the rest.
- If someone wants to copy the code, then no, unless Boss agrees in writing.
- If a family wants its data deleted, then delete it.

## What's going wrong
- The AI coach and fixture import fail. Google's free models are often busy or withdrawn.
- Getting users is hard. One family and one friend, against a goal of 25.
- The privacy notice and terms are unfinished, and nobody is lined up to check them. That blocks the academy in talks.
- Not in the app stores, so iPhone users must add it from Safari.
- Supabase's free tier pauses after a quiet week.
- What could kill it: Boss running out of time, Google changing the free tier, or a privacy mistake with a child's data (guess).

## Where things are
- README.md: what the app does.
- docs/privacy.md and docs/terms.md: the legal drafts.
- src/: the app.
- supabase/: database rules and setup guide.
- worker/: the AI coach, fixture reader and reminders. worker/wrangler.toml sets models and the daily limit.
- The live site deploys from the branch claude/football-match-tracker-n5cq0n.
- Tools and accounts: GitHub, Cloudflare, Google AI Studio, Supabase, Gmail (guess), optionally Anthropic.
- Client list: none. Users' data lives on their phones and in Supabase.

## Open questions
- Who will check the privacy notice and terms, and by when? Nobody is lined up yet.
- Who will own the Apple and Google developer accounts? Both expect an adult account holder.
- What would academies pay, and which extras would families pay for?
- Which academy are you talking to, and what does it need?
- By when should 25 players be using it?
