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
- Only the app's origin is allowed (`ALLOWED_ORIGINS` in `wrangler.toml`) -
  which stops other websites using it from their visitors' browsers, and
  nothing else: a script can send any Origin it likes. The caps below are what
  actually limit it.
- Each person gets `DAILY_LIMIT` requests a day (40 by default), counted by IP
  address - stored only as a hash with the day and the worker's secret, never
  the address itself, and forgotten within two days. Past that, the app tells
  the player to add their own free key in Setup.
- **The hard cap:** every call to Google - each model tried, each retry - takes
  one from `GLOBAL_DAILY_LIMIT` (500 by default), one allowance for everyone,
  counted exactly in a single Durable Object (`src/allowance.ts`). When it is
  gone, nothing more reaches Google until midnight UTC, however many people or
  addresses are asking. Without the Durable Object bound, it spends nothing.
- Requests over ~22MB are refused before reaching Gemini.
- Errors say what failed in plain words, then in brackets the status, the model
  and Google's own reason, with anything shaped like a key removed - so a
  screenshot of the error is enough to know what went wrong.

## Match reminders

The same worker sends Matchday's match reminders (`src/push.ts`): a notification
the evening before each match, and one after full time to log the result. Each
phone turns them on in Setup → Match reminders.

- The app works out the reminders from its fixtures and sends this phone's list
  whenever the fixtures change. Each phone gets one Durable Object holding that
  list, with an alarm set for the first one due. A reminder is deleted once
  it's sent, and dropped if it's over three hours late.
- Pushes are standard Web Push, signed and encrypted with WebCrypto alone
  (`src/webpush.ts`) - no keys to set up. The signing key is made the first time
  it's needed and kept in its own Durable Object.
- Only real push services (Google, Mozilla, Apple, Microsoft) can be sent to,
  so the worker can't be pointed at anything else. These requests don't count
  towards `DAILY_LIMIT`.
- Durable Objects come with Cloudflare's free plan. Re-running **Deploy AI
  proxy** after this change is all it takes to switch reminders on; until then
  the app says reminders aren't set up on the server.

## Costs and limits

What a day can cost is capped three ways in the worker:

| Cap | Where | Default |
|---|---|---|
| Calls to Google per day, for everyone | `GLOBAL_DAILY_LIMIT`, `wrangler.toml` | 500 |
| Length of each answer, thinking included | `MAX_OUTPUT_TOKENS`, `src/index.ts` | 8,192 tokens (16,384 for a schedule) |
| Size of each request | `MAX_BODY_BYTES`, `src/index.ts` | 22 MB |

So the most a day can cost is about `GLOBAL_DAILY_LIMIT` × (the price of one
call at those sizes). Lower `GLOBAL_DAILY_LIMIT` to spend less.

**Also cap it at Google's end**, because a cap in the worker can't stop someone
who gets hold of the key itself:

1. The Gemini key lives in a Google Cloud project. In the Cloud console, open
   **APIs & Services → Generative Language API → Quotas & system limits**, and
   set the requests-per-day quota to match `GLOBAL_DAILY_LIMIT`. Google refuses
   anything past it - that is a hard stop.
2. **Billing → Budgets & alerts**: set a monthly budget with email alerts.
   A budget only *warns*; it does not stop spending. The quota in step 1 does.
3. On the free tier none of this costs money, but Google may use what the key
   sends to improve its products - which matters for a children's app. A paid
   key does not do that, and is what the caps above make safe to use.

Anthropic is not used by the worker. A player who adds their own Claude or
Gemini key in Setup spends on their own account; Anthropic's console has a
monthly spend limit (Settings → Limits) for that.

**Google's terms:** the Gemini API Additional Terms say it may not be used in a
service "directed towards or likely to be accessed by individuals under the age
of 18". Matchday is for youth players. Settle that before launch - see the
Coach section of the main README.

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
