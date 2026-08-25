#!/usr/bin/env bash
# Deploys the proxy from CI. Idempotent: reuses the existing rate-limit store
# rather than creating a new one on every run.
set -euo pipefail
cd "$(dirname "$0")"

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is not set}"
: "${GEMINI_API_KEY:?GEMINI_API_KEY is not set}"

WORKER_NAME=$(grep -E '^name *=' wrangler.toml | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
KV_TITLE="${WORKER_NAME}-RATE_LIMIT"

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
npx wrangler deploy 2>&1 | tee deploy.log

url=$(grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' deploy.log | head -1 || true)
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
