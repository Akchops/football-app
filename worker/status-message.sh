#!/usr/bin/env bash
# Posts - or takes down - the message the app shows when something is wrong.
# Run from the "Status message" workflow in the Actions tab (it works from the
# GitHub app on a phone), so it needs nothing but the CLOUDFLARE_API_TOKEN
# secret the proxy was deployed with.
#
# The message goes into the worker's own KV store on Cloudflare, never into
# Supabase: it has to be readable while Supabase is the thing that's down.
#
#   MESSAGE  what to tell everyone (required unless CLEAR is true)
#   TITLE    a few words for the banner (optional)
#   HOURS    how long before it takes itself down (default 6)
#   CLEAR    "true" to take the current message down
set -euo pipefail
cd "$(dirname "$0")"

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is not set}"

MESSAGE="${MESSAGE:-}"
TITLE="${TITLE:-}"
HOURS="${HOURS:-6}"
CLEAR="${CLEAR:-false}"
# Kept in step with NOTICE_KEY in src/status.ts.
KEY="status-notice"

WORKER_NAME=$(grep -E '^name *=' wrangler.toml | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
KV_TITLE="${WORKER_NAME}-RATE_LIMIT"
API="https://api.cloudflare.com/client/v4"
auth=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")

# Whether a Cloudflare API reply says it worked; prints its errors when not.
succeeded() {
  node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
      try {
        const body = JSON.parse(raw);
        if (body.success) process.exit(0);
        for (const e of body.errors || []) console.error("  " + e.message);
      } catch { console.error("  " + raw.slice(0, 300)); }
      process.exit(1);
    });
  '
}

account_id="${CLOUDFLARE_ACCOUNT_ID:-}"
if [ -z "$account_id" ]; then
  account_id=$(curl -sS "${auth[@]}" "$API/accounts?per_page=1" | node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => { try { console.log(JSON.parse(raw).result[0].id); } catch { console.log(""); } });
  ')
fi
if [ -z "$account_id" ]; then
  echo "Could not find the Cloudflare account. Check the CLOUDFLARE_API_TOKEN secret." >&2
  exit 1
fi

namespace=$(curl -sS "${auth[@]}" "$API/accounts/$account_id/storage/kv/namespaces?per_page=100" | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const found = (JSON.parse(raw).result || []).find((n) => n.title === process.argv[1]);
      console.log(found ? found.id : "");
    } catch { console.log(""); }
  });
' "$KV_TITLE")
if [ -z "$namespace" ]; then
  echo "There's no $KV_TITLE store yet. Run the 'Deploy AI proxy' workflow first - the message lives alongside it." >&2
  exit 1
fi
url="$API/accounts/$account_id/storage/kv/namespaces/$namespace/values/$KEY"

if [ "$CLEAR" = "true" ]; then
  if curl -sS -X DELETE "${auth[@]}" "$url" | succeeded; then
    echo "Taken down. Phones stop showing it within a minute or so."
  else
    echo "Cloudflare would not take the message down." >&2
    exit 1
  fi
  exit 0
fi

if [ -z "$(printf '%s' "$MESSAGE$TITLE" | tr -d '[:space:]')" ]; then
  echo "Type a message to post, or tick 'clear' to take the current one down." >&2
  exit 1
fi
if ! printf '%s' "$HOURS" | grep -qE '^[0-9]+([.][0-9]+)?$'; then
  echo "'$HOURS' is not a number of hours." >&2
  exit 1
fi
# KV won't keep anything for less than a minute.
ttl=$(node -e 'console.log(Math.max(60, Math.round(Number(process.argv[1]) * 3600)))' "$HOURS")

notice=$(mktemp)
trap 'rm -f "$notice"' EXIT
node -e '
  const [title, message] = process.argv.slice(1);
  process.stdout.write(JSON.stringify({ title: title.trim(), message: message.trim(), postedAt: new Date().toISOString() }));
' "$TITLE" "$MESSAGE" > "$notice"

if curl -sS -X PUT "${auth[@]}" -F "value=<$notice" -F 'metadata={}' "$url?expiration_ttl=$ttl" | succeeded; then
  echo "Posted. Phones pick it up within a minute or so:"
  cat "$notice"
  echo
  echo "It takes itself down after $HOURS hours, or run this again with 'clear' ticked."
else
  echo "Cloudflare would not store the message." >&2
  exit 1
fi
