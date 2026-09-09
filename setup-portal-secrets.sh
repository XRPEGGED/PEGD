#!/usr/bin/env bash
# Helper to set portal secrets on Cloudflare Pages (pegd project).
# Run from the repo root: bash setup-portal-secrets.sh
# Secrets are runtime for Pages Functions — no deploy after put.
#
# Requires: wrangler logged in with write access to the "pegd" Pages project.
# This script never commits secrets; it only prints/puts values you supply.
set -euo pipefail
cd "$(dirname "$0")"

echo "=== CURRENT STATE (from wrangler) ==="
npx wrangler pages secret list --project-name pegd 2>&1 || true
echo ""

echo "=== GENERATING FRESH PORTAL_SESSION_SECRET ==="
SECRET="$(openssl rand -base64 48 | tr -d '/+=' | head -c 48)"
echo "FRESH PORTAL_SESSION_SECRET (save offline NOW — shown once only, never committed):"
echo "$SECRET"
echo ""

# Public treasury addresses already shown on pegd.org (edit allowlist as needed)
EXAMPLE_ALLOWLIST="solana:fWi4mx4bavfhFnJgHcAE5aCczEoaA7QFTp26zbV92zb,xrpl:rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78"
echo "Suggested ALLOWLIST (comma-sep; treasury only for now — edit for your wallets):"
echo "$EXAMPLE_ALLOWLIST"
echo ""

echo "=== READY PUTS (run after wrangler login) ==="
echo "cd <REPO_ROOT>"
echo ""
echo "# 1. PORTAL_SESSION_SECRET"
echo "printf '%s' \"\$SECRET\" | npx wrangler pages secret put PORTAL_SESSION_SECRET --project-name pegd"
echo ""
echo "# 2. PORTAL_ALLOWLIST"
echo "printf '%s' \"$EXAMPLE_ALLOWLIST\" | npx wrangler pages secret put PORTAL_ALLOWLIST --project-name pegd"
echo ""
echo "# 3. SUPABASE_SERVICE_ROLE_KEY (from Supabase Dashboard > Project Settings > API)"
echo "printf '%s' \"<SET_VIA_CF_SECRET>\" | npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name pegd"
echo ""
echo "# 4. SUPABASE_URL (environment-specific project URL)"
echo "printf '%s' \"<SUPABASE_URL>\" | npx wrangler pages secret put SUPABASE_URL --project-name pegd"
echo ""
echo "=== END READY PUTS ==="
echo ""

echo "=== CF DASHBOARD ALT ==="
echo "1. dash.cloudflare.com > Pages > pegd > Settings > Environment variables (Production + Preview)"
echo "2. Add as encrypted/secret:"
echo "   PORTAL_SESSION_SECRET = <generated above>"
echo "   PORTAL_ALLOWLIST = <allowlist>"
echo "   SUPABASE_SERVICE_ROLE_KEY = <SET_VIA_CF_SECRET>"
echo "   SUPABASE_URL = <SUPABASE_URL>"
echo "3. Save. No deploy required for Pages secrets."
echo "=== END DASHBOARD ==="
echo ""

echo "=== VERIFY ==="
echo "npx wrangler pages secret list --project-name pegd"
echo "Visit https://pegd.org/portal.html (or https://pegd.pages.dev/portal.html) and sign in with an allowlisted wallet."
echo ""

read -p "Auto-execute the core puts now (will pipe fresh session secret; enter values at prompts if needed)? [y/N] " do_run
if [[ "$do_run" =~ ^[Yy]$ ]]; then
  echo "Piping PORTAL_SESSION_SECRET..."
  printf '%s' "$SECRET" | npx wrangler pages secret put PORTAL_SESSION_SECRET --project-name pegd || echo " (may require interactive; run the printf line above manually)"
  echo ""
  printf '%s' "$EXAMPLE_ALLOWLIST" | npx wrangler pages secret put PORTAL_ALLOWLIST --project-name pegd || echo " (manual run needed for allowlist)"
  echo ""
  read -p "Enter SUPABASE_SERVICE_ROLE_KEY (or Enter to skip): " supa_val
  if [[ -n "$supa_val" ]]; then
    printf '%s' "$supa_val" | npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name pegd || echo " (manual run needed)"
  fi
  echo ""
  read -p "Enter SUPABASE_URL (or Enter to skip): " supa_url
  if [[ -n "$supa_url" ]]; then
    printf '%s' "$supa_url" | npx wrangler pages secret put SUPABASE_URL --project-name pegd || true
  fi
  echo ""
  echo "=== POST-RUN STATE ==="
  npx wrangler pages secret list --project-name pegd 2>&1 || true
  echo "Verify with portal.html. No redeploy required."
fi

echo "Done."
