import { requireChairman, CHAIRMAN_DEFAULTS } from '../../../_lib/chairman.js'
import { supabaseConfigured, listAllListings, listOrders } from '../../../_lib/supabase-admin.js'

const PEGD_MINT = 'BKSHGmoZ16nCGSLbgRWcXc9qPZGgpufZ4kX3PJc1moon'

export async function onRequestGet({ request, env }) {
  const auth = await requireChairman(request, env)
  if (!auth.ok) return auth.response

  const [xrp, sol, listings, orders] = await Promise.all([
    fetch('https://xrplcluster.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_info',
        params: [{ account: CHAIRMAN_DEFAULTS.treasuryXrp, ledger_index: 'validated' }],
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
        params: [CHAIRMAN_DEFAULTS.treasurySol],
      }),
    })
      .then((r) => r.json())
      .then((d) => d?.result?.value / 1_000_000_000)
      .catch(() => null),
    supabaseConfigured(env) ? listAllListings(env, 100) : [],
    supabaseConfigured(env) ? listOrders(env, 50) : [],
  ])

  const activeListings = listings.filter((l) => l.status === 'active').length
  const pendingListings = listings.filter((l) => l.status === 'pending').length
  const completedOrders = orders.filter((o) => o.status === 'completed').length
  const awaitingShip = orders.filter(
    (o) => o.fulfillment_status === 'shipping_submitted' || o.fulfillment_status === 'paid'
  ).length

  return Response.json(
    {
      success: true,
      site: {
        paused: env.SITE_PAUSED === 'true' || env.SITE_PAUSED === '1',
        maintenanceUntil: env.MAINTENANCE_UNTIL || null,
        portalConfigured: Boolean(env.PORTAL_SESSION_SECRET),
        supabaseConfigured: supabaseConfigured(env),
      },
      treasury: { xrp, sol, xrpWallet: CHAIRMAN_DEFAULTS.treasuryXrp, solWallet: CHAIRMAN_DEFAULTS.treasurySol },
      market: {
        pegdMint: PEGD_MINT,
        activeListings,
        pendingListings,
        totalListings: listings.length,
        completedOrders,
        awaitingShip,
        workerUrl: 'https://xrpegged-market.xrpegged.workers.dev/proof',
      },
      session: { rail: auth.session.rail, address: auth.session.address },
      generatedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}