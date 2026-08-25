#!/usr/bin/env bash
# Deploys the proxy from CI. Idempotent: reuses the existing rate-limit store
# rather than creating a new one on every run.
set -euo pipefail
cd "$(dirname "$0")"

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is not set}"
: "${GEMINI_API_KEY:?GEMINI_API_KEY is not set}"

WORKER_NAME=$(grep -E '^name *=' wrangler.toml | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
KV_TITLE="${WORKER_NAME}-RATE_LIMIT"
WORKERS_SUBDOMAIN="${WORKERS_SUBDOMAIN:-}"
API="https://api.cloudflare.com/client/v4"
auth=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")

# Pulls one value out of a Cloudflare API response. Prints nothing when the call
# failed or the field is missing, so callers can test the result with -z.
api_field() {
  node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
      try {
        const body = JSON.parse(raw);
        if (!body.success) return;
        const path = process.argv.slice(1);
        const value = path.reduce((o, k) => (o == null ? o : o[k]), body.result);
        if (value != null) console.log(value);
      } catch { /* not JSON - treat as absent */ }
    });
  ' "$@"
}

# The human-readable reasons a Cloudflare call was rejected, one per line.
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

subdomain_help() {
  echo
  echo "======================================================================"
  echo "  Your Cloudflare account has no *.workers.dev address yet, so there"
  echo "  is nowhere to publish the proxy. It is free and takes a moment."
  echo
  echo "  Easiest fix: run this workflow again, and this time type a name in"
  echo "  the 'workers_subdomain' box - your GitHub username works well."
  echo "  Your proxy then lives at https://$WORKER_NAME.<name>.workers.dev"
  echo
  if [ -n "${account_id:-}" ]; then
    echo "  Or pick one in the dashboard, then re-run this workflow:"
    echo "    https://dash.cloudflare.com/$account_id/workers/onboarding"
  else
    echo "  Or pick one at dash.cloudflare.com under Workers & Pages, then"
    echo "  re-run this workflow."
  fi
  echo "======================================================================"
}

account_id="${CLOUDFLARE_ACCOUNT_ID:-}"
if [ -z "$account_id" ]; then
  account_id=$(curl -sS "${auth[@]}" "$API/accounts?per_page=1" | api_field 0 id || true)
fi
if [ -n "$account_id" ]; then
  export CLOUDFLARE_ACCOUNT_ID="$account_id"
fi

# Register the workers.dev name if one was asked for and the account has none.
# Cloudflare keeps this name for good, so it is only ever set from an explicit
# request - never guessed on the account holder's behalf.
if [ -n "$account_id" ]; then
  current=$(curl -sS "${auth[@]}" "$API/accounts/$account_id/workers/subdomain" | api_field subdomain || true)
  if [ -n "$current" ]; then
    echo "Publishing to *.$current.workers.dev"
    if [ -n "$WORKERS_SUBDOMAIN" ] && [ "$WORKERS_SUBDOMAIN" != "$current" ]; then
      echo "(Ignoring '$WORKERS_SUBDOMAIN' - this account is already '$current'.)"
    fi
    WORKERS_SUBDOMAIN="$current"
  elif [ -n "$WORKERS_SUBDOMAIN" ]; then
    # Cloudflare only takes lowercase, and a GitHub username often is not.
    WORKERS_SUBDOMAIN=$(printf '%s' "$WORKERS_SUBDOMAIN" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
    if ! printf '%s' "$WORKERS_SUBDOMAIN" | grep -qE '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'; then
      echo "'$WORKERS_SUBDOMAIN' is not a usable name. Use lowercase letters," >&2
      echo "numbers and hyphens only, starting and ending with a letter or number." >&2
      exit 1
    fi
    echo "Claiming $WORKERS_SUBDOMAIN.workers.dev..."
    reply=$(curl -sS -X PUT "${auth[@]}" -H 'Content-Type: application/json' \
      --data "{\"subdomain\":\"$WORKERS_SUBDOMAIN\"}" \
      "$API/accounts/$account_id/workers/subdomain")
    if [ -z "$(printf '%s' "$reply" | api_field subdomain)" ]; then
      echo "Cloudflare would not register that name:" >&2
      printf '%s' "$reply" | api_errors | sed 's/^/  /' >&2
      echo "  (Names are shared by everyone, so common ones are often taken.)" >&2
      echo "Run the workflow again with a different name." >&2
      exit 1
    fi
    echo "Registered $WORKERS_SUBDOMAIN.workers.dev"
  fi
fi

echo "Looking for an existing rate-limit store called $KV_TITLE..."
list=$(npx wrangler kv namespace list 2>/dev/null || echo '[]')
id=$(printf '%s' "$list" | node -e "
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    const start = raw.indexOf('[');
    if (start === -1) return console.log('');
    try {
      const found = JSON.parse(raw.slice(start)).find((n) => n.title === process.argv[1]);
      console.log(found ? found.id : '');
    } catch { console.log(''); }
  });
" "$KV_TITLE")

if [ -z "$id" ]; then
  echo "None found - creating it..."
  created=$(npx wrangler kv namespace create RATE_LIMIT 2>&1)
  echo "$created"
  id=$(printf '%s' "$created" | grep -oE '[0-9a-f]{32}' | head -1)
fi

if [ -z "$id" ]; then
  echo "Could not determine the KV namespace id." >&2
  exit 1
fi
echo "Using rate-limit store $id"

# Patch the id in for this run only; it is never committed.
sed -i.bak "s/REPLACE_WITH_KV_ID/$id/" wrangler.toml && rm -f wrangler.toml.bak

echo "Storing the Gemini key as a secret..."
printf '%s' "$GEMINI_API_KEY" | npx wrangler secret put GEMINI_API_KEY

echo "Deploying..."
if npx wrangler deploy > deploy.log 2>&1; then
  cat deploy.log
else
  cat deploy.log
  # The upload itself succeeds without a workers.dev name; only publishing fails,
  # and wrangler's own message buries the one thing you have to go and do.
  if grep -q 'workers.dev subdomain' deploy.log; then
    subdomain_help
  fi
  rm -f deploy.log
  exit 1
fi

url=$(grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' deploy.log | head -1 || true)
if [ -z "$url" ] && [ -n "$WORKERS_SUBDOMAIN" ]; then
  url="https://$WORKER_NAME.$WORKERS_SUBDOMAIN.workers.dev"
fi
rm -f deploy.log
echo
echo "======================================================================"
if [ -n "$url" ]; then
  echo "  Proxy deployed at: $url"
  echo
  echo "  Last step - tell the app about it:"
  echo "    Settings -> Secrets and variables -> Actions -> Variables tab"
  echo "    New repository variable, name: AI_PROXY_URL"
  echo "    Value: $url"
  echo "  Then run the 'Deploy to GitHub Pages' workflow again."
else
  echo "  Deployed. Copy the workers.dev URL from the log above and set it as"
  echo "  the AI_PROXY_URL repository variable."
fi
echo "======================================================================"
