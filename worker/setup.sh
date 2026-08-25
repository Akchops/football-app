#!/usr/bin/env bash
# One-shot setup for the Matchday AI proxy.
set -euo pipefail
cd "$(dirname "$0")"

echo "Matchday AI proxy setup"
echo

if ! npx --yes wrangler whoami >/dev/null 2>&1; then
  echo "1/4  Signing in to Cloudflare (a browser window will open)..."
  npx --yes wrangler login
else
  echo "1/4  Already signed in to Cloudflare."
fi

if grep -q "REPLACE_WITH_KV_ID" wrangler.toml; then
  echo "2/4  Creating the rate-limit store..."
  output=$(npx --yes wrangler kv namespace create RATE_LIMIT 2>&1 | tee /dev/stderr)
  id=$(printf '%s' "$output" | grep -oE '"?id"?[[:space:]]*[:=][[:space:]]*"?[0-9a-f]{32}' | grep -oE '[0-9a-f]{32}' | head -1)
  if [ -z "$id" ]; then
    echo
    echo "Could not read the namespace id automatically."
    echo "Copy the id printed above into wrangler.toml, replacing REPLACE_WITH_KV_ID, then run this again."
    exit 1
  fi
  sed -i.bak "s/REPLACE_WITH_KV_ID/$id/" wrangler.toml && rm -f wrangler.toml.bak
  echo "     Stored namespace id $id"
else
  echo "2/4  Rate-limit store already configured."
fi

echo "3/4  Setting the Gemini key (paste it when prompted; it is never written to disk)..."
echo "     Get one free at https://aistudio.google.com/apikey"
npx --yes wrangler secret put GEMINI_API_KEY

echo "4/4  Deploying..."
npx --yes wrangler deploy

echo
echo "Done. Copy the workers.dev URL printed above and set it as the"
echo "AI_PROXY_URL repository variable on GitHub:"
echo "  Settings -> Secrets and variables -> Actions -> Variables -> New variable"
echo "  Name: AI_PROXY_URL"
echo "Then re-run the Matchday deploy workflow."
