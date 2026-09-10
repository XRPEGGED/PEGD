/**
 * CORS-safe proxy: lifetime mined PEGD for a Solana wallet.
 * Formula: lifetimeMinedPegdUi = (pendingPegd + sum pegdEarned) / 1e6
 * Sources: pegd-compute /miner?wallet= and /payouts
 */
const COMPUTE = 'https://pegd-compute.xrpegged.workers.dev'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

function bad(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: CORS })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url)
  const wallet = (url.searchParams.get('wallet') || '').trim()
  if (!wallet || wallet.length < 32 || wallet.length > 64) {
    return bad('invalid wallet')
  }

  try {
    const [minerRes, payoutsRes] = await Promise.all([
      fetch(`${COMPUTE}/miner?wallet=${encodeURIComponent(wallet)}`, {
        headers: { Accept: 'application/json' },
      }),
      fetch(`${COMPUTE}/payouts`, { headers: { Accept: 'application/json' } }),
    ])

    let pendingPegd = 0
    let shareSeconds = 0
    let minerFound = false

    if (minerRes.ok) {
      const miner = await minerRes.json()
      minerFound = !!miner?.found
      pendingPegd = Number(miner?.pendingPegd) || 0
      shareSeconds = Number(miner?.shareSeconds) || 0
    }

    let payoutsSum = 0
    if (payoutsRes.ok) {
      const payouts = await payoutsRes.json()
      if (Array.isArray(payouts)) {
        for (const p of payouts) {
          if (p && p.wallet === wallet) {
            payoutsSum += Number(p.pegdEarned) || 0
          }
        }
      }
    }

    const lifetimeRaw = pendingPegd + payoutsSum
    const lifetimeMinedPegdUi = lifetimeRaw / 1e6

    return new Response(
      JSON.stringify({
        wallet,
        found: minerFound || payoutsSum > 0 || pendingPegd > 0,
        lifetimeMinedPegdUi,
        pendingPegd,
        shareSeconds,
        payoutsSum,
      }),
      { status: 200, headers: CORS }
    )
  } catch {
    return bad('upstream unavailable', 502)
  }
}
