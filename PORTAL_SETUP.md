# XRPEGGED wallet portal (`/portal.html`)

## Cloudflare Pages secrets (pegd project)

Set these via `wrangler` or the Cloudflare Dashboard (never commit values):

```bash
cd <REPO_ROOT>

# Random 32+ char secret for session cookies
npx wrangler pages secret put PORTAL_SESSION_SECRET --project-name pegd

# Comma-separated allowlist — your wallets only
# XRPL addresses start with r; Solana base58
npx wrangler pages secret put PORTAL_ALLOWLIST --project-name pegd

# Already required for Xaman sign-in:
# XUMM_API_KEY, XUMM_API_SECRET

# Supabase (environment-specific)
npx wrangler pages secret put SUPABASE_URL --project-name pegd
npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name pegd
```

Or run `bash setup-portal-secrets.sh` for a guided helper that generates a fresh session secret and prints put commands with placeholders.

## Samsung (cell data)

1. Open `https://pegd.pages.dev/portal.html` (or pegd.org after deploy)
2. Sign in with Xaman or Phantom (must be on allowlist)
3. Chrome menu → **Add to Home screen**

## KV binding (holder directives)

Holder sprint/backlog reorder persists in **DIRECTIVES_KV** (see `wrangler.toml`).

After first deploy with `wrangler.toml`, confirm in Cloudflare Dashboard → Pages → pegd → Settings → Functions → KV namespace bindings.

## Holder directives

- **Read:** `GET /api/portal/directives` (session required)
- **Move:** `POST /api/portal/directives` with holder or Chairman session
- **Holder sign-in:** `POST /api/portal/verify-holder-phantom` — Phantom message + minimum PEGD balance. Override: Pages secret `HOLDER_MIN_PEGD` (number).
- **Chairman sign-in:** allowlist routes (`verify-phantom`, `verify-xumm`)
- UI: pegd.org **Governance** section + `/portal.html` Command HUD

Treasury moves and deploys remain Chairman-only; reordering is advisory input from holders.

## Security hardening

- **Rate limits** (KV): portal verify, challenge, directives, officers brief, solana proxy, xumm
- **Origin lock**: API calls must come from `pegd.org` / `pegd.pages.dev` (override: `PORTAL_ORIGINS`)
- **Directives GET**: holder/chairman session required
- **Solana proxy**: pegd origins only; allowlisted RPC methods (`getBalance`, `getTokenAccountsByOwner`, `getAccountInfo`)
- **Headers**: `X-Frame-Options: DENY`, `nosniff`, `CORP: same-site` on all responses
- **Required before unpause**: `PORTAL_SESSION_SECRET` + `PORTAL_ALLOWLIST`

## Security

- Ops data only via `/api/portal/dashboard` with HttpOnly cookie (Chairman allowlist)
- Holder session can reorder directives and use Officers brief — not full Command HUD metrics
- Wrong wallet → 403, no data leaked
- `noindex` on portal — directives board requires sign-in
