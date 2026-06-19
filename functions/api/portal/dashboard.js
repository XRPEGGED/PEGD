import { verifySession } from '../../_lib/portal.js'
import { buildHud } from '../../_lib/directives.js'

const MARKET_API = 'https://xrpegged-market.xrpegged.workers.dev/api/proof/listings?limit=50'
const PEGD_MINT = 'BKSHGmoZ16nCGSLbgRWcXc9qPZGgpufZ4kX3PJc1moon'
const XRP_TREASURY = 'rPEGGED33W7WnBkLKwb1aLMaWvw5cbWX78'
const SOL_TREASURY = 'fWi4mx4bavfhFnJgHcAE5aCczEoaA7QFTp26zbV92zb'

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || ''
  const match = raw.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

async function liveMetrics() {
  const [xrp, sol, curve, market, solTokens] = await Promise.all([
    fetch('https://xrplcluster.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_info',
        params: [{ account: XRP_TREASURY, ledger_index: 'validated' }],
      }),
    })
      .then((r) => r.json())
      .then((d) => Number(d?.result?.account_data?.Balance) / 1_000_000)
      .catch(() => null),
    fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [SOL_TREASURY],
      }),
    })
      .then((r) => r.json())
      .then((d) => d?.result?.value / 1_000_000_000)
      .catch(() => null),
    fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${PEGD_MINT}`)
      .then((r) => r.json())
      .then((d) => {
        const attrs = d?.data?.attributes
        const ld = attrs?.launchpad_details ?? {}
        return {
          graduationPct: ld.graduation_percentage ?? null,
          reserveUsd: attrs?.total_reserve_in_usd != null ? Number(attrs.total_reserve_in_usd) : null,
        }
      })
      .catch(() => ({})),
    fetch(MARKET_API)
      .then((r) => r.json())
      .then((d) => ({
        ok: Boolean(d?.success),
        active: Array.isArray(d?.listings) ? d.listings.filter((l) => l.status === 'active').length : 0,
      }))
      .catch(() => ({ ok: false, active: 0 })),
    fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          SOL_TREASURY,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { commitment: 'confirmed', encoding: 'jsonParsed' }
        ]
      })
    }).then((r) => r.json()).then((d) => {
      const accounts = d?.result?.value || [];
      return accounts.map((acc) => {
        const info = acc.account.data.parsed.info;
        const ta = info.tokenAmount;
        return {
          mint: info.mint,
          amount: ta.uiAmountString || ta.amount,
          decimals: ta.decimals
        };
      });
    }).catch(() => []),
  ])

  return { treasury: { xrp, sol, tokens: solTokens }, curve, market, generatedAt: new Date().toISOString() }
}

export async function onRequestGet({ request, env }) {
  const secret = env.PORTAL_SESSION_SECRET
  const token = readCookie(request, 'xrpeg_portal')
  const session = await verifySession(token, secret)
  const role = session?.role || 'chairman'
  if (!session || role !== 'chairman') {
    return Response.json({ success: false, error: 'Chairman allowlist required' }, { status: 401 })
  }

  const [live, hud] = await Promise.all([liveMetrics(), buildHud(env)])
  return Response.json({
    success: true,
    session: { rail: session.rail, address: session.address, role: session.role || 'chairman' },
    hud,
    live,
  })
}