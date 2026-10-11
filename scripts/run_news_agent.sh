#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# CF_API_TOKEN y CF_ZONE_ID para purgar la caché de Cloudflare (ver .cf_env.example)
source "$SCRIPT_DIR/../.cf_env"

/home/mikim/.local/bin/claude --dangerously-skip-permissions -p "$(cat "$SCRIPT_DIR/prompts/news.txt")"

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
echo
