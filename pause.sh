#!/usr/bin/env bash
# Pause pegd.org — 503 until MAINTENANCE_UNTIL, then auto-resumes (no manual unpause needed).
set -euo pipefail
cd "$(dirname "$0")"
sed -i 's/SITE_PAUSED = "false"/SITE_PAUSED = "true"/' wrangler.toml
bash deploy.sh
echo "pegd.org paused (SITE_PAUSED=true). All routes return maintenance 503."