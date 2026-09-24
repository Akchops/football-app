# Matchday AI proxy

Holds one Gemini API key so players using Matchday don't each need their own.

Without this, everyone has to paste their own key into Setup. With it, the
Coach tab works the moment they open the app.

## Easiest: deploy from GitHub, no terminal

You never have to open a command line. Do this once:

**1. Get a Gemini key** — free, no card:
<https://aistudio.google.com/apikey> → Create API key → copy it.

**2. Get a Cloudflare API token** — free, no card:
<https://dash.cloudflare.com/profile/api-tokens> → Create Token → use the
**"Edit Cloudflare Workers"** template → Continue → Create → copy it.

**3. Put both into the repo** — on github.com/Akchops/football-app:
Settings → Secrets and variables → Actions → **Secrets** tab → New repository
secret, twice:

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | the key from step 1 |
| `CLOUDFLARE_API_TOKEN` | the token from step 2 |

**4. Run it** — the **Actions** tab is in the row along the top of the repo
(Code · Issues · Pull requests · **Actions**), not inside Settings. Click
**Deploy AI proxy** in the left-hand list → **Run workflow**.

If your Cloudflare account is new it has no `*.workers.dev` address yet, so
type a name into the **workers_subdomain** box — your GitHub username is a
good choice. The name is shared by everyone on Cloudflare, so a very common
one may be taken; the run tells you if so. Leave the box blank if you have
used Workers before.

It prints a `https://…workers.dev` URL at the end.

**5. Tell the app** — Settings → Secrets and variables → Actions → **Variables**
tab (not Secrets) → New repository variable:

| Name | Value |
|---|---|
| `AI_PROXY_URL` | the URL from step 4 |

**6.** Actions → **Deploy to GitHub Pages** → Run workflow.

Done. The Coach tab now works for everyone with no key.

## Alternative: from your own computer

Needs Node 20+ and the repo cloned.

```bash
cd worker
npm install
npm run setup
```

That signs you into Cloudflare in a browser, creates the rate-limit store, asks
for your Gemini key, and deploys. Then do steps 5 and 6 above.

## What it is

A single Cloudflare Worker. The free tier covers 100,000 requests a day, far
more than this will use, and needs no card.

It is deliberately **not** a general Gemini proxy:

- It owns the system prompts and response schemas. Callers send a position and
  a question, or a clip and a description — not arbitrary prompts. A leaked URL
  can waste quota but can't be used as a free AI endpoint.
- Only the app's origin is allowed (`ALLOWED_ORIGINS` in `wrangler.toml`).
- Each IP gets `DAILY_LIMIT` requests a day (40 by default). Past that, the app
  tells the player to add their own free key in Setup.
- Requests over ~22MB are refused before reaching Gemini.
- Errors say what failed in plain words, then in brackets the status, the model
  and Google's own reason, with anything shaped like a key removed - so a
  screenshot of the error is enough to know what went wrong.

## Costs and limits

The Gemini free tier is shared across everyone using your proxy, and it is rate
limited per key rather than per user. If Matchday gets busy the free tier will
run out and requests fail until it resets — the app handles this by telling
players to add their own key.

If you later put a card on the Google account, every clip analysed bills to
you. `DAILY_LIMIT` in `wrangler.toml` is the lever: lower it to cap exposure.

## Which model it uses

The worker picks its models from Google's list itself (`src/models.ts`), so a
retired model never breaks the app. Two rules, both learnt the hard way:

- **Stable models only.** Previews, image, speech and live models, and the
  `-latest` aliases can never be chosen.
- **One fallback.** If a model answers with a server error, a missing model or
  out of quota, the request goes once to the next model - inside a time limit
  that ends before the app gives up. A busy model sits out for two minutes; one
  Google has withdrawn, for a day.

If the Coach, clips or import stop working, run **Check AI proxy** in the
Actions tab. It lists every model with how it actually answered - status,
seconds, and Google's own words - and calls the live worker the way the app
does. To force a model, set `GEMINI_MODEL` (Coach and clips) or
`GEMINI_FAST_MODEL` (schedule import) in `wrangler.toml` and redeploy.

## Changing things later

Re-run the **Deploy AI proxy** workflow after editing `wrangler.toml`, or
rotate the key by updating the `GEMINI_API_KEY` secret and re-running it.

From a terminal: `npx wrangler tail` watches live logs.
