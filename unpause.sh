#!/usr/bin/env bash
# Emergency early resume — site also auto-unpauses at MAINTENANCE_UNTIL (wrangler.toml).
set -euo pipefail
cd "$(dirname "$0")"
sed -i 's/SITE_PAUSED = "true"/SITE_PAUSED = "false"/' wrangler.toml
bash deploy.sh
echo "pegd.org resumed (SITE_PAUSED=false). Verify https://pegd.pages.dev"