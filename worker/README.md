# Matchday AI proxy

Holds one Gemini API key so players using Matchday don't each need their own.

Without this, every user has to paste their own key into Setup. With it, the
Coach tab works the moment they open the app.

## What it is

A single Cloudflare Worker. Cloudflare's free tier covers 100,000 requests a
day, which is far more than this will ever use, and needs no card.

It is deliberately **not** a general Gemini proxy:

- It owns the system prompts and response schemas. Callers send a position and
  a question, or a clip and a description — not arbitrary prompts. A leaked URL
  can waste quota but can't be used as a free AI endpoint.
- Only the app's origin is allowed (`ALLOWED_ORIGINS`).
- Each IP gets `DAILY_LIMIT` requests a day (40 by default). Past that, the app
  tells the player to add their own free key in Setup.
- Requests over ~22MB are refused before reaching Gemini.
- Upstream errors are rewritten before being returned, so nothing internal leaks.

## Setting it up

```bash
cd worker
npm install
npm run setup
```

That signs you in to Cloudflare, creates the rate-limit store, asks for your
Gemini key, and deploys. It prints a `*.workers.dev` URL at the end.

Then tell the app about it — on GitHub:

**Settings → Secrets and variables → Actions → Variables → New repository
variable**, named `AI_PROXY_URL`, set to that URL.

Re-run the deploy workflow and the Coach tab works for everyone with no key.

## Costs and limits

The Gemini free tier is generous but shared across everyone using your proxy,
and it is rate limited per key rather than per user. If Matchday gets busy the
free tier will run out and requests will fail until it resets — the app handles
this by telling players to add their own key.

If you later put a card on the Google account, every clip analysed bills to
you. `DAILY_LIMIT` in `wrangler.toml` is the lever: lower it to cap exposure.

## Changing settings later

```bash
npx wrangler secret put GEMINI_API_KEY   # rotate the key
npx wrangler deploy                       # after editing wrangler.toml
npx wrangler tail                         # watch live logs
```
