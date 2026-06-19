const PEGD_MINT = 'BKSHGmoZ16nCGSLbgRWcXc9qPZGgpufZ4kX3PJc1moon'

async function coinbaseSpot(pair) {
  const res = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`)
  const data = await res.json()
  const amount = data?.data?.amount
  return amount != null ? parseFloat(amount) : null
}

const GECKO_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'XRPEGGED-pegd-prices/1.0',
}

function curvePriceFromAttrs(attrs) {
  if (!attrs) return { price: null, meta: null }

  const graduation = attrs.launchpad_details?.graduation_percentage ?? null
  const graduated = attrs.launchpad_details?.completed === true
  const reserve = parseFloat(attrs.total_reserve_in_usd)
  const supply = parseFloat(attrs.normalized_total_supply)
  const spot = attrs.price_usd != null ? parseFloat(attrs.price_usd) : null

  let price = spot
  let source = spot != null ? 'market' : null
  if ((price == null || price <= 0) && reserve > 0 && supply > 0) {
    price = reserve / supply
    source = 'curve'
  }

  return {
    price: Number.isFinite(price) && price > 0 ? price : null,
    meta: {
      source,
      graduated,
      graduationPct: graduation,
      reserveUsd: Number.isFinite(reserve) ? reserve : null,
    },
  }
}

async function geckoPegdMeta() {
  const urls = [
    `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${PEGD_MINT}`,
    `https://app.geckoterminal.com/api/v2/networks/solana/tokens/${PEGD_MINT}`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: GECKO_HEADERS })
      if (!res.ok) continue
      const data = await res.json()
      const parsed = curvePriceFromAttrs(data?.data?.attributes)
      if (parsed.price != null) return parsed
    } catch {
      /* try next mirror */
    }
  }

  return { price: null, meta: null }
}

export async function onRequest() {
  const prices = { XRP: null, SOL: null, PEGD: null }
  let pegdMeta = null

  try {
    const [xrp, sol] = await Promise.all([
      coinbaseSpot('XRP-USD'),
      coinbaseSpot('SOL-USD'),
    ])
    prices.XRP = xrp
    prices.SOL = sol
  } catch {}

  if (prices.XRP == null || prices.SOL == null) {
    try {
      const r = await fetch('https://min-api.cryptocompare.com/data/pricemulti?fsyms=XRP,SOL&tsyms=USD')
      const d = await r.json()
      prices.XRP = prices.XRP ?? d.XRP?.USD ?? null
      prices.SOL = prices.SOL ?? d.SOL?.USD ?? null
    } catch {}
  }

  try {
    const dex = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${PEGD_MINT}`)
    const d = await dex.json()
    const p = d.pairs?.[0]?.priceUsd
    if (p) prices.PEGD = parseFloat(p)
  } catch {}

  if (prices.PEGD == null) {
    try {
      const gecko = await geckoPegdMeta()
      if (gecko.price != null) prices.PEGD = gecko.price
      pegdMeta = gecko.meta
    } catch {}
  } else {
    try {
      const gecko = await geckoPegdMeta()
      pegdMeta = gecko.meta
    } catch {}
  }

  if (prices.PEGD == null) {
    const reserveUsd = 5107.77
    const supply = 1_000_000_000
    prices.PEGD = reserveUsd / supply
    pegdMeta = {
      source: 'curve-snapshot',
      graduated: false,
      graduationPct: 0.17,
      reserveUsd,
      stale: true,
    }
  }

  return new Response(JSON.stringify({ success: true, pricesUsd: prices, pegdMeta }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}