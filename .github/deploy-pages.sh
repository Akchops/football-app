#!/usr/bin/env bash
# Publishes the built app (dist/) to Cloudflare Pages from CI, creating the
# Pages project the first time. Unlike GitHub Pages on the free plan, this
# works with a private repository.
#
# Needs CLOUDFLARE_API_TOKEN - the same secret as the AI proxy - with the
# "Cloudflare Pages: Edit" permission added to it. PAGES_PROJECT names the
# project (default "matchday"); it becomes the address, <name>.pages.dev, or
# <name>-<letters>.pages.dev if someone else already has that name.
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is not set - see "Hosting it" in README.md}"
PROJECT=$(printf '%s' "${PAGES_PROJECT:-matchday}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
API="https://api.cloudflare.com/client/v4"
auth=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
WRANGLER="$PWD/worker/node_modules/.bin/wrangler"
export WRANGLER_SEND_METRICS=false

if ! printf '%s' "$PROJECT" | grep -qE '^[a-z0-9]([a-z0-9-]{0,56}[a-z0-9])?$'; then
  echo "'$PROJECT' can't be a Pages project name. Use lowercase letters, numbers" >&2
  echo "and hyphens only (the PAGES_PROJECT repository variable)." >&2
  exit 1
fi
[ -f dist/index.html ] || { echo "No build in dist/ - run npm run build first." >&2; exit 1; }
[ -x "$WRANGLER" ] || { echo "wrangler is missing - run npm install in worker/ first." >&2; exit 1; }

# One value out of a Cloudflare API reply on stdin: result.<path>. Prints
# nothing when the call failed or the field is missing.
api_field() {
  node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
      try {
        const body = JSON.parse(raw);
        if (!body.success) return;
        const value = process.argv.slice(1).reduce((o, k) => (o == null ? o : o[k]), body.result);
        if (value != null) console.log(value);
      } catch { /* not JSON - treat as absent */ }
    });
  ' "$@"
}

# The reasons a Cloudflare call was refused, one per line.
api_errors() {
  node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
      try {
        for (const e of JSON.parse(raw).errors || []) console.log(e.message);
      } catch { /* not JSON - nothing to report */ }
    });
  '
}

token_help() {
  echo
  echo "======================================================================"
  echo "  The CLOUDFLARE_API_TOKEN secret can't manage Cloudflare Pages yet."
  echo
  echo "  1. dash.cloudflare.com/profile/api-tokens -> the token -> Edit"
  echo "  2. Add a permission: Account | Cloudflare Pages | Edit"
  echo "  3. Continue to summary -> Update token"
  echo
  echo "  Editing a token keeps its value, so nothing changes in GitHub."
  echo "  Then run this workflow again."
  echo "======================================================================"
}

account_id="${CLOUDFLARE_ACCOUNT_ID:-}"
if [ -z "$account_id" ]; then
  account_id=$(curl -sS "${auth[@]}" "$API/accounts?per_page=1" | api_field 0 id || true)
fi
if [ -z "$account_id" ]; then
  echo "Could not find a Cloudflare account this token belongs to." >&2
  token_help
  exit 1
fi
export CLOUDFLARE_ACCOUNT_ID="$account_id"

subdomain=$(curl -sS "${auth[@]}" "$API/accounts/$account_id/pages/projects/$PROJECT" | api_field subdomain || true)
if [ -z "$subdomain" ]; then
  echo "No Pages project called $PROJECT yet - creating it..."
  reply=$(curl -sS -X POST "${auth[@]}" -H 'Content-Type: application/json' \
    --data "{\"name\":\"$PROJECT\",\"production_branch\":\"main\"}" \
    "$API/accounts/$account_id/pages/projects")
  subdomain=$(printf '%s' "$reply" | api_field subdomain || true)
  if [ -z "$subdomain" ]; then
    echo "Cloudflare would not create the project:" >&2
    printf '%s' "$reply" | api_errors | sed 's/^/  /' >&2
    token_help
    exit 1
  fi
  echo "Created $PROJECT"
fi

# --branch main makes this the live (production) site rather than a preview,
# whichever git branch the workflow ran from.
"$WRANGLER" pages deploy dist --project-name "$PROJECT" --branch main

echo
echo "======================================================================"
echo "  Matchday is live at: https://$subdomain"
echo
echo "  First time? Three things point at the old address. Set them once:"
echo "    1. GitHub: Settings -> Secrets and variables -> Actions -> Variables"
echo "       New repository variable APP_ORIGIN = https://$subdomain"
echo "       then Actions -> Deploy AI proxy -> Run workflow"
echo "    2. Supabase: Authentication -> URL Configuration"
echo "       Site URL = https://$subdomain/"
echo "       and add https://$subdomain/** under Redirect URLs"
echo "    3. On each phone: open the new address, sign in, add it to the"
echo "       Home Screen, and switch match reminders on again in Setup"
echo "======================================================================"
