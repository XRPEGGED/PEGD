#!/usr/bin/env bash
# Chairman: one-command helper to set portal secrets on Cloudflare Pages (pegd project).
# Run from pegd-site: bash setup-portal-secrets.sh
# Prints current state + generates + outputs READY PUTS block (copy-paste or auto).
# Secrets are runtime for Pages Functions — no deploy after put.
# WHY CHAIRMAN EXECUTION ONLY: wrangler pages secret put requires interactive CF account login + write permission on the exact "pegd" Pages project (CISO boundaries + Chairman protocol). AI/subagents have zero credentials and cannot perform privileged remote secret writes on user infrastructure. Script + values prepared yesterday; execution is the Chairman step.
set -euo pipefail
cd "$(dirname "$0")"

echo "=== CURRENT STATE (from wrangler) ==="
npx wrangler pages secret list --project-name pegd 2>&1 || true
echo ""

# LATEST PRE-GENERATED (use this P0k... value for PORTAL_SESSION_SECRET to match prior turns; script also gens fresh below)
LATEST_SECRET="P0kXpofCiKzHo1Iu53niUHGWIziT2MXvF7bO3nOJGjWMl7kC"
echo "LATEST PREPARED PORTAL_SESSION_SECRET (from yesterday prep): $LATEST_SECRET"
echo "  (Use this or the fresh generated below. Do NOT commit.)"
echo ""

echo "=== GENERATING FRESH PORTAL_SESSION_SECRET ==="
SECRET="$(openssl rand -base64 48 | tr -d '/+=' | head -c 48)"
echo "FRESH PORTAL_SESSION_SECRET (save offline NOW — shown once only):"
echo "$SECRET"
echo "(Primary for this run: use LATEST_PREPARED $LATEST_SECRET above for yesterday consistency.)"
echo ""

# Example using known treasuries (edit to your exact wallets for ALLOWLIST)
EXAMPLE_ALLOWLIST="solana:fWi4mx4bavfhFnJgHcAE5aCczEoaA7QFTp26zbV92zb,xrpl:rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78"
echo "Suggested ALLOWLIST (comma-sep; prefixed or bare ok per portal.js; treasury only for now):"
echo "$EXAMPLE_ALLOWLIST"
echo ""

echo "=== ONE-CLICK READY BLOCK (use LATEST or fresh; paste this whole section after wrangler login) ==="
echo "cd /home/cube/Desktop/pegd-site"
echo ""
echo "# 1. PORTAL_SESSION_SECRET (paste LATEST or fresh value at wrangler prompt, or use piped):"
echo "printf '%s' \"$LATEST_SECRET\" | npx wrangler pages secret put PORTAL_SESSION_SECRET --project-name pegd"
echo "# (or with fresh: printf '%s' \"$SECRET\" | ... )"
echo ""
echo "# 2. PORTAL_ALLOWLIST (exact treasury; pipe or prompt):"
echo "printf '%s' \"$EXAMPLE_ALLOWLIST\" | npx wrangler pages secret put PORTAL_ALLOWLIST --project-name pegd"
echo ""
echo "# 3. SUPABASE_SERVICE_ROLE_KEY (Chairman: get from Supabase Dashboard > Project Settings > API > service_role secret key; pipe or at prompt):"
echo "printf '%s' \"<SUPABASE_SERVICE_ROLE_KEY>\" | npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name pegd"
echo ""
echo "# 4. SUPABASE_URL (optional explicit):"
echo "printf '%s' \"https://tmaeezonwjyydkxwpeug.supabase.co\" | npx wrangler pages secret put SUPABASE_URL --project-name pegd"
echo ""
echo "=== END ONE-CLICK BLOCK ==="
echo ""

echo "=== CF DASHBOARD UI ALT (no CLI at all; use for first-time or double-check; secrets instant) ==="
echo "1. dash.cloudflare.com > Pages > pegd > Settings > Environment variables (Production section; also Preview)"
echo "2. Add (secret/locked type for keys):"
echo "   PORTAL_SESSION_SECRET = $LATEST_SECRET   (or fresh)"
echo "   PORTAL_ALLOWLIST = $EXAMPLE_ALLOWLIST"
echo "   SUPABASE_SERVICE_ROLE_KEY = <your service_role from Supabase>"
echo "   SUPABASE_URL = https://tmaeezonwjyydkxwpeug.supabase.co"
echo "3. Save. No deploy. Then verify with secret list or curl."
echo "=== END DASHBOARD ==="
echo ""
echo "=== AFTER PUTS (instant; no redeploy) ==="
echo "npx wrangler pages secret list --project-name pegd   # should now list PORTAL_SESSION_SECRET, PORTAL_ALLOWLIST, SUPABASE_SERVICE_ROLE_KEY (XUMM were already present)"
echo ""

echo "=== BEST TEST (no deploy needed; secrets runtime for Functions) ==="
echo "1. Visit: https://pegd.pages.dev/portal.html   (or https://pegd.org/portal.html )"
echo "2. Sign in with EXACT wallet from ALLOWLIST — **Phantom preferred** (north star rail per Order #1 / CPO rail coherence; Xaman rPEGGED... secondary)."
echo "3. Successful auth sets HttpOnly xrpeg_portal cookie; HUD appears (no more 'Portal not configured' 503)."
echo "4. Test command: https://pegd.pages.dev/command.html  (or /api/portal/command/overview with cookie) for ops/inbox."
echo "5. Optional API smoke (after sign-in): curl -s https://pegd.pages.dev/api/portal/challenge"
echo "If 503 persists: secret/allowlist not set or wrong value (re-check list + Supabase key)."
echo ""

echo "Chairman Command Portal (private, works while site paused): https://pegd.pages.dev/command.html"
echo "Unblocks: listings CRUD, orders inbox, cto commands, dashboard, supabase ops — no more raw scripts for Order #1 fulfillment (COO)."
echo ""

read -p "Auto-execute the core puts now (will pipe LATEST/fresh; enter values at prompts if needed)? [y/N] " do_run
if [[ "$do_run" =~ ^[Yy]$ ]]; then
  echo "Piping PORTAL_SESSION_SECRET (LATEST)..."
  printf '%s' "$LATEST_SECRET" | npx wrangler pages secret put PORTAL_SESSION_SECRET --project-name pegd || echo " (may require interactive; run the printf line above manually)"
  echo ""
  printf '%s' "$EXAMPLE_ALLOWLIST" | npx wrangler pages secret put PORTAL_ALLOWLIST --project-name pegd || echo " (manual run needed for allowlist)"
  echo ""
  read -p "Enter exact SUPABASE_SERVICE_ROLE_KEY value (or Enter to skip): " supa_val
  if [[ -n "$supa_val" ]]; then
    printf '%s' "$supa_val" | npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name pegd || echo " (manual run needed)"
  fi
  echo ""
  printf '%s' "https://tmaeezonwjyydkxwpeug.supabase.co" | npx wrangler pages secret put SUPABASE_URL --project-name pegd || true
  echo ""
  echo "=== POST-RUN STATE ==="
  npx wrangler pages secret list --project-name pegd 2>&1 || true
  echo "Verify with portal.html test above. No redeploy required."
fi

echo ""
echo "=== NEXT AFTER PUTS (per quorum 2026-06-13) ==="
echo "1. Test portal sign-in (Phantom preferred) on https://pegd.pages.dev/portal.html — confirm no 'not configured', HUD loads, command.html works."
echo "2. Update live-state: edit /home/cube/.grok/agents/references/xrpegged-live-state.md"
echo "   - Last updated: 2026-06-13 (Zeta)"
echo "   - Portal status: Live (PORTAL_* + SUPABASE set on pegd Pages; XUMM already present)"
echo "   - Backlog: clear P1 'PORTAL_SESSION_SECRET + allowlist' / 'PORTAL_* absent'"
echo "   - CISO row / access control: 'portal secrets + strict Chairman allowlist set'"
echo "   - CHANGELOG: add '2026-06-13 | CISO/CTO: PORTAL_SESSION_SECRET (P0k...), ALLOWLIST (treasury solana: fWi4... + xrpl: rPEGGED...), SUPABASE set on Pages pegd via wrangler/Dashboard; portal sign-in unblocked (Phantom pref); no redeploy; script updated for one-click; live-state corrected.'"
echo "   - Then save + (optional) git commit if tracked."
echo "Brand: XRPEGGED / $PEGD only. North star: CLOSE ORDER #1 (portal P1 for ops/command/HUD)."
echo 'Done. Update live-state after puts (all officers). Script updated with latest + Dashboard + explicit next steps.'